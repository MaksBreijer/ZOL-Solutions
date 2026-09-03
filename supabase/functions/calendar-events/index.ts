import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.112.3"

const CALENDAR_ID = "7d10f76a1ef8cdb5ca15ae46e3ba1e70af731fd60f5fa40abf93c259ea88f0dd@group.calendar.google.com"
const TIME_ZONE = "Europe/Amsterdam"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"
const allowedOrigins = new Set([
  "https://zol-solutions.pages.dev",
  "https://zolsolutions.nl",
  "https://www.zolsolutions.nl",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
])

let cachedGoogleToken: { value: string; expiresAt: number } | null = null

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
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  )
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("Authorization")
  if (!authorization?.startsWith("Bearer ")) throw new Error("Niet ingelogd.")
  return authorization.slice(7)
}

async function requireActiveAdmin(request: Request) {
  const db = adminClient()
  const token = bearerToken(request)
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) throw new Error("Ongeldige sessie.")
  const { data: assurance, error: assuranceError } = await db.auth.mfa.getAuthenticatorAssuranceLevel(token)
  if (assuranceError || assurance?.currentLevel !== "aal2") throw new Error("Tweestapsverificatie is vereist voor ZOL Admin.")
  const sessionId = String((await db.auth.getClaims(token)).data?.claims?.session_id || "")
  const { data: activeSession, error: sessionError } = await db.rpc("admin_session_is_active", { p_user_id: user.id, p_session_id: sessionId || null })
  if (sessionError || activeSession !== true) throw new Error("Deze beheerderssessie is ingetrokken. Log opnieuw in.")
  const { data: profile, error: profileError } = await db.from("admin_profiles").select("id,active").eq("id", user.id).maybeSingle()
  if (profileError) throw profileError
  if (!profile?.active) throw new Error("Geen toegang tot ZOL Admin.")
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
  if (!body) throw new Error("De Google Agenda-schrijfkoppeling is nog niet ingesteld.")
  const binary = atob(body)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function serviceAccountAssertion(email: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = base64Url(JSON.stringify({
    iss: email,
    scope: GOOGLE_CALENDAR_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }))
  const unsigned = `${header}.${claims}`
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`
}

async function googleAccessToken() {
  if (cachedGoogleToken && cachedGoogleToken.expiresAt > Date.now() + 60_000) return cachedGoogleToken.value
  const email = Deno.env.get("GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL")?.trim() || ""
  const privateKey = Deno.env.get("GOOGLE_CALENDAR_PRIVATE_KEY") || ""
  if (!email || !privateKey) throw new Error("De Google Agenda-schrijfkoppeling is nog niet ingesteld. Laat de ZOL Teamagenda eenmalig verbinden.")
  const assertion = await serviceAccountAssertion(email, privateKey)
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.access_token) throw new Error("Google kon de beveiligde agenda-aanmelding niet voltooien. Controleer de schrijfkoppeling.")
  cachedGoogleToken = { value: String(data.access_token), expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 }
  return cachedGoogleToken.value
}

function requiredText(value: unknown, label: string, maxLength: number) {
  const text = String(value || "").trim()
  if (!text) throw new Error(`Vul ${label} in.`)
  if (text.length > maxLength) throw new Error(`${label} is te lang.`)
  return text
}

function optionalText(value: unknown, label: string, maxLength: number) {
  const text = String(value || "").trim()
  if (text.length > maxLength) throw new Error(`${label} is te lang.`)
  return text
}

function localDateTime(value: unknown, label: string) {
  const text = String(value || "")
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) || Number.isNaN(new Date(text).getTime())) throw new Error(`${label} is ongeldig.`)
  return `${text}:00`
}

async function eventId(requestId: unknown) {
  const source = requiredText(requestId, "de aanvraagcode", 100)
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)))
  return Array.from(digest.slice(0, 20), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function googleError(response: Response) {
  const details = await response.json().catch(() => ({}))
  if (response.status === 401) return "De Google Agenda-schrijfkoppeling is verlopen of ongeldig."
  if (response.status === 403 || response.status === 404) return "De beveiligde ZOL-koppeling heeft nog geen bewerkrechten op ZOL Teamagenda."
  if (response.status === 409) return "duplicate"
  return String(details?.error?.message || "Google Agenda kon de afspraak niet opslaan.")
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })

  try {
    await requireActiveAdmin(request)
    const body = await request.json().catch(() => ({}))
    const title = requiredText(body.title, "een titel", 180)
    const start = localDateTime(body.start, "De begintijd")
    const end = localDateTime(body.end, "De eindtijd")
    if (end <= start) throw new Error("De eindtijd moet na de begintijd liggen.")
    const location = optionalText(body.location, "De locatie", 300)
    const description = optionalText(body.description, "De notities", 3000)
    const id = await eventId(body.request_id)
    const token = await googleAccessToken()
    const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`
    const response = await fetch(calendarUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        summary: title,
        description,
        location,
        start: { dateTime: start, timeZone: TIME_ZONE },
        end: { dateTime: end, timeZone: TIME_ZONE },
        extendedProperties: { private: { source: "zol-admin" } },
      }),
    })
    if (!response.ok) {
      const message = await googleError(response)
      if (message !== "duplicate") return Response.json({ error: message }, { status: response.status >= 500 ? 502 : 424, headers })
      const existing = await fetch(`${calendarUrl}/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!existing.ok) return Response.json({ error: "De afspraak bestaat al, maar kon niet worden bevestigd." }, { status: 409, headers })
      const event = await existing.json()
      return Response.json({ event: { id: event.id, htmlLink: event.htmlLink }, duplicate: true }, { headers })
    }
    const event = await response.json()
    return Response.json({ event: { id: event.id, htmlLink: event.htmlLink } }, { status: 201, headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Afspraak opslaan mislukt."
    const status = /ingelogd|sessie/i.test(message) ? 401 : /geen toegang|tweestapsverificatie/i.test(message) ? 403 : /nog niet ingesteld|eenmalig verbinden/i.test(message) ? 503 : 400
    return Response.json({ error: message }, { status, headers })
  }
})
