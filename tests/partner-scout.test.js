import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNominatimQueries, buildOverpassQuery, filterPartnerLeads, mergeDiscoveredLeads, parseNominatimLeads, parseOverpassLeads,
  partnerMailDraft, partnerStats,
} from '../src/partner-scout.js'

test('turns public map organizations into scored ZOL prospects', () => {
  const leads = parseOverpassLeads({ elements: [{ type: 'node', id: 42, tags: { name: 'Jeugd Fysio Sport', healthcare: 'physiotherapist', website: 'https://example.nl', email: 'info@example.nl', 'addr:city': 'Haarlem' } }] }, 'NL-NH', '2026-09-03T10:00:00.000Z')
  assert.equal(leads.length, 1)
  assert.equal(leads[0].type, 'physio')
  assert.ok(leads[0].score >= 90)
  assert.equal(leads[0].email, 'info@example.nl')
})

test('keeps sales work while refreshing public source details', () => {
  const old = [{ id: 'osm-node-42', external_id: 'osm:node:42', name: 'Oude naam', status: 'contacted', notes: 'Thijn heeft gebeld', website: '', last_verified_at: '2026-01-01' }]
  const fresh = [{ id: 'osm-node-42', external_id: 'osm:node:42', name: 'Nieuwe naam', status: 'new', notes: '', website: 'https://example.nl', last_verified_at: '2026-09-03' }]
  const result = mergeDiscoveredLeads(old, fresh)
  assert.equal(result.added, 0)
  assert.equal(result.refreshed, 1)
  assert.equal(result.leads[0].status, 'contacted')
  assert.equal(result.leads[0].notes, 'Thijn heeft gebeld')
  assert.equal(result.leads[0].website, 'https://example.nl')
})

test('filters completed work and calculates sales pipeline', () => {
  const leads = [
    { name: 'A', type: 'school', status: 'new', score: 90, estimated_units: 10, next_action_at: '2026-09-01' },
    { name: 'B', type: 'physio', status: 'won', score: 95, estimated_units: 5, next_action_at: '' },
  ]
  assert.deepEqual(filterPartnerLeads(leads, { flow: 'done' }).map((lead) => lead.name), ['B'])
  const stats = partnerStats(leads, new Date('2026-09-03T12:00:00Z'))
  assert.equal(stats.due, 1)
  assert.equal(stats.pipelineCents, 99950)
})

test('builds a bounded public-data query and a reviewable mail draft', () => {
  const query = buildOverpassQuery('NL-NH', 'school', 9999)
  assert.match(query, /NL-NH/)
  assert.match(query, /school/)
  assert.match(query, /tags center 300/)
  const draft = partnerMailDraft({ name: 'Testschool', type: 'school', status: 'new', contact_name: '', angle: 'bewegingsonderwijs' })
  assert.match(draft.subject, /Testschool/)
  assert.match(draft.body, /15 minuten/)
})

test('builds rate-limit friendly public searches and reads their results', () => {
  const queries = buildNominatimQueries('NL-NH', 'all', 180)
  assert.equal(queries.length, 8)
  assert.ok(queries.every((query) => query.url.includes('limit=23')))
  assert.equal(queries.filter((query) => query.type === 'school').length, 2)
  assert.equal(queries.filter((query) => query.type === 'sports_club').length, 4)
  const leads = parseNominatimLeads([{ osm_type: 'node', osm_id: 7, name: 'Testschool', address: { city: 'Amsterdam' }, extratags: { website: 'https://school.test' } }], 'school', 'NL-NH', '2026-09-03T10:00:00Z')
  assert.equal(leads[0].type, 'school')
  assert.equal(leads[0].city, 'Amsterdam')
})
