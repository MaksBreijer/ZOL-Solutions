import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.112.3"

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://zol-solutions.pages.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders })

  try {
    const authorization = request.headers.get("Authorization")
    if (!authorization) return Response.json({ error: "Niet ingelogd." }, { status: 401, headers: corsHeaders })

    const url = Deno.env.get("SUPABASE_URL")!
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const adminClient = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
    const token = authorization.replace("Bearer ", "")
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !user) return Response.json({ error: "Ongeldige sessie." }, { status: 401, headers: corsHeaders })

    const { data: caller } = await adminClient.from("admin_profiles").select("role,active").eq("id", user.id).single()
    if (!caller?.active || caller.role !== "owner") {
      return Response.json({ error: "Alleen de eigenaar kan beheerders toevoegen." }, { status: 403, headers: corsHeaders })
    }

    const body = await request.json()
    const email = String(body.email || "").trim().toLowerCase()
    const fullName = String(body.full_name || "").trim().slice(0, 100)
    const password = String(body.password || "")
    const role = ["admin", "editor", "viewer"].includes(body.role) ? body.role : "admin"
    if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Vul een geldig e-mailadres in." }, { status: 400, headers: corsHeaders })
    if (!fullName) return Response.json({ error: "Vul de naam van de beheerder in." }, { status: 400, headers: corsHeaders })
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return Response.json({ error: "Gebruik minimaal 12 tekens met hoofdletter, kleine letter, cijfer en speciaal teken." }, { status: 400, headers: corsHeaders })
    }

    const { data: existingProfile } = await adminClient.from("admin_profiles").select("id").eq("email", email).maybeSingle()
    if (existingProfile) return Response.json({ error: "Dit e-mailadres heeft al een beheeraccount." }, { status: 409, headers: corsHeaders })

    const { error: allowError } = await adminClient.from("admin_allowed_emails").upsert({ email, role, invited_by: user.id })
    if (allowError) throw allowError

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (createError) {
      await adminClient.from("admin_allowed_emails").delete().eq("email", email)
      return Response.json({ error: createError.message }, { status: 400, headers: corsHeaders })
    }

    return Response.json({ success: true, id: created.user?.id, email, role }, { headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "Uitnodiging mislukt."
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})
