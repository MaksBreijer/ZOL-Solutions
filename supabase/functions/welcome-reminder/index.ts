import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { adminClient, emailShell, escapeEmailHtml, getEmailConfig, logEmail, markEmail, sendEmail } from "../_shared/email.ts"

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 })

  try {
    const db = adminClient()
    const suppliedSecret = request.headers.get("x-zol-marketing-secret") || ""
    const { data: verified, error: verificationError } = await db.rpc("verify_marketing_cron_secret", { p_secret: suppliedSecret })
    if (verificationError || !verified) return Response.json({ error: "Niet toegestaan." }, { status: 401 })

    const config = await getEmailConfig(db)
    if (!config.enabled) return Response.json({ success: true, status: "disabled", sent: 0 })

    const { data: due, error: dueError } = await db.rpc("due_welcome_reminders", { p_limit: 50 })
    if (dueError) throw dueError

    const websiteUrl = String(config.website_url || "https://zolsolutions.nl").replace(/\/$/, "")
    const productUrl = `${websiteUrl}/product/`
    const results: Array<Record<string, unknown>> = []

    for (const row of due || []) {
      const validUntil = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(row.ends_at))
      const daysLeft = Math.max(1, Math.ceil((new Date(row.ends_at).getTime() - Date.now()) / 86_400_000))
      const unsubscribeUrl = `${websiteUrl}/uitschrijven/?token=${encodeURIComponent(row.unsubscribe_token)}`
      const greeting = row.first_name ? `Hoi ${row.first_name},` : "Hoi,"
      const step = Number(row.reminder_number) || 1
      const subject = step === 1 ? `Je ZOL-code ${row.code} is nog niet gebruikt` : step === 2 ? `Nog 2 weken: jouw 10% ZOL-korting` : `Laatste kans: je ZOL-code verloopt over ${daysLeft} ${daysLeft === 1 ? "dag" : "dagen"}`
      const intro = step === 1
        ? `Een paar dagen geleden kreeg je 10% korting op je eerste ZOL'tjes. Je hebt je code nog niet gebruikt, dus een kleine herinnering: hij is nog ${daysLeft} ${daysLeft === 1 ? "dag" : "dagen"} geldig.`
        : step === 2
          ? `Je persoonlijke code voor 10% korting is halverwege: hij is nog ${daysLeft} ${daysLeft === 1 ? "dag" : "dagen"} geldig. Twijfel je of de ZOL'tjes iets voor jouw kind zijn? Antwoord gerust op deze mail, dan denken we met je mee.`
          : `Dit is de laatste herinnering: je code voor 10% korting verloopt over ${daysLeft} ${daysLeft === 1 ? "dag" : "dagen"}. Daarna kunnen we hem niet meer verlengen.`
      const title = step === 1 ? "Je 10% korting wacht nog op je" : step === 2 ? "Je 10% korting is halverwege" : "Laatste kans op je 10% korting"
      const paragraph = (text: string) => `<p style="margin:0 0 18px;color:#445b70;font-size:15px;line-height:1.72">${escapeEmailHtml(text)}</p>`
      const content = `${paragraph(greeting)}
        ${paragraph(intro)}
        <div style="margin:0 0 22px;padding:20px;border:2px dashed #9fc4e8;border-radius:14px;text-align:center;background:#f3f6f8">
          <p style="margin:0 0 6px;color:#66798c;font-size:12px;letter-spacing:1px;text-transform:uppercase">Jouw code voor 10% korting</p>
          <p style="margin:0;color:#102b4a;font-size:30px;font-weight:700;letter-spacing:2px">${escapeEmailHtml(row.code)}</p>
          <p style="margin:8px 0 0;color:#66798c;font-size:13px">Eenmalig te gebruiken en geldig tot ${escapeEmailHtml(validUntil)}.</p>
        </div>
        ${paragraph("Je vult de code in bij het afrekenen. Heb je vragen over de maat of werking? Antwoord gerust op deze mail.")}
        <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e4e9ee;color:#738496;font-size:11px;line-height:1.6">Je ontvangt deze mail omdat je je via zolsolutions.nl hebt aangemeld voor de nieuwsbrief. <a href="${escapeEmailHtml(unsubscribeUrl)}" style="color:#33669b">Direct afmelden</a>.</div>`
      const text = `${greeting}\n\n${intro}\n\nJouw code: ${row.code} (geldig tot ${validUntil}).\n\nBekijk de ZOL'tjes: ${productUrl}\n\nAfmelden: ${unsubscribeUrl}`
      const dedupeKey = `welcome-reminder-${row.discount_id}-${step}`

      const log = await logEmail(db, { kind: "welcome_reminder", recipient_email: row.email, subject, body_preview: `Herinnering code ${row.code}`, dedupe_key: dedupeKey })
      try {
        const sent = await sendEmail({
          to: row.email,
          subject,
          html: emailShell(content, { eyebrow: "Herinnering", title, websiteUrl, logoUrl: config.logo_url, buttonLabel: "Bekijk de ZOL'tjes", buttonUrl: productUrl }),
          text,
          idempotencyKey: dedupeKey,
          headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
          config,
        })
        await markEmail(db, log.id, { status: "sent", providerId: sent.id })
        await db.from("discounts").update({ reminder_sent_at: new Date().toISOString(), reminder_count: step }).eq("id", row.discount_id)
        results.push({ code: row.code, step, status: "sent" })
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : "Herinnering kon niet worden verstuurd."
        await markEmail(db, log.id, { status: "failed", error: message })
        results.push({ code: row.code, status: "failed", error: message })
      }
    }

    return Response.json({ success: true, processed: results.length, sent: results.filter((r) => r.status === "sent").length, results })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Herinneringen konden niet worden verwerkt." }, { status: 500 })
  }
})
