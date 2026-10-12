import { escapeEmailHtml, logEmail, markEmail, sendEmail } from "../_shared/email.ts"

// Persoonlijke opvolging na een bestelling: kale mail zonder opmaak, alsof we hem zelf typen.
// Mail 1 twee weken na bezorging, mail 2 een maand na bezorging. Alleen bestellingen vanaf de startdatum,
// zodat oudere klanten niet ineens allemaal een mail krijgen.
const START = "2026-10-12T00:00:00Z"
const DAY = 86_400_000

export const followups = [
  {
    step: 1,
    days: 14,
    subject: "Hoe bevallen de ZOL'tjes?",
    body: `Hoi {{voornaam}},

Twee weken geleden kwamen de ZOL'tjes bij jullie binnen, dus we zijn benieuwd: hoe bevallen ze?

Merk je al verschil tijdens of na het sporten? En zitten ze lekker in de schoen? Alles is welkom, ook als het (nog) niet goed gaat. Dan denken we graag met je mee.

Je kunt gewoon op deze mail antwoorden.

Groet,
Maks & Thijn
ZOL Solutions`,
  },
  {
    step: 2,
    days: 30,
    subject: "Hoe staat het er nu mee?",
    body: `Hoi {{voornaam}},

Het is nu ongeveer een maand geleden dat de ZOL'tjes binnenkwamen. Hoe staat het er nu mee?

Is de hielpijn minder geworden, of speelt het nog? En kan er weer volop gesport worden?

We horen het heel graag, ook als je twijfels hebt of tips voor ons. Antwoord gewoon op deze mail.

Groet,
Maks & Thijn
ZOL Solutions`,
  },
]

type Db = ReturnType<typeof import("../_shared/email.ts").adminClient>
type Order = { id: string; customer_id: string | null; customer_email: string; customer_name: string | null; delivered_at: string | null; shipped_at: string | null }

const firstName = (order: Order, customerFirst?: string | null) => {
  const name = String(customerFirst || order.customer_name || "").trim().split(/\s+/)[0]
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "daar"
}

// Bezorgdatum; zonder bezorgmelding rekenen we twee dagen na verzending.
const deliveredOn = (order: Order) => order.delivered_at ? new Date(order.delivered_at) : order.shipped_at ? new Date(new Date(order.shipped_at).getTime() + 2 * DAY) : null

export function renderFollowup(followup: typeof followups[number], name: string) {
  const text = followup.body.replace(/{{\s*(voornaam|customer_first_name)\s*}}/g, name)
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222">${text.split(/\n{2,}/).map((part) => `<p style="margin:0 0 14px">${escapeEmailHtml(part).replaceAll("\n", "<br>")}</p>`).join("")}</div>`
  return { subject: followup.subject, text, html }
}

export async function sendCustomerFollowups(db: Db, config: Record<string, unknown>, now = new Date()) {
  const results: Record<string, unknown>[] = []
  // Teksten komen uit E-mails in de admin; staat een opvolgmail daar uit, dan slaan we hem over.
  const { data: templates } = await db.from("email_templates").select("template_key,subject_template,body_template,enabled").in("template_key", ["customer_followup_1", "customer_followup_2"])
  const active = followups.flatMap((followup) => {
    const template = (templates || []).find((row) => row.template_key === `customer_followup_${followup.step}`)
    if (template && !template.enabled) return []
    return [{ ...followup, subject: template?.subject_template?.trim() || followup.subject, body: template?.body_template?.trim() || followup.body }]
  })
  const { data: orders, error } = await db.from("orders")
    .select("id,customer_id,customer_email,customer_name,delivered_at,shipped_at")
    .eq("order_type", "customer").eq("payment_status", "paid").eq("archived", false)
    .is("returned_at", null)
    .or(`delivered_at.gte.${START},shipped_at.gte.${START}`)
    .limit(200)
  if (error) throw error
  const customerIds = [...new Set((orders || []).map((order) => order.customer_id).filter(Boolean))]
  const { data: customers } = customerIds.length ? await db.from("customers").select("id,first_name,marketing_unsubscribed_at").in("id", customerIds) : { data: [] }
  const byCustomer = new Map((customers || []).map((customer) => [customer.id, customer]))

  for (const order of (orders || []) as Order[]) {
    const delivered = deliveredOn(order)
    const email = String(order.customer_email || "").trim().toLowerCase()
    if (!delivered || !email || delivered.getTime() < new Date(START).getTime()) continue
    const customer = order.customer_id ? byCustomer.get(order.customer_id) : null
    if (customer?.marketing_unsubscribed_at) continue
    // Alleen de laatste mail die nu aan de beurt is; een gemiste eerste mail sturen we niet meer na.
    const due = [...active].reverse().find((followup) => now.getTime() >= delivered.getTime() + followup.days * DAY)
    if (!due) continue
    const dedupeKey = `customer-followup-${order.id}-${due.step}`
    const { data: existing } = await db.from("email_messages").select("id,status").eq("dedupe_key", dedupeKey).maybeSingle()
    if (existing?.status === "sent") continue
    // Meerdere bestellingen van dezelfde klant: dezelfde opvolgmail hooguit één keer per 25 dagen.
    const { count } = await db.from("email_messages").select("id", { count: "exact", head: true })
      .eq("recipient_email", email).like("dedupe_key", `customer-followup-%-${due.step}`).eq("status", "sent")
      .gte("created_at", new Date(now.getTime() - 25 * DAY).toISOString())
    if (count) continue
    const mail = renderFollowup(due, firstName(order, customer?.first_name))
    const log = existing || await logEmail(db, { kind: `customer_followup_${due.step}`, recipient_email: email, subject: mail.subject, body_preview: mail.text.slice(0, 500), customer_id: order.customer_id, dedupe_key: dedupeKey })
    try {
      const sent = await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text, idempotencyKey: dedupeKey, config: { ...config, from_email: "info@zolsolutions.nl", reply_to: "info@zolsolutions.nl" } as never })
      await markEmail(db, log.id, { status: "sent", providerId: sent.id })
      results.push({ order_id: order.id, step: due.step, status: "sent" })
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Opvolgmail kon niet worden verstuurd."
      await markEmail(db, log.id, { status: "failed", error: message })
      results.push({ order_id: order.id, step: due.step, status: "failed", error: message })
    }
  }
  return results
}
