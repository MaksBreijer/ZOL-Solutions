import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { adminClient } from "../_shared/email.ts"

const allowedStatuses = new Set(["open", "pending", "authorized", "paid", "failed", "cancelled", "expired"])

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 })
  const mollieKey = Deno.env.get("MOLLIE_API_KEY")
  if (!mollieKey) return Response.json({ error: "Mollie is nog niet geconfigureerd." }, { status: 503 })
  try {
    const contentType = request.headers.get("content-type") || ""
    const body = contentType.includes("application/json") ? await request.json() : Object.fromEntries((await request.formData()).entries())
    const paymentId = String(body.id || "")
    if (!/^tr_[A-Za-z0-9]+$/.test(paymentId)) return Response.json({ error: "Ongeldige betaling." }, { status: 400 })
    const response = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`, { headers: { "Authorization": `Bearer ${mollieKey}` } })
    const payment = await response.json()
    if (!response.ok) return Response.json({ error: "Betaling kon niet worden gecontroleerd." }, { status: 502 })
    const status = allowedStatuses.has(payment.status) ? payment.status : "pending"
    const db = adminClient()
    const { data: localPayment, error } = await db.from("payments").select("id,order_id").eq("provider_payment_id", paymentId).maybeSingle()
    if (error || !localPayment) return Response.json({ error: "Betaling niet gevonden." }, { status: 404 })
    if (payment.metadata?.order_id && payment.metadata.order_id !== localPayment.order_id) return Response.json({ error: "Ordercontrole mislukt." }, { status: 409 })
    const refundedCents = Math.round(Number(payment.amountRefunded?.value || 0) * 100)
    const mappedStatus = refundedCents > 0 ? (refundedCents >= Math.round(Number(payment.amount?.value || 0) * 100) ? "refunded" : "partially_refunded") : status
    const { error: updateError } = await db.from("payments").update({ status: mappedStatus, method: payment.method || "", refunded_cents: refundedCents, metadata: payment.metadata || {} }).eq("id", localPayment.id)
    if (updateError) throw updateError
    return new Response("ok", { status: 200 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Webhook kon niet worden verwerkt." }, { status: 500 })
  }
})
