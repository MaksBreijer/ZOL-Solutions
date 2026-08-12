import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const allowedOrigins = new Set([
  "https://zol-solutions.pages.dev",
  "https://zolsolutions.nl",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
])

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || ""
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://zol-solutions.pages.dev",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

function moneyValue(cents: number) {
  return (cents / 100).toFixed(2)
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })

  try {
    const body = await request.json()
    const items = Array.isArray(body.items) ? body.items.slice(0, 20) : []
    const customer = body.customer || {}
    const email = String(customer.email || "").trim().toLowerCase()
    if (!items.length) return Response.json({ error: "De winkelwagen is leeg." }, { status: 400, headers })
    if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Vul een geldig e-mailadres in." }, { status: 400, headers })

    const normalizedItems = items.map((item: { variant_id?: string; quantity?: number }) => ({
      variant_id: String(item.variant_id || ""),
      quantity: Math.min(10, Math.max(1, Number.parseInt(String(item.quantity || 1), 10) || 1)),
    })).filter((item: { variant_id: string }) => /^[0-9a-f-]{36}$/i.test(item.variant_id))
    if (normalizedItems.length !== items.length) return Response.json({ error: "Een productvariant is ongeldig." }, { status: 400, headers })

    const url = Deno.env.get("SUPABASE_URL")!
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${userAgent}`))
    const fingerprint = [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("")
    const { data: rateAllowed, error: rateError } = await db.rpc("enforce_checkout_rate_limit", { p_fingerprint: fingerprint })
    if (rateError) throw rateError
    if (!rateAllowed) return Response.json({ error: "Te veel bestelverzoeken. Probeer het over 15 minuten opnieuw." }, { status: 429, headers })

    const { data: commerceSetting } = await db.from("settings").select("value").eq("key", "commerce").maybeSingle()
    const commerce = commerceSetting?.value || {}
    const { data: order, error: orderError } = await db.rpc("create_checkout_order", {
      p_customer: customer,
      p_items: normalizedItems,
      p_note: String(body.note || "").slice(0, 1000),
      p_session_id: String(body.session_id || crypto.randomUUID()).slice(0, 120),
    })
    if (orderError) throw orderError
    const totalCents = Number(order.total_cents)

    let checkoutUrl: string | null = null
    let providerPaymentId: string | null = null
    const mollieKey = Deno.env.get("MOLLIE_API_KEY")
    if (commerce.mollie_enabled && mollieKey) {
      const mollieResponse = await fetch("https://api.mollie.com/v2/payments", {
        method: "POST",
        headers: { "Authorization": `Bearer ${mollieKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: { currency: "EUR", value: moneyValue(totalCents) },
          description: `ZOL bestelling #${order.order_number}`,
          redirectUrl: `https://zol-solutions.pages.dev/checkout/?order=${order.order_number}`,
          metadata: { order_id: order.order_id, order_number: order.order_number },
        }),
      })
      const mollieData = await mollieResponse.json()
      if (!mollieResponse.ok) throw new Error(mollieData.detail || "Mollie kon de betaling niet starten.")
      checkoutUrl = mollieData._links?.checkout?.href || null
      providerPaymentId = mollieData.id || null
    }

    await db.from("payments").update({
      provider_payment_id: providerPaymentId,
      status: checkoutUrl ? "open" : "pending",
      metadata: { checkout_ready: Boolean(checkoutUrl) },
    }).eq("order_id", order.order_id)

    return Response.json({ success: true, order_number: order.order_number, total_cents: totalCents, checkout_url: checkoutUrl, payment_ready: Boolean(checkoutUrl) }, { headers: { ...headers, "Content-Type": "application/json" } })
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "Afrekenen is niet gelukt."
    return Response.json({ error: message }, { status: 500, headers })
  }
})
