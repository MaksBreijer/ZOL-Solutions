import test from 'node:test'
import assert from 'node:assert/strict'
import { syntheticExport } from './helpers/crm-fixture.js'
import { normalizeState, validateRecord } from '../src/crm/model.js'
import { parseDate, parseEntry, parseTime } from '../src/crm/quick-entry.js'

const state = normalizeState(syntheticExport())
const NOW = '2026-10-26' // maandag

test('dates in Dutch: day+month, numeric, relative and weekdays', () => {
  assert.equal(parseDate('18 november', NOW).date, '2026-11-18')
  assert.equal(parseDate('op 3 jan', NOW).date, '2027-01-03', 'datum in het verleden dit jaar wordt volgend jaar')
  assert.equal(parseDate('18-11', NOW).date, '2026-11-18')
  assert.equal(parseDate('5/12/2027', NOW).date, '2027-12-05')
  assert.equal(parseDate('31 november', NOW), null)
  assert.equal(parseDate('morgen bellen', NOW).date, '2026-10-27')
  assert.equal(parseDate('overmorgen', NOW).date, '2026-10-28')
  assert.equal(parseDate('over 2 weken', NOW).date, '2026-11-09')
  assert.equal(parseDate('donderdag', NOW).date, '2026-10-29')
  assert.equal(parseDate('maandag', NOW).date, '2026-11-02', 'vandaag is maandag: de volgende')
  assert.equal(parseDate('volgende week donderdag', NOW).date, '2026-11-05')
})

test('times: 14:00, 14.30, om 9 uur', () => {
  assert.equal(parseTime('om 14:00').time, '14:00')
  assert.equal(parseTime('rond 9.30 uur').time, '09:30')
  assert.equal(parseTime('om 9 uur').time, '09:00')
  assert.equal(parseTime('18 november'), null)
})

test('an event sentence becomes an event linked to the matching organisation', () => {
  const entry = parseEntry('Joh, we hebben 18 november bij Testclub Alpha een evenement om 14:00, vul het CRM in', state, NOW)
  assert.equal(entry.kind, 'events')
  assert.equal(entry.proposals.length, 1)
  const { record } = entry.proposals[0]
  assert.equal(record.date, '2026-11-18')
  assert.equal(record.time, '14:00')
  assert.equal(record.organizationId, 'org-alpha')
  assert.doesNotThrow(() => validateRecord('events', record))
  assert.deepEqual(entry.warnings, [])
})

test('several organisations give one event each; aliases and first words are matched', () => {
  const entry = parseEntry('18 november evenement bij Alpha FC en Testpraktijk', state, NOW)
  assert.deepEqual(entry.proposals.map((p) => p.record.organizationId).sort(), ['org-alpha', 'org-beta'])
  const derived = parseEntry('18 november evenement bij Testclub', state, NOW)
  assert.equal(derived.proposals[0].record.organizationId, 'org-alpha')
  assert.ok(derived.notes.some((note) => /afgeleid/.test(note)))
})

test('a follow-up becomes a task with channel, date, time, contact and priority', () => {
  const entry = parseEntry('Bel Pat Voorbeeld donderdag om 13:00 over het voorstel, urgent', state, NOW)
  assert.equal(entry.kind, 'tasks')
  const { record } = entry.proposals[0]
  assert.equal(record.due, '2026-10-29')
  assert.equal(record.time, '13:00')
  assert.equal(record.channel, 'telefoon')
  assert.equal(record.priority, 'hoog')
  assert.deepEqual(record.contactIds, ['con-1'])
  assert.deepEqual(record.organizationIds, ['org-alpha'], 'organisatie volgt uit het contact')
  assert.doesNotThrow(() => validateRecord('tasks', record))
})

test('a past conversation becomes an activity on today and links the dossiers', () => {
  const entry = parseEntry('Net gebeld met Pat Voorbeeld van Testclub Alpha, ze willen een offerte', state, NOW)
  assert.equal(entry.kind, 'activities')
  const { record } = entry.proposals[0]
  assert.equal(record.type, 'telefoon')
  assert.equal(record.date, NOW)
  assert.deepEqual(record.relatedIds.sort(), ['con-1', 'org-alpha'])
  assert.doesNotThrow(() => validateRecord('activities', record))
})

test('unknown organisations are only proposed, never linked silently, and a missing date is flagged', () => {
  const entry = parseEntry('Evenement bij Hockeyclub Nieuwveld', state, NOW)
  assert.equal(entry.proposals[0].record.organizationId, undefined)
  assert.equal(entry.proposals[0].record.club, 'Hockeyclub Nieuwveld')
  assert.deepEqual(entry.created.map((c) => c.record.name), ['Hockeyclub Nieuwveld'])
  assert.ok(entry.warnings.some((w) => /Geen datum/.test(w)))
  assert.ok(entry.warnings.some((w) => /staat nog niet in het CRM/.test(w)))
})

test('empty input and merged (hidden) organisations', () => {
  assert.deepEqual(parseEntry('   ', state, NOW).proposals, [])
  const entry = parseEntry('Taak: Gamma dubbel bellen morgen', state, NOW)
  assert.deepEqual(entry.proposals[0].record.organizationIds, [], 'samengevoegde organisaties worden niet gekoppeld')
})

test('quick entry assigns a category and an owner', () => {
  const event = parseEntry('18 november evenement bij Testclub Alpha', state, NOW)
  assert.equal(event.proposals[0].record.category, 'evenementen')
  const task = parseEntry('Thijn moet de boekhouding bijwerken voor 30 november', state, NOW)
  assert.equal(task.proposals[0].record.owner, 'Thijn')
  assert.equal(task.proposals[0].record.category, 'intern')
  assert.ok(task.notes.includes('Voor: Thijn'))
  const meeting = parseEntry('Afspraak met Pat Voorbeeld donderdag 11:00', state, NOW)
  assert.equal(meeting.proposals[0].record.category, 'afspraken')
  const relation = parseEntry('Bel Pat Voorbeeld morgen', state, NOW)
  assert.equal(relation.proposals[0].record.category, 'relaties')
})
