import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

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
    if (!caller?.active || !["owner", "admin"].includes(caller.role)) {
      return Response.json({ error: "Je hebt geen rechten om beheerders uit te nodigen." }, { status: 403, headers: corsHeaders })
    }

    const body = await request.json()
    const email = String(body.email || "").trim().toLowerCase()
    const role = ["admin", "editor", "viewer"].includes(body.role) ? body.role : "admin"
    if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Vul een geldig e-mailadres in." }, { status: 400, headers: corsHeaders })

    const { error: allowError } = await adminClient.from("admin_allowed_emails").upsert({ email, role, invited_by: user.id })
    if (allowError) throw allowError

    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: "https://zol-solutions.pages.dev/admin/",
      data: { invited_role: role },
    })
    if (inviteError && !inviteError.message.toLowerCase().includes("already")) throw inviteError

    return Response.json({ success: true, email, role }, { headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "Uitnodiging mislukt."
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})
