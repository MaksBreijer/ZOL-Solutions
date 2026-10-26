import test from 'node:test'
import assert from 'node:assert/strict'
import { adminHarness } from './helpers/admin-harness.js'

test('admin Home shows the total revenue of all paid orders', async () => {
  const admin = await adminHarness()
  admin.run('renderDashboard()')
  const card = [...admin.window.document.querySelectorAll('.metric-card')].find((el) => /Totale omzet tot nu toe/.test(el.textContent))
  assert.ok(card)
  const paid = admin.run("visibleOrders().filter((o) => o.payment_status === 'paid').reduce((sum, o) => sum + o.total_cents, 0)")
  const expected = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(paid / 100)
  assert.ok(card.textContent.replace(/\s/g, ' ').includes(expected.replace(/\s/g, ' ')), `${card.textContent} bevat niet ${expected}`)
  assert.equal(admin.q('#crm-home'), null, 'geen CRM-blok op Home')
})
