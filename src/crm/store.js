// Gegevenslaag van het CRM: leest de staat via Supabase-functies en schrijft wijzigingen als één atomaire commit.
// Rolcontrole, revisiecontrole en auditregels worden door de database afgedwongen (zie supabase/migrations/20261026120000_add_crm.sql).
import {
  COLLECTIONS, activityRecord, diffStates, eraseContact, erasureKey, isErased, mergeOrganizations, normalizeState, recordRevision, resolveOrganization,
  sha256Hex, subjectData, today, undoOrganizationMerge, validatePolicy, validateRecord,
} from './model.js'

const FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
export const FILE_BUCKET = 'crm-files'

export class CrmError extends Error {
  constructor(message, code = '') { super(message); this.code = code }
}

export function createCrmStore(supabase) {
  async function call(name, args = {}) {
    const { data, error } = await supabase.rpc(name, args)
    if (error) throw new CrmError(error.message || 'Opslaan mislukt.', error.code || '')
    return data
  }

  async function loadState() { return normalizeState(await call('crm_get_state')) }

  const requireAdmin = (state) => { if (state.me?.role !== 'admin' || !state.privacy) throw new CrmError('Je account heeft hiervoor geen toestemming.', '42501') }

  // Voert `mutate` uit op een kopie van de staat en schrijft het verschil weg. Bij een conflict wijzigt de database niets.
  async function commit(state, mutate, { action, resource = '', recordIds = [], adminOnly = false }) {
    if (adminOnly) requireAdmin(state)
    const draft = structuredClone(state)
    const outcome = mutate(draft) || {}
    const { writes, deletes } = diffStates(state, draft)
    if (!writes.length && !deletes.length && !(outcome.erasedIds || []).length) return { state, outcome, fileKeys: [] }
    const result = await call('crm_commit', {
      p_action: action, p_writes: writes, p_deletes: deletes, p_erased_ids: outcome.erasedIds || [], p_resource: resource, p_record_ids: recordIds,
    })
    const fileKeys = result?.fileKeys || []
    if (fileKeys.length) await removeFiles(fileKeys)
    return { state: await loadState(), outcome, fileKeys }
  }

  async function removeFiles(keys) {
    try {
      const { error } = await supabase.storage.from(FILE_BUCKET).remove(keys)
      if (!error) await call('crm_clear_file_deletes', { p_keys: keys })
    } catch { /* De onderhoudsactie ruimt openstaande bestanden later op. */ }
  }

  async function saveRecord(state, collection, record, expectedRevision = null) {
    validateRecord(collection, record)
    return commit(state, (draft) => {
      const privacy = draft.privacy
      if (privacy && isErased(privacy.erasedIds, record.id)) throw new CrmError('Dit record is verwijderd en kan niet opnieuw worden geïmporteerd.')
      const next = structuredClone(record)
      if (next.organizationId) next.organizationId = resolveOrganization(draft, next.organizationId)
      if (next.organizationIds) next.organizationIds = [...new Set(next.organizationIds.map((id) => resolveOrganization(draft, id)))]
      const index = draft[collection].findIndex((item) => item.id === next.id)
      const old = index >= 0 ? draft[collection][index] : null
      if (collection === 'organizations' && old?.mergedInto) throw new CrmError('Bewerk de samengevoegde organisatie.')
      if (old && expectedRevision !== recordRevision(old)) throw new CrmError('Dit dossier is intussen gewijzigd. Vernieuw het CRM en probeer opnieuw.', 'P0409')
      const saved = { ...next, revision: crypto.randomUUID() }
      if (old) draft[collection][index] = saved; else draft[collection].push(saved)
      if (collection !== 'activities') {
        const changes = old ? Object.fromEntries(Object.keys(next).filter((key) => !['updatedAt', 'revision'].includes(key) && JSON.stringify(old[key]) !== JSON.stringify(next[key])).map((key) => [key, { from: old[key] ?? null, to: next[key] }])) : {}
        const statusChange = old && old.status !== next.status && next.status ? ` · status: ${old.status || 'onbekend'} → ${next.status}`
          : old && old.stage !== next.stage && next.stage ? ` · fase: ${old.stage || 'onbekend'} → ${next.stage}` : ''
        const related = [next.id, ...(next.organizationIds || []), ...(next.organizationId ? [next.organizationId] : [])]
        draft.activities.push(activityRecord(`${old ? 'Bijgewerkt' : 'Toegevoegd'}: ${next.name || next.title}${statusChange}`, related, 'wijziging', { changes }))
      }
    }, { action: 'record.write', resource: collection, recordIds: [record.id] })
  }

  const merge = (state, input) => commit(state, (draft) => {
    const result = mergeOrganizations(draft, input)
    draft.activities.push(activityRecord(`Organisaties samengevoegd tot ${input.name}`, [input.targetId]))
    return result
  }, { action: 'organizations.merge', adminOnly: true, resource: 'organizations', recordIds: [input.targetId, ...input.sourceIds] })

  const unmerge = (state, id) => commit(state, (draft) => undoOrganizationMerge(draft, id), { action: 'organizations.merge.undo', adminOnly: true, resource: 'organizations', recordIds: [id] })

  const savePolicy = (state, value) => commit(state, (draft) => { draft.privacy.policy = { ...draft.privacy.policy, ...validatePolicy(value) } }, { action: 'privacy.policy.update', adminOnly: true })

  const REGISTER_KEYS = ['controller', 'purpose', 'legalBasis', 'contactEmail', 'noticeUrl', 'processor', 'hostingRegion']
  function saveRegister(state, input) {
    for (const key of REGISTER_KEYS) if (typeof input[key] !== 'string' || input[key].length > 3000) throw new CrmError('Controleer het verwerkingsregister.')
    if (input.noticeUrl && !/^https:\/\//.test(input.noticeUrl)) throw new CrmError('Gebruik een HTTPS-link naar de privacyverklaring.')
    return commit(state, (draft) => {
      draft.privacy.register = {
        ...draft.privacy.register, ...Object.fromEntries(REGISTER_KEYS.map((key) => [key, input[key]])),
        processorAgreement: input.processorAgreement === true, approvedAt: input.approved === true ? new Date().toISOString() : null,
      }
    }, { action: 'privacy.register.update', adminOnly: true })
  }

  function saveRequest(state, input) {
    return commit(state, (draft) => {
      const { requests } = draft.privacy
      if (input.id) {
        const request = requests.find((item) => item.id === input.id)
        if (!request || !['ontvangen', 'in-behandeling', 'afgerond', 'afgewezen'].includes(input.status)) throw new CrmError('Ongeldig verzoek.')
        request.status = input.status
        if (typeof input.identityVerified === 'boolean') request.identityVerified = input.identityVerified
        if (['afgerond', 'afgewezen'].includes(input.status)) request.closedAt = new Date().toISOString()
        return
      }
      if (!draft.contacts.some((contact) => contact.id === input.contactId) || !['inzage', 'correctie', 'verwijdering', 'beperking', 'bezwaar'].includes(input.type)) throw new CrmError('Kies een contactpersoon en verzoektype.')
      const received = input.receivedDate ? new Date(`${input.receivedDate}T12:00:00Z`) : new Date()
      if (Number.isNaN(received.getTime()) || received.getTime() > Date.now() + 86400000) throw new CrmError('Controleer de ontvangstdatum.')
      const due = new Date(received)
      due.setUTCDate(1); due.setUTCMonth(due.getUTCMonth() + 1)
      const days = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0)).getUTCDate()
      due.setUTCDate(Math.min(received.getUTCDate(), days))
      requests.push({ id: crypto.randomUUID(), contactId: input.contactId, type: input.type, status: 'ontvangen', receivedAt: received.toISOString(), due: due.toISOString().slice(0, 10), identityVerified: input.identityVerified === true })
    }, { action: input.id ? 'privacy.request.update' : 'privacy.request.create', adminOnly: true, resource: 'requests' })
  }

  function saveIncident(state, input) {
    if (typeof input.summary !== 'string' || !input.summary.trim() || input.summary.length > 3000) throw new CrmError('Geef een korte omschrijving zonder onnodige persoonsgegevens.')
    return commit(state, (draft) => {
      const { incidents } = draft.privacy
      if (input.id) {
        if (!['te-beoordelen', 'in-onderzoek', 'afgesloten'].includes(input.status) || typeof input.reportingDecision !== 'string' || input.reportingDecision.length > 5000) throw new CrmError('Controleer de incidentbeoordeling.')
        const incident = incidents.find((item) => item.id === input.id)
        if (!incident) throw new CrmError('Incident niet gevonden.')
        Object.assign(incident, { summary: input.summary, status: input.status, reportingDecision: input.reportingDecision, updatedAt: new Date().toISOString() })
        return
      }
      const detectedAt = input.detectedAt ? new Date(input.detectedAt) : new Date()
      if (Number.isNaN(detectedAt.getTime()) || detectedAt.getTime() > Date.now() + 300000) throw new CrmError('Controleer het moment van ontdekking.')
      incidents.push({ id: crypto.randomUUID(), detectedAt: detectedAt.toISOString(), summary: input.summary, status: 'te-beoordelen', assessmentDue: new Date(detectedAt.getTime() + 72 * 3600000).toISOString() })
    }, { action: input.id ? 'incident.update' : 'incident.create', adminOnly: true, resource: 'incidents' })
  }

  const reviewRetention = (state, input) => commit(state, (draft) => {
    const contact = draft.contacts.find((item) => item.id === input.contactId)
    if (!contact) throw new CrmError('Dossier niet gevonden.')
    if (typeof input.retentionReason !== 'string' || !input.retentionReason.trim() || input.retentionReason.length > 2000) throw new CrmError('Leg vast waarom dit dossier bewaard moet worden.')
    Object.assign(contact, { lastReviewedAt: new Date().toISOString(), retentionReason: input.retentionReason, retentionHold: input.retentionHold === true, revision: crypto.randomUUID() })
  }, { action: 'subject.retention.review', adminOnly: true, resource: 'contacts', recordIds: [input.contactId] })

  const erase = (state, input) => commit(state, (draft) => {
    const contact = draft.contacts.find((item) => item.id === input.contactId)
    if (!contact || input.confirmName !== contact.name || input.manualReviewConfirmed !== true) throw new CrmError('Bevestig de naam en de handmatige controle.')
    const result = eraseContact(draft, input.contactId, input.attachmentIds || [])
    // Bijlagen worden na de commit uit de opslag gehaald; de database bewaart de lijst tot dat gelukt is.
    return { erasedIds: result.erasedIds }
  }, { action: 'subject.erase', adminOnly: true, resource: 'contacts', recordIds: [input.contactId] })

  async function uploadFile(state, { file, title, organizationId, notes }) {
    if (!file || !FILE_TYPES.includes(file.type) || file.size > 10 * 1024 * 1024) throw new CrmError('Kies een PNG, JPG, WebP of PDF van maximaal 10 MB.')
    if (organizationId && !state.organizations.some((organization) => organization.id === organizationId)) throw new CrmError('Organisatie bestaat niet.')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    const id = crypto.randomUUID(), fileKey = `files/${id}`
    const upload = await supabase.storage.from(FILE_BUCKET).upload(fileKey, bytes, { contentType: file.type, upsert: false })
    if (upload.error) throw new CrmError(upload.error.message || 'Uploaden mislukt.')
    const inbox = { id, title: title || 'Screenshot / document', organizationId: organizationId || '', status: 'te-verwerken', notes: notes || '', fileKey, fileName: file.name, fileType: file.type, size: file.size, date: today(), source: 'Upload via CRM' }
    const activity = activityRecord(`Bestand toegevoegd: ${file.name}`, [id, ...(organizationId ? [organizationId] : [])], 'bestand')
    try {
      await call('crm_add_file', { p_inbox: inbox, p_file: { fileKey, fileName: file.name, contentType: file.type, size: file.size, sha256 }, p_activity: activity })
    } catch (error) {
      await supabase.storage.from(FILE_BUCKET).remove([fileKey])
      throw error
    }
    return loadState()
  }

  async function openFile(fileKey) {
    await call('crm_file_metadata', { p_file_key: fileKey })
    const { data, error } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(fileKey, 60)
    if (error) throw new CrmError(error.message || 'Bestand niet gevonden.')
    return data.signedUrl
  }

  async function exportData(state) {
    await call('crm_log_event', { p_action: 'workspace.export', p_resource: '', p_ids: [] })
    const exported = { version: 1, exportedAt: new Date().toISOString(), ...Object.fromEntries(COLLECTIONS.map((name) => [name, state[name]])) }
    return exported
  }

  return {
    call, loadState, commit, saveRecord, merge, unmerge, savePolicy, saveRegister, saveRequest, saveIncident, reviewRetention, erase,
    uploadFile, openFile, exportData, removeFiles,
    readRecord: (collection, id) => call('crm_log_event', { p_action: 'record.read', p_resource: collection, p_ids: [id] }),
    audit: (limit = 100) => call('crm_get_audit', { p_limit: limit }),
    pendingFileDeletes: () => call('crm_pending_file_deletes'),
    subjectExport: async (state, id) => { await call('crm_log_event', { p_action: 'subject.export.review', p_resource: 'contacts', p_ids: [id] }); return subjectData(state, id) },
    erasureKey, sha256Hex,
  }
}
