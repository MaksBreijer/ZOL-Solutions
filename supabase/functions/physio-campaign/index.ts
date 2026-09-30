import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { adminClient, corsHeaders, emailShell, escapeEmailHtml, getEmailConfig, logEmail, markEmail, requireAdmin, sendEmail } from "../_shared/email.ts"

type Lead = Record<string, unknown>
type Recipient = { id: string; campaign_id: string; lead_id: string; practice_name: string; location: string; specialization: string; contact_person: string; personal_opening: string; email: string }
const clean = (value: unknown) => String(value ?? "").trim()
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const footer = "Wilt u geen berichten meer ontvangen van ZOL Solutions? Reageer met 'geen interesse', dan verwijderen wij u direct uit het bestand."

function eligibleLeads(leads: Lead[]) {
  const seen = new Set<string>()
  return leads.filter((lead) => {
    if (lead.type !== "physio" || lead.outreach_opt_out || !["consent", "existing_customer"].includes(clean(lead.outreach_basis)) || !clean(lead.outreach_basis_note)) return false
    if (/^(smc|sport\s*medisch\s*centrum)\s+almere$/i.test(clean(lead.name).replace(/[-–]/g, " ")) || /@smcalmere\.nl$/i.test(clean(lead.email)) || /(^|\.)smcalmere\.nl$/i.test((() => { try { return new URL(clean(lead.website)).hostname } catch { return "" } })())) return false
    const email = clean(lead.email).toLowerCase()
    if (!validEmail(email) || seen.has(email)) return false
    seen.add(email)
    return true
  })
}

function personalize(template: string, recipient: Recipient) {
  return template.replace(/{{\s*(praktijknaam|plaats|specialisatie|contactpersoon|persoonlijke_opening)\s*}}/gi, (_match, key: string) => {
    if (key.toLowerCase() === "praktijknaam") return recipient.practice_name
    if (key.toLowerCase() === "plaats") return recipient.location
    if (key.toLowerCase() === "contactpersoon") return recipient.contact_person || `praktijkhouder van ${recipient.practice_name}`
    if (key.toLowerCase() === "persoonlijke_opening") return recipient.personal_opening
    return recipient.specialization
  })
}

async function mxValid(email: string) {
  const domain = email.split("@")[1]
  const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, { headers: { accept: "application/dns-json" } })
  if (!response.ok) throw new Error("MX-controle tijdelijk niet beschikbaar")
  const result = await response.json()
  return result.Status === 0 && (result.Answer || []).some((answer: { type?: number; data?: string }) => answer.type === 15 && !/^0\s+\.$/.test(answer.data || ""))
}

async function campaignStatus(db: ReturnType<typeof adminClient>) {
  const { data: settings, error: settingsError } = await db.from("settings").select("value").eq("key", "partner_scout").maybeSingle()
  if (settingsError) throw settingsError
  const leads = Array.isArray(settings?.value?.leads) ? settings.value.leads as Lead[] : []
  const physios = leads.filter((lead) => lead.type === "physio")
  const eligible = eligibleLeads(physios)
  const { data: campaign, error: campaignError } = await db.from("physio_campaigns").select("id,subject_template,body_template,status,created_at,completed_at").order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (campaignError) throw campaignError
  let counts: Record<string, number> = {}
  if (campaign) {
    const { data, error } = await db.from("physio_campaign_recipients").select("status").eq("campaign_id", campaign.id)
    if (error) throw error
    counts = (data || []).reduce((result: Record<string, number>, row: { status: string }) => { result[row.status] = (result[row.status] || 0) + 1; return result }, {})
  }
  const sampleLead = eligible.find((lead) => clean(lead.personal_opening)) || eligible[0]
  return { total_physios: physios.length, eligible: eligible.length, personalized: eligible.filter((lead) => clean(lead.personal_opening)).length, excluded: physios.length - eligible.length, campaign, counts, sample: sampleLead ? { practice_name: clean(sampleLead.name), location: clean(sampleLead.city), specialization: clean(sampleLead.specialization), contact_person: clean(sampleLead.contact_name), personal_opening: clean(sampleLead.personal_opening) } : null }
}

async function processBatch(db: ReturnType<typeof adminClient>) {
  const config = await getEmailConfig(db)
  if (!config.enabled) return { sent: 0, failed: 0, skipped: 0, status: "email_disabled" }
  const { data: claimed, error: claimError } = await db.rpc("claim_physio_campaign_recipients", { p_limit: 40 })
  if (claimError) throw claimError
  const recipients = (claimed || []) as Recipient[]
  if (!recipients.length) return { sent: 0, failed: 0, skipped: 0, status: "no_due_recipients" }
  const campaignIds = [...new Set(recipients.map((recipient) => recipient.campaign_id))]
  const { data: campaigns, error: campaignError } = await db.from("physio_campaigns").select("id,subject_template,body_template").in("id", campaignIds)
  if (campaignError) throw campaignError
  const byCampaign = new Map((campaigns || []).map((campaign: Record<string, string>) => [campaign.id, campaign]))
  const { data: settings, error: settingsError } = await db.from("settings").select("value").eq("key", "partner_scout").maybeSingle()
  if (settingsError) throw settingsError
  const leads = new Map(((settings?.value?.leads || []) as Lead[]).map((lead) => [clean(lead.id), lead]))
  const counts = { sent: 0, failed: 0, skipped: 0 }

  for (const recipient of recipients) {
    const lead = leads.get(recipient.lead_id)
    const campaign = byCampaign.get(recipient.campaign_id)
    const stillEligible = lead && !lead.outreach_opt_out && ["consent", "existing_customer"].includes(clean(lead.outreach_basis)) && clean(lead.outreach_basis_note) && clean(lead.email).toLowerCase() === recipient.email.toLowerCase()
    if (!stillEligible || !campaign) {
      await db.from("physio_campaign_recipients").update({ status: "skipped", error_message: "Contact of mailgrond gewijzigd" }).eq("id", recipient.id)
      counts.skipped++
      continue
    }
    try {
      if (!await mxValid(recipient.email)) {
        await db.from("physio_campaign_recipients").update({ status: "skipped", error_message: "Geen bruikbaar MX-record" }).eq("id", recipient.id)
        counts.skipped++
        continue
      }
      const subject = personalize(campaign.subject_template, recipient).slice(0, 180)
      const body = personalize(campaign.body_template, recipient).trim()
      const bookingUrl = `https://zolsolutions.nl/kennismaking/?praktijk=${encodeURIComponent(recipient.practice_name)}`
      const text = `${body}\n\nPlan 10 minuten met ons: ${bookingUrl}\n\n${footer}`
      const dedupeKey = `physio-campaign-${recipient.id}`
      const { data: existing } = await db.from("email_messages").select("id,status,provider_id").eq("dedupe_key", dedupeKey).maybeSingle()
      if (existing?.status === "sent") {
        await db.from("physio_campaign_recipients").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: existing.provider_id }).eq("id", recipient.id)
        counts.sent++
        continue
      }
      const log = existing || await logEmail(db, { kind: "physio_campaign", recipient_email: recipient.email, subject, body_preview: text.slice(0, 500), dedupe_key: dedupeKey })
      const paragraphs = body.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
        .map((paragraph) => `<p style="margin:0 0 18px;color:#445b70;font-size:15px;line-height:1.72">${escapeEmailHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("")
      const bookingButton = `<a href="${escapeEmailHtml(bookingUrl)}" style="display:inline-block;margin-top:16px;padding:13px 19px;border-radius:8px;background:#33669b;color:#fff;font-size:14px;font-weight:700;text-decoration:none">Plan 10 minuten met ons →</a>`
      const teamPhoto = `<div style="margin:28px 0 0"><img src="https://zolsolutions.nl/media/story-team.jpg" width="604" alt="Maks en Thijn, oprichters van ZOL Solutions" style="display:block;width:100%;max-width:604px;height:auto;border-radius:10px"><p style="margin:8px 0 0;color:#66798c;font-size:12px;line-height:1.5">Maks &amp; Thijn · ZOL Solutions</p></div>`
      const optOut = `<p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #e4e9ee;color:#66798c;font-size:12px;line-height:1.6">${escapeEmailHtml(footer)}</p>`
      const html = emailShell(`${paragraphs}${bookingButton}${teamPhoto}${optOut}`, { eyebrow: "Bericht van ZOL Solutions", title: subject, websiteUrl: config.website_url, logoUrl: config.logo_url })
      const sent = await sendEmail({ to: recipient.email, subject, html, text, idempotencyKey: dedupeKey, config })
      await markEmail(db, log.id, { status: "sent", providerId: sent.id })
      await db.from("physio_campaign_recipients").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: sent.id || null }).eq("id", recipient.id)
      counts.sent++
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verzenden mislukt"
      await db.from("physio_campaign_recipients").update({ status: "failed", error_message: message }).eq("id", recipient.id)
      counts.failed++
    }
  }

  for (const campaignId of campaignIds) {
    const { count, error } = await db.from("physio_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).in("status", ["queued", "sending"])
    if (!error && count === 0) await db.from("physio_campaigns").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", campaignId)
  }
  return counts
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
      return Response.json({ success: true, ...await processBatch(db) }, { headers })
    }
    const admin = await requireAdmin(request, db)
    if (!["owner", "admin"].includes(clean(admin.role))) return Response.json({ error: "Geen toegang" }, { status: 403, headers })
    if (action === "test") {
      const config = await getEmailConfig(db)
      const recipients = [
        { name: "Thijn", email: "thijn@zolsolutions.nl" },
        { name: "Maks", email: "maks@zolsolutions.nl" },
      ]
      const templateSubject = clean(body.subject) || "Vraag over {{praktijknaam}}"
      const templateBody = clean(body.message) || "Hoi {{contactpersoon}},\n\nDit is een test van de persoonlijke fysiomail van ZOL Solutions. Zo ziet de mail eruit voor {{praktijknaam}}.\n\nGroet,\nMaks & Thijn\nZOL Solutions"
      const results = []
      for (const recipient of recipients) {
        const person = { practice_name: `Praktijk van ${recipient.name}`, location: "Amsterdam", specialization: "fysiotherapie", contact_person: recipient.name, personal_opening: `Hoi ${recipient.name}, dit is een voorbeeld van een persoonlijke openingszin.` } as Recipient
        const subject = `[TEST] ${personalize(templateSubject, person).slice(0, 170)}`
        const bodyText = personalize(templateBody, person).trim()
        const bookingUrl = `https://zolsolutions.nl/kennismaking/?praktijk=${encodeURIComponent(person.practice_name)}`
        const text = `${bodyText}\n\nPlan 10 minuten met ons: ${bookingUrl}\n\n${footer}`
        const paragraphs = bodyText.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
          .map((paragraph) => `<p style="margin:0 0 18px;color:#445b70;font-size:15px;line-height:1.72">${escapeEmailHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("")
        const button = `<a href="${escapeEmailHtml(bookingUrl)}" style="display:inline-block;margin-top:16px;padding:13px 19px;border-radius:8px;background:#33669b;color:#fff;font-size:14px;font-weight:700;text-decoration:none">Plan 10 minuten met ons →</a>`
        const photo = `<div style="margin:28px 0 0"><img src="https://zolsolutions.nl/media/story-team.jpg" width="604" alt="Maks en Thijn, oprichters van ZOL Solutions" style="display:block;width:100%;max-width:604px;height:auto;border-radius:10px"><p style="margin:8px 0 0;color:#66798c;font-size:12px;line-height:1.5">Maks &amp; Thijn · ZOL Solutions</p></div>`
        const optOut = `<p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #e4e9ee;color:#66798c;font-size:12px;line-height:1.6">${escapeEmailHtml(footer)}</p>`
        const html = emailShell(`${paragraphs}${button}${photo}${optOut}`, { eyebrow: "Test fysiomail · ZOL Solutions", title: subject, websiteUrl: config.website_url, logoUrl: config.logo_url })
        const dedupeKey = `physio-campaign-test-${crypto.randomUUID()}`
        const log = await logEmail(db, { kind: "physio_campaign", recipient_email: recipient.email, subject, body_preview: text.slice(0, 500), dedupe_key: dedupeKey })
        try {
          const sent = await sendEmail({ to: recipient.email, subject, html, text, idempotencyKey: dedupeKey, config })
          await markEmail(db, log.id, { status: "sent", providerId: sent.id })
          results.push({ recipient: recipient.email, status: "sent", provider_id: sent.id || null })
        } catch (error) {
          const message = error instanceof Error ? error.message : "Verzenden mislukt"
          await markEmail(db, log.id, { status: "failed", error: message })
          results.push({ recipient: recipient.email, status: "failed", error: message })
        }
      }
      return Response.json({ success: results.every((result) => result.status === "sent"), results }, { headers })
    }
    if (action === "status") return Response.json({ success: true, ...await campaignStatus(db) }, { headers })
    if (action === "run") return Response.json({ success: true, ...await processBatch(db) }, { headers })
    if (action === "pause" || action === "resume") {
      const campaignId = clean(body.campaign_id)
      const { error } = await db.from("physio_campaigns").update({ status: action === "pause" ? "paused" : "running" }).eq("id", campaignId)
      if (error) throw error
      return Response.json({ success: true, ...await campaignStatus(db) }, { headers })
    }
    if (action !== "start") return Response.json({ error: "Onbekende actie" }, { status: 400, headers })

    const subject = clean(body.subject).slice(0, 180)
    const message = clean(body.message).slice(0, 5000)
    if (!subject || !message || !/{{\s*praktijknaam\s*}}/i.test(`${subject}\n${message}`)) return Response.json({ error: "Onderwerp, bericht en {{praktijknaam}} zijn verplicht." }, { status: 400, headers })
    const { data: running } = await db.from("physio_campaigns").select("id").eq("status", "running").limit(1).maybeSingle()
    if (running) return Response.json({ error: "Er loopt al een fysiocampagne. Rond die eerst af of pauzeer haar." }, { status: 409, headers })
    const { data: settings, error: settingsError } = await db.from("settings").select("value").eq("key", "partner_scout").maybeSingle()
    if (settingsError) throw settingsError
    const recipients = eligibleLeads(Array.isArray(settings?.value?.leads) ? settings.value.leads : [])
    if (!recipients.length) return Response.json({ error: "Er zijn nog geen fysiopraktijken met een vastgelegde mailgrond en geldig e-mailadres." }, { status: 400, headers })
    if (/{{\s*persoonlijke_opening\s*}}/i.test(`${subject}\n${message}`) && recipients.some((lead) => !clean(lead.personal_opening))) return Response.json({ error: "Vul voor iedere ontvanger een controleerbare persoonlijke openingszin in voordat je deze campagne start." }, { status: 400, headers })
    const { data: campaign, error: campaignError } = await db.from("physio_campaigns").insert({ subject_template: subject, body_template: message, created_by: admin.id }).select("id").single()
    if (campaignError) throw campaignError
    const rows = recipients.map((lead) => ({ campaign_id: campaign.id, lead_id: clean(lead.id), practice_name: clean(lead.name), location: clean(lead.city), specialization: clean(lead.specialization), contact_person: clean(lead.contact_name), personal_opening: clean(lead.personal_opening), email: clean(lead.email).toLowerCase() }))
    for (let index = 0; index < rows.length; index += 500) {
      const { error } = await db.from("physio_campaign_recipients").insert(rows.slice(index, index + 500))
      if (error) { await db.from("physio_campaigns").update({ status: "paused" }).eq("id", campaign.id); throw error }
    }
    const delivery = await processBatch(db)
    return Response.json({ success: true, campaign_id: campaign.id, queued: rows.length, delivery, ...await campaignStatus(db) }, { headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : "De campagne kon niet worden verwerkt"
    const status = /ingelogd|sessie|toegang|Tweestapsverificatie/i.test(message) ? 401 : 500
    return Response.json({ error: message }, { status, headers })
  }
})
