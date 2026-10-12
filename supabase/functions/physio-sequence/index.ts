import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { physioSalutationName } from "../physio-campaign/email-finder.js"
import { adminClient, corsHeaders, escapeEmailHtml, getEmailConfig, logEmail, markEmail, requireAdmin, sendEmail } from "../_shared/email.ts"

type Lead = Record<string, unknown>
type Step = { title: string; subject: string; body: string; wait_days: number }
type Enrollment = { id: string; lead_id: string; email: string; practice_name: string; location: string; region: string; specialization: string; contact_person: string; personal_opening: string; circle: string; steps_sent: number }
type Db = ReturnType<typeof adminClient>

const clean = (value: unknown) => String(value ?? "").trim()
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const stepTitles = ["Eerste contact", "Geen reactie", "Herhaling", "Herhaling 2.0"]
const defaultWait = [0, 7, 7, 14]
// Een praktijk die in Partner Scout al een gesprek, test of besluit heeft, krijgt geen opvolgmail meer.
const stopStatuses = new Set(["meeting", "pilot", "won", "lost"])
const groups = ["gold", "silver", "national"] as const
const fromConfig = { from_email: "info@zolsolutions.nl", reply_to: "info@zolsolutions.nl" }

async function loadSettings(db: Db) {
  const { data, error } = await db.from("settings").select("key,value").in("key", ["physio_sequence", "partner_scout"])
  if (error) throw error
  const byKey = Object.fromEntries((data || []).map((row) => [row.key, row.value || {}]))
  const sequence = byKey.physio_sequence || {}
  const steps: Step[] = stepTitles.map((title, index) => {
    const step = Array.isArray(sequence.steps) ? sequence.steps[index] || {} : {}
    return { title, subject: clean(step.subject), body: clean(step.body), wait_days: Math.max(0, Math.min(60, Number(step.wait_days ?? defaultWait[index]) || 0)) }
  })
  const leads = Array.isArray(byKey.partner_scout?.leads) ? byKey.partner_scout.leads as Lead[] : []
  const gold = new Set((Array.isArray(sequence.gold_lead_ids) ? sequence.gold_lead_ids : []).map(clean))
  const flags = sequence.enabled_groups || {}
  const enabledGroups = Object.fromEntries(groups.map((group) => [group, Boolean(flags[group])])) as Record<string, boolean>
  return { enabledGroups, steps, leads, gold }
}

const isExcluded = (lead: Lead) => /smc\s*almere|sport\s*medisch\s*centrum\s*almere/i.test(clean(lead.name).replace(/[-–]/g, " ")) || /smcalmere\.nl/i.test(`${clean(lead.email)} ${clean(lead.website)}`)
// Gold en Silver zijn alleen voor praktijken in Amsterdam en Amstelveen; alles daarbuiten is Landelijk.
const isHomeArea = (lead: Lead) => /\b(amsterdam|amstelveen)\b/i.test(clean(lead.city))
// Gold: kinder- of sportfocus (of handmatig gekozen) binnen Amsterdam/Amstelveen. Silver: overige praktijken daar. Landelijk: de rest.
const goldSignals = /kinder|kids|jeugd|junior|sport|hielpijn|sever/i
const circleOf = (lead: Lead, gold: Set<string>) => {
  if (!isHomeArea(lead)) return "national"
  if (gold.has(clean(lead.id))) return "gold"
  // De standaardreden van de landelijke zoekactie ("Openbare vermelding…") noemt altijd sport en kinderen en telt dus niet mee.
  const reason = /^openbare vermelding/i.test(clean(lead.match_reason)) ? "" : lead.match_reason
  const profile = [lead.name, lead.specialization, reason, lead.website, ...(Array.isArray(lead.tags) ? lead.tags : [])].map(clean).join(" ")
  return goldSignals.test(profile) ? "gold" : "silver"
}

function personalize(template: string, enrollment: Enrollment) {
  return template.replace(/{{\s*(praktijknaam|plaats|specialisatie|contactpersoon|persoonlijke_opening)\s*}}/gi, (_match, key: string) => {
    const name = key.toLowerCase()
    if (name === "praktijknaam") return enrollment.practice_name
    if (name === "plaats") return enrollment.location
    if (name === "contactpersoon") return physioSalutationName({ contactPerson: enrollment.contact_person, email: enrollment.email, practiceName: enrollment.practice_name })
    if (name === "persoonlijke_opening") return enrollment.personal_opening
    return enrollment.specialization || "fysiotherapie"
  })
}

// Bewust een kale, persoonlijke mail: geen huisstijlkop, knop of afmeldregel, zodat het leest als een mail die we zelf typen.
function renderMail(step: Step, enrollment: Enrollment) {
  const subject = personalize(step.subject, enrollment).slice(0, 180)
  // De aanhef staat vast: een eventueel getypte aanhef vervangen we, zodat hij nooit ontbreekt of dubbel staat.
  const text = String(step.body || "").replace(/^\s*(beste|hoi|hallo|dag)\s+[^\n]*,[ \t]*\n+/i, "").trim()
  const body = personalize(`Beste {{contactpersoon}},\n\n${text}`, enrollment).trim()
  const paragraphs = body.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 14px">${escapeEmailHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("")
  const photo = `<img src="https://zolsolutions.nl/media/story-team.jpg" width="280" alt="Maks en Thijn" style="display:block;width:280px;max-width:100%;height:auto;margin-top:6px;border-radius:6px">`
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222">${paragraphs}${photo}</div>`
  return { subject, text: body, html }
}

async function mxValid(email: string) {
  const domain = email.split("@")[1]
  const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, { headers: { accept: "application/dns-json" } })
  if (!response.ok) throw new Error("MX-controle tijdelijk niet beschikbaar")
  const result = await response.json()
  return result.Status === 0 && (result.Answer || []).some((answer: { type?: number; data?: string }) => answer.type === 15 && !/^0\s+\.$/.test(answer.data || ""))
}

// Alleen op werkdagen tussen 08:00 en 17:00 (Amsterdam), zodat mails niet 's nachts of in het weekend binnenkomen.
function withinOfficeHours(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]))
  const hour = Number(parts.hour)
  return !["Sat", "Sun"].includes(parts.weekday) && hour >= 8 && hour < 17
}

function amsterdamDayStart(now = new Date()) {
  const local = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Amsterdam" }))
  const offset = local.getTime() - now.getTime()
  local.setHours(0, 0, 0, 0)
  return new Date(local.getTime() - offset)
}

async function release(db: Db, id: string, patch: Record<string, unknown>) {
  const { error } = await db.from("physio_sequence_enrollments").update({ claimed_at: null, updated_at: new Date().toISOString(), ...patch }).eq("id", id)
  if (error) throw error
}

// Verstuurt alleen voor de groepen die aan staan; met `onlyGroup` alleen voor die ene groep.
async function processDue(db: Db, onlyGroup = "") {
  const { enabledGroups, steps, leads } = await loadSettings(db)
  const active = groups.filter((group) => enabledGroups[group] && (!onlyGroup || group === onlyGroup))
  if (!active.length) return { sent: 0, status: "disabled" }
  if (!withinOfficeHours()) return { sent: 0, status: "outside_office_hours" }
  const config = await getEmailConfig(db)
  if (!config.enabled) return { sent: 0, status: "email_disabled" }
  const { data: claimed, error } = await db.rpc("claim_physio_sequence_due", { p_groups: active, p_limit: 40 })
  if (error) throw error
  const byId = new Map(leads.map((lead) => [clean(lead.id), lead]))
  const counts = { sent: 0, failed: 0, stopped: 0, waiting: 0 }

  for (const enrollment of (claimed || []) as Enrollment[]) {
    const lead = byId.get(enrollment.lead_id)
    const step = steps[enrollment.steps_sent]
    if (!lead || lead.outreach_opt_out || clean(lead.email).toLowerCase() !== enrollment.email.toLowerCase()) {
      await release(db, enrollment.id, { status: "stopped", error_message: lead?.outreach_opt_out ? "Afgemeld" : "Contact gewijzigd of verwijderd in Partner Scout" })
      counts.stopped++
      continue
    }
    if (stopStatuses.has(clean(lead.status))) {
      await release(db, enrollment.id, { status: "replied", error_message: "Gesprek of besluit staat in Partner Scout" })
      counts.stopped++
      continue
    }
    if (!step?.subject || !step?.body) {
      await release(db, enrollment.id, { status: "active", error_message: `Tekst voor stap ${enrollment.steps_sent + 1} (${stepTitles[enrollment.steps_sent]}) ontbreekt` })
      counts.waiting++
      continue
    }
    const stepNumber = enrollment.steps_sent + 1
    const dedupeKey = `physio-sequence-${enrollment.id}-${stepNumber}`
    try {
      if (enrollment.steps_sent === 0 && !await mxValid(enrollment.email)) {
        await release(db, enrollment.id, { status: "failed", error_message: "Geen bruikbaar MX-record" })
        counts.failed++
        continue
      }
      const mail = renderMail(step, enrollment)
      const { data: existing } = await db.from("email_messages").select("id,status,provider_id").eq("dedupe_key", dedupeKey).maybeSingle()
      let providerId = existing?.provider_id || null
      if (existing?.status !== "sent") {
        const log = existing || await logEmail(db, { kind: "physio_campaign", recipient_email: enrollment.email, subject: mail.subject, body_preview: mail.text.slice(0, 500), dedupe_key: dedupeKey })
        const sent = await sendEmail({ to: enrollment.email, subject: mail.subject, html: mail.html, text: mail.text, idempotencyKey: dedupeKey, config: { ...config, ...fromConfig } })
        await markEmail(db, log.id, { status: "sent", providerId: sent.id })
        providerId = sent.id || null
      }
      await db.from("physio_sequence_messages").upsert({ enrollment_id: enrollment.id, step: stepNumber, subject: mail.subject, status: "sent", provider_id: providerId }, { onConflict: "enrollment_id,step" })
      const now = new Date()
      const nextStep = steps[stepNumber]
      await release(db, enrollment.id, {
        steps_sent: stepNumber, last_sent_at: now.toISOString(), error_message: null,
        status: stepNumber >= 4 ? "completed" : "active",
        next_send_at: new Date(now.getTime() + (nextStep?.wait_days || 0) * 86_400_000).toISOString(),
      })
      counts.sent++
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Verzenden mislukt"
      await db.from("physio_sequence_messages").upsert({ enrollment_id: enrollment.id, step: stepNumber, subject: clean(step.subject), status: "failed", error_message: message }, { onConflict: "enrollment_id,step" })
      await release(db, enrollment.id, { status: "failed", error_message: message })
      counts.failed++
    }
  }
  return counts
}

async function previousMailings(db: Db) {
  const sent = new Map<string, string>()
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("physio_campaign_recipients").select("email,sent_at").eq("status", "sent").range(offset, offset + 999)
    if (error) throw error
    for (const row of data || []) sent.set(clean(row.email).toLowerCase(), clean(row.sent_at))
    if ((data || []).length < 1000) break
  }
  return sent
}

async function status(db: Db) {
  const { enabledGroups, steps, leads, gold } = await loadSettings(db)
  const { data: enrollments, error } = await db.from("physio_sequence_enrollments")
    .select("id,lead_id,email,practice_name,location,region,circle,steps_sent,next_send_at,status,last_sent_at,error_message,created_at")
    .order("created_at", { ascending: false })
  if (error) throw error
  const enrolledLeads = new Map((enrollments || []).map((row) => [row.lead_id, row.circle]))
  const enrolledEmails = new Set((enrollments || []).map((row) => clean(row.email).toLowerCase()))
  const previous = await previousMailings(db)
  const practices = leads.filter((lead) => lead.type === "physio" && !isExcluded(lead)).map((lead) => {
    const email = clean(lead.email).toLowerCase()
    return {
      id: clean(lead.id), name: clean(lead.name), city: clean(lead.city), region: clean(lead.region) || "Onbekend",
      email: validEmail(email) ? email : "", circle: circleOf(lead, gold), status: clean(lead.status),
      opt_out: Boolean(lead.outreach_opt_out), has_opening: Boolean(clean(lead.personal_opening)),
      enrolled: enrolledLeads.has(clean(lead.id)) || (email && enrolledEmails.has(email)),
      // Amsterdam en Amstelveen mogen opnieuw: de oude fysiomail telt daar niet als eerder gemaild.
      previous_mail_at: isHomeArea(lead) ? "" : previous.get(email) || "",
      enrolled_group: enrolledLeads.get(clean(lead.id)) || "",
      salutation: physioSalutationName({ contactPerson: clean(lead.contact_name), email, practiceName: clean(lead.name) }),
      found_at: clean(lead.email) ? clean(lead.email_scan_at) || clean(lead.created_at) : "",
    }
  })
  const { count: sentToday } = await db.from("email_messages").select("id", { count: "exact", head: true }).eq("status", "sent")
    .gte("sent_at", amsterdamDayStart().toISOString())
  return { enabled_groups: enabledGroups, steps, practices, enrollments: enrollments || [], sent_today: sentToday || 0, daily_limit: 40, office_hours: withinOfficeHours() }
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })
  const db = adminClient()
  try {
    const body = await request.json()
    const action = clean(body.action)
    if (action === "run" && request.headers.get("x-zol-marketing-secret")) {
      const { data: verified, error } = await db.rpc("verify_marketing_cron_secret", { p_secret: request.headers.get("x-zol-marketing-secret") })
      if (error || !verified) return Response.json({ error: "Niet toegestaan" }, { status: 401, headers })
      return Response.json({ success: true, ...await processDue(db) }, { headers })
    }
    const admin = await requireAdmin(request, db)
    if (!["owner", "admin"].includes(clean(admin.role))) return Response.json({ error: "Geen toegang" }, { status: 403, headers })

    if (action === "status") return Response.json({ success: true, ...await status(db) }, { headers })

    if (action === "test") {
      const index = Math.max(0, Math.min(3, Number(body.step) || 0))
      const step = { title: stepTitles[index], subject: clean(body.subject), body: clean(body.body), wait_days: 0 }
      if (!step.subject || !step.body) return Response.json({ error: "Vul eerst onderwerp en tekst van deze stap in." }, { status: 400, headers })
      const config = await getEmailConfig(db)
      const results = []
      for (const person of [{ name: "Thijn", email: "thijn@zolsolutions.nl" }, { name: "Maks", email: "maks@zolsolutions.nl" }]) {
        const sample = { id: "", lead_id: "", email: person.email, practice_name: `Praktijk van ${person.name}`, location: "Amsterdam", region: "Noord-Holland", specialization: "fysiotherapie", contact_person: person.name, personal_opening: `Hoi ${person.name}, dit is een voorbeeld van een persoonlijke openingszin.`, circle: "", steps_sent: index }
        const mail = renderMail(step, sample)
        const dedupeKey = `physio-sequence-test-${crypto.randomUUID()}`
        const log = await logEmail(db, { kind: "physio_campaign", recipient_email: person.email, subject: `[TEST] ${mail.subject}`, body_preview: mail.text.slice(0, 500), dedupe_key: dedupeKey })
        try {
          const sent = await sendEmail({ to: person.email, subject: `[TEST] ${mail.subject}`, html: mail.html, text: mail.text, idempotencyKey: dedupeKey, config: { ...config, ...fromConfig } })
          await markEmail(db, log.id, { status: "sent", providerId: sent.id })
          results.push({ recipient: person.email, status: "sent" })
        } catch (sendError) {
          const message = sendError instanceof Error ? sendError.message : "Verzenden mislukt"
          await markEmail(db, log.id, { status: "failed", error: message })
          results.push({ recipient: person.email, status: "failed", error: message })
        }
      }
      return Response.json({ success: results.every((result) => result.status === "sent"), results }, { headers })
    }

    if (action === "enroll") {
      const group = clean(body.group)
      const allReady = body.all_ready === true
      const ids = [...new Set((Array.isArray(body.lead_ids) ? body.lead_ids : []).map(clean).filter(Boolean))]
      if (!allReady && (!ids.length || ids.length > 200)) return Response.json({ error: "Kies 1 tot 200 praktijken." }, { status: 400, headers })
      if (!groups.includes(group as typeof groups[number])) return Response.json({ error: "Kies een groep: Gold, Silver of Landelijk." }, { status: 400, headers })
      const { leads, gold } = await loadSettings(db)
      const inGroup = (lead: Lead) => circleOf(lead, gold) === group
      const wanted = new Set(ids)
      const { data: existing, error: existingError } = await db.from("physio_sequence_enrollments").select("lead_id,email")
      if (existingError) throw existingError
      const takenLeads = new Set((existing || []).map((row) => row.lead_id))
      // Ooit gemaild (oude fysiomail of eerdere reeks) telt als bezet: die praktijk krijgt niets opnieuw.
      const enrolledEmails = new Set((existing || []).map((row) => clean(row.email).toLowerCase()))
      const oldMailings = await previousMailings(db)
      const rows = []
      for (const lead of leads) {
        const email = clean(lead.email).toLowerCase()
        if ((!allReady && !wanted.has(clean(lead.id))) || lead.type !== "physio" || lead.outreach_opt_out || isExcluded(lead) || !validEmail(email) || !inGroup(lead)) continue
        // Amsterdam en Amstelveen mogen een tweede keer, ook als de oude fysiomail ze al had; de nieuwe reeks nooit dubbel.
        if (takenLeads.has(clean(lead.id)) || enrolledEmails.has(email) || (!isHomeArea(lead) && oldMailings.has(email))) continue
        enrolledEmails.add(email)
        rows.push({ lead_id: clean(lead.id), email, practice_name: clean(lead.name), location: clean(lead.city), region: clean(lead.region), specialization: clean(lead.specialization), contact_person: clean(lead.contact_name), personal_opening: clean(lead.personal_opening), circle: group, created_by: admin.id })
      }
      if (rows.length) {
        const { error: insertError } = await db.from("physio_sequence_enrollments").insert(rows)
        if (insertError) throw insertError
      }
      let delivery = null
      if (body.send_now === true) {
        const { data: current, error: settingsError } = await db.from("settings").select("value").eq("key", "physio_sequence").maybeSingle()
        if (settingsError) throw settingsError
        const value = current?.value || {}
        const { error: saveError } = await db.from("settings").update({ value: { ...value, enabled_groups: { ...(value.enabled_groups || {}), [group]: true }, updated_at: new Date().toISOString() } }).eq("key", "physio_sequence")
        if (saveError) throw saveError
        delivery = await processDue(db, group)
      }
      return Response.json({ success: true, enrolled: rows.length, skipped: allReady ? 0 : ids.length - rows.length, delivery, ...await status(db) }, { headers })
    }

    if (action === "update") {
      const id = clean(body.id)
      const op = clean(body.op)
      const patches: Record<string, Record<string, unknown>> = {
        replied: { status: "replied" }, stop: { status: "stopped" }, pause: { status: "paused" },
        resume: { status: "active", error_message: null, next_send_at: new Date().toISOString() },
      }
      if (!patches[op]) return Response.json({ error: "Onbekende wijziging" }, { status: 400, headers })
      const { error } = await db.from("physio_sequence_enrollments").update({ ...patches[op], updated_at: new Date().toISOString() }).eq("id", id).neq("status", "sending")
      if (error) throw error
      return Response.json({ success: true, ...await status(db) }, { headers })
    }

    if (action === "run") return Response.json({ success: true, delivery: await processDue(db, clean(body.group)), ...await status(db) }, { headers })
    return Response.json({ error: "Onbekende actie" }, { status: 400, headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : "De fysiomail kon niet worden verwerkt"
    const code = /ingelogd|sessie|toegang|Tweestapsverificatie/i.test(message) ? 401 : 500
    return Response.json({ error: message }, { status: code, headers })
  }
})
