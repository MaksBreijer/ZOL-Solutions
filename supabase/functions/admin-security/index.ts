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

async function requireActiveAdminAccount(request: Request) {
  const db = adminClient()
  const { data: { user }, error } = await db.auth.getUser(bearerToken(request))
  if (error || !user) throw new Error("Ongeldige sessie.")

  const { data: profile, error: profileError } = await db
    .from("admin_profiles")
    .select("id,active")
    .eq("id", user.id)
    .maybeSingle()
  if (profileError) throw profileError
  if (!profile?.active) throw new Error("Geen toegang tot ZOL Admin.")

  return { db, user }
}

async function requireAdmin(request: Request, db = adminClient()) {
  const token = bearerToken(request)
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) throw new Error("Ongeldige sessie.")
  const { data: assurance, error: assuranceError } = await db.auth.mfa.getAuthenticatorAssuranceLevel(token)
  if (assuranceError || assurance?.currentLevel !== "aal2") throw new Error("Tweestapsverificatie is vereist voor ZOL Admin.")
  const { data: profile } = await db.from("admin_profiles").select("id,active").eq("id", user.id).maybeSingle()
  if (!profile?.active) throw new Error("Geen toegang tot ZOL Admin.")
  return profile
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })

  try {
    const body = await request.json().catch(() => ({}))
    const action = String(body.action || "")

    if (action === "check_access") {
      await requireActiveAdminAccount(request)
      return Response.json({ allowed: true }, { headers: { ...headers, "Content-Type": "application/json" } })
    }

    if (action === "reset_totp") {
      const db = adminClient()
      const caller = await requireAdmin(request, db)
      const factorId = String(body.factor_id || "")
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(factorId)) {
        return Response.json({ error: "Ongeldige authenticatorfactor." }, { status: 400, headers })
      }

      const { data: factors, error: factorsError } = await db.auth.admin.mfa.listFactors({ userId: caller.id })
      if (factorsError) throw factorsError
      const ownFactor = factors?.factors?.find((factor) => factor.id === factorId && factor.factor_type === "totp")
      if (!ownFactor) return Response.json({ error: "Authenticatorfactor niet gevonden." }, { status: 404, headers })

      const { error: deleteError } = await db.auth.admin.mfa.deleteFactor({ id: factorId, userId: caller.id })
      if (deleteError) throw deleteError
      return Response.json({ success: true }, { headers: { ...headers, "Content-Type": "application/json" } })
    }

    return Response.json({ error: "Onbekende beveiligingsactie." }, { status: 400, headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Beveiligingscontrole mislukt."
    const status = /ingelogd|sessie/i.test(message) ? 401 : /geen toegang/i.test(message) ? 403 : 500
    return Response.json({ error: message }, { status, headers })
  }
})
