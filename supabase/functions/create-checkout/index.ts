import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.112.3"

const allowedOrigins = new Set([
  "https://zol-solutions.pages.dev",
  "https://codex-zol-premium-launch.zol-solutions.pages.dev",
  "https://zolsolutions.nl",
  "https://www.zolsolutions.nl",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
])
const retriableStatuses = new Set(["failed", "cancelled", "expired"])
const mollieStatuses = new Set(["open", "pending", "authorized", "paid", "failed", "cancelled", "expired"])

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || ""
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://zol-solutions.pages.dev",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

function checkoutOrigin(request: Request) {
  const origin = request.headers.get("origin") || ""
  return allowedOrigins.has(origin) ? origin : "https://zol-solutions.pages.dev"
}

function moneyValue(cents: number) {
  return (cents / 100).toFixed(2)
}

async function listPaymentMethods(mollieKey: string, amountCents: number) {
  if (!mollieKey) return []
  const query = new URLSearchParams({
    locale: "nl_NL",
    sequenceType: "oneoff",
    billingCountry: "NL",
    includeWallets: "applepay",
    "amount[value]": moneyValue(amountCents),
    "amount[currency]": "EUR",
  })
  const response = await fetch(`https://api.mollie.com/v2/methods?${query}`, {
    headers: { "Authorization": `Bearer ${mollieKey}` },
  })
  const payload = await response.json()
  if (!response.ok) throw new Error("De betaalmethoden konden niet worden geladen.")
  const preferred = ["ideal", "creditcard", "applepay", "paypal", "bancontact", "banktransfer", "in3", "klarna"]
  const methods = Array.isArray(payload?._embedded?.methods) ? payload._embedded.methods : []
  return methods
    .filter((method: Record<string, any>) => typeof method?.id === "string")
    .sort((a: Record<string, any>, b: Record<string, any>) => {
      const aIndex = preferred.indexOf(a.id)
      const bIndex = preferred.indexOf(b.id)
      return (aIndex === -1 ? preferred.length : aIndex) - (bIndex === -1 ? preferred.length : bIndex)
    })
    .slice(0, 8)
    .map((method: Record<string, any>) => {
      const image = [method.image?.svg, method.image?.size2x, method.image?.size1x]
        .find((source) => typeof source === "string" && source.startsWith("https://")) || ""
      return { id: method.id, description: String(method.description || method.id), image }
    })
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("")
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  )
}

async function getCheckout(db: ReturnType<typeof adminClient>, orderId: string, token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !/^[0-9a-f]{64}$/i.test(token)) return null
  const [{ data: order }, { data: payment }] = await Promise.all([
    db.from("orders").select("id,order_number,subtotal_cents,shipping_cents,discount_code,discount_cents,tax_cents,total_cents,currency,payment_status").eq("id", orderId).maybeSingle(),
    db.from("payments").select("id,order_id,provider_payment_id,status,amount_cents,currency,metadata").eq("order_id", orderId).maybeSingle(),
  ])
  if (!order || !payment) return null
  const expectedHash = String(payment.metadata?.return_token_hash || "")
  if (!expectedHash || expectedHash !== await hashToken(token)) return null
  return { order, payment }
}

async function refreshPayment(db: ReturnType<typeof adminClient>, payment: Record<string, any>, mollieKey: string) {
  if (!payment.provider_payment_id) return payment
  const response = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(payment.provider_payment_id)}`, {
    headers: { "Authorization": `Bearer ${mollieKey}` },
  })
  const remote = await response.json()
  if (!response.ok) throw new Error("De betaalstatus kon niet worden gecontroleerd.")
  const refundedCents = Math.round(Number(remote.amountRefunded?.value || 0) * 100)
  const paidCents = Math.round(Number(remote.amount?.value || 0) * 100)
  const status = refundedCents > 0
    ? (refundedCents >= paidCents ? "refunded" : "partially_refunded")
    : (mollieStatuses.has(remote.status) ? remote.status : "pending")
  const metadata = { ...(payment.metadata || {}), ...(remote.metadata || {}) }
  const { data, error } = await db.from("payments").update({
    status,
    method: remote.method || "",
    refunded_cents: refundedCents,
    metadata,
  }).eq("id", payment.id).select("id,order_id,provider_payment_id,status,amount_cents,currency,metadata").single()
  if (error) throw error
  return data
}

async function startMolliePayment(input: {
  db: ReturnType<typeof adminClient>
  order: Record<string, any>
  payment: Record<string, any>
  token: string
  origin: string
  supabaseUrl: string
  mollieKey: string
  method?: string
}) {
  const redirect = `${input.origin}/checkout/?ref=${encodeURIComponent(input.order.id)}&token=${encodeURIComponent(input.token)}`
  const response = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: { "Authorization": `Bearer ${input.mollieKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { currency: input.order.currency || "EUR", value: moneyValue(Number(input.order.total_cents)) },
      description: `ZOL bestelling #${input.order.order_number}`,
      redirectUrl: redirect,
      cancelUrl: `${redirect}&cancelled=1`,
      webhookUrl: `${input.supabaseUrl}/functions/v1/mollie-webhook`,
      metadata: { order_id: input.order.id, order_number: input.order.order_number },
      ...(input.method ? { method: input.method } : {}),
    }),
  })
  const mollie = await response.json()
  if (!response.ok) throw new Error(mollie.detail || "Mollie kon de betaling niet starten.")
  const checkoutUrl = mollie._links?.checkout?.href || null
  if (!checkoutUrl || !mollie.id) throw new Error("Mollie gaf geen geldige betaallink terug.")
  const { error } = await input.db.from("payments").update({
    provider_payment_id: mollie.id,
    status: "open",
    metadata: { ...(input.payment.metadata || {}), checkout_ready: true, selected_method: input.method || null },
  }).eq("id", input.payment.id)
  if (error) throw error
  return checkoutUrl
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })

  try {
    const body = await request.json()
    const db = adminClient()
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const mollieKey = Deno.env.get("MOLLIE_API_KEY") || ""
    const { data: commerceSetting } = await db.from("settings").select("value").eq("key", "commerce").maybeSingle()
    const commerce = commerceSetting?.value || {}

    if (body.action === "status" || body.action === "retry") {
      const checkout = await getCheckout(db, String(body.order_id || ""), String(body.token || ""))
      if (!checkout) return Response.json({ error: "Deze bestelling kon niet veilig worden gevonden." }, { status: 404, headers })
      let payment = checkout.payment
      if (mollieKey && payment.provider_payment_id) payment = await refreshPayment(db, payment, mollieKey)
      if (body.action === "retry") {
        if (!mollieKey) return Response.json({ error: "Online betalen is nog niet beschikbaar." }, { status: 503, headers })
        if (!retriableStatuses.has(payment.status)) return Response.json({ error: "Deze betaling kan niet opnieuw worden gestart." }, { status: 409, headers })
        const checkoutUrl = await startMolliePayment({
          db,
          order: checkout.order,
          payment,
          token: body.token,
          origin: checkoutOrigin(request),
          supabaseUrl,
          mollieKey,
          method: String(payment.metadata?.selected_method || ""),
        })
        return Response.json({ success: true, checkout_url: checkoutUrl }, { headers: { ...headers, "Content-Type": "application/json" } })
      }
      return Response.json({
        success: true,
        order_number: checkout.order.order_number,
        subtotal_cents: checkout.order.subtotal_cents,
        shipping_cents: checkout.order.shipping_cents,
        discount_code: checkout.order.discount_code,
        discount_cents: checkout.order.discount_cents,
        tax_cents: checkout.order.tax_cents,
        total_cents: checkout.order.total_cents,
        payment_status: payment.status,
      }, { headers: { ...headers, "Content-Type": "application/json" } })
    }

    const items = Array.isArray(body.items) ? body.items.slice(0, 20) : []
    if (!items.length) return Response.json({ error: "De winkelwagen is leeg." }, { status: 400, headers })

    const normalizedItems = items.map((item: { variant_id?: string; quantity?: number }) => ({
      variant_id: String(item.variant_id || ""),
      quantity: Math.min(10, Math.max(1, Number.parseInt(String(item.quantity || 1), 10) || 1)),
    })).filter((item: { variant_id: string }) => /^[0-9a-f-]{36}$/i.test(item.variant_id))
    if (normalizedItems.length !== items.length) return Response.json({ error: "Een productvariant is ongeldig." }, { status: 400, headers })

    if (body.action === "quote") {
      const { data: quote, error: quoteError } = await db.rpc("quote_checkout_order", {
        p_items: normalizedItems,
        p_discount_code: String(body.discount_code || "").trim().toUpperCase().slice(0, 40),
      })
      if (quoteError) return Response.json({ error: quoteError.message }, { status: 400, headers })
      let paymentMethods: Array<{ id: string, description: string, image: string }> = []
      if (commerce.mollie_enabled && mollieKey) {
        try {
          paymentMethods = await listPaymentMethods(mollieKey, Number(quote.total_cents || 0))
        } catch {
          // Mollie's hosted checkout remains the fallback when the method list is unavailable.
        }
      }
      return Response.json({ success: true, ...quote, payment_methods: paymentMethods }, { headers: { ...headers, "Content-Type": "application/json" } })
    }

    const customer = body.customer || {}
    const email = String(customer.email || "").trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Vul een geldig e-mailadres in." }, { status: 400, headers })

    if (commerce.mollie_enabled && !mollieKey) return Response.json({ error: "Online betalen is tijdelijk niet beschikbaar. Probeer het later opnieuw." }, { status: 503, headers })

    const selectedMethod = String(body.payment_method || "").trim().toLowerCase()
    if (commerce.mollie_enabled && selectedMethod) {
      const { data: methodQuote, error: methodQuoteError } = await db.rpc("quote_checkout_order", {
        p_items: normalizedItems,
        p_discount_code: String(body.discount_code || "").trim().toUpperCase().slice(0, 40),
      })
      if (methodQuoteError) return Response.json({ error: methodQuoteError.message }, { status: 400, headers })
      const availableMethods = await listPaymentMethods(mollieKey, Number(methodQuote.total_cents || 0))
      if (!availableMethods.some((method) => method.id === selectedMethod)) {
        return Response.json({ error: "Kies een beschikbare betaalmethode." }, { status: 400, headers })
      }
    }

    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"
    const fingerprint = await hashToken(`${ip}|${userAgent}`)
    const { data: rateAllowed, error: rateError } = await db.rpc("enforce_checkout_rate_limit", { p_fingerprint: fingerprint })
    if (rateError) throw rateError
    if (!rateAllowed) return Response.json({ error: "Te veel bestelverzoeken. Probeer het over 15 minuten opnieuw." }, { status: 429, headers })

    const { data: order, error: orderError } = await db.rpc("create_checkout_order", {
      p_customer: customer,
      p_items: normalizedItems,
      p_note: "",
      p_session_id: String(body.session_id || crypto.randomUUID()).slice(0, 120),
      p_discount_code: String(body.discount_code || "").trim().toUpperCase().slice(0, 40),
    })
    if (orderError) throw orderError

    const token = randomToken()
    const { data: payment, error: paymentError } = await db.from("payments").update({
      metadata: { checkout_ready: false, return_token_hash: await hashToken(token) },
    }).eq("order_id", order.order_id).select("id,order_id,provider_payment_id,status,amount_cents,currency,metadata").single()
    if (paymentError) throw paymentError

    let checkoutUrl: string | null = null
    if (commerce.mollie_enabled) {
      try {
        checkoutUrl = await startMolliePayment({
          db,
          order: { id: order.order_id, order_number: order.order_number, total_cents: order.total_cents, currency: "EUR" },
          payment,
          token,
          origin: checkoutOrigin(request),
          supabaseUrl,
          mollieKey,
          method: selectedMethod,
        })
      } catch (error) {
        await db.from("payments").update({ status: "failed" }).eq("id", payment.id)
        throw error
      }
    }

    return Response.json({
      success: true,
      order_number: order.order_number,
      total_cents: Number(order.total_cents),
      discount_code: order.discount_code || null,
      discount_cents: Number(order.discount_cents || 0),
      checkout_url: checkoutUrl,
      payment_ready: Boolean(checkoutUrl),
    }, { headers: { ...headers, "Content-Type": "application/json" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Afrekenen is niet gelukt."
    const status = /kortingscode|winkelwagen|product|voorraad|bestelbedrag|beschikbaar|e-mailadres|hielpijn|vragen/i.test(message) ? 400 : 500
    return Response.json({ error: message }, { status, headers })
  }
})
