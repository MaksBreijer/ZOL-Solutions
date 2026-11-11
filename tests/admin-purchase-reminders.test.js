import test from 'node:test'
import assert from 'node:assert/strict'
import { adminHarness } from './helpers/admin-harness.js'

test('klantenlijst en klantvenster tonen waar iemand staat in de herinneringsreeks', async () => {
  const h = await adminHarness()
  try {
    const base = { last_name: '', phone: '', address: {}, notes: '', total_orders: 0, total_spent_cents: 0, created_at: new Date().toISOString(), marketing_opt_in: true }
    h.db.customers[0].created_at = base.created_at // De vaste testklant heeft al betaald.
    h.db.customers.push(
      { ...base, id: 'c-actief', email: 'actief@example.invalid', first_name: 'Actief', purchase_reminder_count: 1 },
      { ...base, id: 'c-klaar', email: 'klaar@example.invalid', first_name: 'Klaar', purchase_reminder_count: 3 },
      { ...base, id: 'c-geen', email: 'geen@example.invalid', first_name: 'Geen', marketing_opt_in: false, purchase_reminder_count: 0 },
    )
    h.db.email_messages = [{ id: 'm1', kind: 'welcome_reminder', recipient_email: 'actief@example.invalid', customer_id: null, subject: "De ZOL'tjes voor je kind wachten nog op je", status: 'sent', dedupe_key: 'purchase-reminder-c-actief-1', created_at: '2026-11-11T12:00:00Z', sent_at: '2026-11-11T12:00:00Z' }]
    await h.run('fetchAllData()'); h.run('renderCustomers()')
    const row = (id) => h.q(`tr[data-id="${id}"]`).textContent
    assert.match(h.q('#customers-table thead').textContent, /Herinneringen/)
    assert.match(row('c-actief'), /1 van 3 verstuurd/); assert.match(row('c-actief'), /Volgende: na 1 dag/)
    assert.match(row('c-klaar'), /3 van 3 verstuurd/); assert.match(row('c-klaar'), /Reeks afgerond/)
    assert.match(row('c-geen'), /Geen toestemming/)
    assert.match(row(h.db.customers[0].id), /Gekocht/)

    await h.click('tr[data-id="c-actief"]')
    const dialog = h.q('#customer-form').textContent
    assert.match(dialog, /Herinneringen zonder aankoop/)
    assert.match(dialog, /1 van 3 verstuurd/)
    assert.match(dialog, /laatste op/)
    assert.match(dialog, /De ZOL'tjes voor je kind wachten nog op je/)
  } finally { h.close() }
})
