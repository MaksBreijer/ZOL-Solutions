import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { adminClient, corsHeaders, requireAdmin } from "../_shared/email.ts"

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })

  try {
    const db = adminClient()
    const caller = await requireAdmin(request, db)
    if (caller.role !== "owner") {
      return Response.json({ error: "Alleen de eigenaar kan beheerders toevoegen." }, { status: 403, headers })
    }

    const body = await request.json()
    const email = String(body.email || "").trim().toLowerCase()
    const fullName = String(body.full_name || "").trim().slice(0, 100)
    const password = String(body.password || "")
    const role = ["admin", "editor", "viewer"].includes(body.role) ? body.role : "admin"
    if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Vul een geldig e-mailadres in." }, { status: 400, headers })
    if (!fullName) return Response.json({ error: "Vul de naam van de beheerder in." }, { status: 400, headers })
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return Response.json({ error: "Gebruik minimaal 12 tekens met hoofdletter, kleine letter, cijfer en speciaal teken." }, { status: 400, headers })
    }

    const { data: existingProfile } = await db.from("admin_profiles").select("id").eq("email", email).maybeSingle()
    if (existingProfile) return Response.json({ error: "Dit e-mailadres heeft al een beheeraccount." }, { status: 409, headers })

    const { error: allowError } = await db.from("admin_allowed_emails").upsert({ email, role, invited_by: caller.id })
    if (allowError) throw allowError

    const { data: created, error: createError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (createError) {
      await db.from("admin_allowed_emails").delete().eq("email", email)
      return Response.json({ error: createError.message }, { status: 400, headers })
    }

    return Response.json({ success: true, id: created.user?.id, email, role }, { headers: { ...headers, "Content-Type": "application/json" } })
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "Uitnodiging mislukt."
    const status = /ingelogd|sessie|toegang/i.test(message) ? 401 : 500
    return Response.json({ error: message }, { status, headers })
  }
})
