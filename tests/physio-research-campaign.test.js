import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../supabase/functions/physio-campaign/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*\n/gm, '')
const context = { Deno: { serve() {} }, URL, Response, Set }
runInNewContext(stripTypeScriptTypes(`${source}\nglobalThis.campaignHelpers = { eligibleLeads, isResearchCampaign, researchSubject, researchBody }`), context)
const { eligibleLeads, isResearchCampaign, researchSubject, researchBody } = context.campaignHelpers

test('neutral research invitation uses valid unique addresses without changing product-mail eligibility', () => {
  const leads = [
    { id: 'one', type: 'physio', name: 'Praktijk Een', email: 'info@voorbeeld.nl', outreach_basis: 'none' },
    { id: 'two', type: 'physio', name: 'Praktijk Twee', email: 'INFO@VOORBEELD.NL', outreach_basis: 'none' },
    { id: 'three', type: 'physio', name: 'Praktijk Drie', email: 'drie@voorbeeld.nl', outreach_opt_out: true },
    { id: 'four', type: 'physio', name: 'Praktijk Vier', email: 'vier@voorbeeld.nl', outreach_basis: 'consent', outreach_basis_note: 'Toestemming vastgelegd' },
  ]
  assert.deepEqual(Array.from(eligibleLeads(leads, false), lead => lead.id), ['one', 'four'])
  assert.deepEqual(Array.from(eligibleLeads(leads), lead => lead.id), ['four'])
})

test('research mode is limited to the fixed invitation without product links', () => {
  assert.equal(isResearchCampaign({ subject_template: researchSubject, body_template: researchBody }), true)
  assert.equal(isResearchCampaign({ subject_template: researchSubject, body_template: `${researchBody}\nKoop onze zolen` }), false)
  assert.doesNotMatch(`${researchSubject}\n${researchBody}`, /zol.tjes|https?:\/\/|bestel|koop|product/i)
})
