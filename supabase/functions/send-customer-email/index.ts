import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { adminClient, corsHeaders, emailShell, escapeHtml, getEmailConfig, logEmail, markEmail, requireAdmin, sendEmail } from "../_shared/email.ts"

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })
  const db = adminClient()
  try {
    const admin = await requireAdmin(request, db)
    const body = await request.json()
    const customerId = String(body.customer_id || "")
    const subject = String(body.subject || "").trim().slice(0, 160)
    const message = String(body.message || "").trim().slice(0, 10000)
    if (!/^[0-9a-f-]{36}$/i.test(customerId) || !subject || !message) return Response.json({ error: "Klant, onderwerp en bericht zijn verplicht." }, { status: 400, headers })
    const { data: customer, error: customerError } = await db.from("customers").select("id,email,first_name,last_name").eq("id", customerId).maybeSingle()
    if (customerError || !customer) return Response.json({ error: "Klant niet gevonden." }, { status: 404, headers })
    const config = await getEmailConfig(db)
    const firstName = customer.first_name || "daar"
    const content = `<p style="margin:0 0 20px;font-size:16px;line-height:1.7">Hoi ${escapeHtml(firstName)},</p><div style="color:#263b50;font-size:15px;line-height:1.75;white-space:pre-wrap">${escapeHtml(message)}</div><p style="margin:28px 0 0;font-size:15px;line-height:1.7">Sportieve groet,<br><strong>ZOL Solutions</strong></p>`
    const log = await logEmail(db, { kind: "admin_customer", recipient_email: customer.email, subject, body_preview: message.slice(0, 500), customer_id: customer.id, created_by: admin.id })
    try {
      const sent = await sendEmail({
        to: customer.email,
        subject,
        html: emailShell(content, { eyebrow: "Persoonlijk bericht", title: subject, websiteUrl: config.website_url }),
        text: `Hoi ${firstName},\n\n${message}\n\nSportieve groet,\nZOL Solutions`,
        config,
      })
      await markEmail(db, log.id, { status: "sent", providerId: sent.id })
      await db.from("activity_log").insert({ actor_id: admin.id, actor_email: admin.email, action: "E-mail naar klant verstuurd", entity_type: "customer", entity_id: customer.id, details: { subject } })
      return Response.json({ success: true }, { headers: { ...headers, "Content-Type": "application/json" } })
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "E-mail kon niet worden verstuurd."
      await markEmail(db, log.id, { status: "failed", error: message })
      return Response.json({ error: message }, { status: 503, headers })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "E-mail kon niet worden verstuurd."
    const status = /ingelogd|sessie|toegang/i.test(message) ? 401 : 500
    return Response.json({ error: message }, { status, headers })
  }
})
