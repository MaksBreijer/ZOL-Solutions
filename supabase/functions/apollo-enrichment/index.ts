import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.112.3"
import { apolloPersonId, buildPeopleSearch } from "./apollo-helpers.js"

type Json = Record<string, any>

const APOLLO_BASE_URL = "https://api.apollo.io/api/v1"
const allowedOrigins = new Set([
  "https://zol-solutions.pages.dev",
  "https://zolsolutions.nl",
  "https://www.zolsolutions.nl",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
])

const roleTitles: Record<string, string[]> = {
  physio: ["kinderfysiotherapeut", "sportfysiotherapeut", "fysiotherapeut", "praktijkeigenaar", "practice owner"],
  sports_club: ["jeugdcoördinator", "hoofd jeugdopleiding", "technisch manager", "clubmanager", "voorzitter", "medische staf"],
  school: ["docent lichamelijke opvoeding", "LO-docent", "zorgcoördinator", "sportcoördinator", "schooldirecteur"],
  retail: ["eigenaar", "inkoper", "store manager", "general manager"],
  medical: ["kinderfysiotherapeut", "sportarts", "zorgmanager", "praktijkeigenaar"],
  other: ["eigenaar", "directeur", "manager", "partnerships"],
}

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
  const { data: profile } = await db.from("admin_profiles").select("id,role,active").eq("id", user.id).maybeSingle()
  if (!profile?.active || !["owner", "admin"].includes(profile.role)) throw new Error("Geen toestemming voor deze actie.")
  return profile
}

function clean(value: unknown, max = 180) {
  return String(value ?? "").trim().slice(0, max)
}

function websiteDomain(value: unknown) {
  const website = clean(value, 500)
  if (!website) return ""
  try {
    const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`)
    if (!["http:", "https:"].includes(url.protocol)) return ""
    return url.hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return ""
  }
}

function normalizedName(value: unknown) {
  return clean(value, 180)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(bv|b\.v\.|vereniging|stichting|club)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function organizationScore(organization: Json, leadName: string, city: string) {
  const wanted = normalizedName(leadName)
  const found = normalizedName(organization.name)
  if (!wanted || !found) return 0
  const wantedWords = new Set(wanted.split(" ").filter((word) => word.length > 2))
  const foundWords = new Set(found.split(" ").filter((word) => word.length > 2))
  const overlap = [...wantedWords].filter((word) => foundWords.has(word)).length
  const nameScore = wanted === found ? 20 : overlap / Math.max(1, wantedWords.size) * 12
  const foundCity = normalizedName(organization.city || organization.raw_address || organization.formatted_address)
  const cityScore = city && foundCity.includes(normalizedName(city)) ? 4 : 0
  return nameScore + cityScore
}

function apolloError(status: number) {
  if (status === 401) return "Apollo heeft de API-sleutel geweigerd."
  if (status === 403) return "Het Apollo-abonnement of de API-sleutel geeft geen toegang tot deze functie."
  if (status === 429) return "De Apollo-limiet is bereikt. Probeer het later opnieuw of controleer de credits."
  return "Apollo kon de aanvraag niet verwerken."
}

async function apolloRequest(path: string, search: URLSearchParams, apiKey: string) {
  const response = await fetch(`${APOLLO_BASE_URL}${path}?${search}`, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json", "Cache-Control": "no-cache", "x-api-key": apiKey },
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    console.error("Apollo request failed", { path, status: response.status })
    throw new Error(apolloError(response.status))
  }
  return result
}

function candidateScore(person: Json, titles: string[]) {
  const title = clean(person.title).toLowerCase()
  const roleScore = titles.reduce((score, role) => title.includes(role.toLowerCase()) ? score + 3 : score, 0)
  return roleScore + (person.has_email ? 5 : 0) + (["owner", "founder", "partner", "head", "director", "manager"].includes(person.seniority) ? 2 : 0)
}

function candidate(person: Json) {
  const lastName = clean(person.last_name_obfuscated || person.last_name, 100)
  return {
    id: apolloPersonId(person),
    name: [clean(person.first_name, 100), lastName].filter(Boolean).join(" "),
    title: clean(person.title, 160),
    organization: clean(person.organization?.name, 180),
    has_email: Boolean(person.has_email),
    last_refreshed_at: clean(person.last_refreshed_at, 50),
  }
}

function usableEmail(value: unknown) {
  const email = clean(value, 200).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""
}

function businessPhone(person: Json) {
  return clean(
    person.organization?.primary_phone?.sanitized_number ||
      person.organization?.primary_phone?.number ||
      person.organization?.phone ||
      "",
    60,
  )
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  const jsonHeaders = { ...headers, "Content-Type": "application/json" }
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: jsonHeaders })

  try {
    await requireAdmin(request)
    const apiKey = Deno.env.get("APOLLO_API_KEY") || ""
    const body = await request.json().catch(() => ({}))
    const action = clean(body.action, 30)

    if (action === "status") {
      return Response.json({ success: true, configured: Boolean(apiKey) }, { headers: jsonHeaders })
    }
    if (!apiKey) return Response.json({ error: "Apollo is nog niet geactiveerd. Stel eerst APOLLO_API_KEY veilig in." }, { status: 503, headers: jsonHeaders })

    if (action === "search") {
      let domain = websiteDomain(body.lead?.website)
      let organizationId = ""
      let organizationName = clean(body.lead?.name, 180)
      let organizationLookupCredits = 0
      if (!domain) {
        if (!organizationName) return Response.json({ error: "Een organisatienaam of website is vereist." }, { status: 400, headers: jsonHeaders })
        const organizationParams = new URLSearchParams({ q_organization_name: organizationName, page: "1", per_page: "5" })
        const organizationResult = await apolloRequest("/mixed_companies/search", organizationParams, apiKey)
        organizationLookupCredits = 1
        const organizations = Array.isArray(organizationResult.organizations) ? organizationResult.organizations : []
        const city = clean(body.lead?.city, 100)
        const organization = organizations
          .filter((item: Json) => clean(item.id, 80) && clean(item.name, 180))
          .sort((a: Json, b: Json) => organizationScore(b, organizationName, city) - organizationScore(a, organizationName, city))[0]
        if (!organization || organizationScore(organization, organizationName, city) < 6) {
          return Response.json({ success: true, domain: "", organization: organizationName, organization_lookup_credits: organizationLookupCredits, candidates: [] }, { headers: jsonHeaders })
        }
        organizationId = clean(organization.id, 80)
        organizationName = clean(organization.name, 180)
        domain = websiteDomain(organization.primary_domain || organization.website_url)
      }
      const type = clean(body.lead?.type, 30)
      const titles = roleTitles[type] || roleTitles.other
      const search = (includeTitles: boolean, includeSeniorities: boolean) => buildPeopleSearch({ domain, organizationId, titles, includeTitles, includeSeniorities })
      let result = await apolloRequest("/mixed_people/api_search", search(true, true), apiKey)
      if (!Array.isArray(result.people) || !result.people.length) result = await apolloRequest("/mixed_people/api_search", search(false, true), apiKey)
      if (!Array.isArray(result.people) || !result.people.length) result = await apolloRequest("/mixed_people/api_search", search(false, false), apiKey)
      const candidates = (Array.isArray(result.people) ? result.people : [])
        .filter((person: Json) => apolloPersonId(person))
        .sort((a: Json, b: Json) => candidateScore(b, titles) - candidateScore(a, titles))
        .slice(0, 8)
        .map(candidate)
      return Response.json({ success: true, domain, organization: organizationName, organization_lookup_credits: organizationLookupCredits, candidates }, { headers: jsonHeaders })
    }

    if (action === "enrich") {
      const personId = clean(body.person_id, 80)
      if (!/^[a-z0-9_-]{8,80}$/i.test(personId)) return Response.json({ error: "Ongeldig Apollo-contact." }, { status: 400, headers: jsonHeaders })
      const params = new URLSearchParams({ id: personId, reveal_personal_emails: "false", reveal_phone_number: "false" })
      const result = await apolloRequest("/people/match", params, apiKey)
      const person = result.person || result.contact || {}
      if (!clean(person.id || personId, 80) || !clean(person.first_name || person.name, 100)) {
        return Response.json({ error: "Apollo kon dit contact niet betrouwbaar verrijken." }, { status: 404, headers: jsonHeaders })
      }
      const name = clean(person.name, 160) || [clean(person.first_name, 100), clean(person.last_name, 100)].filter(Boolean).join(" ")
      return Response.json({
        success: true,
        contact: {
          id: clean(person.id || personId, 80),
          name,
          title: clean(person.title, 160),
          email: usableEmail(person.email),
          email_status: clean(person.email_status, 50),
          phone: businessPhone(person),
          linkedin_url: clean(person.linkedin_url, 500),
          organization: clean(person.organization?.name, 180),
          match_confidence: clean(result.match_confidence || person.match_confidence, 30),
          enriched_at: new Date().toISOString(),
        },
      }, { headers: jsonHeaders })
    }

    return Response.json({ error: "Onbekende Apollo-actie." }, { status: 400, headers: jsonHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apollo-verrijking mislukt."
    const status = /ingelogd|sessie/i.test(message) ? 401 : /toestemming/i.test(message) ? 403 : /limiet|abonnement|API-sleutel|Apollo/i.test(message) ? 502 : 500
    return Response.json({ error: message }, { status, headers: jsonHeaders })
  }
})
