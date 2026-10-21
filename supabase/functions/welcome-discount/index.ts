import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { adminClient, corsHeaders, emailShell, escapeEmailHtml, getEmailConfig, logEmail, markEmail, sendEmail } from "../_shared/email.ts"

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
    const subject = "Jouw persoonlijke ZOL-code en onze founder story"

    const paragraph = (text: string) => `<p style="margin:0 0 18px;color:#445b70;font-size:15px;line-height:1.72">${escapeEmailHtml(text)}</p>`
    const content = `${paragraph(greeting)}
      ${paragraph("Leuk dat je je hebt aangemeld voor de ZOL-nieuwsbrief! Hieronder vind je je persoonlijke kortingscode en de video waarin wij vertellen waarom we ZOL begonnen.")}
      <div style="margin:0 0 22px;padding:20px;border:2px dashed #9fc4e8;border-radius:14px;text-align:center;background:#f3f6f8">
        <p style="margin:0 0 6px;color:#66798c;font-size:12px;letter-spacing:1px;text-transform:uppercase">Jouw code voor 10% korting</p>
        <p style="margin:0;color:#102b4a;font-size:30px;font-weight:700;letter-spacing:2px">${escapeEmailHtml(code)}</p>
        <p style="margin:8px 0 0;color:#66798c;font-size:13px">Eenmalig te gebruiken en geldig tot ${escapeEmailHtml(validUntil)}.</p>
      </div>
      <video controls playsinline preload="none" width="260" poster="${escapeEmailHtml(websiteUrl)}/media/founder-story-poster.jpg" style="display:block;width:260px;max-width:100%;height:auto;margin:0 auto 10px;border-radius:14px"><source src="${escapeEmailHtml(websiteUrl)}/media/founder-story.mp4" type="video/mp4"><a href="${escapeEmailHtml(videoUrl)}" style="display:block"><img src="${escapeEmailHtml(websiteUrl)}/media/founder-story-poster.jpg" width="260" alt="Bekijk onze founder story" style="display:block;width:260px;max-width:100%;height:auto;margin:0 auto;border-radius:14px"></a></video>
      <p style="margin:0 0 22px;text-align:center;color:#738496;font-size:12px">Speelt de video hier niet af? <a href="${escapeEmailHtml(videoUrl)}" style="color:#33669b">Bekijk hem op onze website</a>.</p>
      ${paragraph("Je vult de code in bij het afrekenen. Heb je vragen? Antwoord gerust op deze mail.")}
      <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e4e9ee;color:#738496;font-size:11px;line-height:1.6">Je ontvangt deze mail omdat je je via zolsolutions.nl hebt aangemeld voor de nieuwsbrief. <a href="${escapeEmailHtml(unsubscribeUrl)}" style="color:#33669b">Direct afmelden</a>.</div>`
    const text = `${greeting}\n\nLeuk dat je je hebt aangemeld voor de ZOL-nieuwsbrief!\n\nJouw persoonlijke code voor 10% korting: ${code}\nEenmalig te gebruiken en geldig tot ${validUntil}.\n\nBekijk onze founder story: ${videoUrl}\n\nAfmelden: ${unsubscribeUrl}`

    const emailLog = await logEmail(db, { kind: "welcome_discount", recipient_email: email, subject, body_preview: `Persoonlijke code ${code}`, dedupe_key: `welcome-${code}` })
    let mailed = false
    try {
      const sent = await sendEmail({
        to: email,
        subject,
        html: emailShell(content, { eyebrow: "Welkom bij ZOL", title: "Jouw 10% korting en onze founder story", websiteUrl, logoUrl: config.logo_url, buttonLabel: "Bekijk de founder story", buttonUrl: videoUrl }),
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
