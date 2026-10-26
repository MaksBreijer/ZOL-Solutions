import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { syntheticExport } from './helpers/crm-fixture.js'
import { checkExpectations, compareWithDatabase, contentHash, planImport } from '../src/crm/import.js'
import { diffStates, erasureKey, normalizeState, sha256Hex, validateRecord } from '../src/crm/model.js'

test('browser sha256 matches node crypto, so erasure keys equal those of the source system', () => {
  for (const text of ['', 'abc', 'con-1', 'Ünïcode — €', 'x'.repeat(1000), 'y'.repeat(55), 'z'.repeat(56), 'w'.repeat(64)]) {
    assert.equal(sha256Hex(text), createHash('sha256').update(text).digest('hex'), text.slice(0, 10))
  }
  assert.equal(erasureKey('con-1'), `sha256:${createHash('sha256').update('con-1').digest('hex')}`)
})

test('record validation follows the source rules', () => {
  assert.throws(() => validateRecord('tasks', { id: 't', title: 'x', status: 'nope' }), /taakstatus/)
  assert.throws(() => validateRecord('deals', { id: 'd', title: 'x', stage: 'nope' }), /pipelinefase/)
  assert.throws(() => validateRecord('tasks', { id: 't', title: 'x', status: 'open', due: '2026-02-30' }), /datum/)
  assert.throws(() => validateRecord('organizations', { id: 'o p', name: 'x' }), /record-ID/)
  assert.throws(() => validateRecord('deals', { id: 'd', title: 'x', stage: 'voorstel', value: -1 }), /bedrag/)
  assert.throws(() => validateRecord('tasks', { id: 't', title: 'x', status: 'open', contactIds: [1] }), /relatieverwijzing/)
  assert.doesNotThrow(() => validateRecord('tasks', { id: 't', title: 'x', status: 'wacht-op-reactie', due: '2026-10-30', unknownField: { a: 1 } }))
})

test('import plan maps every record and reports counts, relations and unresolved references', () => {
  const source = syntheticExport()
  source.tasks.push({ id: 'task-x', title: 'Verwijst naar niets', status: 'open', organizationIds: ['weg'] })
  const plan = planImport(source, { files: { 'files/synthetic-file-1': { sha256: 'a'.repeat(64), size: 8, fileName: 'scherm.png', contentType: 'image/png' } } })
  assert.deepEqual(plan.errors, [])
  assert.equal(plan.report.counts.perCollection.organizations, 3)
  assert.equal(plan.report.counts.organizationsVisible, 2, 'samengevoegde organisaties tellen niet mee als zichtbaar')
  assert.equal(plan.report.counts.openTasks, 2)
  assert.deepEqual(plan.report.counts.tasksByStatus, { 'wacht-op-reactie': 1, afgerond: 1, vervallen: 1, open: 1 })
  assert.deepEqual(plan.report.unresolvedReferences.map((item) => [item.relation, item.to]), [['tasks.organizationIds', 'weg']])
  assert.equal(plan.report.relations['inbox.fileKey'].unresolved, 0)
  assert.equal(plan.report.legacyMembersNotImported, 1)
  // Alle bronvelden zijn terug te vinden: ook die zonder eigen collectie.
  const meta = plan.rows.find((row) => row.collection === 'source_meta')
  assert.deepEqual(meta.data.uncertainties, ['Synthetische onzekerheid'])
  assert.equal(plan.rows.find((row) => row.collection === 'organizations' && row.id === 'org-beta').data.customField.nested[2], 3)
  assert.deepEqual(checkExpectations(plan, { organizations: 2, openTasks: 2, contacts: 2 }).map((c) => c.ok), [true, true, true])
  assert.equal(checkExpectations(plan, { organizations: 25 })[0].ok, false)
  // Het plan is deterministisch, dus de bevestigingscode van een dry-run geldt voor de echte import.
  assert.equal(planImport(structuredClone(source), { files: { 'files/synthetic-file-1': { sha256: 'a'.repeat(64), size: 8, fileName: 'scherm.png', contentType: 'image/png' } } }).planHash, plan.planHash)
})

test('import plan blocks duplicates and flags invalid records and missing attachments without dropping them', () => {
  const source = syntheticExport()
  source.contacts.push({ id: 'con-1', name: 'Dubbel' })
  source.tasks.push({ id: 'task-bad', title: 'Slechte status', status: 'kapot' })
  const plan = planImport(source, { files: {} })
  assert.ok(plan.errors.some((error) => /Dubbele ID contacts\/con-1/.test(error)))
  assert.deepEqual(plan.invalid.map((item) => item.id).sort(), ['in-2', 'task-bad'])
  assert.ok(plan.rows.some((row) => row.id === 'task-bad'), 'ongeldige records blijven in het plan en worden gemeld')
})

test('database comparison finds missing and altered rows', () => {
  const plan = planImport(syntheticExport(), { files: { 'files/synthetic-file-1': { sha256: 'a'.repeat(64), size: 8 } } })
  const stored = plan.rows.map((row) => ({ ...row, data: structuredClone(row.data) }))
  stored.pop(); stored[0].data.name = 'Gewijzigd'
  const result = compareWithDatabase(plan, stored)
  assert.equal(result.missing.length, 1)
  assert.deepEqual(result.different, [`${stored[0].collection}/${stored[0].id}`])
  assert.equal(contentHash({ b: 1, a: [2] }), contentHash({ a: [2], b: 1 }))
})

test('state diff produces minimal writes with the revision the user saw', () => {
  const before = normalizeState({ ...syntheticExport(), organizations: syntheticExport().organizations.map((o) => ({ ...o, revision: `r-${o.id}` })) })
  const after = structuredClone(before)
  after.organizations[0].city = 'Teststad'
  after.tasks.pop()
  after.contacts.push({ id: 'con-new', name: 'Nieuw' })
  const { writes, deletes } = diffStates(before, after)
  assert.deepEqual(writes.map((w) => [w.collection, w.id, w.expectedRevision]), [['organizations', 'org-alpha', 'r-org-alpha'], ['contacts', 'con-new', null]])
  assert.deepEqual(deletes.map((d) => [d.collection, d.id]), [['tasks', 'task-3']])
})
