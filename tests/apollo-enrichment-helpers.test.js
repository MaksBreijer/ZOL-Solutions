import test from 'node:test'
import assert from 'node:assert/strict'
import { apolloPersonId, buildPeopleSearch } from '../supabase/functions/apollo-enrichment/apollo-helpers.js'

test('normalizes both current and compatible Apollo person IDs', () => {
  assert.equal(apolloPersonId({ id: 'apollo-id' }), 'apollo-id')
  assert.equal(apolloPersonId({ person_id: 'compatible-id' }), 'compatible-id')
  assert.equal(apolloPersonId({}), '')
})

test('builds a narrow people search for the first attempt', () => {
  const params = buildPeopleSearch({ domain: 'praktijk.nl', titles: ['fysiotherapeut'] })
  assert.equal(params.get('q_organization_domains_list[]'), 'praktijk.nl')
  assert.deepEqual(params.getAll('person_titles[]'), ['fysiotherapeut'])
  assert.ok(params.getAll('person_seniorities[]').includes('owner'))
})

test('builds a broad domain-only fallback without title or seniority filters', () => {
  const params = buildPeopleSearch({ domain: 'praktijk.nl', titles: ['fysiotherapeut'], includeTitles: false, includeSeniorities: false })
  assert.equal(params.get('q_organization_domains_list[]'), 'praktijk.nl')
  assert.deepEqual(params.getAll('person_titles[]'), [])
  assert.deepEqual(params.getAll('person_seniorities[]'), [])
})
