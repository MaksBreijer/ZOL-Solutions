// Snelle invoer: zet een getypte Nederlandse zin om in een voorstel voor CRM-records, zonder AI of externe dienst.
// Alles draait in de browser; er wordt niets opgeslagen voordat de gebruiker het voorstel bevestigt.
import { CATEGORIES, categoryOf, today, visibleOrganizations } from './model.js'

const MONTHS = { jan: 1, januari: 1, feb: 2, februari: 2, mrt: 3, maart: 3, apr: 4, april: 4, mei: 5, jun: 6, juni: 6, jul: 7, juli: 7, aug: 8, augustus: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12 }
const WEEKDAYS = { zondag: 0, maandag: 1, dinsdag: 2, woensdag: 3, donderdag: 4, vrijdag: 5, zaterdag: 6 }
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')
const STOPWORDS = new Set(['bij', 'voor', 'met', 'naar', 'een', 'het', 'de', 'we', 'hebben', 'joh', 'dan', 'en', 'op', 'om', 'van', 'voeg', 'toe', 'crm'])

const norm = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const pad = (n) => String(n).padStart(2, '0')
const isoDate = (y, m, d) => {
  const date = new Date(Date.UTC(y, m - 1, d, 12))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null
}
const addDays = (iso, days) => { const date = new Date(`${iso}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }
const dayOfWeek = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay()

// Eerstvolgende datum voor dag+maand (dit jaar, anders volgend jaar) of voor een expliciet jaar.
function resolveDayMonth(day, month, year, now) {
  if (year) return isoDate(year < 100 ? 2000 + year : year, month, day)
  const thisYear = Number(now.slice(0, 4))
  const candidate = isoDate(thisYear, month, day)
  return candidate && candidate >= now ? candidate : isoDate(thisYear + 1, month, day)
}

export function parseDate(text, now = today()) {
  let match
  if ((match = text.match(new RegExp(`\\b(\\d{1,2})\\s*(${MONTH_NAMES})\\b\\.?(?:\\s+(\\d{4}))?`, 'i')))) {
    const date = resolveDayMonth(Number(match[1]), MONTHS[match[2].toLowerCase()], match[3] ? Number(match[3]) : null, now)
    if (date) return { date, span: match[0] }
  }
  if ((match = text.match(/\b(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?\b/))) {
    const date = resolveDayMonth(Number(match[1]), Number(match[2]), match[3] ? Number(match[3]) : null, now)
    if (date) return { date, span: match[0] }
  }
  if ((match = text.match(/\bovermorgen\b/i))) return { date: addDays(now, 2), span: match[0] }
  if ((match = text.match(/\bmorgen\b/i))) return { date: addDays(now, 1), span: match[0] }
  if ((match = text.match(/\bvandaag\b/i))) return { date: now, span: match[0] }
  if ((match = text.match(/\bover\s+(\d{1,3})\s+(dag|dagen|week|weken)\b/i))) return { date: addDays(now, Number(match[1]) * (/^we/i.test(match[2]) ? 7 : 1)), span: match[0] }
  if ((match = text.match(/\b(?:(volgende|komende)\s+week\s+)?(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/i))) {
    const target = WEEKDAYS[match[2].toLowerCase()]
    let date = addDays(now, 1)
    while (dayOfWeek(date) !== target) date = addDays(date, 1)
    if (match[1] && /volgende/i.test(match[1])) {
      // "volgende week donderdag": de donderdag in de kalenderweek na deze.
      const daysToMonday = (8 - dayOfWeek(now)) % 7 || 7
      const nextMonday = addDays(now, daysToMonday)
      date = addDays(nextMonday, (target + 6) % 7)
    }
    return { date, span: match[0] }
  }
  return null
}

export function parseTime(text) {
  let match = text.match(/\b(?:om\s*)?(?:(?:rond|vanaf)\s*)?([01]?\d|2[0-3])[:.]([0-5]\d)\b(?:\s*(?:uur|u))?/i)
  if (match) return { time: `${pad(match[1])}:${match[2]}`, span: match[0] }
  match = text.match(/\b(?:om\s*)?([01]?\d|2[0-3])\s*(?:uur|u)\b/i)
  if (match) return { time: `${pad(match[1])}:00`, span: match[0] }
  return null
}

function detectKind(text) {
  const lower = text.toLowerCase()
  if (/\bnieuwe\s+(kans|samenwerking)\b/.test(lower)) return 'deals'
  if (/\b(notitie|gesproken|gebeld|gemaild|besproken|appte|gebeld met)\b/.test(lower) && !/\b(taak|moet|moeten|nog)\b/.test(lower)) return 'activities'
  if (/\b(evenement|toernooi|clubdag|open ?dag|wedstrijd|clinic|beurs|workshop|training|stand)\b/.test(lower)) return 'events'
  return 'tasks'
}

function detectChannel(text) {
  const lower = text.toLowerCase()
  if (/\b(bel|bellen|telefoon|call|gebeld)\b/.test(lower)) return 'telefoon'
  if (/\b(whatsapp|appen|app)\b/.test(lower)) return 'whatsapp'
  if (/\b(mail|mailen|e-mail|gemaild)\b/.test(lower)) return 'mail'
  if (/\b(afspraak|langs|bezoek|bezoeken|meeting|ontmoeten)\b/.test(lower)) return 'afspraak'
  return ''
}

// Zoekt organisaties (naam of alias) en contactpersonen in de tekst; langste namen eerst zodat "Fysio Sterk" niet als "Fysio" telt.
function findMatches(text, state) {
  let work = ` ${norm(text)} `
  const candidates = []
  for (const organization of visibleOrganizations(state)) {
    for (const name of [organization.name, ...(organization.aliases || [])]) {
      const key = norm(name)
      if (key.length >= 3) candidates.push({ type: 'organization', id: organization.id, key })
    }
  }
  for (const contact of state.contacts) {
    const key = norm(contact.name)
    if (key.length >= 3) candidates.push({ type: 'contact', id: contact.id, key })
  }
  candidates.sort((a, b) => b.key.length - a.key.length)
  const organizations = [], contacts = [], consumed = []
  for (const candidate of candidates) {
    if (work.includes(` ${candidate.key} `)) {
      work = work.replace(` ${candidate.key} `, ' ')
      consumed.push(candidate.key)
      const list = candidate.type === 'organization' ? organizations : contacts
      if (!list.includes(candidate.id)) list.push(candidate.id)
    }
  }
  // Tweede ronde: een los woord dat de eerste (unieke) naam van één organisatie of voornaam van één contact is.
  const tokens = [...new Set(work.split(' ').filter((token) => token.length >= 4 && !STOPWORDS.has(token)))]
  const derived = []
  for (const token of tokens) {
    const orgHits = visibleOrganizations(state).filter((organization) => norm(organization.name).split(' ')[0] === token)
    if (orgHits.length === 1 && !organizations.includes(orgHits[0].id)) { organizations.push(orgHits[0].id); derived.push(orgHits[0].id); consumed.push(token); continue }
    const contactHits = state.contacts.filter((contact) => norm(contact.name).split(' ')[0] === token)
    if (!orgHits.length && contactHits.length === 1 && !contacts.includes(contactHits[0].id)) { contacts.push(contactHits[0].id); derived.push(contactHits[0].id); consumed.push(token) }
  }
  return { organizations, contacts, derived, consumed }
}

function unknownOrganizations(text, consumed) {
  const found = []
  const pattern = /\b(?:bij|voor|met|naar|van)\s+((?:[A-Z][\w&.'-]*)(?:\s+(?:[A-Z][\w&.'-]*|&))*)/g
  for (const match of text.matchAll(pattern)) {
    const phrase = match[1].replace(/[.,;:!?]+$/, '')
    const key = norm(phrase)
    if (key.length < 3 || STOPWORDS.has(key) || consumed.some((item) => key.includes(item) || item.includes(key))) continue
    if (!found.includes(phrase)) found.push(phrase)
  }
  return found
}

const FILLERS = /\b(joh|zeg|hey|even|alsjeblieft|alstublieft|svp|we hebben|wij hebben|ik heb|vul|zet|voeg|maak)\b[^,.]*?\b(crm|systeem|agenda|erbij|toe|aan|in)\b/gi

function cleanTitle(text, spans) {
  let title = text
  for (const span of spans.filter(Boolean)) title = title.replace(span, ' ')
  title = title.replace(FILLERS, ' ').replace(/\b(joh|zeg|hey)\b[,!]?/gi, ' ').replace(/\b(dan en dan|op)\s*(?=[,.]|$)/gi, ' ')
  title = title.replace(/\s*[,;]\s*(?=[,;]|$)/g, '').replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '').replace(/\s{2,}/g, ' ')
  return title ? title[0].toUpperCase() + title.slice(1) : ''
}

const KIND_LABEL = { events: 'Evenement', tasks: 'Taak', activities: 'Contactmoment', deals: 'Samenwerking' }
export const FOLLOW_UP_CHANNELS = { telefoon: 'Telefoon', mail: 'E-mail', whatsapp: 'WhatsApp', afspraak: 'Afspraak / bezoek' }

// Geeft voorstellen terug; elk voorstel is een compleet record dat door validateRecord in model.js moet komen.
export function parseEntry(text, state, now = today()) {
  const input = String(text || '').trim()
  if (!input) return { proposals: [], notes: [], warnings: ['Typ eerst wat je wilt vastleggen.'] }
  const kind = detectKind(input)
  const date = parseDate(input, now)
  const time = parseTime(input.replace(date?.span || '', ' '))
  const matches = findMatches(input, state)
  const unknown = unknownOrganizations(input, matches.consumed)
  const channel = kind === 'tasks' || kind === 'deals' ? detectChannel(input) : ''
  const contactOrg = state.contacts.find((contact) => matches.contacts.includes(contact.id) && contact.organizationId)?.organizationId
  const organizations = matches.organizations.length ? matches.organizations : (contactOrg ? [contactOrg] : [])
  const orgName = (id) => state.organizations.find((organization) => organization.id === id)?.name || id
  const contactName = (id) => state.contacts.find((contact) => contact.id === id)?.name || id
  const ownerMatch = input.match(/\b(maks|thijn)\b/i)
  const owner = ownerMatch ? ownerMatch[1][0].toUpperCase() + ownerMatch[1].slice(1).toLowerCase() : ''
  const priority = /\b(urgent|dringend|belangrijk|asap)\b/i.test(input) ? 'hoog' : undefined
  const title = cleanTitle(input, [date?.span, time?.span])

  const notes = []
  if (date) notes.push(`Datum: ${date.date}`)
  if (time) notes.push(`Tijd: ${time.time}`)
  for (const id of organizations) notes.push(`Organisatie gekoppeld: ${orgName(id)}${matches.derived.includes(id) ? ' (afgeleid, controleer)' : ''}`)
  for (const id of matches.contacts) notes.push(`Contactpersoon gekoppeld: ${contactName(id)}${matches.derived.includes(id) ? ' (afgeleid, controleer)' : ''}`)
  if (owner) notes.push(`Voor: ${owner}`)
  const warnings = []
  if (kind !== 'activities' && !date) warnings.push('Geen datum herkend. Vul die zelf in als het nodig is.')
  for (const phrase of unknown) warnings.push(`"${phrase}" staat nog niet in het CRM. Je kunt die organisatie hieronder meteen laten aanmaken.`)

  const base = { source: 'Snelle invoer' }
  const internal = /\b(intern|boekhouding|belasting|aangifte|administratie|factuur|planning|overleg|website|bijwerken)\b/i.test(input)
  const withCategory = (collection, record) => {
    const category = collection === 'events' ? 'evenementen' : record.channel === 'afspraak' ? 'afspraken' : internal && !record.organizationIds?.length && !record.organizationId && !record.contactIds?.length ? 'intern' : categoryOf(collection, record)
    return { ...record, category }
  }
  const proposals = []
  const id = () => crypto.randomUUID()
  if (kind === 'events') {
    const targets = organizations.length ? organizations : [null]
    for (const orgId of targets) {
      const club = !orgId && unknown.length ? unknown[0] : undefined
      proposals.push({ collection: 'events', summary: `Evenement${orgId ? ` bij ${orgName(orgId)}` : club ? ` bij ${club}` : ''}`, record: withCategory('events', { id: id(), title: title || `Evenement${orgId ? ` bij ${orgName(orgId)}` : ''}`, ...(date ? { date: date.date } : {}), ...(time ? { time: time.time } : {}), ...(orgId ? { organizationId: orgId } : {}), ...(club ? { club } : {}), ...base }) })
    }
  } else if (kind === 'activities') {
    const type = /\bgebeld|telefoon\b/i.test(input) ? 'telefoon' : /\bgemaild|mail\b/i.test(input) ? 'mail' : /\bappte|whatsapp\b/i.test(input) ? 'whatsapp' : 'notitie'
    proposals.push({ collection: 'activities', summary: 'Contactmoment', record: { id: id(), type, date: date?.date || now, text: input.replace(/^[\s,.:;-]+/, ''), relatedIds: [...organizations, ...matches.contacts], ...base } })
  } else if (kind === 'deals') {
    proposals.push({ collection: 'deals', summary: 'Samenwerking', record: withCategory('deals', { id: id(), title: title || `Samenwerking${organizations[0] ? ` ${orgName(organizations[0])}` : ''}`, stage: 'te-benaderen', ...(organizations[0] ? { organizationId: organizations[0] } : {}), contactIds: matches.contacts, ...(date ? { nextDate: date.date } : {}), ...(time ? { time: time.time } : {}), ...(channel ? { channel } : {}), ...(owner ? { owner } : {}), ...base }) })
  } else {
    proposals.push({ collection: 'tasks', summary: 'Taak', record: withCategory('tasks', { id: id(), title: title || `Taak${organizations[0] ? ` ${orgName(organizations[0])}` : ''}`, status: 'open', priority: priority || 'normaal', ...(date ? { due: date.date } : {}), ...(time ? { time: time.time } : {}), ...(channel ? { channel } : {}), ...(owner ? { owner } : {}), organizationIds: organizations, contactIds: matches.contacts, ...base }) })
  }
  // Nieuwe organisaties alleen als voorstel; ze worden pas aangemaakt na bevestiging en nooit op basis van alleen een naam gekoppeld.
  const created = unknown.map((name) => ({ collection: 'organizations', optionalCreate: true, summary: `Nieuwe organisatie: ${name}`, record: { id: id(), name, segment: 'Onbekend', ...base } }))
  for (const item of proposals) if (item.record.category) notes.push(`Categorie: ${CATEGORIES[item.record.category]}`)
  return { kind, kindLabel: KIND_LABEL[kind], proposals, created, notes: [...new Set(notes)], warnings }
}
