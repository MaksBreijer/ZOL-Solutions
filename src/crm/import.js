// Migratieplan voor het lokale ZOL CRM: zet een ontgrendelde bron om in rijen voor public.crm_records, zonder verlies van velden.
// Bron-ID's blijven de primaire sleutel (identiteitsmapping); er worden nooit records samengevoegd of aangevuld op basis van naam.
import { COLLECTIONS, erasureKey, sha256Hex, validateRecord } from './model.js'

export const DEFAULT_NAMESPACE = 'zol-crm-local'
const KNOWN_TOP_LEVEL = new Set([...COLLECTIONS, 'privacy', 'version'])
const KNOWN_PRIVACY = new Set(['policy', 'register', 'requests', 'incidents', 'organizationMerges', 'erasedIds', 'audit', 'members', 'pendingFileDeletes'])
const OPEN_TASK = (task) => !['afgerond', 'vervallen'].includes(task.status)

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export const contentHash = (value) => sha256Hex(canonical(value))

// files: { [fileKey]: { sha256, size, fileName, contentType } } uit het exportmanifest.
export function planImport(source, { files = {}, namespace = DEFAULT_NAMESPACE } = {}) {
  const errors = [], warnings = [], invalid = []
  if (!source || typeof source !== 'object') throw new Error('Ongeldige bron.')
  if (source.version !== 1) errors.push('Bronversie is niet 1.')
  const rows = []
  const seen = new Map()
  const push = (collection, record, origin = collection) => {
    if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.id !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(record.id)) {
      errors.push(`Record zonder bruikbare ID in ${origin}.`); return
    }
    const key = `${collection}/${record.id}`
    if (seen.has(key)) { errors.push(`Dubbele ID ${key}.`); return }
    seen.set(key, true)
    rows.push({ collection, id: record.id, data: structuredClone(record) })
  }

  for (const collection of COLLECTIONS) {
    if (!Array.isArray(source[collection])) { errors.push(`Collectie ${collection} ontbreekt of is geen lijst.`); continue }
    for (const record of source[collection]) {
      push(collection, record)
      try { validateRecord(collection, record) } catch (error) { invalid.push({ collection, id: record?.id ?? null, reason: error.message }) }
    }
  }

  const privacy = source.privacy || {}
  for (const [key, collection] of [['requests', 'privacy_requests'], ['incidents', 'privacy_incidents'], ['organizationMerges', 'org_merges']]) {
    for (const record of privacy[key] || []) push(collection, record, `privacy.${key}`)
  }
  if (privacy.policy) push('privacy_settings', { id: 'policy', ...privacy.policy })
  if (privacy.register) push('privacy_settings', { id: 'register', ...privacy.register })

  // Alles wat geen eigen collectie heeft (onzekerheden, tijdstempels, onbekende velden) blijft bewaard als bronmetadata.
  const meta = {}
  for (const [key, value] of Object.entries(source)) if (!KNOWN_TOP_LEVEL.has(key)) meta[key] = value
  const privacyMeta = {}
  for (const [key, value] of Object.entries(privacy)) if (!KNOWN_PRIVACY.has(key)) privacyMeta[key] = value
  const members = privacy.members || []
  push('source_meta', { id: 'state', ...meta, _privacyUnmapped: privacyMeta, _legacyMembers: members.map(({ id, role, active }) => ({ id, role, active })), _pendingFileDeletes: privacy.pendingFileDeletes || [] })
  if ((privacy.pendingFileDeletes || []).length) warnings.push(`${privacy.pendingFileDeletes.length} openstaande bestandsverwijderingen in de bron; controleer die voor de cutover.`)

  const erased = [...new Set(privacy.erasedIds || [])]
  const audit = (privacy.audit || []).map((entry) => ({ at: entry.at, actorId: entry.actorId ?? null, actorEmail: entry.actorEmail || '', action: entry.action, resource: entry.resource || '', recordIds: entry.recordIds || [] }))
  if (audit.some((entry) => !entry.at || !entry.action || Number.isNaN(Date.parse(entry.at)))) errors.push('Auditregels met ontbrekende of ongeldige velden.')

  // Bijlagen: elke inbox-verwijzing moet in het manifest staan.
  const fileRows = []
  for (const item of source.inbox || []) {
    if (!item.fileKey) continue
    const file = files[item.fileKey]
    if (!file) { invalid.push({ collection: 'inbox', id: item.id, reason: 'Bijlage ontbreekt in het exportmanifest.' }); continue }
    fileRows.push({ fileKey: item.fileKey, inboxId: item.id, fileName: item.fileName || file.fileName || '', contentType: item.fileType || file.contentType || '', size: file.size, sha256: file.sha256 })
  }

  const index = Object.fromEntries(COLLECTIONS.map((name) => [name, new Set((source[name] || []).map((record) => record.id))]))
  const anyId = new Set(COLLECTIONS.flatMap((name) => [...index[name]]))
  const erasedSet = new Set(erased)
  const relations = {}
  const relation = (name, from, id, ok) => {
    const entry = (relations[name] ||= { total: 0, unresolved: [] })
    entry.total++
    if (!ok) entry.unresolved.push({ from, to: id, explainedByErasure: erasedSet.has(erasureKey(id)) })
  }
  for (const contact of source.contacts || []) if (contact.organizationId) relation('contacts.organizationId', contact.id, contact.organizationId, index.organizations.has(contact.organizationId))
  for (const deal of source.deals || []) {
    if (deal.organizationId) relation('deals.organizationId', deal.id, deal.organizationId, index.organizations.has(deal.organizationId))
    for (const id of deal.contactIds || []) relation('deals.contactIds', deal.id, id, index.contacts.has(id))
  }
  for (const task of source.tasks || []) {
    for (const id of task.organizationIds || []) relation('tasks.organizationIds', task.id, id, index.organizations.has(id))
    for (const id of task.contactIds || []) relation('tasks.contactIds', task.id, id, index.contacts.has(id))
  }
  for (const activity of source.activities || []) for (const id of activity.relatedIds || []) relation('activities.relatedIds', activity.id, id, anyId.has(id))
  for (const event of source.events || []) if (event.organizationId) relation('events.organizationId', event.id, event.organizationId, index.organizations.has(event.organizationId))
  for (const item of source.inbox || []) {
    if (item.organizationId) relation('inbox.organizationId', item.id, item.organizationId, index.organizations.has(item.organizationId))
    if (item.fileKey) relation('inbox.fileKey', item.id, item.fileKey, Boolean(files[item.fileKey]))
  }
  for (const organization of source.organizations || []) if (organization.mergedInto) relation('organizations.mergedInto', organization.id, organization.mergedInto, index.organizations.has(organization.mergedInto))
  for (const request of privacy.requests || []) if (request.contactId) relation('privacy.requests.contactId', request.id, request.contactId, index.contacts.has(request.contactId) || String(request.contactId).startsWith('sha256:'))
  for (const id of erased) if (!/^sha256:[0-9a-f]{64}$/.test(id) && !/^[a-zA-Z0-9_-]{1,150}$/.test(id)) errors.push('Ongeldige sleutel in de verwijderlijst.')

  const count = (name) => (source[name] || []).length
  const byStatus = (records, key) => (records || []).reduce((acc, record) => { const value = record[key] ?? 'onbekend'; acc[value] = (acc[value] || 0) + 1; return acc }, {})
  const counts = {
    perCollection: Object.fromEntries([...COLLECTIONS.map((name) => [name, count(name)]), ['privacy_requests', (privacy.requests || []).length], ['privacy_incidents', (privacy.incidents || []).length], ['org_merges', (privacy.organizationMerges || []).length]]),
    organizationsVisible: (source.organizations || []).filter((item) => !item.mergedInto).length,
    organizationsMerged: (source.organizations || []).filter((item) => item.mergedInto).length,
    openTasks: (source.tasks || []).filter(OPEN_TASK).length,
    tasksByStatus: byStatus(source.tasks, 'status'), dealsByStage: byStatus(source.deals, 'stage'), inboxByStatus: byStatus(source.inbox, 'status'),
    erasedKeys: erased.length, auditEntries: audit.length, files: fileRows.length,
  }
  const unresolved = Object.entries(relations).flatMap(([name, entry]) => entry.unresolved.map((item) => ({ relation: name, ...item })))
  const rowHashes = Object.fromEntries(rows.map((row) => [`${row.collection}/${row.id}`, contentHash(row.data)]))
  const planHash = contentHash({ namespace, rows: rowHashes, erased, audit, files: fileRows }).slice(0, 12)

  return {
    namespace, rows, erased, audit, files: fileRows, errors, warnings, invalid, rowHashes, planHash,
    report: {
      namespace, planHash, counts,
      idMapping: 'Bron-ID\'s zijn ongewijzigd overgenomen als primaire sleutel (collectie + id); er zijn geen nieuwe ID\'s aangemaakt.',
      relations: Object.fromEntries(Object.entries(relations).map(([name, entry]) => [name, { total: entry.total, unresolved: entry.unresolved.length }])),
      unresolvedReferences: unresolved, invalidRecords: invalid, errors, warnings,
      legacyMembersNotImported: members.length,
    },
  }
}

// Vergelijkt het plan met wat in de database staat (rijen: [{collection,id,data}]); geeft ontbrekende, afwijkende en onverwachte rijen terug.
export function compareWithDatabase(plan, databaseRows) {
  const stored = new Map(databaseRows.map((row) => [`${row.collection}/${row.id}`, row]))
  const missing = [], different = []
  for (const row of plan.rows) {
    const found = stored.get(`${row.collection}/${row.id}`)
    if (!found) missing.push(`${row.collection}/${row.id}`)
    else if (contentHash(found.data) !== plan.rowHashes[`${row.collection}/${row.id}`]) different.push(`${row.collection}/${row.id}`)
  }
  return { missing, different, matched: plan.rows.length - missing.length - different.length }
}

export function checkExpectations(plan, expectations) {
  const actual = { organizations: plan.report.counts.organizationsVisible, contacts: plan.report.counts.perCollection.contacts, openTasks: plan.report.counts.openTasks }
  return Object.entries(expectations).map(([key, expected]) => ({ key, expected, actual: actual[key] ?? plan.report.counts.perCollection[key], ok: (actual[key] ?? plan.report.counts.perCollection[key]) === expected }))
}
