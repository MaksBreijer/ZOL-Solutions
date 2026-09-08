import test from 'node:test'
import assert from 'node:assert/strict'
import { adminHarness } from './helpers/admin-harness.js'

test('analytics charts render without CSP-blocked inline styles', async () => {
  const h = await adminHarness()
  try {
    const now = new Date().toISOString()
    h.run(`
      state.analytics = [
        { event_name: 'page_view', session_id: 'session-1', page: '/', metadata: {}, created_at: '${now}' },
        { event_name: 'product_view', session_id: 'session-1', page: '/product/', metadata: {}, created_at: '${now}' },
        { event_name: 'add_to_cart', session_id: 'session-1', page: '/product/', metadata: {}, created_at: '${now}' }
      ];
      state.orders = [{
        id: 'order-analytics', customer_email: 'test@example.nl', created_at: '${now}', payment_status: 'paid',
        fulfillment_status: 'unfulfilled', total_cents: 9995, subtotal_cents: 9995, shipping_cents: 0,
        discount_cents: 0, order_items: [{ product_name: "De ZOL'tjes", total_cents: 9995 }]
      }];
      renderAnalytics();
    `)

    assert.equal(h.window.document.querySelectorAll('.analytics-page [style]').length, 0)
    const bars = [...h.window.document.querySelectorAll('.report-bar-svg rect')]
    assert.ok(bars.length > 0)
    assert.ok(bars.some((bar) => Number(bar.getAttribute('height')) === 100))
    assert.equal(h.run(`analyticsSeries(30, state.analytics, state.orders).at(-1).sessions`), 1)
    assert.equal(h.run(`analyticsSeries(30, state.analytics, state.orders).at(-1).revenue`), 9995)
    assert.ok(h.q('.funnel-meter rect'))
    assert.ok(h.q('.report-donut'))
  } finally {
    h.close()
  }
})
