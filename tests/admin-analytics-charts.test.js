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
    const interactiveBars = [...h.window.document.querySelectorAll('.report-bar[data-chart-tooltip]')]
    assert.ok(interactiveBars.length > 0)
    assert.ok(interactiveBars.some((bar) => /€|99/.test(bar.dataset.chartTooltip)))
    assert.ok(interactiveBars.every((bar) => bar.tabIndex === 0 && bar.getAttribute('aria-label')))
    assert.equal(h.run(`analyticsSeries(30, state.analytics, state.orders).at(-1).sessions`), 1)
    assert.equal(h.run(`analyticsSeries(30, state.analytics, state.orders).at(-1).revenue`), 9995)
    assert.match(h.q('.conversion-funnel [data-chart-tooltip]').dataset.chartTooltip, /Sessies: 1/)
    assert.ok(h.q('.funnel-meter rect'))
    assert.ok(h.q('.report-donut'))
  } finally {
    h.close()
  }
})

test('marketing dashboard separates Meta, Google Ads and organic sessions', async () => {
  const h = await adminHarness()
  try {
    const now = new Date().toISOString()
    h.run(`
      state.analytics = [
        { event_name: 'page_view', session_id: 'meta-1', page: '/product/?utm_source=meta&utm_medium=paid_social&utm_campaign=zol_test', metadata: { utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: 'zol_test' }, created_at: '${now}' },
        { event_name: 'product_view', session_id: 'meta-1', page: '/product/', metadata: {}, created_at: '${now}' },
        { event_name: 'order_created', session_id: 'meta-1', page: '/checkout/', metadata: { order_number: 'ZOL-1001' }, created_at: '${now}' },
        { event_name: 'page_view', session_id: 'google-ad-1', page: '/product/?gclid=google-click', metadata: {}, created_at: '${now}' },
        { event_name: 'page_view', session_id: 'google-organic-1', page: '/', metadata: { referrer: 'https://www.google.nl/' }, created_at: '${now}' }
      ];
      state.orders = [{ order_number: 'ZOL-1001', payment_status: 'paid', total_cents: 9995, created_at: '${now}' }];
      renderMarketing();
    `)

    assert.equal(h.window.document.querySelectorAll('.marketing-page [style]').length, 0)
    assert.equal(h.run(`marketingChannelStats(state.analytics, 'meta').sessions`), 1)
    assert.equal(h.run(`marketingChannelStats(state.analytics, 'meta').orders`), 1)
    assert.equal(h.run(`marketingChannelStats(state.analytics, 'meta').revenue`), 9995)
    assert.equal(h.run(`marketingChannelStats(state.analytics, 'google_ads').sessions`), 1)
    assert.equal(h.run(`marketingChannelStats(state.analytics, 'google_organic').sessions`), 1)
    assert.match(h.q('.marketing-summary').textContent, /€\s*99,95/)
    assert.equal(h.window.document.querySelectorAll('.marketing-channel-card').length, 2)
  } finally {
    h.close()
  }
})
