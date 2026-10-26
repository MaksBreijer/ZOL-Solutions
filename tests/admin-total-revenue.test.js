import test from 'node:test'
import assert from 'node:assert/strict'
import { adminHarness } from './helpers/admin-harness.js'

test('admin Home shows four logical cards: total revenue, this month, orders and customers', async () => {
  const admin = await adminHarness()
  admin.run('renderDashboard()')
  const cards = [...admin.window.document.querySelectorAll('.metric-card')]
  assert.deepEqual(cards.map((card) => card.querySelector('header span').textContent), ['Totale omzet', 'Omzet deze maand', 'Bestellingen', 'Klanten'])
  const paid = admin.run("visibleOrders().filter((o) => o.payment_status === 'paid').reduce((sum, o) => sum + o.total_cents, 0)")
  const expected = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(paid / 100)
  assert.ok(cards[0].textContent.replace(/\s/g, ' ').includes(expected.replace(/\s/g, ' ')))
})
