import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import {
  adminClient, corsHeaders, emailShell, escapeHtml, getEmailConfig, getEmailTemplate,
  logEmail, markEmail, money, renderTemplate, requireAdmin, safeEmailUrl, sendEmail,
  templateParagraphs,
} from "../_shared/email.ts"

type OrderRow = Record<string, any>

const actionTemplates: Record<string, string[]> = {
  created: ["order_received", "new_order_admin"],
  paid: ["payment_confirmed", "new_order_admin"],
  shipping: ["order_shipped"],
  delivered: ["order_delivered"],
  returned: ["order_returned"],
  cancelled: ["order_cancelled"],
  refunded: ["refund_confirmed"],
}

function addressLine(address: Record<string, string> = {}) {
  return [address.street, [address.postal_code, address.city].filter(Boolean).join(" "), address.country === "NL" ? "Nederland" : address.country].filter(Boolean).join(", ")
}

function itemTable(order: OrderRow) {
  const rows = (order.order_items || []).map((item: Record<string, unknown>) => `<tr><td style="padding:13px 0;border-bottom:1px solid #e7ebef"><strong style="color:#102b4a">${escapeHtml(item.product_name)}</strong><br><span style="color:#6b7b8b;font-size:12px">${escapeHtml(item.variant_name)} · ${item.quantity} × ${money(Number(item.unit_price_cents), order.currency)}</span></td><td align="right" style="padding:13px 0;border-bottom:1px solid #e7ebef;font-weight:700">${money(Number(item.total_cents), order.currency)}</td></tr>`).join("")
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 24px;font-size:14px">${rows}</table>`
}

function totalsTable(order: OrderRow) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;font-size:14px;color:#445b70"><tr><td style="padding:7px 0">Subtotaal</td><td align="right">${money(order.subtotal_cents, order.currency)}</td></tr>${order.discount_cents ? `<tr><td style="padding:7px 0">Korting${order.discount_code ? ` (${escapeHtml(order.discount_code)})` : ""}</td><td align="right">− ${money(order.discount_cents, order.currency)}</td></tr>` : ""}<tr><td style="padding:7px 0">Verzending</td><td align="right">${order.shipping_cents ? money(order.shipping_cents, order.currency) : "Gratis"}</td></tr><tr><td style="padding:14px 0 0;border-top:2px solid #102b4a;color:#102b4a;font-size:17px;font-weight:700">Totaal</td><td align="right" style="padding:14px 0 0;border-top:2px solid #102b4a;color:#102b4a;font-size:17px;font-weight:700">${money(order.total_cents, order.currency)}</td></tr></table>`
}

function detailBlock(key: string, order: OrderRow, variables: Record<string, unknown>) {
  if (["order_received", "payment_confirmed", "new_order_admin"].includes(key)) {
    const customer = key === "new_order_admin" ? `<div style="margin:0 0 22px;padding:18px;border-radius:12px;background:#f3f6f8;color:#445b70;font-size:13px;line-height:1.7"><strong style="color:#102b4a">${escapeHtml(order.customer_name || order.customer_email)}</strong><br><a href="mailto:${escapeHtml(order.customer_email)}" style="color:#33669b">${escapeHtml(order.customer_email)}</a><br>${escapeHtml(addressLine(order.shipping_address || {}))}</div>` : ""
    const address = key !== "new_order_admin" ? `<div style="margin-top:4px;padding:18px;border-radius:12px;background:#f3f6f8;color:#445b70;font-size:13px;line-height:1.65"><strong style="color:#102b4a">Bezorgadres</strong><br>${escapeHtml(addressLine(order.shipping_address || {}))}</div>` : ""
    return `${customer}${itemTable(order)}${totalsTable(order)}${address}`
  }
  if (key === "order_shipped") return `<div style="margin:4px 0 22px;padding:18px;border-radius:12px;background:#f3f6f8"><span style="display:block;color:#6b7b8b;font-size:11px">Trackingcode · ${escapeHtml(variables.carrier)}</span><strong style="display:block;margin-top:6px;color:#102b4a;font-size:20px;letter-spacing:.04em">${escapeHtml(variables.tracking_code)}</strong></div>`
  if (key === "refund_confirmed") return `<div style="margin:4px 0 22px;padding:18px;border-radius:12px;background:#edf6f1"><span style="display:block;color:#577263;font-size:11px">Terugbetaald bedrag</span><strong style="display:block;margin-top:6px;color:#17603d;font-size:25px">${escapeHtml(variables.refund_amount)}</strong><span style="display:block;margin-top:7px;color:#577263;font-size:12px">Totaal terugbetaald: ${escapeHtml(variables.refunded_total)}</span></div>`
  return ""
}

function dedupeKey(key: string, order: OrderRow, payment: OrderRow = {}) {
  if (key === "order_shipped") return `${key}-${order.id}-${order.tracking_code}`
  if (key === "refund_confirmed") return `${key}-${order.id}-${payment.metadata?.last_refund_at || payment.refunded_cents || "refund"}`
  return `${key}-${order.id}`
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

    const body = await request.json()
    const orderId = String(body.order_id || "")
    const action = String(body.action || "paid")
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return Response.json({ error: "Bestelling ontbreekt." }, { status: 400, headers })
    const templateKeys = actionTemplates[action] || (["order_received", "payment_confirmed", "order_shipped", "order_delivered", "order_returned", "order_cancelled", "refund_confirmed", "new_order_admin"].includes(action) ? [action] : [])
    if (!templateKeys.length) return Response.json({ error: "Onbekend e-mailmoment." }, { status: 400, headers })

    const [{ data: order, error: orderError }, { data: payment }] = await Promise.all([
      db.from("orders").select("*, order_items(*)").eq("id", orderId).maybeSingle(),
      db.from("payments").select("*").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ])
    if (orderError || !order) return Response.json({ error: "Bestelling niet gevonden." }, { status: 404, headers })
    if (templateKeys.includes("payment_confirmed") && order.payment_status !== "paid") return Response.json({ error: "De bestelling is nog niet betaald." }, { status: 409, headers })
    if (templateKeys.includes("order_shipped") && !order.tracking_code) return Response.json({ error: "Voeg eerst een trackingcode toe." }, { status: 409, headers })
    if (templateKeys.includes("order_shipped") && order.postnl?.environment === "sandbox" && order.postnl?.barcode === order.tracking_code) {
      return Response.json({ success: true, skipped: "sandbox_tracking", results: [] }, { headers })
    }

    const config = await getEmailConfig(db)
    if (!config.enabled) return Response.json({ success: true, skipped: "email_disabled", results: [] }, { headers: { ...headers, "Content-Type": "application/json" } })
    const websiteUrl = String(config.website_url || "https://zolsolutions.nl").replace(/\/$/, "")
    const adminUrl = String(config.admin_url || "https://zol-solutions.pages.dev/admin/").replace(/\/$/, "")
    const customerName = order.customer_name || order.customer_email
    const customerFirstName = String(customerName).trim().split(/\s+/)[0] || "daar"
    const refundAmountCents = Number(body.amount_cents || payment?.metadata?.last_refund_cents || payment?.refunded_cents || 0)
    const trackingUrl = safeEmailUrl(order.tracking_url || websiteUrl, websiteUrl)
    const variables: Record<string, unknown> = {
      customer_first_name: customerFirstName, customer_name: customerName, customer_email: order.customer_email,
      order_id: order.id, order_number: order.order_number, order_total: money(order.total_cents, order.currency),
      order_subtotal: money(order.subtotal_cents, order.currency), shipping_cost: order.shipping_cents ? money(order.shipping_cents, order.currency) : "Gratis",
      discount_amount: money(order.discount_cents || 0, order.currency), discount_code: order.discount_code || "",
      carrier: order.tracking_carrier || "de bezorgdienst", tracking_code: order.tracking_code || "", tracking_url: trackingUrl,
      refund_amount: money(refundAmountCents, order.currency), refunded_total: money(payment?.refunded_cents || refundAmountCents, order.currency),
      website_url: websiteUrl, admin_url: adminUrl,
    }

    const results = []
    for (const key of templateKeys) {
      const template = await getEmailTemplate(key, db)
      if (!template.enabled) { results.push({ kind: key, status: "disabled" }); continue }
      const recipient = template.audience === "admin" ? (config.admin_email || "info@zolsolutions.nl") : order.customer_email
      const subject = renderTemplate(template.subject_template, variables).slice(0, 240)
      const dedupe = dedupeKey(key, order, payment || {})
      const { data: existing } = await db.from("email_messages").select("id,status").eq("dedupe_key", dedupe).maybeSingle()
      if (existing?.status === "sent") { results.push({ kind: key, status: "already_sent" }); continue }

      const bodyHtml = templateParagraphs(template.body_template, variables)
      const details = detailBlock(key, order, variables)
      const buttonLabel = renderTemplate(template.button_label_template, variables)
      const buttonUrl = renderTemplate(template.button_url_template, variables)
      const html = emailShell(`${bodyHtml}${details}`, {
        eyebrow: renderTemplate(template.eyebrow_template, variables),
        title: renderTemplate(template.title_template, variables),
        intro: renderTemplate(template.intro_template, variables),
        websiteUrl, logoUrl: config.logo_url, buttonLabel, buttonUrl,
      })
      const text = [renderTemplate(template.title_template, variables), renderTemplate(template.intro_template, variables), renderTemplate(template.body_template, variables), key === "order_shipped" ? `Trackingcode: ${order.tracking_code}\n${trackingUrl}` : "", key === "refund_confirmed" ? `Terugbetaald: ${money(refundAmountCents, order.currency)}` : "", buttonLabel && buttonUrl ? `${buttonLabel}: ${buttonUrl}` : ""].filter(Boolean).join("\n\n")
      const log = existing || await logEmail(db, { kind: key, recipient_email: recipient, subject, body_preview: text.slice(0, 280), order_id: order.id, customer_id: order.customer_id, dedupe_key: dedupe })
      try {
        const sent = await sendEmail({ to: recipient, subject, html, text, idempotencyKey: dedupe, config })
        await markEmail(db, log.id, { status: "sent", providerId: sent.id })
        results.push({ kind: key, status: "sent" })
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : "E-mail kon niet worden verstuurd."
        await markEmail(db, log.id, { status: "failed", error: message })
        results.push({ kind: key, status: "failed", error: message })
      }
    }

    if (results.some((result) => result.status === "failed")) return Response.json({ error: "Een of meer e-mails konden niet worden verstuurd.", results }, { status: 503, headers })
    return Response.json({ success: true, results }, { headers: { ...headers, "Content-Type": "application/json" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ordermails konden niet worden verstuurd."
    return Response.json({ error: message }, { status: /ingelogd|sessie|toegang/i.test(message) ? 401 : 500, headers })
  }
})
