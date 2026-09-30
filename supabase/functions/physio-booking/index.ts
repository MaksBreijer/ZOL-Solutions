import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import ICAL from "npm:ical.js@2.2.1"
import { adminClient, corsHeaders, emailShell, escapeEmailHtml, getEmailConfig, logEmail, markEmail, requireAdmin, sendEmail } from "../_shared/email.ts"

const CALENDAR_ID = "7d10f76a1ef8cdb5ca15ae46e3ba1e70af731fd60f5fa40abf93c259ea88f0dd@group.calendar.google.com"
const TIME_ZONE = "Europe/Amsterdam"
const DAY_MS = 86_400_000
const clean = (value: unknown, limit = 200) => String(value ?? "").trim().slice(0, limit)

function amsterdamParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date)
  return Object.fromEntries(parts.map((part) => [part.type, Number(part.value)])) as Record<string, number>
}

function localToUtc(year: number, month: number, day: number, hour: number, minute: number) {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const actual = amsterdamParts(new Date(guess))
  const offset = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute) - guess
  return new Date(guess - offset)
}

type BusyEvent = { start: Date; end: Date }
async function calendarBusy(db: ReturnType<typeof adminClient>, from: Date, until: Date) {
  const { data: setting, error } = await db.from("settings").select("value").eq("key", "calendar_config").maybeSingle()
  if (error) throw error
  const feed = clean(setting?.value?.private_ics_url, 2000)
  if (!feed) throw new Error("De ZOL Teamagenda is nog niet verbonden.")
  const url = new URL(feed)
  if (url.protocol !== "https:" || url.hostname !== "calendar.google.com" || !/^\/calendar\/ical\/.+\/(?:private-[^/]+|public)\/basic\.ics$/.test(url.pathname)) throw new Error("De ZOL Teamagenda is nog niet verbonden.")
  const response = await fetch(url, { headers: { "User-Agent": "ZOL-Booking/1.0" } })
  if (!response.ok) throw new Error("De ZOL Teamagenda kon niet worden geladen.")
  const ics = await response.text()
  if (!ics.includes("BEGIN:VCALENDAR") || ics.length > 5_000_000) throw new Error("De agenda gaf geen geldig overzicht terug.")
  const calendar = new ICAL.Component(ICAL.parse(ics))
  const masters = new Map<string, InstanceType<typeof ICAL.Event>>()
  const exceptions: InstanceType<typeof ICAL.Event>[] = []
  for (const component of calendar.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(component)
    if (event.isRecurrenceException()) exceptions.push(event)
    else masters.set(event.uid || crypto.randomUUID(), event)
  }
  for (const exception of exceptions) masters.get(exception.uid)?.relateException(exception)
  const events: BusyEvent[] = []
  for (const event of masters.values()) {
    if (!event.isRecurring()) {
      const start = event.startDate.toJSDate(), end = event.endDate.toJSDate()
      if (start < until && end > from) events.push({ start, end })
      continue
    }
    const iterator = event.iterator()
    let occurrence, count = 0
    while ((occurrence = iterator.next()) && count++ < 10000) {
      if (occurrence.toJSDate() >= until) break
      const details = event.getOccurrenceDetails(occurrence)
      const start = details.startDate.toJSDate(), end = details.endDate.toJSDate()
      if (start < until && end > from) events.push({ start, end })
    }
  }
  return events
}

function occupied(start: Date, end: Date, events: BusyEvent[], bookings: { start_at: string; end_at: string }[]) {
  const overlaps = (from: number, until: number) => from < end.getTime() && until > start.getTime()
  if (bookings.some((booking) => overlaps(Date.parse(booking.start_at), Date.parse(booking.end_at)))) return true
  return events.some((event) => overlaps(event.start.getTime(), event.end.getTime()))
}

async function availableSlots(db: ReturnType<typeof adminClient>) {
  const { data: setting, error: settingError } = await db.from("settings").select("value").eq("key", "physio_booking").maybeSingle()
  if (settingError) throw settingError
  const config = setting?.value || {}
  if (config.enabled === false) return []
  const firstHour = Math.max(8, Math.min(16, Number(config.start_hour) || 9))
  const lastHour = Math.max(firstHour + 1, Math.min(19, Number(config.end_hour) || 17))
  const interval = Math.max(10, Math.min(60, Number(config.slot_interval_minutes) || 20))
  const blockedWeekdays = Array.isArray(config.blocked_weekdays) ? config.blocked_weekdays.map(Number) : [2]
  const now = new Date()
  const local = amsterdamParts(now)
  const today = Date.UTC(local.year, local.month - 1, local.day)
  const until = new Date(now.getTime() + 16 * DAY_MS)
  const events = await calendarBusy(db, now, until)
  const { data: bookings, error: bookingError } = await db.from("physio_bookings").select("start_at,end_at").in("status", ["pending", "confirmed"]).gte("start_at", now.toISOString()).lt("start_at", until.toISOString())
  if (bookingError) throw bookingError
  const result: { start: string; end: string; day: string }[] = []
  for (let dayOffset = 0; dayOffset < 15; dayOffset++) {
    const date = new Date(today + dayOffset * DAY_MS)
    if ([0, 6, ...blockedWeekdays].includes(date.getUTCDay())) continue
    const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1, dayNumber = date.getUTCDate()
    const day = `${year}-${String(month).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`
    for (let minuteOfDay = firstHour * 60; minuteOfDay + 10 <= lastHour * 60; minuteOfDay += interval) {
      const start = localToUtc(year, month, dayNumber, Math.floor(minuteOfDay / 60), minuteOfDay % 60)
      const end = new Date(start.getTime() + 10 * 60_000)
      if (start.getTime() < now.getTime() + 2 * 60 * 60_000 || occupied(start, end, events, bookings || [])) continue
      result.push({ start: start.toISOString(), end: end.toISOString(), day })
    }
  }
  return result
}

async function notify(db: ReturnType<typeof adminClient>, booking: Record<string, string>) {
  const config = await getEmailConfig(db)
  const start = new Date(booking.start_at).toLocaleString("nl-NL", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
  const subject = `10 minuten met ${booking.practice_name} · ${start}`
  const dates = `${booking.start_at.replace(/[-:]/g, "").replace(/\.\d{3}/, "")}/${booking.end_at.replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`
  const addToCalendar = `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: "TEMPLATE", text: `ZOL · 10 min met ${booking.practice_name}`, dates, ctz: TIME_ZONE, details: `${booking.contact_name} · ${booking.email} · ${booking.phone}\n${booking.message}`, location: "Telefonisch", src: CALENDAR_ID })}`
  const text = `Nieuwe afspraak met ${booking.practice_name}\n\nWie bellen: ${booking.contact_name}\n06-nummer: ${booking.phone}\nE-mail: ${booking.email}\nWanneer: ${start} (10 minuten)\nVraag: ${booking.message || "Niet ingevuld"}\n\nVoeg deze afspraak toe aan de ZOL Teamagenda: ${addToCalendar}`
  const guestText = `Hoi ${booking.contact_name},\n\nLeuk dat je even met ons wilt bellen. We hebben 10 minuten voor ${booking.practice_name} gereserveerd op ${start}. We bellen je op ${booking.phone}.\n\n${booking.message ? `Jouw vraag: ${booking.message}\n\n` : ""}Tot dan!\nMaks & Thijn\nZOL Solutions\ninfo@zolsolutions.nl`
  const items = [
    { kind: "physio_booking_admin", to: config.admin_email || "info@zolsolutions.nl", subject, text, html: emailShell(`<p style="white-space:pre-wrap;line-height:1.7">${escapeEmailHtml(text)}</p>`, { eyebrow: "Nieuwe afspraak", title: "10 minuten met een praktijk" }), column: "admin_notified_at" },
    { kind: "physio_booking_guest", to: booking.email, subject: `Afgesproken: ${start} met ZOL`, text: guestText, html: emailShell(`<p style="white-space:pre-wrap;line-height:1.7">${escapeEmailHtml(guestText)}</p>`, { eyebrow: "Tot snel", title: "We bellen je binnenkort" }), column: "guest_notified_at" },
  ]
  const errors: string[] = []
  for (const item of items) {
    const dedupeKey = `${item.kind}-${booking.id}`
    let logId = ""
    try {
      const log = await logEmail(db, { kind: item.kind, recipient_email: item.to, subject: item.subject, body_preview: item.text.slice(0, 500), dedupe_key: dedupeKey })
      logId = log.id
      const result = await sendEmail({ to: item.to, subject: item.subject, html: item.html, text: item.text, replyTo: item.kind === "physio_booking_admin" ? booking.email : undefined, idempotencyKey: dedupeKey, config })
      await markEmail(db, log.id, { status: "sent", providerId: result.id })
      await db.from("physio_bookings").update({ [item.column]: new Date().toISOString() }).eq("id", booking.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Melding mislukt"
      if (logId) await markEmail(db, logId, { status: "failed", error: message })
      errors.push(message)
    }
  }
  return errors
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })
  try {
    const body = await request.json().catch(() => ({}))
    const action = clean(body.action, 20)
    const db = adminClient()
    if (action === "admin_bookings") {
      const admin = await requireAdmin(request, db)
      if (!["owner", "admin"].includes(clean(admin.role))) return Response.json({ error: "Geen toegang" }, { status: 403, headers })
      const { data, error } = await db.from("physio_bookings").select("id,practice_name,contact_name,email,phone,message,start_at,end_at,status,admin_notified_at,guest_notified_at").eq("status", "confirmed").gte("start_at", new Date().toISOString()).order("start_at").limit(50)
      if (error) throw error
      return Response.json({ bookings: data || [] }, { headers })
    }
    if (action === "availability") return Response.json({ slots: await availableSlots(db) }, { headers })
    if (action !== "book") return Response.json({ error: "Onbekende actie" }, { status: 400, headers })
    if (clean(body.website)) return Response.json({ success: true }, { headers })
    const practice = clean(body.practice_name, 180), name = clean(body.contact_name, 120)
    const email = clean(body.email, 254).toLowerCase(), phone = clean(body.phone, 60)
    const message = clean(body.message, 1000), startAt = clean(body.start, 40)
    if (!practice || !name || !/^\S+@\S+\.\S+$/.test(email) || !phone || ![true, "true", "on"].includes(body.privacy_consent)) return Response.json({ error: "Vul praktijk, naam, e-mail, telefoon en toestemming in." }, { status: 400, headers })
    if (!/^(?:\+316|00316|06)\d{8}$/.test(phone.replace(/[\s()-]/g, ""))) return Response.json({ error: "Vul een geldig Nederlands 06-nummer in." }, { status: 400, headers })
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown"
    const fingerprint = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${request.headers.get("user-agent") || "unknown"}`)))].map((part) => part.toString(16).padStart(2, "0")).join("")
    const { data: allowed, error: rateError } = await db.rpc("enforce_contact_rate_limit", { p_fingerprint: fingerprint })
    if (rateError) throw rateError
    if (!allowed) return Response.json({ error: "Te veel aanvragen. Probeer het later opnieuw." }, { status: 429, headers })
    const config = await getEmailConfig(db)
    if (!config.enabled) throw new Error("De mailbevestiging is tijdelijk niet beschikbaar.")
    const slot = (await availableSlots(db)).find((item) => item.start === startAt)
    if (!slot) return Response.json({ error: "Deze tijd is niet meer vrij. Kies een andere tijd." }, { status: 409, headers })
    const { data: booking, error: insertError } = await db.from("physio_bookings").insert({ practice_name: practice, contact_name: name, email, phone, message, start_at: slot.start, end_at: slot.end }).select("*").single()
    if (insertError?.code === "23505") return Response.json({ error: "Deze tijd is zojuist geboekt. Kies een andere tijd." }, { status: 409, headers })
    if (insertError || !booking) throw insertError || new Error("Reserveren mislukt")
    await db.from("physio_bookings").update({ status: "confirmed" }).eq("id", booking.id)
    const emailErrors = await notify(db, { ...booking, id: booking.id })
    return Response.json({ success: true, start: slot.start, notification_warning: emailErrors.length > 0 }, { headers })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Boeken is nu niet mogelijk." }, { status: 503, headers })
  }
})
