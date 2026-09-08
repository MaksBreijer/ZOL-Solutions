import test from 'node:test'
import assert from 'node:assert/strict'
import { adminHarness } from './helpers/admin-harness.js'

const scenario = (name, fn) => test(name, async () => { const h = await adminHarness(); try { await fn(h) } finally { h.close() } })

async function openPartnerScout(h) {
  h.db.settings.push({ key: 'partner_scout', value: {
    version: 3,
    leads: [{ id: 'lead-1', name: 'Test Fysiotherapie', type: 'physio', website: 'https://testfysio.nl', city: 'Haarlem', score: 90, status: 'new', contact_role: 'Kinderfysiotherapeut' }],
    interactions: [],
  } })
  await h.run('fetchAllData()')
  h.run("partnerFilters = { query: '', type: '', status: '', flow: 'todo', priority: '' }; renderPartners()")
}

scenario('searches Apollo without changing the lead and presents candidate review', async h => {
  await openPartnerScout(h)
  h.respondWith({ success: true, domain: 'testfysio.nl', candidates: [{ id: 'apollo-person-1', name: 'Sanne V***', title: 'Kinderfysiotherapeut', organization: 'Test Fysiotherapie', has_email: true }] })
  await h.click('[data-action="apollo-search"]')
  const call = h.calls.find(item => item.function === 'apollo-enrichment')
  assert.equal(call.body.action, 'search')
  assert.equal(call.body.lead.website, 'https://testfysio.nl')
  assert.match(h.q('#dialog-body').textContent, /Kinderfysiotherapeut/)
  assert.equal(h.run("partnerLead('lead-1').contact_name"), '')
})

scenario('enriches a reviewed Apollo candidate and records provenance', async h => {
  await openPartnerScout(h)
  h.respondWith({ success: true, domain: 'testfysio.nl', candidates: [{ id: 'apollo-person-1', name: 'Sanne V***', title: 'Kinderfysiotherapeut', organization: 'Test Fysiotherapie', has_email: true }] })
  await h.click('[data-action="apollo-search"]')
  h.respondWith({ success: true, contact: { id: 'apollo-person-1', name: 'Sanne Visser', title: 'Kinderfysiotherapeut', email: 'sanne@testfysio.nl', email_status: 'verified', phone: '0201234567', linkedin_url: 'https://linkedin.com/in/sanne', match_confidence: 'high', enriched_at: '2026-09-08T10:00:00Z' } })
  await h.click('[data-action="apollo-enrich"]')
  const lead = h.run("partnerLead('lead-1')")
  assert.equal(lead.contact_name, 'Sanne Visser')
  assert.equal(lead.email, 'sanne@testfysio.nl')
  assert.equal(lead.status, 'qualified')
  assert.equal(lead.apollo_contact_id, 'apollo-person-1')
  assert.equal(lead.apollo_email_status, 'verified')
  assert.ok(h.calls.some(item => item.function === 'apollo-enrichment' && item.body.action === 'enrich'))
  assert.ok(h.db.activity_log.some(item => item.action === 'Partnercontact via Apollo verrijkt'))
})

scenario('keeps Apollo unavailable for leads without a website', async h => {
  await openPartnerScout(h)
  h.run("state.partnerScout.leads[0].website = ''; renderPartners()")
  assert.equal(h.q('[data-action="apollo-search"]').disabled, true)
})
