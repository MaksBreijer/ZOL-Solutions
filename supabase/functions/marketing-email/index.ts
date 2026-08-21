import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import {
  adminClient,
  emailShell,
  escapeHtml,
  getEmailConfig,
  getEmailTemplate,
  logEmail,
  markEmail,
  renderTemplate,
  sendEmail,
  templateParagraphs,
} from "../_shared/email.ts"

const TEMPLATE_KEY = "marketing_product_update"
const MAX_PER_RUN = 50

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 })

  try {
    const db = adminClient()
    const suppliedSecret = request.headers.get("x-zol-marketing-secret") || ""
    const { data: verified, error: verificationError } = await db.rpc("verify_marketing_cron_secret", { p_secret: suppliedSecret })
    if (verificationError || !verified) return Response.json({ error: "Niet toegestaan." }, { status: 401 })

    const config = await getEmailConfig(db)
    if (!config.enabled || !config.marketing_enabled) {
      return Response.json({ success: true, status: "disabled", sent: 0 })
    }

    const template = await getEmailTemplate(TEMPLATE_KEY, db)
    if (!template.enabled) return Response.json({ success: true, status: "template_disabled", sent: 0 })

    const now = new Date()
    const intervalDays = Math.min(90, Math.max(21, Number(config.marketing_interval_days || 21)))
    const { data: customers, error: customerError } = await db
      .from("customers")
      .select("id,email,first_name,last_name,marketing_unsubscribe_token,marketing_next_send_at")
      .eq("marketing_opt_in", true)
      .is("marketing_unsubscribed_at", null)
      .lte("marketing_next_send_at", now.toISOString())
      .order("marketing_next_send_at", { ascending: true })
      .limit(MAX_PER_RUN)
    if (customerError) throw customerError

    const websiteUrl = String(config.website_url || "https://zolsolutions.nl").replace(/\/$/, "")
    const results: Array<Record<string, unknown>> = []

    for (const customer of customers || []) {
      const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.email
      const firstName = customer.first_name || "daar"
      const unsubscribeUrl = `${websiteUrl}/uitschrijven/?token=${encodeURIComponent(customer.marketing_unsubscribe_token)}`
      const variables: Record<string, unknown> = {
        customer_first_name: firstName,
        customer_name: fullName,
        website_url: websiteUrl,
        product_url: `${websiteUrl}/product/`,
        unsubscribe_url: unsubscribeUrl,
      }
      const subject = renderTemplate(template.subject_template, variables).slice(0, 240)
      const body = templateParagraphs(template.body_template, variables)
      const compliance = `<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e4e9ee;color:#738496;font-size:11px;line-height:1.6">Je ontvangt deze productupdate omdat je daar via ZOL Solutions toestemming voor hebt gegeven. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#33669b">Direct afmelden</a>.</div>`
      const html = emailShell(`${body}${compliance}`, {
        eyebrow: renderTemplate(template.eyebrow_template, variables),
        title: renderTemplate(template.title_template, variables),
        intro: renderTemplate(template.intro_template, variables),
        websiteUrl,
        logoUrl: config.logo_url,
        buttonLabel: renderTemplate(template.button_label_template, variables),
        buttonUrl: renderTemplate(template.button_url_template, variables),
      })
      const text = [
        renderTemplate(template.title_template, variables),
        renderTemplate(template.intro_template, variables),
        renderTemplate(template.body_template, variables),
        `Afmelden: ${unsubscribeUrl}`,
      ].filter(Boolean).join("\n\n")
      const dueKey = String(customer.marketing_next_send_at || now.toISOString()).slice(0, 10)
      const dedupeKey = `${TEMPLATE_KEY}-${customer.id}-${dueKey}`
      const { data: existing } = await db.from("email_messages").select("id,status").eq("dedupe_key", dedupeKey).maybeSingle()
      const log = existing || await logEmail(db, {
        kind: TEMPLATE_KEY,
        recipient_email: customer.email,
        subject,
        body_preview: text.slice(0, 500),
        customer_id: customer.id,
        dedupe_key: dedupeKey,
      })

      try {
        const sent = await sendEmail({ to: customer.email, subject, html, text, idempotencyKey: dedupeKey, config })
        await markEmail(db, log.id, { status: "sent", providerId: sent.id })
        const nextSend = new Date(now.getTime() + intervalDays * 86_400_000).toISOString()
        await db.from("customers").update({ marketing_last_sent_at: now.toISOString(), marketing_next_send_at: nextSend }).eq("id", customer.id)
        results.push({ customer_id: customer.id, status: "sent", next_send_at: nextSend })
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : "Marketingmail kon niet worden verstuurd."
        await markEmail(db, log.id, { status: "failed", error: message })
        results.push({ customer_id: customer.id, status: "failed", error: message })
      }
    }

    return Response.json({
      success: true,
      processed: results.length,
      sent: results.filter((result) => result.status === "sent").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Marketingmails konden niet worden verwerkt." }, { status: 500 })
  }
})
