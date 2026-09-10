import test from 'node:test'
import assert from 'node:assert/strict'
import { adminHarness } from './helpers/admin-harness.js'

test('Live View counts only connected consented visitors and renders real page details', async () => {
  const h = await adminHarness()
  try {
    h.run(`
      liveChannel = {
        presenceState: () => ({
          one: [{ role: 'visitor', session_id: 'visitor-1', page: '/product/', device: 'Mobiel', source: 'Meta' }],
          duplicate: [{ role: 'visitor', session_id: 'visitor-1', page: '/product/', device: 'Mobiel', source: 'Meta' }],
          two: [{ role: 'visitor', session_id: 'visitor-2', page: '/checkout/', device: 'Desktop', source: 'Direct' }],
          admin: [{ role: 'admin', session_id: 'admin-1', page: '/admin/' }]
        })
      };
      liveRealtimeStatus = 'SUBSCRIBED';
      liveLastUpdatedAt = new Date();
      syncLiveVisitors();
      renderLive();
    `)

    assert.match(h.q('.live-now').textContent, /Realtime verbonden/)
    assert.equal(h.q('.live-kpis article strong').textContent, '2')
    assert.match(h.q('.live-locations').textContent, /Productpagina/)
    assert.match(h.q('.live-locations').textContent, /Afrekenen/)
    assert.match(h.q('.live-locations').textContent, /Meta · Mobiel/)
    assert.equal(h.window.document.querySelectorAll('.globe-visitor').length, 2)
    assert.equal(h.window.document.querySelectorAll('.live-page [style]').length, 0)
  } finally {
    h.close()
  }
})

