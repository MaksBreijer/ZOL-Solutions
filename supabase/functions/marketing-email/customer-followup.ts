import { escapeEmailHtml, logEmail, markEmail, sendEmail } from "../_shared/email.ts"

// Persoonlijke opvolging na een bestelling: kale mail zonder opmaak, alsof we hem zelf typen.
// Mail 1 een week na bezorging, de reviewvraag (mail 3) tien dagen na bezorging, mail 2 een maand na bezorging.
// De lijst staat op volgorde van `days`: er gaat steeds alleen de laatste mail uit die nu aan de beurt is.
// Elke opvolgmail geldt alleen voor bestellingen die zijn bezorgd vanaf zijn eigen startdatum (`from`):
// mail 1 vanaf de bestelling van Thomas Hartjes (8 oktober), oudere klanten krijgen hem niet meer; mail 2 vanaf 12 oktober.
const DAY = 86_400_000

type Followup = { step: number; days: number; from: string; standalone?: boolean; subject: string; body: string }

export const followups: Followup[] = [
  {
    step: 1,
    days: 7,
    from: "2026-10-08T00:00:00Z",
    subject: "Hoe bevallen de ZOL'tjes?",
    body: `Hoi {{voornaam}},

Een paar dagen geleden kwamen de ZOL'tjes bij je binnen, dus we zijn benieuwd: hoe bevallen ze?

Merk je al verschil tijdens of na het sporten? En zitten ze lekker in de schoen? Alles is welkom, ook als het (nog) niet goed gaat. Dan denken we graag met je mee.

Je kunt gewoon op deze mail antwoorden.

Groet,
Maks & Thijn
ZOL Solutions`,
  },
  {
    step: 3,
    days: 10,
    from: "2026-10-12T00:00:00Z",
    // Een los bericht, niet als antwoord op mail 1. Iedereen krijgt dezelfde vraag en dezelfde links.
    standalone: true,
    subject: "Wil je je ervaring met de ZOL'tjes delen?",
    body: `Hoi {{voornaam}},

De ZOL'tjes zijn nu zo'n tien dagen bij jullie. Hopelijk zitten ze fijn in de schoen!

Mogen we je om een kleine gunst vragen? Andere ouders twijfelen vaak of een zool echt iets voor hun kind is. Jouw eerlijke ervaring, positief of kritisch, helpt hen enorm.

Een review achterlaten kan hier (duurt een minuut):
https://maps.google.com/?cid=654808623137506283

Liever op onze eigen website? Dat kan ook:
https://zolsolutions.nl/product/#reviews

Heb je een foto of korte video van je kind in actie met de ZOL'tjes? Stuur hem gerust als antwoord op deze mail en laat even weten of we hem (zonder naam) mogen gebruiken.

Gaat het (nog) niet zoals je hoopte? Antwoord dan vooral op deze mail, dan denken we met je mee.

Groet,
Maks & Thijn
ZOL Solutions`,
  },
  {
    step: 2,
    days: 30,
    from: "2026-10-12T00:00:00Z",
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

// Losse https-adressen in de tekst worden klikbaar, zodat de admin geen opmaak nodig heeft voor bv. een reviewlink.
const linkify = (html: string) => html.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => `<a href="${url}" style="color:#33669b">${url}</a>`)
const paragraphsHtml = (text: string) => text.split(/\n{2,}/).map((part) => `<p style="margin:0 0 14px">${linkify(escapeEmailHtml(part)).replaceAll("\n", "<br>")}</p>`).join("")
const mailDate = (iso: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
const messageId = (orderId: string, step: number) => `<customer-followup-${orderId}-${step}@zolsolutions.nl>`
const fill = (text: string, name: string) => text.replace(/{{\s*(voornaam|customer_first_name)\s*}}/g, name)

// Mail 2 gaat als antwoord op mail 1 (zelfde gesprek, "Re:", mail 1 eronder) als mail 1 echt verstuurd is.
export function renderFollowup(followup: Followup, name: string, orderId = "", previous?: { followup: Followup; sentAt: string }) {
  const own = fill(followup.body, name)
  const headers: Record<string, string> = orderId ? { "Message-ID": messageId(orderId, followup.step) } : {}
  if (!previous) {
    return { subject: followup.subject, text: own, html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222">${paragraphsHtml(own)}</div>`, headers }
  }
  const earlier = fill(previous.followup.body, name)
  const intro = `Op ${mailDate(previous.sentAt)} schreef ZOL Solutions <info@zolsolutions.nl>:`
  if (orderId) { headers["In-Reply-To"] = messageId(orderId, previous.followup.step); headers["References"] = messageId(orderId, previous.followup.step) }
  return {
    subject: `Re: ${previous.followup.subject}`.slice(0, 240),
    text: `${own}\n\n${intro}\n${earlier.split("\n").map((line) => `> ${line}`).join("\n")}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222">${paragraphsHtml(own)}<div style="margin-top:22px;color:#666">${escapeEmailHtml(intro)}</div><blockquote style="margin:6px 0 0 4px;padding-left:12px;border-left:2px solid #ccc;color:#555">${paragraphsHtml(earlier)}</blockquote></div>`,
    headers,
  }
}

export async function sendCustomerFollowups(db: Db, config: Record<string, unknown>, now = new Date()) {
  const results: Record<string, unknown>[] = []
  // Teksten komen uit E-mails in de admin; staat een opvolgmail daar uit, dan slaan we hem over.
  const { data: templates } = await db.from("email_templates").select("template_key,subject_template,body_template,enabled").in("template_key", followups.map((followup) => `customer_followup_${followup.step}`))
  const active = followups.flatMap((followup) => {
    const template = (templates || []).find((row) => row.template_key === `customer_followup_${followup.step}`)
    if (template && !template.enabled) return []
    return [{ ...followup, subject: template?.subject_template?.trim() || followup.subject, body: template?.body_template?.trim() || followup.body }]
  })
  const { data: orders, error } = await db.from("orders")
    .select("id,customer_id,customer_email,customer_name,delivered_at,shipped_at")
    .eq("order_type", "customer").eq("payment_status", "paid").eq("archived", false)
    .is("returned_at", null)
    .limit(500)
  if (error) throw error
  const customerIds = [...new Set((orders || []).map((order) => order.customer_id).filter(Boolean))]
  const { data: customers } = customerIds.length ? await db.from("customers").select("id,first_name,marketing_unsubscribed_at").in("id", customerIds) : { data: [] }
  const byCustomer = new Map((customers || []).map((customer) => [customer.id, customer]))

  for (const order of (orders || []) as Order[]) {
    const delivered = deliveredOn(order)
    const email = String(order.customer_email || "").trim().toLowerCase()
    if (!delivered || !email) continue
    const customer = order.customer_id ? byCustomer.get(order.customer_id) : null
    if (customer?.marketing_unsubscribed_at) continue
    // Alleen de laatste mail die nu aan de beurt is; een gemiste eerste mail sturen we niet meer na.
    const due = [...active].reverse().find((followup) => delivered.getTime() >= new Date(followup.from).getTime() && now.getTime() >= delivered.getTime() + followup.days * DAY)
    if (!due) continue
    const dedupeKey = `customer-followup-${order.id}-${due.step}`
    const { data: existing } = await db.from("email_messages").select("id,status").eq("dedupe_key", dedupeKey).maybeSingle()
    if (existing?.status === "sent") continue
    // Meerdere bestellingen van dezelfde klant: dezelfde opvolgmail hooguit één keer per 25 dagen.
    const { count } = await db.from("email_messages").select("id", { count: "exact", head: true })
      .eq("recipient_email", email).like("dedupe_key", `customer-followup-%-${due.step}`).eq("status", "sent")
      .gte("created_at", new Date(now.getTime() - 25 * DAY).toISOString())
    if (count) continue
    let previous
    const before = due.standalone ? undefined : active.find((followup) => followup.step === due.step - 1)
    if (before) {
      const { data: earlier } = await db.from("email_messages").select("sent_at,created_at").eq("dedupe_key", `customer-followup-${order.id}-${before.step}`).eq("status", "sent").maybeSingle()
      if (earlier) previous = { followup: before, sentAt: earlier.sent_at || earlier.created_at }
    }
    const mail = renderFollowup(due, firstName(order, customer?.first_name), order.id, previous)
    const log = existing || await logEmail(db, { kind: `customer_followup_${due.step}`, recipient_email: email, subject: mail.subject, body_preview: mail.text.slice(0, 500), customer_id: order.customer_id, dedupe_key: dedupeKey })
    try {
      const sent = await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text, headers: mail.headers, idempotencyKey: dedupeKey, config: { ...config, from_email: "info@zolsolutions.nl", reply_to: "info@zolsolutions.nl" } as never })
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
