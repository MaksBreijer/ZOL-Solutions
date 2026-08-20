import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { adminClient, corsHeaders, emailShell, escapeHtml, getEmailConfig, logEmail, markEmail, money, requireAdmin, sendEmail } from "../_shared/email.ts"

function addressLine(address: Record<string, string> = {}) {
  return [address.street, [address.postal_code, address.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })
  const db = adminClient()
  try {
    const internalSecret = request.headers.get("x-zol-email-secret") || ""
    const { data: validInternalSecret } = internalSecret ? await db.rpc("verify_email_webhook_secret", { p_secret: internalSecret }) : { data: false }
    if (!validInternalSecret) await requireAdmin(request, db)
    const { order_id: orderId, action = "paid" } = await request.json()
    if (!/^[0-9a-f-]{36}$/i.test(String(orderId || ""))) return Response.json({ error: "Bestelling ontbreekt." }, { status: 400, headers })
    const { data: order, error: orderError } = await db.from("orders").select("*, order_items(*)").eq("id", orderId).maybeSingle()
    if (orderError || !order) return Response.json({ error: "Bestelling niet gevonden." }, { status: 404, headers })
    if (action === "shipping") {
      if (!order.tracking_code) return Response.json({ error: "Voeg eerst een trackingcode toe." }, { status: 409, headers })
      const config = await getEmailConfig(db)
      const trackingUrl = order.tracking_url || config.website_url || "https://zolsolutions.nl"
      const carrier = order.tracking_carrier || "de bezorgdienst"
      const content = `<div style="display:inline-block;margin-bottom:20px;padding:7px 11px;border-radius:999px;background:#e6f0f8;color:#245f8b;font-size:11px;font-weight:700">ONDERWEG</div><p style="margin:0 0 20px;color:#445b70;font-size:15px;line-height:1.7">Je bestelling is overgedragen aan ${escapeHtml(carrier)}. Met de onderstaande code kun je de zending volgen.</p><div style="padding:18px;border-radius:12px;background:#f3f6f8"><span style="display:block;color:#6b7b8b;font-size:11px">Trackingcode</span><strong style="display:block;margin-top:6px;color:#102b4a;font-size:20px;letter-spacing:.04em">${escapeHtml(order.tracking_code)}</strong></div><a href="${escapeHtml(trackingUrl)}" style="display:inline-block;margin-top:22px;padding:13px 20px;border-radius:8px;background:#33669b;color:#fff;font-size:13px;font-weight:700;text-decoration:none">Volg je bestelling →</a>`
      const dedupe = `order-shipped-${order.id}-${order.tracking_code}`
      const { data: existing } = await db.from("email_messages").select("id,status").eq("dedupe_key", dedupe).maybeSingle()
      if (existing?.status === "sent") return Response.json({ success: true, results: [{ kind: "shipping_customer", status: "already_sent" }] }, { headers: { ...headers, "Content-Type": "application/json" } })
      const subject = `Je ZOL-bestelling #${order.order_number} is onderweg`
      const log = existing || await logEmail(db, { kind: "shipping_customer", recipient_email: order.customer_email, subject, order_id: order.id, customer_id: order.customer_id, dedupe_key: dedupe })
      try {
        const sent = await sendEmail({ to: order.customer_email, subject, html: emailShell(content, { eyebrow: `Bestelling #${order.order_number}`, title: "Je ZOL'tjes zijn onderweg.", intro: `Verzonden met ${carrier}.`, websiteUrl: config.website_url }), text: `Je bestelling #${order.order_number} is onderweg met ${carrier}. Trackingcode: ${order.tracking_code}. Volg je zending: ${trackingUrl}`, idempotencyKey: dedupe, config })
        await markEmail(db, log.id, { status: "sent", providerId: sent.id })
        return Response.json({ success: true, results: [{ kind: "shipping_customer", status: "sent" }] }, { headers: { ...headers, "Content-Type": "application/json" } })
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : "Verzendmail kon niet worden verstuurd."
        await markEmail(db, log.id, { status: "failed", error: message })
        return Response.json({ error: message }, { status: 503, headers })
      }
    }
    if (order.payment_status !== "paid") return Response.json({ error: "De bestelling is nog niet betaald." }, { status: 409, headers })
    const config = await getEmailConfig(db)
    const items = (order.order_items || []).map((item: Record<string, unknown>) => `<tr><td style="padding:13px 0;border-bottom:1px solid #e7ebef"><strong>${escapeHtml(item.product_name)}</strong><br><span style="color:#6b7b8b;font-size:12px">${escapeHtml(item.variant_name)} · ${item.quantity} × ${money(Number(item.unit_price_cents))}</span></td><td align="right" style="padding:13px 0;border-bottom:1px solid #e7ebef;font-weight:700">${money(Number(item.total_cents))}</td></tr>`).join("")
    const totals = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px"><tr><td style="padding:8px 0">Subtotaal</td><td align="right">${money(order.subtotal_cents)}</td></tr><tr><td style="padding:8px 0">Verzending</td><td align="right">${order.shipping_cents ? money(order.shipping_cents) : "Gratis"}</td></tr><tr><td style="padding:14px 0 0;border-top:2px solid #102b4a;font-size:17px;font-weight:700">Totaal</td><td align="right" style="padding:14px 0 0;border-top:2px solid #102b4a;font-size:17px;font-weight:700">${money(order.total_cents)}</td></tr></table>`
    const customerContent = `<div style="display:inline-block;margin-bottom:20px;padding:7px 11px;border-radius:999px;background:#e8f3ec;color:#21734d;font-size:11px;font-weight:700">BETALING ONTVANGEN</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table><div style="margin:25px 0">${totals}</div><div style="padding:18px;border-radius:12px;background:#f3f6f8;color:#445b70;font-size:13px;line-height:1.65"><strong style="color:#102b4a">Bezorgadres</strong><br>${escapeHtml(addressLine(order.shipping_address || {}))}</div>`
    const adminContent = `<p style="margin:0 0 22px;font-size:15px;line-height:1.65"><strong>${escapeHtml(order.customer_name || order.customer_email)}</strong><br><a href="mailto:${escapeHtml(order.customer_email)}" style="color:#33669b">${escapeHtml(order.customer_email)}</a><br>${escapeHtml(addressLine(order.shipping_address || {}))}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table><div style="margin:25px 0">${totals}</div><a href="https://zol-solutions.pages.dev/admin/#orders" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#33669b;color:#fff;font-size:13px;font-weight:700;text-decoration:none">Open in ZOL Admin →</a>`

    const deliveries = [
      { kind: "order_customer", to: order.customer_email, subject: `Bestelling #${order.order_number} betaald — bedankt!`, html: emailShell(customerContent, { eyebrow: `Bestelling #${order.order_number}`, title: "Je betaling is ontvangen.", intro: "We gaan je ZOL'tjes klaarmaken voor verzending.", websiteUrl: config.website_url }), text: `Bestelling #${order.order_number}\n\nJe betaling van ${money(order.total_cents)} is ontvangen. We maken je bestelling klaar voor verzending.`, dedupe: `order-paid-${order.id}-customer` },
      { kind: "order_admin", to: config.admin_email || "info@zolsolutions.nl", subject: `Nieuwe betaalde bestelling #${order.order_number} — ${money(order.total_cents)}`, html: emailShell(adminContent, { eyebrow: "Nieuwe betaalde bestelling", title: `Bestelling #${order.order_number}`, intro: "De betaling is ontvangen. De bestelling kan worden verwerkt.", websiteUrl: config.website_url }), text: `Nieuwe betaalde bestelling #${order.order_number}\nKlant: ${order.customer_name}\nE-mail: ${order.customer_email}\nTotaal: ${money(order.total_cents)}`, dedupe: `order-paid-${order.id}-admin` },
    ]
    const results = []
    for (const delivery of deliveries) {
      const { data: existing } = await db.from("email_messages").select("id,status").eq("dedupe_key", delivery.dedupe).maybeSingle()
      if (existing?.status === "sent") { results.push({ kind: delivery.kind, status: "already_sent" }); continue }
      const log = existing || await logEmail(db, { kind: delivery.kind, recipient_email: delivery.to, subject: delivery.subject, order_id: order.id, customer_id: order.customer_id, dedupe_key: delivery.dedupe })
      try {
        const sent = await sendEmail({ to: delivery.to, subject: delivery.subject, html: delivery.html, text: delivery.text, idempotencyKey: delivery.dedupe, config })
        await markEmail(db, log.id, { status: "sent", providerId: sent.id })
        results.push({ kind: delivery.kind, status: "sent" })
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : "E-mail kon niet worden verstuurd."
        await markEmail(db, log.id, { status: "failed", error: message })
        results.push({ kind: delivery.kind, status: "failed", error: message })
      }
    }
    if (results.some((result) => result.status === "failed")) return Response.json({ error: "Een of meer e-mails konden niet worden verstuurd.", results }, { status: 503, headers })
    return Response.json({ success: true, results }, { headers: { ...headers, "Content-Type": "application/json" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ordermails konden niet worden verstuurd."
    return Response.json({ error: message }, { status: /ingelogd|sessie|toegang/i.test(message) ? 401 : 500, headers })
  }
})
