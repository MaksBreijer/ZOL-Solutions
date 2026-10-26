import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { crmDatabase, syntheticExport } from './helpers/crm-fixture.js'
import { createCrmStore } from '../src/crm/store.js'
import { compareWithDatabase, planImport } from '../src/crm/import.js'
import { normalizeState } from '../src/crm/model.js'

const files = { 'files/synthetic-file-1': { sha256: 'a'.repeat(64), size: 8, fileName: 'scherm.png', contentType: 'image/png' } }

// Importeert de synthetische bron zoals scripts/crm-import.mjs dat doet.
async function importSource(env, source = syntheticExport(), { allowConflicts = false, batch = randomUUID() } = {}) {
  const plan = planImport(source, { files })
  const { data, error } = await env.client.rpc('crm_import_apply', {
    p_batch: batch, p_namespace: plan.namespace, p_rows: plan.rows, p_erased: plan.erased, p_audit: plan.audit, p_files: plan.files, p_report: plan.report, p_allow_conflicts: allowConflicts,
  })
  return { plan, data, error, batch }
}

async function ready() {
  const env = await crmDatabase()
  await env.as('owner')
  const imported = await importSource(env)
  assert.equal(imported.error, null)
  return { ...env, store: createCrmStore(env.client), imported }
}

test('import keeps every source record, field and relation, and is idempotent', async () => {
  const env = await ready()
  const source = syntheticExport()
  const { rows } = await env.db.query('select collection, id, data from public.crm_records')
  const comparison = compareWithDatabase(env.imported.plan, rows)
  assert.deepEqual(comparison.missing, [])
  assert.deepEqual(comparison.different, [])
  assert.equal(env.imported.data.inserted, env.imported.plan.rows.length)

  const again = await importSource(env)
  assert.equal(again.error, null)
  assert.equal(again.data.inserted, 0)
  assert.equal(again.data.unchanged, env.imported.plan.rows.length)
  assert.equal(again.data.audit, 0, 'auditregels worden niet dubbel overgenomen')
  assert.equal((await env.db.query('select count(*)::int as n from public.crm_records')).rows[0].n, env.imported.plan.rows.length)
  assert.equal((await env.db.query('select count(*)::int as n from public.crm_audit where import_batch_id is not null')).rows[0].n, source.privacy.audit.length)

  const state = await env.store.loadState()
  assert.equal(state.organizations.length, 3)
  assert.equal(state.tasks.length, 3, 'afgeronde en vervallen taken blijven aanwezig')
  assert.deepEqual(state.organizations.find((o) => o.id === 'org-beta').customField, { nested: [1, 2, 3] }, 'onbekende velden blijven verliesvrij')
  assert.equal(state.privacy.policy.prospectReviewMonths, 6)
  assert.equal(state.privacy.organizationMerges[0].status, 'merged')
})

test('conflicting rows stop the import and nothing is overwritten', async () => {
  const env = await ready()
  const changed = syntheticExport()
  changed.organizations[0].name = 'Andere naam in bron'
  const result = await importSource(env, changed)
  assert.match(result.error.message, /Importconflicten/)
  const { rows } = await env.db.query("select data->>'name' as name from public.crm_records where collection='organizations' and id='org-alpha'")
  assert.equal(rows[0].name, 'Testclub Alpha')
  assert.equal((await env.db.query('select count(*)::int as n from public.crm_import_batches')).rows[0].n, 1, 'mislukte batch laat geen rest achter')
})

test('rollback removes only untouched imported rows', async () => {
  const env = await ready()
  const state = await env.store.loadState()
  const alpha = state.organizations.find((o) => o.id === 'org-alpha')
  await env.store.saveRecord(state, 'organizations', { ...alpha, city: 'Teststad' }, alpha.revision || alpha.updatedAt)
  const rollback = await env.client.rpc('crm_import_rollback', { p_batch: env.imported.batch })
  assert.equal(rollback.error, null)
  assert.deepEqual(rollback.data.keptBecauseModified, [{ collection: 'organizations', id: 'org-alpha' }])
  assert.deepEqual(rollback.data.fileKeys, ['files/synthetic-file-1'])
  const { rows } = await env.db.query('select collection, id from public.crm_records')
  assert.equal(rows.filter((r) => r.collection === 'organizations').length, 1)
})

test('import and rollback are not callable by logged-in admins', async () => {
  const env = await ready()
  assert.equal((await env.db.query("select has_function_privilege('authenticated', 'public.crm_import_apply(uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,boolean)', 'execute') as ok")).rows[0].ok, false)
  assert.equal((await env.db.query("select has_function_privilege('authenticated', 'public.crm_import_rollback(uuid)', 'execute') as ok")).rows[0].ok, false)
  assert.equal((await env.db.query("select has_function_privilege('service_role', 'public.crm_import_rollback(uuid)', 'execute') as ok")).rows[0].ok, true)
})

test('access: no login, viewer, member and admin', async () => {
  const env = await ready()
  await env.as('')
  assert.match((await env.client.rpc('crm_get_state')).error.message, /geen toestemming/)

  await env.as('viewer')
  const viewerState = await env.store.loadState()
  assert.equal(viewerState.privacy, null, 'viewer ziet geen privacybeheer')
  assert.equal(viewerState.me.role, 'viewer')
  await assert.rejects(() => env.store.saveRecord(viewerState, 'tasks', { id: 'x', title: 'Nieuw', status: 'open' }), /geen toestemming/)
  assert.match((await env.client.rpc('crm_get_audit')).error.message, /geen toestemming/)

  await env.as('editor')
  const memberState = await env.store.loadState()
  assert.equal(memberState.privacy, null)
  assert.equal(memberState.me.role, 'member')
  await env.store.saveRecord(memberState, 'tasks', { id: 'task-member', title: 'Door medewerker', status: 'open', organizationIds: ['org-alpha'] })
  const revisions = Object.fromEntries(memberState.organizations.map((o) => [o.id, o.revision]))
  await assert.rejects(() => env.store.merge(memberState, { targetId: 'org-alpha', sourceIds: ['org-beta'], name: 'X', revisions }), /geen toestemming/)
  await assert.rejects(() => env.store.savePolicy({ ...memberState, privacy: normalizeState({ privacy: {} }).privacy }, { prospectReviewMonths: 3, auditDays: 100, backupDays: 10 }), /geen toestemming/)
  assert.match((await env.client.rpc('crm_pending_file_deletes')).error.message, /geen toestemming/)
  const direct = await env.client.rpc('crm_commit', { p_action: 'privacy.policy.update', p_writes: [{ collection: 'privacy_settings', id: 'policy', data: { id: 'policy', auditDays: 1 }, expectedRevision: null }] })
  assert.match(direct.error.message, /geen toestemming/, 'ook rechtstreeks via de database mag een medewerker geen privacyinstellingen wijzigen')
  const directDelete = await env.client.rpc('crm_commit', { p_action: 'record.write', p_writes: [], p_deletes: [{ collection: 'tasks', id: 'task-1', expectedRevision: null }] })
  assert.match(directDelete.error.message, /geen toestemming/)

  await env.as('owner')
  const adminState = await env.store.loadState()
  assert.equal(adminState.privacy.requests.length, 1)
  assert.equal(adminState.me.role, 'admin')
  assert.ok((await env.store.audit()).some((entry) => entry.action === 'record.write' && entry.actorEmail === 'editor@example.invalid'))
})

test('saving enforces validation, references and optimistic concurrency, and logs an activity', async () => {
  const env = await ready()
  let state = await env.store.loadState()
  await assert.rejects(() => env.store.saveRecord(state, 'tasks', { id: 't9', title: 'Fout', status: 'raar' }), /taakstatus/)
  await assert.rejects(() => env.store.saveRecord(state, 'tasks', { id: 't9', title: 'Fout', status: 'open', organizationIds: ['bestaat-niet'] }), /organisatie bestaat niet/)
  await assert.rejects(() => env.store.saveRecord(state, 'deals', { id: 'd9', title: 'Fout', stage: 'voorstel', contactIds: ['bestaat-niet'] }), /persoon bestaat niet/)

  const task = state.tasks.find((t) => t.id === 'task-1')
  const result = await env.store.saveRecord(state, 'tasks', { ...task, status: 'afgerond' }, task.revision || task.updatedAt)
  state = result.state
  assert.equal(state.tasks.find((t) => t.id === 'task-1').status, 'afgerond')
  const logged = state.activities.at(-1)
  assert.match(logged.text, /status: wacht-op-reactie → afgerond/)
  assert.deepEqual(logged.changes.status, { from: 'wacht-op-reactie', to: 'afgerond' })

  // Tweede gebruiker met verouderde staat.
  await assert.rejects(() => env.store.saveRecord(normalizeState({ ...syntheticExport(), tasks: [task] }), 'tasks', { ...task, title: 'Oud' }, task.revision || task.updatedAt), /intussen gewijzigd/)
})

test('writes are blocked until the processing register is complete', async () => {
  const env = await crmDatabase()
  await env.as('owner')
  const source = syntheticExport()
  source.privacy.register.approvedAt = null
  await importSource(env, source)
  const store = createCrmStore(env.client)
  let state = await store.loadState()
  await assert.rejects(() => store.saveRecord(state, 'tasks', { id: 'x', title: 'Nieuw', status: 'open' }), /verwerkingsregister/)
  state = (await store.saveRegister(state, { ...state.privacy.register, approved: true, processorAgreement: true })).state
  await store.saveRecord(state, 'tasks', { id: 'x', title: 'Nieuw', status: 'open' })
})

test('merging organizations is atomic and can be undone', async () => {
  const env = await ready()
  let state = await env.store.loadState()
  const [alpha, beta] = ['org-alpha', 'org-beta'].map((id) => state.organizations.find((o) => o.id === id))
  const revisions = { 'org-alpha': alpha.revision, 'org-beta': beta.revision }
  state = (await env.store.merge(state, { targetId: 'org-alpha', sourceIds: ['org-beta'], name: 'Alpha & Beta', revisions })).state
  const merged = state.organizations.find((o) => o.id === 'org-alpha')
  assert.equal(merged.name, 'Alpha & Beta')
  assert.ok(merged.aliases.includes('Testpraktijk Beta'))
  assert.equal(state.organizations.find((o) => o.id === 'org-beta').mergedInto, 'org-alpha')
  assert.deepEqual(state.contacts.find((c) => c.id === 'con-2').organizationId, 'org-alpha')
  assert.deepEqual(state.tasks.find((t) => t.id === 'task-1').organizationIds, ['org-alpha'])

  const mergeId = state.privacy.organizationMerges.find((m) => m.status === 'merged' && m.targetId === 'org-alpha').id
  state = (await env.store.unmerge(state, mergeId)).state
  assert.equal(state.organizations.find((o) => o.id === 'org-alpha').name, 'Testclub Alpha')
  assert.equal(state.organizations.find((o) => o.id === 'org-beta').mergedInto, undefined)
  assert.deepEqual(state.tasks.find((t) => t.id === 'task-1').organizationIds, ['org-alpha', 'org-beta'])
})

test('erasing a contact removes it, scrubs mentions, blocks re-import and cleans the audit trail', async () => {
  const env = await ready()
  let state = await env.store.loadState()
  await env.store.readRecord('contacts', 'con-1')
  const result = await env.store.erase(state, { contactId: 'con-1', confirmName: 'Pat Voorbeeld', manualReviewConfirmed: true, attachmentIds: ['in-2'] })
  state = result.state
  assert.equal(state.contacts.some((c) => c.id === 'con-1'), false)
  assert.equal(state.activities.some((a) => a.id === 'act-1'), false, 'persoonsgebonden activiteit verdwijnt')
  assert.equal(state.inbox.some((i) => i.id === 'in-2'), false)
  assert.deepEqual(state.deals.find((d) => d.id === 'deal-1').contactIds, [])
  assert.equal(state.privacy.erasedIds.length, 2)
  assert.deepEqual(env.removedFiles, ['files/synthetic-file-1'])
  assert.equal((await env.db.query('select count(*)::int as n from public.crm_pending_file_deletes')).rows[0].n, 0)
  assert.equal((await env.db.query('select count(*)::int as n from public.crm_files')).rows[0].n, 0)
  assert.equal((await env.db.query("select count(*)::int as n from public.crm_audit where 'con-1' = any(record_ids)")).rows[0].n, 0, 'audit bevat geen ruwe ID meer')

  // Herintroductie wordt geweigerd, ook via een nieuwe import van de oude bron.
  await assert.rejects(() => env.store.saveRecord(state, 'contacts', { id: 'con-1', name: 'Pat Voorbeeld' }), /verwijderd/)
  const reimport = await importSource(env)
  assert.equal(reimport.error, null, 'records die naar de verwijderde persoon verwijzen worden overgeslagen, niet als conflict gemeld')
  assert.ok(reimport.data.skippedErased >= 4, 'contact, bijlage, activiteit en verwijzende taak/kans')
  assert.equal((await env.db.query("select count(*)::int as n from public.crm_records where id in ('con-1','act-1','in-2')")).rows[0].n, 0)
  const after = await env.store.loadState()
  assert.deepEqual(after.deals.find((d) => d.id === 'deal-1').contactIds, [], 'geschoonde kans blijft geschoond')
})

test('erasing is refused while a retention hold exists, and for non-admins', async () => {
  const env = await ready()
  let state = await env.store.loadState()
  const contact = state.contacts.find((c) => c.id === 'con-2')
  state = (await env.store.reviewRetention(state, { contactId: 'con-2', retentionReason: 'Lopende afspraak', retentionHold: true })).state
  await assert.rejects(() => env.store.erase(state, { contactId: 'con-2', confirmName: contact.name, manualReviewConfirmed: true }), /bewaarbeperking/)
  await env.as('editor')
  const memberState = await env.store.loadState()
  await assert.rejects(() => env.store.erase(memberState, { contactId: 'con-2', confirmName: contact.name, manualReviewConfirmed: true }), /bewaarbeperking|geen toestemming|Cannot read/)
})

test('privacy requests, incidents and register are stored and audited', async () => {
  const env = await ready()
  let state = await env.store.loadState()
  state = (await env.store.saveRequest(state, { contactId: 'con-2', type: 'bezwaar', receivedDate: '2026-10-20', identityVerified: true })).state
  assert.equal(state.privacy.requests.length, 2)
  assert.equal(state.privacy.requests.at(-1).due, '2026-11-20')
  const first = state.privacy.requests.find((r) => r.id === 'req-1')
  state = (await env.store.saveRequest(state, { id: first.id, status: 'afgerond', identityVerified: true })).state
  assert.equal(state.privacy.requests.find((r) => r.id === 'req-1').status, 'afgerond')
  state = (await env.store.saveIncident(state, { summary: 'Mail naar verkeerde ontvanger' })).state
  assert.equal(state.privacy.incidents.length, 2)
  state = (await env.store.savePolicy(state, { prospectReviewMonths: 9, auditDays: 200, backupDays: 30 })).state
  assert.equal(state.privacy.policy.prospectReviewMonths, 9)
  const actions = (await env.store.audit()).map((entry) => entry.action)
  for (const action of ['privacy.request.create', 'privacy.request.update', 'incident.create', 'privacy.policy.update']) assert.ok(actions.includes(action), action)
})

test('direct table access is limited by row level security policies', async () => {
  const env = await ready()
  const { rows } = await env.db.query("select polname from pg_policy where polrelid = 'public.crm_records'::regclass")
  assert.deepEqual(rows.map((r) => r.polname), ['crm admins read business records'])
  const grants = await env.db.query("select privilege_type from information_schema.role_table_grants where table_name = 'crm_records' and grantee = 'authenticated'")
  assert.deepEqual(grants.rows.map((r) => r.privilege_type), ['SELECT'])
  assert.equal((await env.db.query("select relrowsecurity from pg_class where oid = 'public.crm_records'::regclass")).rows[0].relrowsecurity, true)
})
