import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import {
  adminClient, corsHeaders, emailShell, escapeHtml, getEmailConfig, getEmailTemplate,
  logEmail, markEmail, renderTemplate, requireAdmin, sendEmail,
} from "../_shared/email.ts"

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

const timepoints: Timepoint[] = [
  {
    key: "baseline", label: "Startmeting", delayDays: 0, templateKey: "pilot_baseline", quickQuestion: "pain_sport",
    questions: [
      { key: "pain_sport", label: "Hoeveel hielpijn was er tijdens het sporten?", help: "0 is geen pijn, 10 is de ergst denkbare pijn.", type: "scale", min: 0, max: 10, minLabel: "Geen pijn", maxLabel: "Ergste pijn", required: true },
      { key: "sport_limit", label: "Kon je kind de sport gewoon meedoen?", type: "choice", required: true, options: [{ value: "full", label: "Ja, volledig" }, { value: "partial", label: "Gedeeltelijk" }, { value: "stopped", label: "Nee, gestopt" }] },
      { key: "pain_after", label: "Hoeveel hielpijn was er na het sporten?", help: "Denk aan de eerste uren na de training of wedstrijd.", type: "scale", min: 0, max: 10, minLabel: "Geen pijn", maxLabel: "Ergste pijn", required: true },
      { key: "sport_days", label: "Hoeveel dagen per week sport je kind meestal?", type: "scale", min: 0, max: 7, minLabel: "0 dagen", maxLabel: "7 dagen", required: true },
    ],
  },
  {
    key: "week1", label: "Meting na 1 week", delayDays: 7, templateKey: "pilot_week1", quickQuestion: "comfort",
    questions: [
      { key: "comfort", label: "Hoe comfortabel zitten de ZOL’tjes?", help: "0 is helemaal niet comfortabel, 10 is zeer comfortabel.", type: "scale", min: 0, max: 10, minLabel: "Niet comfortabel", maxLabel: "Zeer comfortabel", required: true },
      { key: "used_days", label: "Op hoeveel dagen zijn de ZOL’tjes gedragen?", type: "scale", min: 0, max: 7, minLabel: "0 dagen", maxLabel: "7 dagen", required: true },
      { key: "pain_sport", label: "Hoeveel hielpijn was er tijdens het sporten?", type: "scale", min: 0, max: 10, minLabel: "Geen pijn", maxLabel: "Ergste pijn", required: true },
      { key: "fit_issue", label: "Zijn er problemen met pasvorm of drukplekken?", type: "choice", required: true, options: [{ value: "no", label: "Nee" }, { value: "a_little", label: "Een beetje" }, { value: "yes", label: "Ja" }] },
    ],
  },
  {
    key: "week4", label: "Meting na 4 weken", delayDays: 28, templateKey: "pilot_week4", quickQuestion: "change",
    questions: [
      { key: "change", label: "Hoe gaat het vergeleken met de start?", type: "choice", required: true, options: [{ value: "worse", label: "Slechter" }, { value: "same", label: "Ongeveer gelijk" }, { value: "better", label: "Beter" }, { value: "much_better", label: "Veel beter" }] },
      { key: "pain_sport", label: "Hoeveel hielpijn is er nu tijdens het sporten?", type: "scale", min: 0, max: 10, minLabel: "Geen pijn", maxLabel: "Ergste pijn", required: true },
      { key: "sport_limit", label: "Kan je kind de sport nu gewoon meedoen?", type: "choice", required: true, options: [{ value: "full", label: "Ja, volledig" }, { value: "partial", label: "Gedeeltelijk" }, { value: "stopped", label: "Nee, gestopt" }] },
      { key: "recommend", label: "Hoe waarschijnlijk is het dat je ZOL aanbeveelt?", type: "scale", min: 0, max: 10, minLabel: "Niet waarschijnlijk", maxLabel: "Zeer waarschijnlijk", required: true },
    ],
  },
  {
    key: "week12", label: "Meting na 12 weken", delayDays: 84, templateKey: "pilot_week12", quickQuestion: "continued_use",
    questions: [
      { key: "continued_use", label: "Worden de ZOL’tjes nog gebruikt?", type: "choice", required: true, options: [{ value: "yes", label: "Ja" }, { value: "sometimes", label: "Soms" }, { value: "no", label: "Nee" }] },
      { key: "pain_sport", label: "Hoeveel hielpijn is er nu tijdens het sporten?", type: "scale", min: 0, max: 10, minLabel: "Geen pijn", maxLabel: "Ergste pijn", required: true },
      { key: "sport_limit", label: "Kan je kind de sport nu gewoon meedoen?", type: "choice", required: true, options: [{ value: "full", label: "Ja, volledig" }, { value: "partial", label: "Gedeeltelijk" }, { value: "stopped", label: "Nee, gestopt" }] },
      { key: "overall", label: "Wat is het resultaat over de hele periode?", type: "choice", required: true, options: [{ value: "worse", label: "Slechter" }, { value: "same", label: "Ongeveer gelijk" }, { value: "better", label: "Beter" }, { value: "much_better", label: "Veel beter" }] },
      { key: "comment", label: "Wil je nog iets meegeven?", help: "Dit is niet verplicht.", type: "text", required: false },
    ],
  },
]

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
  if (!enrollment || enrollment.status !== "active") throw new Error("Deze pilotmeting is niet meer actief.")
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
  if (!["owner", "admin"].includes(admin.role)) throw new Error("Alleen een eigenaar of beheerder kan pilotresultaten bekijken.")
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
      action: "Pilotdata geëxporteerd",
      entity_type: "pilot_report",
      entity_id: "",
      details: { participants: participants.length, anonymized: true },
    })
  }

  return { generated_at: new Date().toISOString(), anonymized_export: true, participants }
}

async function enroll(db: ReturnType<typeof adminClient>, body: Record<string, unknown>, admin: { id: string; email: string; role: string }) {
  if (!['owner', 'admin'].includes(admin.role)) throw new Error("Alleen een eigenaar of beheerder kan deelnemers toevoegen.")
  const customerId = String(body.customer_id || "")
  if (!uuidPattern.test(customerId) || body.consent_confirmed !== true) throw new Error("Kies een klant en bevestig de toestemming van de ouder/verzorger.")
  const { data: customer, error: customerError } = await db.from("customers").select("id,email").eq("id", customerId).maybeSingle()
  if (customerError || !customer) throw new Error("Klant niet gevonden.")
  const { data: setting } = await db.from("settings").select("value").eq("key", "pilot_measurements").maybeSingle()
  const config = setting?.value || {}
  const allowed = (config.allowed_emails || []).map((email: unknown) => String(email).trim().toLowerCase())
  if (config.test_mode !== false && !allowed.includes(customer.email.toLowerCase())) throw new Error("In de teststand kun je alleen een adres uit de testlijst toevoegen.")
  const now = new Date()
  const { data: enrollment, error } = await db.from("pilot_enrollments").upsert({
    customer_id: customer.id,
    order_id: uuidPattern.test(String(body.order_id || "")) ? String(body.order_id) : null,
    status: "active",
    consent_confirmed_at: now.toISOString(),
    consent_source: String(body.consent_source || "handmatig bevestigd in ZOL Admin").slice(0, 160),
    enrolled_by: admin.id,
    enrolled_at: now.toISOString(),
    completed_at: null,
    withdrawn_at: null,
  }, { onConflict: "customer_id" }).select("id").single()
  if (error) throw error
  const invites = timepoints.map((definition, index) => ({
    enrollment_id: enrollment.id,
    timepoint: definition.key,
    sequence: index,
    due_at: new Date(now.getTime() + definition.delayDays * 86_400_000).toISOString(),
    status: "pending",
  }))
  const { error: inviteError } = await db.from("pilot_invites").upsert(invites, { onConflict: "enrollment_id,timepoint", ignoreDuplicates: true })
  if (inviteError) throw inviteError
  await db.from("activity_log").insert({ actor_id: admin.id, actor_email: admin.email, action: "Klant aan meetpilot toegevoegd", entity_type: "pilot_enrollment", entity_id: enrollment.id, details: { customer_id: customer.id } })
  return { success: true, enrollment_id: enrollment.id }
}

async function sendInvite(db: ReturnType<typeof adminClient>, body: Record<string, unknown>, admin: { id: string; email: string; role: string }) {
  if (!['owner', 'admin'].includes(admin.role)) throw new Error("Alleen een eigenaar of beheerder kan meetmails versturen.")
  const inviteId = String(body.invite_id || "")
  if (!uuidPattern.test(inviteId)) throw new Error("Meetmoment ontbreekt.")
  const { data: invite, error } = await db.from("pilot_invites").select("id,enrollment_id,timepoint,status,send_count,pilot_enrollments!inner(customer_id,status,customers!inner(id,email,first_name,last_name))").eq("id", inviteId).maybeSingle()
  if (error || !invite) throw new Error("Meetmoment niet gevonden.")
  const enrollment = Array.isArray(invite.pilot_enrollments) ? invite.pilot_enrollments[0] : invite.pilot_enrollments
  const customer = Array.isArray(enrollment.customers) ? enrollment.customers[0] : enrollment.customers
  if (enrollment.status !== "active" || invite.status === "completed") throw new Error("Dit meetmoment kan niet meer worden verstuurd.")
  const { data: setting } = await db.from("settings").select("value").eq("key", "pilot_measurements").maybeSingle()
  const pilotConfig = setting?.value || {}
  const allowed = (pilotConfig.allowed_emails || []).map((email: unknown) => String(email).trim().toLowerCase())
  if (!pilotConfig.enabled) throw new Error("De pilot staat uit. Activeer hem eerst handmatig in ZOL Admin.")
  if (pilotConfig.test_mode !== false && !allowed.includes(customer.email.toLowerCase())) throw new Error("Geblokkeerd door de interne testlijst.")
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
  const log = await logEmail(db, { kind: "pilot_measurement", recipient_email: customer.email, subject, body_preview: bodyCopy.slice(0, 500), customer_id: customer.id, created_by: admin.id, dedupe_key: `pilot:${invite.id}:${nextCount}` })
  try {
    const sent = await sendEmail({
      to: customer.email,
      subject,
      html: emailShell(content, { eyebrow: renderTemplate(template.eyebrow_template, variables), title: renderTemplate(template.title_template, variables), intro: renderTemplate(template.intro_template, variables), websiteUrl }),
      text: `${renderTemplate(template.title_template, variables)}\n\n${bodyCopy}\n\nOpen de korte meting: ${variables.measurement_url}`,
      config: emailConfig,
      idempotencyKey: `pilot-${invite.id}-${nextCount}`,
    })
    await markEmail(db, log.id, { status: "sent", providerId: sent.id })
    const { error: inviteError } = await db.from("pilot_invites").update({ status: "sent", sent_at: new Date().toISOString(), send_count: nextCount, last_email_message_id: log.id }).eq("id", invite.id)
    await db.from("activity_log").insert({ actor_id: admin.id, actor_email: admin.email, action: "Pilotmeetmail verstuurd", entity_type: "pilot_invite", entity_id: invite.id, details: { timepoint: definition.key, customer_id: customer.id } })
    return { success: true, warning: inviteError?.message || "" }
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : "De meetmail kon niet worden verstuurd."
    await markEmail(db, log.id, { status: "failed", error: message })
    throw new Error(message)
  }
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
    const admin = await requireAdmin(request, db)
    if (action === "enroll") return asJson(headers, await enroll(db, body, admin))
    if (action === "send") return asJson(headers, await sendInvite(db, body, admin))
    if (action === "report") return asJson(headers, await loadAdminReport(db, admin, body.record_export === true))
    return asJson(headers, { error: "Onbekende actie." }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : "De pilotmeting kon niet worden verwerkt."
    const status = /ingelogd|sessie|toegang/i.test(message) ? 401 : /ongeldig|verplicht|toegestaan|ontbreekt|geblokkeerd|staat uit/i.test(message) ? 400 : 500
    return asJson(headers, { error: message }, status)
  }
})
