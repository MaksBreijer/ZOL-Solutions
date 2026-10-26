import test from 'node:test'
import assert from 'node:assert/strict'
import { adminHarness } from './helpers/admin-harness.js'

test('admin Home shows a CRM block with a link to the CRM', async () => {
  const admin = await adminHarness()
  admin.run('renderDashboard()')
  const block = admin.q('#crm-home')
  assert.ok(block)
  assert.match(block.textContent, /CRM: wat we hebben omgezet/)
  assert.equal(block.querySelector('a').getAttribute('href'), '#crm')
  admin.run("state.crmSummary = { organizations: 25, merged: 1, contacts: 10, tasksOpen: 11, tasksDone: 2, tasksClosed: 2, activities: 26, events: 4, deals: 1 }")
  admin.run('renderDashboard()')
  assert.match(admin.q('#crm-home').textContent, /25/)
  assert.match(admin.q('#crm-home').textContent, /1 samengevoegd en verborgen/)
  assert.match(admin.q('#crm-home').textContent, /11/)
})
