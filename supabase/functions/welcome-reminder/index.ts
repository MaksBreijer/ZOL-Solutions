import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { adminClient, escapeEmailHtml, getEmailConfig, logEmail, markEmail, sendEmail } from "../_shared/email.ts"
import { purchaseReminderCopy } from "../_shared/purchase-reminder.js"

// Herinnert aanmelders die nog niets hebben gekocht: na een half uur, een dag en drie dagen,
// daarna wekelijks zolang hun 10%-code ongebruikt is.
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

    const websiteUrl = String(config.website_url || "https://zolsolutions.nl").replace(/\/$/, "")
    const productUrl = `${websiteUrl}/product/`
    // Afbeeldingen via Supabase-opslag: elk zolsolutions.nl-adres in de mail scoort in Razor2 als spam.
    const mediaBase = `${String(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "")}/storage/v1/object/public/zol-media/email`
    const logoUrl = `${mediaBase}/zol-logo-email-v4.png`
    const replyTo = String(config.reply_to || "info@zolsolutions.nl")
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "")
    const results: Array<Record<string, unknown>> = []

    const buildMail = (row: Record<string, any>) => {
      const validUntil = row.code_ends_at
        ? new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(row.code_ends_at))
        : ""
      const copy = purchaseReminderCopy({ step: row.reminder_number, firstName: row.first_name, code: row.code, validUntil, introduceCode: Boolean(row.introduce_code) })
      const unsubscribeUrl = `${websiteUrl}/uitschrijven/?token=${encodeURIComponent(row.unsubscribe_token)}`
      const oneClickUrl = `${supabaseUrl}/functions/v1/marketing-unsubscribe?token=${encodeURIComponent(row.unsubscribe_token)}`
      // Bewust een eenvoudige, persoonlijke mail (geen zware template, één afbeelding, weinig links):
      // dat lijkt op een gewone mail en belandt daardoor veel minder vaak in de spam of het promotietabblad.
      const about = "De ZOL'tjes zijn korte inlegzooltjes met een zachte hielondersteuning. We hebben ze ontwikkeld voor kinderen met hielpijn door de ziekte van Sever, zodat ze weer zonder pijn kunnen sporten en spelen. Ze passen in de meeste sport- en vrijetijdsschoenen en je haalt ze makkelijk van het ene paar naar het andere."
      const sizing = "Twijfel je over de maat? Kies de maat van de schoen waar je kind het meest in sport. Past het toch niet goed, laat het ons weten, dan zoeken we samen een oplossing. En heb je een vraag over je kind, de klachten of de werking: stuur een berichtje terug, we lezen alles zelf."
      const p = (text: string) => `<p style="margin:0 0 16px">${escapeEmailHtml(text)}</p>`
      const logo = `<p style="margin:0 0 20px"><img src="${escapeEmailHtml(logoUrl)}" width="96" alt="ZOL" style="display:block;width:96px;height:auto;border:0"></p>`
      const photo = `<p style="margin:0 0 16px"><img src="${escapeEmailHtml(mediaBase)}/product-blue.jpg" width="280" alt="De ZOL'tjes" style="display:block;width:280px;max-width:100%;height:auto;border:0;border-radius:8px"></p>`
      const code = copy.hasCode ? `<p style="margin:0 0 16px">Je code: <strong style="font-size:17px;letter-spacing:1px">${escapeEmailHtml(row.code)}</strong>${validUntil ? ` (geldig tot ${escapeEmailHtml(validUntil)})` : ""}</p>` : ""
      const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeEmailHtml(copy.subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff"><div style="max-width:560px;padding:24px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2d3d">
${logo}${p(copy.greeting)}${p(copy.intro)}${code}${p(about)}${photo}${p(sizing)}<p style="margin:0 0 16px">Je bestelt ze via onze website, de code vul je in bij het afrekenen.</p>${p(copy.closing)}<p style="margin:0 0 24px">Groetjes,<br>Maks en Thijn<br>ZOL Solutions</p>
<p style="margin:0;color:#8a96a3;font-size:12px">Je krijgt deze mail omdat je je op onze website hebt aangemeld voor 10% korting. Liever geen mails meer? Antwoord dan met "afmelden" of gebruik de afmeldknop van je mailprogramma.</p>
</div></body></html>`
      const text = `${copy.greeting}\n\n${copy.intro}\n\n${copy.hasCode ? `Je code: ${row.code}${validUntil ? ` (geldig tot ${validUntil})` : ""}\n\n` : ""}${about}\n\n${sizing}\n\nJe bestelt ze via onze website, de code vul je in bij het afrekenen.\n\n${copy.closing}\n\nGroetjes,\nMaks en Thijn\nZOL Solutions\n\nLiever geen mails meer? Antwoord dan met "afmelden" of gebruik de afmeldknop van je mailprogramma.`
      return { copy, unsubscribeUrl, oneClickUrl, text, html }
    }

    // Testmodus: stuurt de drie mails (plus de variant zonder code) alleen naar het beheeradres, zonder klanten aan te raken.
    const body = await request.json().catch(() => ({}))
    if (body?.test === true) {
      // Optioneel: één realistische mail naar een spamtestdienst (alleen mail-tester.com) om de spamscore te meten.
      const testTo = String(body.to || "").trim().toLowerCase()
      const noImages = body.no_images === true
      const noLinks = body.no_links === true
      const onlyUnsubscribe = body.only_unsubscribe === true
      const spamCheck = /^[a-z0-9-]+@srv\d+\.mail-tester\.com$/.test(testTo)
      const recipient = spamCheck ? testTo : String(config.admin_email || "info@zolsolutions.nl").split(",")[0].trim().toLowerCase()
      const codeEndsAt = new Date(Date.now() + 27 * 86_400_000).toISOString()
      const samples = [
        { reminder_number: 1, code: "VOORBEELD-AB12", code_ends_at: codeEndsAt },
        { reminder_number: 2, code: "VOORBEELD-AB12", code_ends_at: codeEndsAt },
        { reminder_number: 3, code: "VOORBEELD-AB12", code_ends_at: codeEndsAt },
        { reminder_number: 4, code: "VOORBEELD-AB12", code_ends_at: codeEndsAt },
        { reminder_number: 4, code: "VOORBEELD-AB12", code_ends_at: codeEndsAt, introduce_code: true },
        { reminder_number: 1, code: null, code_ends_at: null },
      ]
      const outcomes: Array<Record<string, unknown>> = []
      for (const sample of spamCheck ? [samples[3]] : samples) {
        const mail = buildMail({ ...sample, first_name: "Test", unsubscribe_token: "test" })
        if (onlyUnsubscribe) { mail.html = mail.html.replace(/<p style="margin:0 0 16px">Bekijk ze hier:[\s\S]*?<\/p>/, ""); mail.text = mail.text.replace(/Bekijk ze hier: \S+\n\n/, "") }
        if (noLinks) { mail.html = mail.html.replace(/<a [^>]*>([^<]*)<\/a>/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/zolsolutions\.nl\/\S*/g, ""); mail.text = mail.text.replace(/https?:\/\/\S+/g, "") }
        if (noImages) mail.html = mail.html.replace(/<p style="margin:0 0 \d+px">\s*<img[^>]*><\/p>/g, "")
        try {
          const sent = await sendEmail({ to: recipient, subject: spamCheck ? mail.copy.subject : `[TEST] ${mail.copy.subject}`, html: mail.html, text: mail.text, idempotencyKey: `purchase-reminder-test-${crypto.randomUUID()}`, config,
            headers: { "List-Unsubscribe": `<${mail.oneClickUrl}>, <mailto:${replyTo}?subject=afmelden>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } })
          outcomes.push({ step: mail.copy.step, with_code: mail.copy.hasCode, status: "sent", id: sent.id })
        } catch (sendError) {
          outcomes.push({ step: mail.copy.step, with_code: mail.copy.hasCode, status: "failed", error: sendError instanceof Error ? sendError.message : "onbekend" })
        }
      }
      return Response.json({ success: true, test: true, recipient, results: outcomes })
    }

    // Aanmelders zonder code krijgen na de eerste reeks alsnog een eigen 10%-code (dan lopen ze mee in de wekelijkse mail).
    const { error: issueError } = await db.rpc("issue_missing_reminder_codes", { p_limit: 50 })
    if (issueError) console.error("Codes uitgeven mislukt", issueError.message)

    const { data: due, error: dueError } = await db.rpc("due_purchase_reminders", { p_limit: 50 })
    if (dueError) throw dueError

    for (const row of due || []) {
      // Code die we zelf na de eerste reeks uitgaven en nog nooit gemaild is: eerste wekelijkse mail introduceert hem.
      if (Number(row.reminder_number) === 4 && row.code) {
        const { data: discount } = await db.from("discounts").select("title").eq("code", row.code).maybeSingle()
        row.introduce_code = discount?.title === "10% korting (herinnering, persoonlijk)"
      }
      // Wekelijkse herinneringen: houd de ongebruikte code minstens twee weken geldig.
      if (Number(row.reminder_number) >= 4 && row.code) {
        const minimumEnd = new Date(Date.now() + 14 * 86_400_000)
        if (!row.code_ends_at || new Date(row.code_ends_at) < minimumEnd) {
          await db.from("discounts").update({ ends_at: minimumEnd.toISOString() }).eq("code", row.code).eq("usage_count", 0)
          row.code_ends_at = minimumEnd.toISOString()
        }
      }
      const { copy, unsubscribeUrl, oneClickUrl, text, html } = buildMail(row)
      const dedupeKey = `purchase-reminder-${row.customer_id}-${copy.step}`
      const attemptAt = new Date().toISOString()

      const log = await logEmail(db, { kind: "welcome_reminder", recipient_email: row.email, customer_id: row.customer_id, subject: copy.subject, body_preview: copy.weekly ? `Wekelijkse herinnering (${copy.step}): code nog ongebruikt` : `Herinnering ${copy.step} van 3: nog geen aankoop`, dedupe_key: dedupeKey })
      try {
        const sent = await sendEmail({
          to: row.email,
          subject: copy.subject,
          html,
          text,
          idempotencyKey: dedupeKey,
          headers: {
            "List-Unsubscribe": `<${oneClickUrl}>, <mailto:${replyTo}?subject=afmelden>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          config,
        })
        await markEmail(db, log.id, { status: "sent", providerId: sent.id })
        await db.from("customers").update({ purchase_reminder_count: copy.step, purchase_reminder_attempt_at: null, purchase_reminder_last_sent_at: new Date().toISOString() }).eq("id", row.customer_id)
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
