import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { adminClient, emailShell, escapeEmailHtml, getEmailConfig, logEmail, markEmail, sendEmail } from "../_shared/email.ts"
import { purchaseReminderCopy } from "../_shared/purchase-reminder.js"

// Herinnert aanmelders die nog niets hebben gekocht: na een half uur, een dag en drie dagen.
// Wordt elke tien minuten door pg_cron aangeroepen; wie aan de beurt is bepaalt due_purchase_reminders.
Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 })

  try {
    const db = adminClient()
    const suppliedSecret = request.headers.get("x-zol-marketing-secret") || ""
    const { data: verified, error: verificationError } = await db.rpc("verify_marketing_cron_secret", { p_secret: suppliedSecret })
    if (verificationError || !verified) return Response.json({ error: "Niet toegestaan." }, { status: 401 })

    const config = await getEmailConfig(db)
    if (!config.enabled) return Response.json({ success: true, status: "disabled", sent: 0 })

    const { data: due, error: dueError } = await db.rpc("due_purchase_reminders", { p_limit: 50 })
    if (dueError) throw dueError

    const websiteUrl = String(config.website_url || "https://zolsolutions.nl").replace(/\/$/, "")
    const productUrl = `${websiteUrl}/product/`
    const results: Array<Record<string, unknown>> = []

    for (const row of due || []) {
      const validUntil = row.code_ends_at
        ? new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(row.code_ends_at))
        : ""
      const copy = purchaseReminderCopy({ step: row.reminder_number, firstName: row.first_name, code: row.code, validUntil })
      const unsubscribeUrl = `${websiteUrl}/uitschrijven/?token=${encodeURIComponent(row.unsubscribe_token)}`
      const paragraph = (text: string) => `<p style="margin:0 0 18px;color:#445b70;font-size:15px;line-height:1.72">${escapeEmailHtml(text)}</p>`
      const codeBlock = copy.hasCode
        ? `<div style="margin:0 0 22px;padding:20px;border:2px dashed #9fc4e8;border-radius:14px;text-align:center;background:#f3f6f8">
          <p style="margin:0 0 6px;color:#66798c;font-size:12px;letter-spacing:1px;text-transform:uppercase">Jouw code voor 10% korting</p>
          <p style="margin:0;color:#102b4a;font-size:30px;font-weight:700;letter-spacing:2px">${escapeEmailHtml(row.code)}</p>
          <p style="margin:8px 0 0;color:#66798c;font-size:13px">Eenmalig te gebruiken en geldig tot ${escapeEmailHtml(validUntil)}.</p>
        </div>`
        : ""
      const content = `${paragraph(copy.greeting)}
        ${paragraph(copy.intro)}
        ${codeBlock}
        ${paragraph(copy.closing)}
        <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e4e9ee;color:#738496;font-size:11px;line-height:1.6">Je ontvangt deze mail omdat je je via zolsolutions.nl hebt aangemeld voor mail van ZOL. <a href="${escapeEmailHtml(unsubscribeUrl)}" style="color:#33669b">Direct afmelden</a>.</div>`
      const text = `${copy.greeting}\n\n${copy.intro}\n\n${copy.hasCode ? `Jouw code: ${row.code} (geldig tot ${validUntil}).\n\n` : ""}${copy.closing}\n\nBekijk de ZOL'tjes: ${productUrl}\n\nAfmelden: ${unsubscribeUrl}`
      const dedupeKey = `purchase-reminder-${row.customer_id}-${copy.step}`
      const attemptAt = new Date().toISOString()

      const log = await logEmail(db, { kind: "welcome_reminder", recipient_email: row.email, subject: copy.subject, body_preview: `Herinnering ${copy.step} van 3: nog geen aankoop`, dedupe_key: dedupeKey })
      try {
        const sent = await sendEmail({
          to: row.email,
          subject: copy.subject,
          html: emailShell(content, { eyebrow: "Herinnering", title: copy.title, websiteUrl, logoUrl: config.logo_url, buttonLabel: "Bekijk de ZOL'tjes", buttonUrl: productUrl }),
          text,
          idempotencyKey: dedupeKey,
          headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
          config,
        })
        await markEmail(db, log.id, { status: "sent", providerId: sent.id })
        await db.from("customers").update({ purchase_reminder_count: copy.step, purchase_reminder_attempt_at: null }).eq("id", row.customer_id)
        results.push({ step: copy.step, status: "sent" })
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : "Herinnering kon niet worden verstuurd."
        await markEmail(db, log.id, { status: "failed", error: message })
        await db.from("customers").update({ purchase_reminder_attempt_at: attemptAt }).eq("id", row.customer_id)
        results.push({ step: copy.step, status: "failed", error: message })
      }
    }

    return Response.json({ success: true, processed: results.length, sent: results.filter((r) => r.status === "sent").length, results })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Herinneringen konden niet worden verwerkt." }, { status: 500 })
  }
})
