import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { adminClient, corsHeaders, emailShell, escapeHtml, getEmailConfig, logEmail, markEmail, sendEmail } from "../_shared/email.ts"

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })

  try {
    const body = await request.json()
    if (String(body.company || "").trim()) return Response.json({ success: true }, { headers })
    const name = String(body.name || "").trim().slice(0, 120)
    const email = String(body.email || "").trim().toLowerCase().slice(0, 254)
    const phone = String(body.phone || "").trim().slice(0, 80)
    const topic = String(body.topic || "Contact via de website").trim().slice(0, 140)
    const message = String(body.message || "").trim().slice(0, 5000)
    const privacyConsent = [true, "true", "on", "yes", "1"].includes(body.privacy_consent)
    const marketingOptIn = [true, "true", "on", "yes", "1"].includes(body.marketing_opt_in)
    if (!name || !message || !/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Controleer je naam, e-mailadres en bericht." }, { status: 400, headers })
    if (!privacyConsent) return Response.json({ error: "Bevestig dat we je gegevens mogen gebruiken om je vraag te beantwoorden." }, { status: 400, headers })

    const db = adminClient()
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown"
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${request.headers.get("user-agent") || "unknown"}`))
    const fingerprint = [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("")
    const { data: allowed, error: rateError } = await db.rpc("enforce_contact_rate_limit", { p_fingerprint: fingerprint })
    if (rateError) throw rateError
    if (!allowed) return Response.json({ error: "Te veel berichten. Probeer het over 15 minuten opnieuw." }, { status: 429, headers })

    const nameParts = name.split(/\s+/).filter(Boolean)
    const firstName = nameParts.shift() || name
    const lastName = nameParts.join(" ")
    const { data: existingCustomer, error: existingCustomerError } = await db.from("customers").select("id,first_name,last_name,phone,marketing_opt_in").eq("email", email).maybeSingle()
    if (existingCustomerError) throw existingCustomerError

    const customerValues: Record<string, unknown> = {
      first_name: existingCustomer?.first_name || firstName,
      last_name: existingCustomer?.last_name || lastName,
      phone: phone || existingCustomer?.phone || "",
    }
    if (marketingOptIn) Object.assign(customerValues, {
      marketing_opt_in: true,
      marketing_opt_in_at: new Date().toISOString(),
      marketing_opt_in_source: "contactformulier",
      marketing_unsubscribed_at: null,
      marketing_next_send_at: new Date(Date.now() + 21 * 86_400_000).toISOString(),
    })

    let customerId = existingCustomer?.id
    if (customerId) {
      const { error: customerUpdateError } = await db.from("customers").update(customerValues).eq("id", customerId)
      if (customerUpdateError) throw customerUpdateError
    } else {
      const { data: customer, error: customerInsertError } = await db.from("customers").insert({
        email,
        ...customerValues,
        marketing_opt_in: marketingOptIn,
        ...(marketingOptIn ? {} : { marketing_opt_in_source: "" }),
      }).select("id").single()
      if (customerInsertError) throw customerInsertError
      customerId = customer.id
    }

    const { data: contact, error: contactError } = await db.from("contact_messages").insert({
      name,
      email,
      phone,
      topic,
      message,
      customer_id: customerId,
      metadata: { source: "website_contact_form", privacy_consent: true, marketing_opt_in: marketingOptIn },
    }).select("id").single()
    if (contactError) throw contactError
    const config = await getEmailConfig(db)
    const subject = `${topic} — ${name}`
    const content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.65">
      <tr><td style="padding:0 0 18px"><strong style="display:block;color:#33669b;font-size:11px;letter-spacing:1px;text-transform:uppercase">Contactgegevens</strong>${escapeHtml(name)}<br><a href="mailto:${escapeHtml(email)}" style="color:#33669b">${escapeHtml(email)}</a>${phone ? `<br>${escapeHtml(phone)}` : ""}</td></tr>
      <tr><td style="padding:22px;border-radius:14px;background:#f3f6f8;white-space:pre-wrap">${escapeHtml(message)}</td></tr>
    </table>`
    const emailLog = await logEmail(db, { kind: "contact_notification", recipient_email: config.admin_email || "info@zolsolutions.nl", subject, body_preview: message.slice(0, 500), contact_message_id: contact.id })
    try {
      const sent = await sendEmail({
        to: config.admin_email || "info@zolsolutions.nl",
        subject,
        html: emailShell(content, { eyebrow: "Nieuw contactbericht", title: topic, intro: `${name} heeft via zolsolutions.nl een vraag gesteld.`, websiteUrl: config.website_url }),
        text: `Nieuw contactbericht\n\nNaam: ${name}\nE-mail: ${email}\nTelefoon: ${phone || "Niet ingevuld"}\nOnderwerp: ${topic}\n\n${message}`,
        replyTo: email,
        idempotencyKey: `contact-${contact.id}`,
        config,
      })
      await markEmail(db, emailLog.id, { status: "sent", providerId: sent.id })
      return Response.json({ success: true }, { headers: { ...headers, "Content-Type": "application/json" } })
    } catch (emailError) {
      const errorMessage = emailError instanceof Error ? emailError.message : "E-mail kon niet worden verstuurd."
      await markEmail(db, emailLog.id, { status: "failed", error: errorMessage })
      await db.from("contact_messages").update({ status: "email_failed" }).eq("id", contact.id)
      return Response.json({ error: errorMessage, saved: true }, { status: 503, headers })
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Je bericht kon niet worden verstuurd." }, { status: 500, headers })
  }
})
