import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import {
  adminClient, corsHeaders, emailShell, escapeHtml, getEmailConfig, getEmailTemplate,
  logEmail, markEmail, renderTemplate, requireAdmin, sendEmail,
} from "../_shared/email.ts"
import { timepoints as pilotTimepoints } from "../_shared/pilot-questions.js"

type Question = {
  key: string
  label: string
  help?: string
  type: "scale" | "choice" | "text"
  min?: number
  max?: number
  minLabel?: string
  maxLabel?: string
  required: boolean
  options?: Array<{ value: string; label: string }>
}

type Timepoint = {
  key: "baseline" | "week1" | "week4" | "week12"
  label: string
  delayDays: number
  templateKey: string
  quickQuestion: string
  questions: Question[]
}

const timepoints = pilotTimepoints as Timepoint[]

const encoder = new TextEncoder()
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function asJson(headers: Record<string, string>, body: unknown, status = 200) {
  return Response.json(body, { status, headers: { ...headers, "Content-Type": "application/json" } })
}

function base64Url(bytes: Uint8Array) {
  let binary = ""
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function newToken() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function validAnswer(question: Question, input: unknown) {
  if (question.type === "scale") {
    const value = Number(input)
    if (!Number.isInteger(value) || value < Number(question.min) || value > Number(question.max)) throw new Error("Dit antwoord valt buiten de toegestane schaal.")
    return value
  }
  const value = String(input ?? "").trim()
  if (question.type === "choice") {
    if (!question.options?.some((option) => option.value === value)) throw new Error("Dit antwoord is niet geldig.")
    return value
  }
  if (value.length > 600) throw new Error("De toelichting is te lang.")
  if (question.required && !value) throw new Error("Deze vraag is verplicht.")
  return value
}

async function findInvite(db: ReturnType<typeof adminClient>, token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) throw new Error("De meetlink is ongeldig of verlopen.")
  const hash = await tokenHash(token)
  const { data: invite, error } = await db.from("pilot_invites").select("id,enrollment_id,timepoint,status,token_expires_at,completed_at").eq("token_hash", hash).maybeSingle()
  if (error || !invite) throw new Error("De meetlink is ongeldig of verlopen.")
  if (invite.token_expires_at && new Date(invite.token_expires_at) < new Date()) throw new Error("De meetlink is verlopen.")
  const { data: enrollment } = await db.from("pilot_enrollments").select("id,status").eq("id", invite.enrollment_id).maybeSingle()
  if (!enrollment || enrollment.status !== "active") throw new Error("Deze pijnvragenlijst is niet meer actief.")
  const definition = timepoints.find((item) => item.key === invite.timepoint)
  if (!definition) throw new Error("Dit meetmoment bestaat niet.")
  return { invite, definition }
}

function quickAnswers(definition: Timepoint) {
  const question = definition.questions.find((item) => item.key === definition.quickQuestion)!
  if (question.type === "scale") return Array.from({ length: Number(question.max) - Number(question.min) + 1 }, (_, index) => ({ value: String(Number(question.min) + index), label: String(Number(question.min) + index) }))
  return question.options || []
}

function quickButtons(definition: Timepoint, websiteUrl: string, token: string) {
  const base = `${websiteUrl.replace(/\/$/, "")}/meting/`
  const answers = quickAnswers(definition)
  const buttons = answers.map((answer) => {
    const url = `${base}?token=${encodeURIComponent(token)}&q=${encodeURIComponent(definition.quickQuestion)}&a=${encodeURIComponent(answer.value)}`
    return `<a href="${escapeHtml(url)}" style="display:inline-block;min-width:${answers.length > 5 ? "34px" : "92px"};margin:5px 3px;padding:12px 10px;border-radius:10px;background:#33669b;color:#fff;font-size:14px;font-weight:700;text-align:center;text-decoration:none">${escapeHtml(answer.label)}</a>`
  }).join("")
  const question = definition.questions.find((item) => item.key === definition.quickQuestion)!
  return `<div style="margin:26px 0 10px;padding:22px;border-radius:16px;background:#f2f6f9;text-align:center"><p style="margin:0 0 14px;color:#17324f;font-size:16px;font-weight:700;line-height:1.45">${escapeHtml(question.label)}</p><div>${buttons}</div>${question.type === "scale" ? `<div style="display:flex;justify-content:space-between;margin:9px 4px 0;color:#758697;font-size:10px"><span>${escapeHtml(question.minLabel || "Laag")}</span><span>${escapeHtml(question.maxLabel || "Hoog")}</span></div>` : ""}</div>`
}

async function loadPublic(db: ReturnType<typeof adminClient>, token: string) {
  const { invite, definition } = await findInvite(db, token)
  const { data: rows, error } = await db.from("pilot_responses").select("question_key,answer").eq("invite_id", invite.id)
  if (error) throw error
  const answers = Object.fromEntries((rows || []).map((row) => [row.question_key, row.answer]))
  return { timepoint: definition.key, label: definition.label, questions: definition.questions, answers, completed: invite.status === "completed" }
}

async function saveAnswer(db: ReturnType<typeof adminClient>, token: string, questionKey: string, input: unknown) {
  const { invite, definition } = await findInvite(db, token)
  if (invite.status === "completed") throw new Error("Deze meting is al afgerond.")
  const question = definition.questions.find((item) => item.key === questionKey)
  if (!question) throw new Error("Deze vraag hoort niet bij dit meetmoment.")
  const answer = validAnswer(question, input)
  const { error } = await db.from("pilot_responses").upsert({ invite_id: invite.id, question_key: question.key, answer, submitted_at: new Date().toISOString() }, { onConflict: "invite_id,question_key" })
  if (error) throw error
  if (invite.status === "sent" || invite.status === "pending") await db.from("pilot_invites").update({ status: "started", started_at: new Date().toISOString() }).eq("id", invite.id)
  return { success: true }
}

async function completeMeasurement(db: ReturnType<typeof adminClient>, token: string) {
  const { invite, definition } = await findInvite(db, token)
  const { data: rows, error } = await db.from("pilot_responses").select("question_key,answer").eq("invite_id", invite.id)
  if (error) throw error
  const answered = new Set((rows || []).filter((row) => row.answer !== "").map((row) => row.question_key))
  if (definition.questions.some((question) => question.required && !answered.has(question.key))) throw new Error("Beantwoord eerst alle verplichte vragen.")
  const now = new Date().toISOString()
  await db.from("pilot_invites").update({ status: "completed", completed_at: now, token_hash: null, token_expires_at: null }).eq("id", invite.id)
  if (definition.key === "week12") await db.from("pilot_enrollments").update({ status: "completed", completed_at: now }).eq("id", invite.enrollment_id)
  return { success: true }
}

function displayAnswer(question: Question, value: unknown) {
  if (value === null || value === undefined || value === "") return ""
  if (question.type === "choice") return question.options?.find((option) => option.value === String(value))?.label || String(value)
  return String(value)
}

async function loadAdminReport(
  db: ReturnType<typeof adminClient>,
  admin: { id: string; email: string; role: string },
  recordExport = false,
) {
  if (!["owner", "admin"].includes(admin.role)) throw new Error("Alleen een eigenaar of beheerder kan de antwoorden bekijken.")
  const { data, error } = await db
    .from("pilot_enrollments")
    .select("id,status,consent_confirmed_at,enrolled_at,completed_at,customers!inner(email,first_name,last_name),pilot_invites(id,timepoint,sequence,due_at,status,sent_at,started_at,completed_at,pilot_responses(question_key,answer,submitted_at))")
    .order("enrolled_at", { ascending: true })
  if (error) throw error

  const participants = (data || []).map((enrollment, index) => {
    const customer = Array.isArray(enrollment.customers) ? enrollment.customers[0] : enrollment.customers
    const invites = Array.isArray(enrollment.pilot_invites) ? enrollment.pilot_invites : []
    const measurements = timepoints.map((definition, sequence) => {
      const invite = invites.find((item) => item.timepoint === definition.key)
      const responses = Array.isArray(invite?.pilot_responses) ? invite.pilot_responses : []
      const answers = definition.questions.map((question) => {
        const response = responses.find((item) => item.question_key === question.key)
        return {
          key: question.key,
          label: question.label,
          type: question.type,
          value: response?.answer ?? null,
          display_value: displayAnswer(question, response?.answer),
          submitted_at: response?.submitted_at || null,
        }
      })
      return {
        id: invite?.id || null,
        timepoint: definition.key,
        label: definition.label,
        sequence,
        due_at: invite?.due_at || null,
        status: invite?.status || "pending",
        sent_at: invite?.sent_at || null,
        started_at: invite?.started_at || null,
        completed_at: invite?.completed_at || null,
        answer_count: answers.filter((answer) => answer.value !== null && answer.value !== "").length,
        answers,
      }
    })
    return {
      enrollment_id: enrollment.id,
      participant_code: `P${String(index + 1).padStart(3, "0")}`,
      name: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Onbekend",
      email: customer?.email || "",
      status: enrollment.status,
      enrolled_at: enrollment.enrolled_at,
      consent_confirmed_at: enrollment.consent_confirmed_at,
      completed_at: enrollment.completed_at,
      measurements,
    }
  })

  if (recordExport) {
    await db.from("activity_log").insert({
      actor_id: admin.id,
      actor_email: admin.email,
      action: "Antwoorden pijnvragenlijsten geëxporteerd",
      entity_type: "pilot_report",
      entity_id: "",
      details: { participants: participants.length, anonymized: true },
    })
  }

  return { generated_at: new Date().toISOString(), anonymized_export: true, participants }
}

type AdminActor = { id: string; email: string; role: string }
type CustomerRow = { id: string; email: string; first_name?: string; last_name?: string }
type PainConfig = {
  enabled?: boolean
  test_mode?: boolean
  automatic_sending?: boolean
  allowed_emails?: string[]
  excluded_emails?: string[]
  additional_invitation_emails?: string[]
}

async function getPainConfig(db: ReturnType<typeof adminClient>): Promise<PainConfig> {
  const { data, error } = await db.from("settings").select("value").eq("key", "pilot_measurements").maybeSingle()
  if (error) throw error
  return data?.value || {}
}

function emailExcluded(config: PainConfig, email: string) {
  const excluded = (config.excluded_emails || []).map((item) => String(item).trim().toLowerCase())
  return excluded.includes(email.trim().toLowerCase())
}

function emailAllowed(config: PainConfig, email: string) {
  if (emailExcluded(config, email)) return false
  const allowed = (config.allowed_emails || []).map((item) => String(item).trim().toLowerCase())
  return config.test_mode === false || allowed.includes(email.trim().toLowerCase())
}

async function createEnrollment(
  db: ReturnType<typeof adminClient>,
  input: { customerId: string; orderId?: string | null; consentSource: string; actor?: AdminActor | null; confirmedAt?: string },
) {
  const { data: existing, error: existingError } = await db.from("pilot_enrollments").select("id").eq("customer_id", input.customerId).maybeSingle()
  if (existingError) throw existingError
  if (existing) return existing
  const confirmedAt = input.confirmedAt || new Date().toISOString()
  const { data: enrollment, error } = await db.from("pilot_enrollments").insert({
    customer_id: input.customerId,
    order_id: input.orderId && uuidPattern.test(input.orderId) ? input.orderId : null,
    status: "active",
    consent_confirmed_at: confirmedAt,
    consent_source: input.consentSource.slice(0, 160),
    enrolled_by: input.actor?.id || null,
    enrolled_at: confirmedAt,
  }).select("id").single()
  if (error) throw error
  const start = new Date(confirmedAt)
  const invites = timepoints.map((definition, index) => ({
    enrollment_id: enrollment.id,
    timepoint: definition.key,
    sequence: index,
    due_at: new Date(start.getTime() + definition.delayDays * 86_400_000).toISOString(),
    status: "pending",
  }))
  const { error: inviteError } = await db.from("pilot_invites").insert(invites)
  if (inviteError) throw inviteError
  await db.from("activity_log").insert({
    actor_id: input.actor?.id || null,
    actor_email: input.actor?.email || "vragenlijst@zolsolutions.nl",
    action: "Klant gestart met pijnvragenlijsten",
    entity_type: "pilot_enrollment",
    entity_id: enrollment.id,
    details: { customer_id: input.customerId, consent_source: input.consentSource },
  })
  return enrollment
}

async function enroll(db: ReturnType<typeof adminClient>, body: Record<string, unknown>, admin: AdminActor) {
  if (!['owner', 'admin'].includes(admin.role)) throw new Error("Alleen een eigenaar of beheerder kan deelnemers toevoegen.")
  const customerId = String(body.customer_id || "")
  if (!uuidPattern.test(customerId) || body.consent_confirmed !== true) throw new Error("Kies een klant en bevestig de toestemming van de ouder/verzorger.")
  const { data: customer, error: customerError } = await db.from("customers").select("id,email").eq("id", customerId).maybeSingle()
  if (customerError || !customer) throw new Error("Klant niet gevonden.")
  const config = await getPainConfig(db)
  if (!emailAllowed(config, customer.email)) throw new Error("In de teststand kun je alleen een adres uit de testlijst toevoegen.")
  const enrollment = await createEnrollment(db, {
    customerId: customer.id,
    orderId: String(body.order_id || ""),
    consentSource: String(body.consent_source || "handmatig bevestigd in ZOL Admin"),
    actor: admin,
  })
  return { success: true, enrollment_id: enrollment.id }
}

async function sendMeasurementInvite(db: ReturnType<typeof adminClient>, inviteId: string, actor: AdminActor | null = null) {
  if (!uuidPattern.test(inviteId)) throw new Error("Meetmoment ontbreekt.")
  const { data: invite, error } = await db.from("pilot_invites").select("id,enrollment_id,timepoint,status,send_count,pilot_enrollments!inner(customer_id,status,customers!inner(id,email,first_name,last_name))").eq("id", inviteId).maybeSingle()
  if (error || !invite) throw new Error("Meetmoment niet gevonden.")
  const enrollment = Array.isArray(invite.pilot_enrollments) ? invite.pilot_enrollments[0] : invite.pilot_enrollments
  const customer = Array.isArray(enrollment.customers) ? enrollment.customers[0] : enrollment.customers
  if (enrollment.status !== "active" || invite.status === "completed") throw new Error("Dit meetmoment kan niet meer worden verstuurd.")
  const config = await getPainConfig(db)
  if (!config.enabled) throw new Error("De pijnvragenlijsten staan uit. Activeer ze eerst in ZOL Admin.")
  if (!emailAllowed(config, customer.email)) throw new Error("Geblokkeerd door de interne testlijst.")
  const definition = timepoints.find((item) => item.key === invite.timepoint)
  if (!definition) throw new Error("Onbekend meetmoment.")
  const emailConfig = await getEmailConfig(db)
  const template = await getEmailTemplate(definition.templateKey, db)
  if (!template.enabled) throw new Error("Dit e-mailsjabloon staat uit.")
  const token = newToken()
  const hash = await tokenHash(token)
  const expiresAt = new Date(Date.now() + 180 * 86_400_000).toISOString()
  const { error: tokenError } = await db.from("pilot_invites").update({ token_hash: hash, token_expires_at: expiresAt }).eq("id", invite.id)
  if (tokenError) throw tokenError
  const websiteUrl = emailConfig.website_url || "https://zolsolutions.nl"
  const firstName = customer.first_name || "daar"
  const variables = { customer_first_name: firstName, measurement_url: `${websiteUrl.replace(/\/$/, "")}/meting/?token=${token}` }
  const subject = renderTemplate(template.subject_template, variables)
  const bodyCopy = renderTemplate(template.body_template, variables)
  const content = `<p style="margin:0 0 18px;color:#263b50;font-size:15px;line-height:1.72">${escapeHtml(bodyCopy)}</p>${quickButtons(definition, websiteUrl, token)}<p style="margin:18px 0 0;color:#758697;font-size:12px;line-height:1.6">De persoonlijke link is alleen bedoeld voor deze meting. Antwoord gerust op deze e-mail als iets niet duidelijk is.</p>`
  const nextCount = Number(invite.send_count || 0) + 1
  const log = await logEmail(db, { kind: "pilot_measurement", recipient_email: customer.email, subject, body_preview: bodyCopy.slice(0, 500), customer_id: customer.id, created_by: actor?.id || null, dedupe_key: `pain-checkin:${invite.id}:${nextCount}` })
  try {
    const sent = await sendEmail({
      to: customer.email,
      subject,
      html: emailShell(content, { eyebrow: renderTemplate(template.eyebrow_template, variables), title: renderTemplate(template.title_template, variables), intro: renderTemplate(template.intro_template, variables), websiteUrl }),
      text: `${renderTemplate(template.title_template, variables)}\n\n${bodyCopy}\n\nOpen de korte pijnvragenlijst: ${variables.measurement_url}`,
      config: emailConfig,
      idempotencyKey: `pain-checkin-${invite.id}-${nextCount}`,
    })
    await markEmail(db, log.id, { status: "sent", providerId: sent.id })
    const { error: inviteError } = await db.from("pilot_invites").update({ status: "sent", sent_at: new Date().toISOString(), send_count: nextCount, last_email_message_id: log.id }).eq("id", invite.id)
    await db.from("activity_log").insert({ actor_id: actor?.id || null, actor_email: actor?.email || "vragenlijst@zolsolutions.nl", action: "Pijnvragenlijst verstuurd", entity_type: "pilot_invite", entity_id: invite.id, details: { timepoint: definition.key, customer_id: customer.id } })
    return { success: true, warning: inviteError?.message || "" }
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : "De meetmail kon niet worden verstuurd."
    await markEmail(db, log.id, { status: "failed", error: message })
    throw new Error(message)
  }
}

async function sendInvite(db: ReturnType<typeof adminClient>, body: Record<string, unknown>, admin: AdminActor) {
  if (!['owner', 'admin'].includes(admin.role)) throw new Error("Alleen een eigenaar of beheerder kan vragenlijsten versturen.")
  return sendMeasurementInvite(db, String(body.invite_id || ""), admin)
}

async function sendConsentInvite(db: ReturnType<typeof adminClient>, customer: CustomerRow, orderId: string | null, actor: AdminActor | null = null) {
  const config = await getPainConfig(db)
  if (!config.enabled) throw new Error("De pijnvragenlijsten staan uit.")
  if (!emailAllowed(config, customer.email)) throw new Error("Geblokkeerd door de interne testlijst.")
  const { data: existing, error: existingError } = await db.from("pilot_consent_invites").select("id,status,send_count").eq("customer_id", customer.id).maybeSingle()
  if (existingError) throw existingError
  if (existing && existing.status !== "pending") return { status: "already_invited" }
  let row = existing
  if (!row) {
    const { data: inserted, error: insertError } = await db.from("pilot_consent_invites").insert({ customer_id: customer.id, order_id: orderId, status: "pending" }).select("id,status,send_count").single()
    if (insertError) throw insertError
    row = inserted
  }
  if (!row) throw new Error("De uitnodiging kon niet worden klaargezet.")
  const token = newToken()
  const tokenHashValue = await tokenHash(token)
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString()
  const emailConfig = await getEmailConfig(db)
  const template = await getEmailTemplate("pain_checkin_invitation", db)
  if (!template.enabled) throw new Error("Het uitnodigingssjabloon staat uit.")
  const websiteUrl = String(emailConfig.website_url || "https://zolsolutions.nl").replace(/\/$/, "")
  const variables = { customer_first_name: customer.first_name || "daar", consent_url: `${websiteUrl}/meting/?toestemming=${token}` }
  const subject = renderTemplate(template.subject_template, variables).slice(0, 240)
  const bodyCopy = renderTemplate(template.body_template, variables)
  const content = `<p style="margin:0 0 18px;color:#263b50;font-size:15px;line-height:1.72">${escapeHtml(bodyCopy)}</p><p style="margin:20px 0 0;color:#758697;font-size:12px;line-height:1.6">Deelname is vrijwillig. Zonder expliciete toestemming worden geen antwoorden over de gezondheid van je kind opgeslagen.</p>`
  const nextCount = Number(row.send_count || 0) + 1
  const dedupeKey = `pain-consent:${row.id}:${nextCount}`
  const log = await logEmail(db, { kind: "pain_checkin_invitation", recipient_email: customer.email, subject, body_preview: bodyCopy.slice(0, 500), customer_id: customer.id, order_id: orderId, created_by: actor?.id || null, dedupe_key: dedupeKey })
  await db.from("pilot_consent_invites").update({ token_hash: tokenHashValue, token_expires_at: expiresAt }).eq("id", row.id)
  try {
    const sent = await sendEmail({
      to: customer.email,
      subject,
      html: emailShell(content, {
        eyebrow: renderTemplate(template.eyebrow_template, variables),
        title: renderTemplate(template.title_template, variables),
        intro: renderTemplate(template.intro_template, variables),
        websiteUrl,
        buttonLabel: renderTemplate(template.button_label_template, variables),
        buttonUrl: renderTemplate(template.button_url_template, variables),
      }),
      text: `${renderTemplate(template.title_template, variables)}\n\n${bodyCopy}\n\nLees meer en geef toestemming: ${variables.consent_url}`,
      config: emailConfig,
      idempotencyKey: dedupeKey,
    })
    await markEmail(db, log.id, { status: "sent", providerId: sent.id })
    await db.from("pilot_consent_invites").update({ status: "sent", sent_at: new Date().toISOString(), send_count: nextCount, last_email_message_id: log.id }).eq("id", row.id)
    await db.from("activity_log").insert({ actor_id: actor?.id || null, actor_email: actor?.email || "vragenlijst@zolsolutions.nl", action: "Uitnodiging pijnvragenlijst verstuurd", entity_type: "pilot_consent_invite", entity_id: row.id, details: { customer_id: customer.id, order_id: orderId } })
    return { status: "sent" }
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : "De uitnodiging kon niet worden verstuurd."
    await markEmail(db, log.id, { status: "failed", error: message })
    throw new Error(message)
  }
}

async function eligibleOrderCustomers(db: ReturnType<typeof adminClient>, config: PainConfig) {
  const { data, error } = await db.from("orders")
    .select("id,customer_id,created_at,customers!inner(id,email,first_name,last_name)")
    .in("payment_status", ["paid", "partially_refunded", "refunded"])
    .order("created_at", { ascending: false })
    .limit(5000)
  if (error) throw error
  const unique = new Map<string, { customer: CustomerRow; orderId: string | null }>()
  for (const order of data || []) {
    const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers
    if (!customer?.id || !customer.email || unique.has(customer.id) || !emailAllowed(config, customer.email)) continue
    unique.set(customer.id, { customer, orderId: order.id })
  }
  const additionalEmails = [...new Set((config.additional_invitation_emails || [])
    .map((email) => String(email).trim().toLowerCase())
    .filter((email) => email && emailAllowed(config, email)))]
  if (additionalEmails.length) {
    const { data: additionalCustomers, error: additionalError } = await db.from("customers")
      .select("id,email,first_name,last_name")
      .in("email", additionalEmails)
    if (additionalError) throw additionalError
    for (const customer of additionalCustomers || []) {
      if (!customer?.id || !customer.email || unique.has(customer.id)) continue
      unique.set(customer.id, { customer: customer as CustomerRow, orderId: null })
    }
  }
  return [...unique.values()]
}

async function inviteOrderCustomers(
  db: ReturnType<typeof adminClient>,
  actor: AdminActor | null,
  dryRun = false,
  limit = 100,
  selectedCustomerIds: string[] | null = null,
) {
  const config = await getPainConfig(db)
  if (!config.enabled) throw new Error("De pijnvragenlijsten staan uit.")
  const requestedIds = selectedCustomerIds
    ? [...new Set(selectedCustomerIds.map((id) => String(id).trim()))]
    : null
  if (requestedIds && (!requestedIds.length || requestedIds.length > 100 || requestedIds.some((id) => !uuidPattern.test(id)))) {
    throw new Error("Selecteer één tot honderd geldige klanten.")
  }
  const eligibleCustomers = await eligibleOrderCustomers(db, config)
  const requested = requestedIds ? new Set(requestedIds) : null
  const eligible = requested ? eligibleCustomers.filter((item) => requested.has(item.customer.id)) : eligibleCustomers
  const ids = eligible.map((item) => item.customer.id)
  if (!ids.length) return { eligible: 0, ready: 0, already_enrolled: 0, already_invited: 0, sent: 0, failed: 0 }
  const [{ data: enrollments, error: enrollmentError }, { data: consentInvites, error: consentError }] = await Promise.all([
    db.from("pilot_enrollments").select("customer_id").in("customer_id", ids),
    db.from("pilot_consent_invites").select("customer_id,status").in("customer_id", ids),
  ])
  if (enrollmentError) throw enrollmentError
  if (consentError) throw consentError
  const enrolled = new Set((enrollments || []).map((item) => item.customer_id))
  const invited = new Set((consentInvites || []).filter((item) => item.status !== "pending").map((item) => item.customer_id))
  const ready = eligible.filter((item) => !enrolled.has(item.customer.id) && !invited.has(item.customer.id))
  const summary = { eligible: eligible.length, ready: ready.length, already_enrolled: enrolled.size, already_invited: invited.size, sent: 0, failed: 0 }
  if (dryRun) return summary
  for (const item of ready.slice(0, limit)) {
    try {
      const result = await sendConsentInvite(db, item.customer, item.orderId, actor)
      if (result.status === "sent") summary.sent += 1
    } catch {
      summary.failed += 1
    }
  }
  return summary
}

async function findConsentInvite(db: ReturnType<typeof adminClient>, token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) throw new Error("De toestemmingslink is ongeldig of verlopen.")
  const hash = await tokenHash(token)
  const { data, error } = await db.from("pilot_consent_invites").select("id,customer_id,order_id,status,token_expires_at,customers!inner(id,email,first_name,last_name)").eq("token_hash", hash).maybeSingle()
  if (error || !data || !["pending", "sent"].includes(data.status)) throw new Error("De toestemmingslink is ongeldig of verlopen.")
  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) {
    await db.from("pilot_consent_invites").update({ status: "expired", token_hash: null }).eq("id", data.id)
    throw new Error("De toestemmingslink is verlopen.")
  }
  const customer = Array.isArray(data.customers) ? data.customers[0] : data.customers
  return { invite: data, customer: customer as CustomerRow }
}

async function loadConsent(db: ReturnType<typeof adminClient>, token: string) {
  const { customer } = await findConsentInvite(db, token)
  return { first_name: customer.first_name || "daar" }
}

async function declineConsent(db: ReturnType<typeof adminClient>, token: string) {
  const { invite } = await findConsentInvite(db, token)
  await db.from("pilot_consent_invites").update({ status: "declined", declined_at: new Date().toISOString(), token_hash: null, token_expires_at: null }).eq("id", invite.id)
  return { success: true }
}

async function confirmConsent(db: ReturnType<typeof adminClient>, token: string, parentConfirmed: boolean) {
  if (!parentConfirmed) throw new Error("Bevestig eerst dat je als ouder of verzorger toestemming geeft.")
  const { invite } = await findConsentInvite(db, token)
  const confirmedAt = new Date().toISOString()
  const enrollment = await createEnrollment(db, {
    customerId: invite.customer_id,
    orderId: invite.order_id,
    consentSource: "expliciet bevestigd via online pijnvragenlijst-uitnodiging",
    actor: null,
    confirmedAt,
  })
  await db.from("pilot_consent_invites").update({ status: "accepted", accepted_at: confirmedAt, token_hash: null, token_expires_at: null }).eq("id", invite.id)
  const { data: baseline } = await db.from("pilot_invites").select("id").eq("enrollment_id", enrollment.id).eq("timepoint", "baseline").maybeSingle()
  let warning = ""
  if (baseline) {
    try { await sendMeasurementInvite(db, baseline.id, null) }
    catch (error) { warning = error instanceof Error ? error.message : "De eerste vragenlijst volgt zo snel mogelijk per e-mail." }
  }
  return { success: true, warning }
}

async function sendDue(db: ReturnType<typeof adminClient>, request: Request) {
  const suppliedSecret = request.headers.get("x-zol-email-secret") || ""
  const { data: verified, error: verificationError } = await db.rpc("verify_email_webhook_secret", { p_secret: suppliedSecret })
  if (verificationError || !verified) throw new Error("Geen toegang tot de automatische verzending.")
  const config = await getPainConfig(db)
  if (!config.enabled || !config.automatic_sending) return { success: true, status: "disabled", invitations: {}, questionnaires: { processed: 0, sent: 0, failed: 0 } }
  const invitations = await inviteOrderCustomers(db, null, false, 40)
  const { data: due, error } = await db.from("pilot_invites").select("id").eq("status", "pending").lte("due_at", new Date().toISOString()).order("due_at", { ascending: true }).limit(50)
  if (error) throw error
  const questionnaires = { processed: (due || []).length, sent: 0, failed: 0 }
  for (const invite of due || []) {
    try { await sendMeasurementInvite(db, invite.id, null); questionnaires.sent += 1 }
    catch { questionnaires.failed += 1 }
  }
  return { success: true, invitations, questionnaires }
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return asJson(headers, { error: "Method not allowed" }, 405)
  const db = adminClient()
  try {
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action || "")
    if (action === "load") return asJson(headers, await loadPublic(db, String(body.token || "")))
    if (action === "answer") return asJson(headers, await saveAnswer(db, String(body.token || ""), String(body.question || ""), body.answer))
    if (action === "complete") return asJson(headers, await completeMeasurement(db, String(body.token || "")))
    if (action === "consent_load") return asJson(headers, await loadConsent(db, String(body.token || "")))
    if (action === "consent_confirm") return asJson(headers, await confirmConsent(db, String(body.token || ""), body.parent_confirmed === true))
    if (action === "consent_decline") return asJson(headers, await declineConsent(db, String(body.token || "")))
    if (action === "send_due") return asJson(headers, await sendDue(db, request))
    const admin = await requireAdmin(request, db)
    if (action === "enroll") return asJson(headers, await enroll(db, body, admin))
    if (action === "send") return asJson(headers, await sendInvite(db, body, admin))
    if (action === "invite_order_customers") {
      const selectedCustomerIds = Array.isArray(body.customer_ids) ? body.customer_ids.map(String) : null
      return asJson(headers, await inviteOrderCustomers(db, admin, body.dry_run === true, 100, selectedCustomerIds))
    }
    if (action === "report") return asJson(headers, await loadAdminReport(db, admin, body.record_export === true))
    return asJson(headers, { error: "Onbekende actie." }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : "De pijnvragenlijst kon niet worden verwerkt."
    const status = /ingelogd|sessie|toegang/i.test(message) ? 401 : /ongeldig|verplicht|toegestaan|ontbreekt|geblokkeerd|staat uit/i.test(message) ? 400 : 500
    return asJson(headers, { error: message }, status)
  }
})
