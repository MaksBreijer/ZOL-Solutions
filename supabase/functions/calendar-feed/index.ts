import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.112.3"

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
  return db
}

function validGoogleCalendarUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === "calendar.google.com" && /^\/calendar\/ical\/.+\/(?:private-[^/]+|public)\/basic\.ics$/.test(url.pathname)
  } catch {
    return false
  }
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })

  try {
    const db = await requireActiveAdmin(request)
    const { data: setting, error } = await db.from("settings").select("value").eq("key", "calendar_config").maybeSingle()
    if (error) throw error
    const feedUrl = String(setting?.value?.private_ics_url || "")
    if (!feedUrl) return Response.json({ error: "De geheime iCal-link is nog niet ingesteld." }, { status: 428, headers })
    if (!validGoogleCalendarUrl(feedUrl)) return Response.json({ error: "De opgeslagen Google Agenda-link is ongeldig." }, { status: 400, headers })

    const response = await fetch(feedUrl, { headers: { "User-Agent": "ZOL-Solutions-Admin/1.0" }, redirect: "follow" })
    if (!response.ok) return Response.json({ error: "Google Agenda kon de privéfeed niet laden. Controleer of de geheime iCal-link nog geldig is." }, { status: 502, headers })
    const ics = await response.text()
    if (!ics.includes("BEGIN:VCALENDAR") || ics.length > 5_000_000) return Response.json({ error: "Google gaf geen geldige of te grote agenda terug." }, { status: 502, headers })

    return new Response(ics, {
      headers: { ...headers, "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agenda laden mislukt."
    const status = /ingelogd|sessie/i.test(message) ? 401 : /geen toegang|tweestapsverificatie/i.test(message) ? 403 : 500
    return Response.json({ error: message }, { status, headers })
  }
})
