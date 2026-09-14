import test from 'node:test'
import assert from 'node:assert/strict'
import { adminHarness } from './helpers/admin-harness.js'
const scenario = (name, fn) => test(name, async () => { const h = await adminHarness(); try { h.db.orders[0].payment_status='pending'; h.db.payments[0].status='pending'; await h.detail(); await fn(h) } finally { h.close() } })
scenario('edit existing amount previews and saves zero with a reason then refreshes order and payment', async h => {
  await h.click('[data-action="edit-order-amount"]')
  assert.equal(h.q('[data-amount-price]').value,'99.95')
  h.fill('[data-amount-price]','0'); h.fill('[name="reason"]','Gratis vervanging')
  assert.match(h.q('#order-amount-preview').textContent,/0,00/)
  await h.submit('#order-amount-form')
  const call=h.calls.find(call=>call.rpc==='update_admin_order_amount')
  assert.equal(call.args.p_items[0].unit_price_cents,0); assert.ok(call.args.p_items[0].id)
  assert.equal(call.args.p_expected_updated_at,h.db.orders[0].updated_at)
  assert.equal(call.args.p_reason,'Gratis vervanging'); assert.equal(h.db.payments[0].amount_cents,0)
  assert.match(h.q('.payment-total').textContent,/0,00/); assert.equal(h.q('#admin-dialog').open,false)
})
scenario('preview includes multiple quantities, shipping and discount, excessive discounts cannot save', async h => {
  h.db.orders[0].order_items[0].quantity=2; await h.detail(); await h.click('[data-action="edit-order-amount"]')
  h.fill('[data-amount-price]','20.25'); h.fill('[name="shipping"]','4.55'); h.fill('[name="discount"]','10'); h.fill('[name="reason"]','Prijsafspraak')
  assert.match(h.q('#order-amount-preview').textContent,/35,05/)
  h.fill('[name="discount"]','50'); await h.submit('#order-amount-form')
  assert.equal(h.calls.filter(c=>c.rpc==='update_admin_order_amount').length,0)
  h.fill('[name="discount"]','10'); await h.submit('#order-amount-form')
  assert.equal(h.db.orders[0].total_cents,3505)
})
scenario('cancel does not save and a server failure retains input and allows retry', async h => {
  await h.click('[data-action="edit-order-amount"]'); h.fill('[data-amount-price]','25'); await h.click('[data-close-dialog]')
  assert.equal(h.db.orders[0].total_cents,9995)
  await h.click('[data-action="edit-order-amount"]'); h.fill('[data-amount-price]','25'); h.fill('[name="reason"]','Aanpassing'); h.failNext()
  await h.submit('#order-amount-form')
  assert.equal(h.q('#admin-dialog').open,true); assert.equal(h.q('[data-amount-price]').value,'25'); assert.equal(h.q('#order-amount-form [type="submit"]').disabled,false)
  await h.submit('#order-amount-form'); assert.equal(h.db.orders[0].total_cents,2500)
})
scenario('paid and provider-managed orders cannot open amount editing', async h => {
  h.db.orders[0].payment_status='paid'; await h.detail(); assert.equal(h.q('[data-action="edit-order-amount"]').disabled,true)
  h.db.orders[0].payment_status='pending'; h.db.payments[0].provider='mollie'; await h.detail(); assert.equal(h.q('[data-action="edit-order-amount"]').disabled,true)
})
