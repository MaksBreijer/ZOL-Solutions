import ICAL from 'ical.js'

function eventRecord(item, startTime, endTime) {
  return {
    id: `${item.uid}-${startTime.toString()}`,
    uid: item.uid,
    title: item.summary || 'Naamloze afspraak',
    description: item.description || '',
    location: item.location || '',
    allDay: Boolean(startTime.isDate),
    start: startTime.toJSDate(),
    end: endTime.toJSDate(),
  }
}

function overlapsRange(start, end, rangeStart, rangeEnd) {
  return end.getTime() > rangeStart.getTime() && start.getTime() < rangeEnd.getTime()
}

export function parseCalendarEvents(icsText, rangeStart, rangeEnd) {
  if (!icsText?.trim()) return []
  const calendar = new ICAL.Component(ICAL.parse(icsText))
  const masters = new Map()
  const exceptions = []

  calendar.getAllSubcomponents('vevent').forEach((component) => {
    const event = new ICAL.Event(component)
    if (event.isRecurrenceException()) exceptions.push(event)
    else masters.set(event.uid || crypto.randomUUID(), event)
  })

  exceptions.forEach((exception) => masters.get(exception.uid)?.relateException(exception))

  const records = []
  masters.forEach((event) => {
    if (!event.isRecurring()) {
      const record = eventRecord(event, event.startDate, event.endDate)
      if (overlapsRange(record.start, record.end, rangeStart, rangeEnd)) records.push(record)
      return
    }

    const iterator = event.iterator()
    let occurrence
    let iterations = 0
    while ((occurrence = iterator.next()) && iterations < 10000) {
      iterations += 1
      const occurrenceStart = occurrence.toJSDate()
      if (occurrenceStart.getTime() >= rangeEnd.getTime()) break
      const details = event.getOccurrenceDetails(occurrence)
      const record = eventRecord(details.item, details.startDate, details.endDate)
      if (overlapsRange(record.start, record.end, rangeStart, rangeEnd)) records.push(record)
    }
  })

  return records.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title, 'nl'))
}

export function calendarGridRange(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - mondayOffset)
  const end = new Date(start)
  end.setDate(start.getDate() + 42)
  return { start, end }
}

export function eventsForDay(events, day) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  const end = new Date(start)
  end.setDate(start.getDate() + 1)
  return events.filter((event) => overlapsRange(event.start, event.end, start, end))
}

function googleDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Ongeldige datum of tijd.')
  const part = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}T${part(date.getHours())}${part(date.getMinutes())}00`
}

export function googleCalendarEventUrl({ title, start, end, description = '', location = '', calendarId = '' }) {
  const startDate = start instanceof Date ? start : new Date(start)
  const endDate = end instanceof Date ? end : new Date(end)
  if (!title?.trim()) throw new Error('Vul een titel in.')
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) throw new Error('De eindtijd moet na de begintijd liggen.')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title.trim(),
    dates: `${googleDateTime(startDate)}/${googleDateTime(endDate)}`,
    ctz: 'Europe/Amsterdam',
  })
  if (description.trim()) params.set('details', description.trim())
  if (location.trim()) params.set('location', location.trim())
  if (calendarId.trim()) params.set('src', calendarId.trim())
  return `https://calendar.google.com/calendar/render?${params}`
}

export function appleCalendarSubscriptionUrl(privateIcsUrl) {
  let url
  try { url = new URL(privateIcsUrl) } catch { throw new Error('De agenda is nog niet geldig verbonden.') }
  if (url.protocol !== 'https:' || url.hostname !== 'calendar.google.com' || !/\/calendar\/ical\/.+\/(?:private-[^/]+|public)\/basic\.ics$/.test(url.pathname)) {
    throw new Error('De agenda is nog niet geldig verbonden.')
  }
  return url.href.replace(/^https:/, 'webcal:')
}
