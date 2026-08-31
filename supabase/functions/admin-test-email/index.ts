import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.112.3"

const allowedOrigins = new Set(["https://zol-solutions.pages.dev", "https://zolsolutions.nl", "https://www.zolsolutions.nl", "http://localhost:5173", "http://127.0.0.1:5173"])
const corsHeaders = (request: Request) => { const origin = request.headers.get("origin") || ""; return { "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://zolsolutions.nl", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" } }
const adminClient = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } })
const escapeHtml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;")

async function requireAdmin(request: Request, db = adminClient()) {
  const authorization = request.headers.get("Authorization")
  if (!authorization?.startsWith("Bearer ")) throw new Error("Niet ingelogd.")
  const token = authorization.slice(7)
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) throw new Error("Ongeldige sessie.")
  const { data: assurance, error: assuranceError } = await db.auth.mfa.getAuthenticatorAssuranceLevel(token)
  if (assuranceError || assurance?.currentLevel !== "aal2") throw new Error("Tweestapsverificatie is vereist voor ZOL Admin.")
  const sessionId = String((await db.auth.getClaims(token)).data?.claims?.session_id || "")
  const { data: activeSession, error: sessionError } = await db.rpc("admin_session_is_active", { p_user_id: user.id, p_session_id: sessionId || null })
  if (sessionError || activeSession !== true) throw new Error("Deze beheerderssessie is ingetrokken. Log opnieuw in.")
  const { data: profile } = await db.from("admin_profiles").select("id,email,role,active").eq("id", user.id).maybeSingle()
  if (!profile?.active) throw new Error("Geen toegang tot ZOL Admin.")
  return profile
}

function emailShell(text: string, websiteUrl: string) {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f3f5f7;color:#10233b;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border-radius:22px;background:#fff;overflow:hidden"><tr><td style="padding:34px 38px;background:#102b4a;color:#fff"><p style="margin:0 0 8px;color:#9fc4e8;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Test aankoopbevestiging</p><h1 style="margin:0;font-size:34px;line-height:1.08">Je aankoop is gelukt.</h1></td></tr><tr><td style="padding:34px 38px"><p style="margin:0;color:#445b70;font-size:15px;line-height:1.72">${escapeHtml(text)}</p></td></tr><tr><td style="padding:22px 38px;border-top:1px solid #e4e9ee;color:#66798c;font-size:12px">ZOL Solutions · <a href="${escapeHtml(websiteUrl)}" style="color:#33669b">zolsolutions.nl</a></td></tr></table></td></tr></table></body></html>`
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })
  const db = adminClient()
  try {
    const profile = await requireAdmin(request, db)
    if (!["owner", "admin"].includes(profile.role)) return Response.json({ error: "Geen toestemming voor deze actie." }, { status: 403, headers })
    const { data: setting, error: settingError } = await db.from("settings").select("value").eq("key", "email_config").maybeSingle()
    if (settingError) throw settingError
    const config = setting?.value || {}
    const apiKey = Deno.env.get("RESEND_API_KEY") || ""
    if (!config.enabled || !apiKey) return Response.json({ error: "E-mailverzending is nog niet geactiveerd." }, { status: 503, headers })
    const recipient = String(config.admin_email || "info@zolsolutions.nl").trim().toLowerCase()
    if (recipient !== "info@zolsolutions.nl") return Response.json({ error: "De testmail mag alleen naar info@zolsolutions.nl worden gestuurd." }, { status: 409, headers })
    const subject = "[TEST] Je aankoop bij ZOL Solutions is gelukt"
    const sentAt = new Intl.DateTimeFormat("nl-NL", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date())
    const text = `Dit is een veilige test van de aankoopbevestiging vanuit ZOL Admin. Er is geen echte bestelling geplaatst en er is niets afgeschreven. De e-mailkoppeling werkt. Test uitgevoerd op ${sentAt}.`
    const websiteUrl = String(config.website_url || "https://zolsolutions.nl")
    const html = emailShell(text, websiteUrl)
    const dedupe = `admin-test-${crypto.randomUUID()}`
    const { data: log, error: logError } = await db.from("email_messages").insert({ kind: "admin_customer", recipient_email: recipient, subject, body_preview: text, dedupe_key: dedupe }).select("id").single()
    if (logError) throw logError
    try {
      const fromEmail = String(config.from_email || "info@zolsolutions.nl")
      const fromName = String(config.from_name || "ZOL Solutions")
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": dedupe },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: recipient, subject, html, text, reply_to: String(config.reply_to || fromEmail) }),
      })
      const sent = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(sent.message || "De e-mailprovider heeft de verzending geweigerd.")
      await db.from("email_messages").update({ status: "sent", provider_id: sent.id || null, sent_at: new Date().toISOString() }).eq("id", log.id)
      await db.from("activity_log").insert({ actor_id: profile.id, actor_email: profile.email, action: "Testmail verstuurd", entity_type: "email", entity_id: log.id, details: { recipient } })
      return Response.json({ success: true, recipient }, { headers: { ...headers, "Content-Type": "application/json" } })
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "De testmail kon niet worden verstuurd."
      await db.from("email_messages").update({ status: "failed", error_message: message }).eq("id", log.id)
      return Response.json({ error: message }, { status: 503, headers })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "De testmail kon niet worden verstuurd."
    return Response.json({ error: message }, { status: /ingelogd|sessie|toegang/i.test(message) ? 401 : 500, headers })
  }
})
