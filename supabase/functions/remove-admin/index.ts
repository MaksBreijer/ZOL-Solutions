import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { adminClient, corsHeaders, requireAdmin } from "../_shared/email.ts"

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })

  const db = adminClient()
  try {
    const caller = await requireAdmin(request, db)
    if (caller.role !== "owner") return Response.json({ error: "Alleen de eigenaar kan beheerders verwijderen." }, { status: 403, headers })

    const body = await request.json()
    const targetId = String(body.target_id || "").trim()
    const email = String(body.email || "").trim().toLowerCase().slice(0, 254)
    if (targetId && !/^[0-9a-f-]{36}$/i.test(targetId)) return Response.json({ error: "Ongeldige beheerder." }, { status: 400, headers })
    if (!targetId && !/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Beheerder ontbreekt." }, { status: 400, headers })

    let profileQuery = db.from("admin_profiles").select("id,email,full_name,role,active")
    profileQuery = targetId ? profileQuery.eq("id", targetId) : profileQuery.eq("email", email)
    const { data: target, error: targetError } = await profileQuery.maybeSingle()
    if (targetError) throw targetError

    if (!target) {
      if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Beheerder niet gevonden." }, { status: 404, headers })
      const { error: allowError } = await db.from("admin_allowed_emails").delete().eq("email", email)
      if (allowError) throw allowError
      await db.from("activity_log").insert({ actor_id: caller.id, actor_email: caller.email, action: "Openstaande beheerder verwijderd", entity_type: "admin", entity_id: email, details: { email } })
      return Response.json({ success: true, removed: "allowlist" }, { headers: { ...headers, "Content-Type": "application/json" } })
    }

    if (target.id === caller.id) return Response.json({ error: "Je kunt je eigen eigenaarsaccount niet verwijderen." }, { status: 409, headers })
    if (target.role === "owner") return Response.json({ error: "Een eigenaarsaccount kan niet via de admin worden verwijderd." }, { status: 409, headers })

    if (target.active && ["owner", "admin"].includes(target.role)) {
      const { count: activeManagerCount, error: countError } = await db
        .from("admin_profiles")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .in("role", ["owner", "admin"])
      if (countError) throw countError
      if ((activeManagerCount || 0) <= 1) return Response.json({ error: "De laatste actieve beheerder kan niet worden verwijderd." }, { status: 409, headers })
    }

    const { error: revokeError } = await db.from("admin_profiles").update({ active: false }).eq("id", target.id)
    if (revokeError) throw revokeError
    await db.from("admin_allowed_emails").delete().eq("email", target.email)

    const { error: deleteError } = await db.auth.admin.deleteUser(target.id)
    if (deleteError) {
      await db.from("activity_log").insert({ actor_id: caller.id, actor_email: caller.email, action: "Beheerderstoegang ingetrokken", entity_type: "admin", entity_id: target.id, details: { email: target.email, delete_error: deleteError.message } })
      return Response.json({ error: "De toegang is ingetrokken, maar het Auth-account kon niet volledig worden verwijderd. Controleer of deze beheerder nog eigenaar is van mediabestanden.", access_revoked: true }, { status: 409, headers })
    }

    await db.from("activity_log").insert({ actor_id: caller.id, actor_email: caller.email, action: "Beheerder verwijderd", entity_type: "admin", entity_id: target.id, details: { email: target.email, role: target.role } })
    return Response.json({ success: true, removed: "user" }, { headers: { ...headers, "Content-Type": "application/json" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Beheerder verwijderen mislukt."
    const status = /ingelogd|sessie|toegang/i.test(message) ? 401 : 500
    return Response.json({ error: message }, { status, headers })
  }
})
