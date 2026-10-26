// Pure CRM-logica, zonder opslag of netwerk. Wordt gebruikt door de admin-UI, de importer en de tests.
// Afgeleid van het lokale ZOL CRM (overdracht 26 oktober 2026); regels en foutmeldingen zijn behouden.

export const COLLECTIONS = ['organizations', 'contacts', 'deals', 'tasks', 'activities', 'events', 'inbox']
export const PRIVACY_COLLECTIONS = ['privacy_requests', 'privacy_incidents', 'privacy_settings', 'org_merges']
export const STORED_COLLECTIONS = [...COLLECTIONS, ...PRIVACY_COLLECTIONS, 'source_meta']
export const STAGES = ['onbekend', 'te-benaderen', 'contact-gelegd', 'voorstel', 'onderhandeling', 'gewonnen', 'verloren']
export const TASK_STATUSES = ['open', 'bezig', 'wacht-op-reactie', 'afgerond', 'vervallen']

export const DEFAULT_POLICY = { prospectReviewMonths: 12, auditDays: 180, backupDays: 30, reviewOnly: true }
export const DEFAULT_REGISTER = {
  controller: 'ZOL Solutions',
  purpose: 'Zakelijk relatiebeheer en opvolging van samenwerkingen',
  legalBasis: 'Nog per verwerkingsdoel vast te stellen',
  contactEmail: '', noticeUrl: '', processor: '', hostingRegion: '', processorAgreement: false, approvedAt: null,
}

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,150}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function validateRecord(collection, record) {
  if (!COLLECTIONS.includes(collection) || !record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Ongeldig record.')
  if (typeof record.id !== 'string' || !ID_PATTERN.test(record.id)) throw new Error('Ongeldige record-ID.')
  const title = collection === 'organizations' || collection === 'contacts' ? 'name' : collection === 'activities' ? 'text' : 'title'
  if (typeof record[title] !== 'string' || !record[title].trim() || record[title].length > 20000) throw new Error('Vul een naam of omschrijving in.')
  for (const key of ['due', 'date', 'nextDate']) {
    if (record[key] && (!DATE_PATTERN.test(record[key]) || Number.isNaN(Date.parse(record[key])) || new Date(record[key]).toISOString().slice(0, 10) !== record[key])) throw new Error('Ongeldige datum.')
  }
  if (collection === 'tasks' && !TASK_STATUSES.includes(record.status)) throw new Error('Ongeldige taakstatus.')
  if (collection === 'deals' && !STAGES.includes(record.stage)) throw new Error('Ongeldige pipelinefase.')
  if (record.value !== undefined && record.value !== null && (typeof record.value !== 'number' || !Number.isFinite(record.value) || record.value < 0)) throw new Error('Vul een geldig bedrag in.')
  for (const key of ['organizationIds', 'contactIds', 'relatedIds']) {
    if (record[key] !== undefined && (!Array.isArray(record[key]) || record[key].some((value) => typeof value !== 'string'))) throw new Error('Ongeldige relatieverwijzing.')
  }
  if (JSON.stringify(record).length > 100000) throw new Error('Record is te groot.')
  return record
}

// --- SHA-256 (synchroon, zodat verwijderlijst-sleutels ook in de browser gelijk zijn aan die van de bron) ---
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

export function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text))
  const length = bytes.length
  const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6)
  padded.set(bytes); padded[length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 0x100000000)); view.setUint32(padded.length - 4, (length * 8) >>> 0)
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  const rotr = (x, n) => (x >>> n) | (x << (32 - n))
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh
  }
  return [...h].map((value) => value.toString(16).padStart(8, '0')).join('')
}

export const erasureKey = (id) => `sha256:${sha256Hex(id)}`
export const isErased = (ids, id) => ids.includes(id) || ids.includes(erasureKey(id))

// --- Staat in het geheugen: zakelijke collecties + privacy ---
export function emptyState() {
  return {
    ...Object.fromEntries(COLLECTIONS.map((name) => [name, []])),
    privacy: { policy: structuredClone(DEFAULT_POLICY), register: structuredClone(DEFAULT_REGISTER), requests: [], incidents: [], organizationMerges: [], erasedIds: [] },
  }
}

export function normalizeState(raw) {
  const state = emptyState()
  for (const name of COLLECTIONS) state[name] = Array.isArray(raw?.[name]) ? raw[name] : []
  if (raw?.privacy) {
    const privacy = raw.privacy
    state.privacy = {
      policy: { ...DEFAULT_POLICY, ...(privacy.policy || {}) },
      register: { ...DEFAULT_REGISTER, ...(privacy.register || {}) },
      requests: privacy.requests || [], incidents: privacy.incidents || [],
      organizationMerges: privacy.organizationMerges || [], erasedIds: privacy.erasedIds || [],
    }
  } else state.privacy = null
  state.me = raw?.me || null
  state.uncertainties = Array.isArray(raw?.uncertainties) ? raw.uncertainties : []
  state.updatedAt = raw?.updatedAt || null
  return state
}

export const recordRevision = (record) => record?.revision || record?.updatedAt || null
export const visibleOrganizations = (state) => state.organizations.filter((organization) => !organization.mergedInto)

// --- Organisaties samenvoegen / herstellen ---
export function resolveOrganization(data, id) {
  const seen = new Set()
  while (id) {
    if (seen.has(id)) throw new Error('Ongeldige organisatieverwijzing.')
    seen.add(id)
    const organization = data.organizations.find((item) => item.id === id)
    if (!organization?.mergedInto) return id
    id = organization.mergedInto
  }
  return id
}

export function mergeOrganizations(data, input) {
  const target = data.organizations.find((item) => item.id === input.targetId && !item.mergedInto)
  const ids = [...new Set(input.sourceIds || [])]
  if (!target || !ids.length || ids.includes(target.id) || typeof input.name !== 'string' || !input.name.trim()) throw new Error('Kies de juiste organisaties en naam.')
  const sources = ids.map((id) => data.organizations.find((item) => item.id === id && !item.mergedInto))
  if (sources.some((item) => !item)) throw new Error('Een organisatie bestaat niet meer of is al samengevoegd.')
  for (const organization of [target, ...sources]) {
    if ((input.revisions?.[organization.id] ?? null) !== (recordRevision(organization))) throw new Error('Een dossier is intussen gewijzigd. Vernieuw de gegevens.')
  }
  const mergeId = crypto.randomUUID(), at = new Date().toISOString(), before = {}
  for (const key of ['name', 'segment', 'notes', 'aliases', 'source', 'city', 'email', 'phone', 'website', 'sport']) before[key] = target[key] ?? null
  for (const source of sources) {
    for (const key of ['city', 'email', 'phone', 'website', 'sport']) if (!target[key] && source[key]) target[key] = source[key]
    const extras = ['notes', 'source', 'city', 'email', 'phone', 'website', 'sport'].filter((key) => source[key] && source[key] !== target[key]).map((key) => `${key}: ${source[key]}`)
    if (extras.length) target.notes = `${target.notes || ''}\nSamengevoegde bron ${source.name}: ${extras.join(' · ')}`
    source.mergedInto = target.id; source.mergeId = mergeId; source.updatedAt = at; source.revision = crypto.randomUUID()
  }
  target.aliases = [...new Set([...(target.aliases || []), target.name, ...sources.flatMap((item) => [item.name, ...(item.aliases || [])])])].filter((name) => name !== input.name.trim())
  target.name = input.name.trim()
  if (input.segment) target.segment = input.segment
  target.source = `${target.source || ''}; samenvoeging op aanwijzing gebruiker, ${at.slice(0, 10)}`
  target.updatedAt = at; target.revision = crypto.randomUUID(); target._organizationMergeBefore = { mergeId, before }
  let changed = 0
  for (const collection of ['contacts', 'tasks', 'deals', 'activities', 'events', 'inbox']) {
    for (const record of data[collection]) {
      const changes = []
      for (const field of ['organizationId', 'organizationIds', 'relatedIds']) {
        const old = record[field]
        if (typeof old === 'string' && ids.includes(old)) { record[field] = target.id; changes.push({ field, before: old, after: target.id }) }
        else if (Array.isArray(old) && old.some((id) => ids.includes(id))) {
          const after = [...new Set(old.map((id) => (ids.includes(id) ? target.id : id)))]
          record[field] = after; changes.push({ field, before: [...old], after: [...after] })
        }
      }
      if (changes.length) {
        record._organizationMerges = [...(record._organizationMerges || []), { mergeId, changes }]
        record.updatedAt = at; record.revision = crypto.randomUUID(); changed++
      }
    }
  }
  data.privacy.organizationMerges.push({
    id: mergeId, targetId: target.id, sourceIds: ids, createdAt: at, status: 'merged', targetRevision: target.revision,
    sourceRevisions: Object.fromEntries(sources.map((item) => [item.id, item.revision])),
  })
  return { id: mergeId, changed }
}

export function undoOrganizationMerge(data, mergeId) {
  const merge = data.privacy.organizationMerges.find((item) => item.id === mergeId && item.status === 'merged')
  if (!merge) throw new Error('Samenvoeging niet gevonden.')
  const target = data.organizations.find((item) => item.id === merge.targetId)
  if (target.revision !== merge.targetRevision || target._organizationMergeBefore?.mergeId !== mergeId) throw new Error('Het doeldossier is gewijzigd; herstel dit zorgvuldig handmatig.')
  for (const id of merge.sourceIds) {
    if (data.organizations.find((item) => item.id === id).revision !== merge.sourceRevisions[id]) throw new Error('Een brondossier is gewijzigd.')
  }
  for (const [key, value] of Object.entries(target._organizationMergeBefore.before)) { if (value === null) delete target[key]; else target[key] = value }
  delete target._organizationMergeBefore
  target.updatedAt = new Date().toISOString(); target.revision = crypto.randomUUID()
  for (const id of merge.sourceIds) {
    const source = data.organizations.find((item) => item.id === id)
    delete source.mergedInto; delete source.mergeId; source.updatedAt = new Date().toISOString(); source.revision = crypto.randomUUID()
  }
  let skipped = 0
  for (const collection of ['contacts', 'tasks', 'deals', 'activities', 'events', 'inbox']) {
    for (const record of data[collection]) {
      const entry = record._organizationMerges?.find((item) => item.mergeId === mergeId)
      if (!entry) continue
      for (const change of entry.changes) {
        if (JSON.stringify(record[change.field]) === JSON.stringify(change.after)) record[change.field] = change.before
        else skipped++
      }
      record._organizationMerges = record._organizationMerges.filter((item) => item.mergeId !== mergeId)
      record.updatedAt = new Date().toISOString(); record.revision = crypto.randomUUID()
    }
  }
  merge.status = 'undone'; merge.undoneAt = new Date().toISOString()
  return { skipped }
}

// --- Privacy ---
export function reviewCandidates(data, now = new Date()) {
  const months = data.privacy?.policy?.prospectReviewMonths || 12
  const cutoff = new Date(now); cutoff.setUTCMonth(cutoff.getUTCMonth() - months)
  return data.contacts.filter((contact) => !contact.retentionHold).map((contact) => {
    const dates = [contact.updatedAt, contact.lastReviewedAt, ...data.activities.filter((activity) => (activity.relatedIds || []).includes(contact.id)).map((activity) => activity.date)]
      .filter(Boolean).map((value) => Date.parse(value)).filter(Number.isFinite)
    const last = dates.length ? new Date(Math.max(...dates)).toISOString() : null
    return { id: contact.id, name: contact.name, lastActivity: last, reason: last ? 'Bewaartermijn beoordelen' : 'Geen betrouwbare laatste contactdatum' }
  }).filter((item) => !item.lastActivity || Date.parse(item.lastActivity) < cutoff.getTime())
}

export function subjectData(data, id) {
  const contact = data.contacts.find((item) => item.id === id)
  if (!contact) throw new Error('Contactpersoon niet gevonden.')
  return {
    generatedAt: new Date().toISOString(), contact: structuredClone(contact),
    tasks: data.tasks.filter((item) => (item.contactIds || []).includes(id)),
    deals: data.deals.filter((item) => (item.contactIds || []).includes(id)),
    activities: data.activities.filter((item) => (item.relatedIds || []).includes(id)),
    attachmentCandidates: data.inbox.filter((item) => item.organizationId && item.organizationId === contact.organizationId).map((item) => ({ id: item.id, title: item.title, fileName: item.fileName || '', needsManualReview: true })),
    notice: 'Controleer losse tekst, organisatiebijlagen en inhoud op rechten van andere personen voordat dit wordt gedeeld.',
  }
}

function scrub(value, terms, id) {
  if (typeof value === 'string') {
    if (value === id) return ''
    for (const term of terms) value = value.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'), '[verwijderd]')
    return value
  }
  if (Array.isArray(value)) return value.filter((item) => item !== id).map((item) => scrub(item, terms, id))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ['id', 'revision', 'updatedAt', 'fileKey'].includes(key) ? item : scrub(item, terms, id)]))
  return value
}

export function eraseContact(data, id, attachmentIds = []) {
  const contact = data.contacts.find((item) => item.id === id)
  if (!contact) throw new Error('Contactpersoon niet gevonden.')
  if (contact.retentionHold) throw new Error('Er staat een bewaarbeperking op dit dossier. Beoordeel die eerst.')
  const terms = [contact.name, contact.email, contact.phone].filter((value) => typeof value === 'string' && value.trim().length >= 3).map((value) => value.trim()).sort((a, b) => b.length - a.length)
  const candidates = new Set(subjectData(data, id).attachmentCandidates.map((item) => item.id))
  if (attachmentIds.some((item) => !candidates.has(item))) throw new Error('Controleer de geselecteerde bijlagen.')
  const fileKeys = data.inbox.filter((item) => attachmentIds.includes(item.id) && item.fileKey).map((item) => item.fileKey)
  data.contacts = data.contacts.filter((item) => item.id !== id)
  data.activities = data.activities.filter((item) => !(item.relatedIds || []).includes(id))
  data.inbox = data.inbox.filter((item) => !attachmentIds.includes(item.id))
  for (const collection of COLLECTIONS) data[collection] = scrub(data[collection], terms, id)
  const privacy = data.privacy
  privacy.erasedIds.push(...[id, ...attachmentIds].map(erasureKey).filter((key) => !privacy.erasedIds.includes(key)))
  for (const request of privacy.requests) {
    if (request.contactId === id) { request.contactId = erasureKey(id); request.status = 'afgerond'; request.closedAt = new Date().toISOString() }
  }
  return { fileKeys, erasedIds: [id, ...attachmentIds] }
}

export function validatePolicy(value) {
  for (const [key, min, max] of [['prospectReviewMonths', 1, 120], ['auditDays', 1, 3650], ['backupDays', 1, 365]]) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) throw new Error('Ongeldige bewaartermijn.')
  }
  return { prospectReviewMonths: value.prospectReviewMonths, auditDays: value.auditDays, backupDays: value.backupDays, reviewOnly: true }
}

export function registerComplete(register) {
  return Boolean(register?.approvedAt && register.processorAgreement && register.contactEmail && register.noticeUrl && register.hostingRegion && register.legalBasis && !register.legalBasis.includes('Nog per'))
}

// --- Verschil tussen twee staten -> één atomaire commit ---
const privacyViews = [
  ['requests', 'privacy_requests'], ['incidents', 'privacy_incidents'], ['organizationMerges', 'org_merges'],
]

function flatten(state) {
  const out = new Map()
  for (const name of COLLECTIONS) for (const record of state[name]) out.set(`${name}/${record.id}`, { collection: name, record })
  if (state.privacy) {
    for (const [key, collection] of privacyViews) for (const record of state.privacy[key]) out.set(`${collection}/${record.id}`, { collection, record })
    out.set('privacy_settings/policy', { collection: 'privacy_settings', record: { id: 'policy', ...state.privacy.policy } })
    out.set('privacy_settings/register', { collection: 'privacy_settings', record: { id: 'register', ...state.privacy.register } })
  }
  return out
}

export function diffStates(before, after) {
  const was = flatten(before), now = flatten(after)
  const writes = [], deletes = []
  for (const [key, { collection, record }] of now) {
    const old = was.get(key)
    if (!old) writes.push({ collection, id: record.id, data: record, expectedRevision: null })
    else if (JSON.stringify(old.record) !== JSON.stringify(record)) writes.push({ collection, id: record.id, data: record, expectedRevision: recordRevision(old.record) })
  }
  for (const [key, { collection, record }] of was) if (!now.has(key)) deletes.push({ collection, id: record.id, expectedRevision: recordRevision(record) })
  const erasedIds = (after.privacy?.erasedIds || []).filter((key) => !(before.privacy?.erasedIds || []).includes(key))
  return { writes, deletes, erasedKeys: erasedIds }
}

export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date())
}

export function activityRecord(text, relatedIds = [], type = 'wijziging', extra = {}) {
  return { id: crypto.randomUUID(), date: today(), createdAt: new Date().toISOString(), type, text, relatedIds, source: 'CRM', ...extra }
}
