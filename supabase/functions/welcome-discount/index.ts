import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { adminClient, corsHeaders, escapeEmailHtml, getEmailConfig, logEmail, markEmail, sendEmail } from "../_shared/email.ts"

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })

  try {
    const body = await request.json()
    if (String(body.company || "").trim()) return Response.json({ success: true }, { headers })
    const email = String(body.email || "").trim().toLowerCase().slice(0, 254)
    const firstName = String(body.first_name || "").trim().slice(0, 60)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return Response.json({ error: "Vul een geldig e-mailadres in." }, { status: 400, headers })

    const db = adminClient()
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown"
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`welcome|${ip}|${request.headers.get("user-agent") || "unknown"}`))
    const fingerprint = [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("")
    const { data: allowed, error: rateError } = await db.rpc("enforce_contact_rate_limit", { p_fingerprint: fingerprint })
    if (rateError) throw rateError
    if (!allowed) return Response.json({ error: "Te veel pogingen. Probeer het over 15 minuten opnieuw." }, { status: 429, headers })

    const { data: issued, error: issueError } = await db.rpc("issue_welcome_discount", { p_email: email, p_first_name: firstName })
    if (issueError) return Response.json({ error: issueError.message || "De korting kon niet worden aangemaakt." }, { status: issueError.code === "22023" ? 400 : 500, headers })

    const code = String(issued.code)
    const endsAt = new Date(issued.ends_at)
    const validUntil = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(endsAt)
    const config = await getEmailConfig(db)
    const websiteUrl = String(config.website_url || "https://zolsolutions.nl").replace(/\/$/, "")
    const videoUrl = `${websiteUrl}/founder-story/`
    const unsubscribeUrl = `${websiteUrl}/uitschrijven/?token=${encodeURIComponent(issued.unsubscribe_token)}`
    const greeting = issued.first_name ? `Hoi ${issued.first_name},` : "Hoi,"
    const subject = issued.first_name ? `${issued.first_name}, hier is je ZOL-code` : "Hier is je ZOL-code"

    // Lichte vormgeving met alleen het logo (geen video of grote knop): zwaar opgemaakte mails belanden in het Gmail-tabblad Reclame.
    const p = (text: string) => `<p style="margin:0 0 16px">${escapeEmailHtml(text)}</p>`
    const html = `<div style="max-width:520px;margin:0 auto;padding:8px 4px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#243447">
<div style="margin:0 0 26px;padding:22px 24px;border-bottom:4px solid #f26a21;border-radius:12px 12px 0 0;background:#102b4a"><img src="${escapeEmailHtml(websiteUrl)}/media/zol-logo-v4.png" width="84" alt="ZOL" style="display:block;width:84px;height:auto;border:0"></div>
${p(greeting)}
${p("Leuk dat je je hebt aangemeld voor de ZOL-nieuwsbrief! Hieronder staat je persoonlijke code voor 10% korting. Vul hem in bij het afrekenen.")}
<div style="margin:0 0 22px;padding:18px 20px;border:2px dashed #9fc4e8;border-radius:12px;background:#f3f6f8;text-align:center">
<div style="font-size:30px;font-weight:700;letter-spacing:3px;color:#102b4a">${escapeEmailHtml(code)}</div>
<div style="margin-top:6px;font-size:13px;color:#66798c">Eenmalig te gebruiken en geldig tot ${escapeEmailHtml(validUntil)}</div>
</div>
<p style="margin:0 0 16px">Benieuwd waarom we ZOL zijn begonnen? Dat vertellen we in <a href="${escapeEmailHtml(videoUrl)}" style="color:#f26a21;font-weight:700">onze founder story</a>.</p>
${p("Heb je vragen? Antwoord gerust op deze mail.")}
<p style="margin:0">Groet,<br><strong>Het ZOL-team</strong></p>
<p style="margin:28px 0 0;padding-top:14px;border-top:1px solid #e4e9ee;color:#8a97a5;font-size:12px">Je ontvangt deze mail omdat je je via zolsolutions.nl hebt aangemeld voor de nieuwsbrief. <a href="${escapeEmailHtml(unsubscribeUrl)}" style="color:#8a97a5">Afmelden</a></p>
</div>`
    const text = `${greeting}\n\nLeuk dat je je hebt aangemeld voor de ZOL-nieuwsbrief! Hier is je persoonlijke code voor 10% korting: ${code}\nEenmalig te gebruiken en geldig tot ${validUntil}. Vul hem in bij het afrekenen.\n\nBenieuwd waarom we ZOL zijn begonnen? Bekijk onze founder story: ${videoUrl}\n\nHeb je vragen? Antwoord gerust op deze mail.\n\nGroet,\nHet ZOL-team\n\nAfmelden: ${unsubscribeUrl}`

    const emailLog = await logEmail(db, { kind: "welcome_discount", recipient_email: email, subject, body_preview: `Persoonlijke code ${code}`, dedupe_key: `welcome-${code}` })
    let mailed = false
    try {
      const sent = await sendEmail({
        to: email,
        subject,
        html,
        text,
        idempotencyKey: `welcome-${code}`,
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
        config,
      })
      await markEmail(db, emailLog.id, { status: "sent", providerId: sent.id })
      mailed = true
    } catch (emailError) {
      await markEmail(db, emailLog.id, { status: "failed", error: emailError instanceof Error ? emailError.message : "E-mail kon niet worden verstuurd." })
    }

    return Response.json({ success: true, code, valid_until: validUntil, mailed }, { headers })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Er ging iets mis." }, { status: 500, headers })
  }
})
