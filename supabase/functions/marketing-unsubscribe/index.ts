import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { adminClient, corsHeaders } from "../_shared/email.ts"

Deno.serve(async (request) => {
  const headers = { ...corsHeaders(request), "Content-Type": "application/json" }
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })

  try {
    const body = await request.json()
    const token = String(body.token || "").trim()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
      return Response.json({ error: "Deze afmeldlink is niet geldig." }, { status: 400, headers })
    }

    const db = adminClient()
    const { data: customer, error: lookupError } = await db
      .from("customers")
      .select("id,marketing_opt_in")
      .eq("marketing_unsubscribe_token", token)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!customer) return Response.json({ error: "Deze afmeldlink is niet geldig." }, { status: 404, headers })

    if (customer.marketing_opt_in) {
      const { error: updateError } = await db.from("customers").update({
        marketing_opt_in: false,
        marketing_unsubscribed_at: new Date().toISOString(),
        marketing_next_send_at: null,
      }).eq("id", customer.id)
      if (updateError) throw updateError
    }

    return Response.json({ success: true, already_unsubscribed: !customer.marketing_opt_in }, { headers })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Afmelden is niet gelukt." }, { status: 500, headers })
  }
})
