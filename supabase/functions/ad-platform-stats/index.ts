import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.112.3"

type Json = Record<string, any>

const allowedOrigins = new Set([
  "https://zol-solutions.pages.dev",
  "https://zolsolutions.nl",
  "https://www.zolsolutions.nl",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
])

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || ""
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://zolsolutions.nl",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } })
}

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("Authorization")
  if (!authorization?.startsWith("Bearer ")) throw new Error("Niet ingelogd.")
  const token = authorization.slice(7)
  const db = adminClient()
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) throw new Error("Ongeldige sessie.")
  const { data: assurance, error: assuranceError } = await db.auth.mfa.getAuthenticatorAssuranceLevel(token)
  if (assuranceError || assurance?.currentLevel !== "aal2") throw new Error("Tweestapsverificatie is vereist voor ZOL Admin.")
  const sessionId = String((await db.auth.getClaims(token)).data?.claims?.session_id || "")
  const { data: activeSession, error: sessionError } = await db.rpc("admin_session_is_active", { p_user_id: user.id, p_session_id: sessionId || null })
  if (sessionError || activeSession !== true) throw new Error("Deze beheerderssessie is ingetrokken. Log opnieuw in.")
  const { data: profile } = await db.from("admin_profiles").select("id,role,active").eq("id", user.id).maybeSingle()
  if (!profile?.active || !["owner", "admin"].includes(profile.role)) throw new Error("Geen toestemming voor deze actie.")
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function dateRange(days: number) {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - Math.max(1, days - 1))
  return { since: isoDate(start), until: isoDate(end) }
}

function emptyMetrics() {
  return { impressions: 0, clicks: 0, spend_cents: 0, conversions: 0, conversion_value_cents: 0 }
}

function base64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

function privateKeyBytes(pem: string) {
  const normalized = pem.replace(/\\n/g, "\n")
  const body = normalized.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "")
  const binary = atob(body)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function serviceAccountAccessToken(email: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = base64Url(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/adwords", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }))
  const unsigned = `${header}.${claims}`
  const key = await crypto.subtle.importKey("pkcs8", privateKeyBytes(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"])
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned))
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.access_token) throw new Error("Google Ads heeft de serviceaccount-aanmelding geweigerd.")
  return String(result.access_token)
}

async function oauthAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.access_token) throw new Error("Google Ads heeft de beveiligde aanmelding geweigerd.")
  return String(result.access_token)
}

async function googleStats(days: number) {
  const clientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID") || ""
  const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET") || ""
  const refreshToken = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN") || ""
  const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") || ""
  const serviceAccountEmail = Deno.env.get("GOOGLE_ADS_SERVICE_ACCOUNT_EMAIL") || Deno.env.get("GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL") || ""
  const serviceAccountKey = Deno.env.get("GOOGLE_ADS_PRIVATE_KEY") || Deno.env.get("GOOGLE_CALENDAR_PRIVATE_KEY") || ""
  const customerId = (Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") || "9618384580").replace(/\D/g, "")
  const serviceAccountConfigured = Boolean(serviceAccountEmail && serviceAccountKey)
  const oauthConfigured = Boolean(clientId && clientSecret && refreshToken)
  const configured = Boolean((serviceAccountConfigured || oauthConfigured) && customerId)
  if (!configured) return { configured: false, connected: false, metrics: null }

  try {
    const accessToken = serviceAccountConfigured
      ? await serviceAccountAccessToken(serviceAccountEmail, serviceAccountKey)
      : await oauthAccessToken(clientId, clientSecret, refreshToken)
    const { since, until } = dateRange(days)
    const response = await fetch(`https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:searchStream`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(developerToken ? { "developer-token": developerToken } : {}),
        ...(Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ? { "login-customer-id": Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")!.replace(/\D/g, "") } : {}),
      },
      body: JSON.stringify({ query: `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}'` }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(String(result?.error?.message || "Google Ads kon de cijfers niet ophalen."))
    const metrics = (Array.isArray(result) ? result : []).flatMap((batch: Json) => batch.results || []).reduce((totals: Json, row: Json) => {
      const value = row.metrics || {}
      totals.impressions += Number(value.impressions || 0)
      totals.clicks += Number(value.clicks || 0)
      totals.spend_cents += Math.round(Number(value.costMicros || 0) / 10000)
      totals.conversions += Number(value.conversions || 0)
      totals.conversion_value_cents += Math.round(Number(value.conversionsValue || 0) * 100)
      return totals
    }, emptyMetrics())
    return { configured: true, connected: true, metrics }
  } catch (error) {
    console.error("Google Ads stats failed", error)
    return { configured: true, connected: false, metrics: null, error: "De Google Ads-koppeling moet opnieuw worden gecontroleerd." }
  }
}

function actionValue(rows: Json[], names: string[]) {
  for (const name of names) {
    const match = rows.find((row) => row.action_type === name)
    if (match) return Number(match.value || 0)
  }
  return 0
}

async function metaStats(days: number) {
  const accessToken = Deno.env.get("META_ADS_ACCESS_TOKEN") || ""
  const accountId = (Deno.env.get("META_ADS_ACCOUNT_ID") || "2036716406977754").replace(/\D/g, "")
  const configured = Boolean(accessToken && accountId)
  if (!configured) return { configured: false, connected: false, metrics: null }

  try {
    const { since, until } = dateRange(days)
    const search = new URLSearchParams({
      access_token: accessToken,
      fields: "impressions,clicks,spend,actions,action_values",
      level: "account",
      time_range: JSON.stringify({ since, until }),
    })
    const response = await fetch(`https://graph.facebook.com/v26.0/act_${accountId}/insights?${search}`)
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(String(result?.error?.message || "Meta Ads kon de cijfers niet ophalen."))
    const row = Array.isArray(result.data) ? result.data[0] || {} : {}
    const conversionNames = ["offsite_conversion.fb_pixel_purchase", "omni_purchase", "purchase"]
    return { configured: true, connected: true, metrics: {
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
      spend_cents: Math.round(Number(row.spend || 0) * 100),
      conversions: actionValue(row.actions || [], conversionNames),
      conversion_value_cents: Math.round(actionValue(row.action_values || [], conversionNames) * 100),
    } }
  } catch (error) {
    console.error("Meta Ads stats failed", error)
    return { configured: true, connected: false, metrics: null, error: "De Meta Ads-koppeling moet opnieuw worden gecontroleerd." }
  }
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  const jsonHeaders = { ...headers, "Content-Type": "application/json", "Cache-Control": "private, max-age=60" }
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: jsonHeaders })
  try {
    await requireAdmin(request)
    const body = await request.json().catch(() => ({}))
    const days = [7, 30, 90].includes(Number(body.days)) ? Number(body.days) : 30
    const [meta, googleAds] = await Promise.all([metaStats(days), googleStats(days)])
    return Response.json({ success: true, days, fetched_at: new Date().toISOString(), meta, google_ads: googleAds }, { headers: jsonHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Advertentiecijfers konden niet worden geladen."
    const status = /ingelogd|sessie/i.test(message) ? 401 : /toestemming|tweestaps/i.test(message) ? 403 : 500
    return Response.json({ error: message }, { status, headers: jsonHeaders })
  }
})
