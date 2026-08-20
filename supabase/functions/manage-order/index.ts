import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { adminClient, corsHeaders, requireAdmin } from "../_shared/email.ts"

function mollieAmount(cents: number) {
  return (cents / 100).toFixed(2)
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })

  const db = adminClient()
  try {
    const profile = await requireAdmin(request, db)
    if (!["owner", "admin"].includes(profile.role)) return Response.json({ error: "Geen toestemming voor deze actie." }, { status: 403, headers })
    const body = await request.json()
    if (body.action !== "refund") return Response.json({ error: "Onbekende orderactie." }, { status: 400, headers })
    const orderId = String(body.order_id || "")
    const amountCents = Math.round(Number(body.amount_cents || 0))
    if (!/^[0-9a-f-]{36}$/i.test(orderId) || amountCents <= 0) return Response.json({ error: "Ongeldige terugbetaling." }, { status: 400, headers })

    const { data: order } = await db.from("orders").select("id,order_number,total_cents,currency,customer_id").eq("id", orderId).maybeSingle()
    const { data: payment } = await db.from("payments").select("id,provider,provider_payment_id,status,amount_cents,refunded_cents,currency,metadata").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (!order || !payment) return Response.json({ error: "Betaling niet gevonden." }, { status: 404, headers })
    const refundable = Number(payment.amount_cents) - Number(payment.refunded_cents || 0)
    if (amountCents > refundable) return Response.json({ error: "Het bedrag is hoger dan het nog terugbetaalbare bedrag." }, { status: 409, headers })

    let providerRefundId: string | null = null
    if (payment.provider === "mollie" && payment.provider_payment_id) {
      const mollieKey = Deno.env.get("MOLLIE_API_KEY")
      if (!mollieKey) return Response.json({ error: "Mollie is nog niet geconfigureerd; de terugbetaling is niet uitgevoerd." }, { status: 503, headers })
      const response = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(payment.provider_payment_id)}/refunds`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${mollieKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: { currency: payment.currency || "EUR", value: mollieAmount(amountCents) }, description: `Terugbetaling ZOL bestelling #${order.order_number}` }),
      })
      const refund = await response.json().catch(() => ({}))
      if (!response.ok) return Response.json({ error: refund.detail || "Mollie heeft de terugbetaling geweigerd." }, { status: 502, headers })
      providerRefundId = refund.id || null
    }

    const refundedCents = Number(payment.refunded_cents || 0) + amountCents
    const status = refundedCents >= Number(payment.amount_cents) ? "refunded" : "partially_refunded"
    const metadata = { ...(payment.metadata || {}), last_refund_id: providerRefundId, last_refund_cents: amountCents, last_refund_at: new Date().toISOString() }
    const { error: updateError } = await db.from("payments").update({ refunded_cents: refundedCents, status, metadata }).eq("id", payment.id)
    if (updateError) throw updateError

    await db.from("activity_log").insert({
      actor_id: profile.id,
      actor_email: profile.email,
      action: refundedCents >= Number(payment.amount_cents) ? "Bestelling volledig terugbetaald" : "Bestelling gedeeltelijk terugbetaald",
      entity_type: "order",
      entity_id: order.id,
      details: { order_number: order.order_number, amount_cents: amountCents, provider: payment.provider, provider_refund_id: providerRefundId },
    })
    return Response.json({ success: true, amount_cents: amountCents, refunded_cents: refundedCents, status, provider_refund_id: providerRefundId }, { headers: { ...headers, "Content-Type": "application/json" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "De orderactie kon niet worden uitgevoerd."
    return Response.json({ error: message }, { status: /ingelogd|sessie|toegang/i.test(message) ? 401 : 500, headers })
  }
})
