import { createClient } from "jsr:@supabase/supabase-js@2.112.3"

export const allowedOrigins = new Set([
  "https://zol-solutions.pages.dev",
  "https://zolsolutions.nl",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
])

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || ""
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://zol-solutions.pages.dev",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-zol-email-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  )
}

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function money(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(Number(cents || 0) / 100)
}

export type EmailConfig = {
  enabled?: boolean
  from_name?: string
  from_email?: string
  reply_to?: string
  admin_email?: string
  website_url?: string
}

export async function getEmailConfig(db = adminClient()): Promise<EmailConfig> {
  const { data, error } = await db.from("settings").select("value").eq("key", "email_config").maybeSingle()
  if (error) throw error
  return data?.value || {}
}

export function emailShell(content: string, options: { eyebrow: string; title: string; intro?: string; websiteUrl?: string }) {
  const websiteUrl = options.websiteUrl || "https://zolsolutions.nl"
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#f3f5f7;color:#10233b;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f7"><tr><td align="center" style="padding:32px 12px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;overflow:hidden;border-radius:22px;background:#ffffff;box-shadow:0 18px 50px rgba(16,35,59,.09)">
        <tr><td style="padding:34px 38px;background:#102b4a;color:#ffffff">
          <a href="${escapeHtml(websiteUrl)}" style="color:#ffffff;text-decoration:none"><span style="font-size:32px;font-weight:800;letter-spacing:-1px">ZOL</span><span style="margin-left:8px;font-size:13px;opacity:.8">SOLUTIONS</span></a>
          <p style="margin:24px 0 8px;color:#9fc4e8;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">${escapeHtml(options.eyebrow)}</p>
          <h1 style="margin:0;max-width:560px;font-size:34px;line-height:1.08;letter-spacing:-1px">${escapeHtml(options.title)}</h1>
          ${options.intro ? `<p style="margin:16px 0 0;color:#dfeaf4;font-size:15px;line-height:1.65">${escapeHtml(options.intro)}</p>` : ""}
        </td></tr>
        <tr><td style="padding:34px 38px">${content}</td></tr>
        <tr><td style="padding:22px 38px;border-top:1px solid #e4e9ee;color:#66798c;font-size:12px;line-height:1.6">ZOL Solutions · Zachter landen. Beter sporten.<br><a href="${escapeHtml(websiteUrl)}" style="color:#33669b">${escapeHtml(websiteUrl.replace(/^https?:\/\//, ""))}</a></td></tr>
      </table>
    </td></tr></table>
  </body></html>`
}

export async function sendEmail(input: {
  to: string | string[]
  subject: string
  html: string
  text: string
  replyTo?: string
  idempotencyKey?: string
  config: EmailConfig
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY")
  if (!input.config.enabled || !apiKey) throw new Error("E-mailverzending is nog niet geactiveerd.")
  const fromEmail = input.config.from_email || "info@zolsolutions.nl"
  const fromName = input.config.from_name || "ZOL Solutions"
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo || input.config.reply_to || fromEmail,
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || "De e-mailprovider heeft de verzending geweigerd.")
  return result as { id?: string }
}

export async function requireAdmin(request: Request, db = adminClient()) {
  const authorization = request.headers.get("Authorization")
  if (!authorization?.startsWith("Bearer ")) throw new Error("Niet ingelogd.")
  const { data: { user }, error } = await db.auth.getUser(authorization.slice(7))
  if (error || !user) throw new Error("Ongeldige sessie.")
  const { data: profile } = await db.from("admin_profiles").select("id,email,full_name,role,active").eq("id", user.id).maybeSingle()
  if (!profile?.active) throw new Error("Geen toegang tot ZOL Admin.")
  return profile
}

export async function logEmail(db: ReturnType<typeof adminClient>, payload: Record<string, unknown>) {
  const { data, error } = await db.from("email_messages").insert(payload).select("id").single()
  if (error) throw error
  return data
}

export async function markEmail(db: ReturnType<typeof adminClient>, id: string, result: { status: "sent" | "failed"; providerId?: string; error?: string }) {
  await db.from("email_messages").update({
    status: result.status,
    provider_id: result.providerId || null,
    error_message: result.error || "",
    sent_at: result.status === "sent" ? new Date().toISOString() : null,
  }).eq("id", id)
}
