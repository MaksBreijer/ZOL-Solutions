import test from 'node:test'
import assert from 'node:assert/strict'
import { trackingRemovalUpdate } from '../src/order-tracking.js'

test('removes only tracking fields from an order', () => {
  assert.deepEqual(trackingRemovalUpdate(), {
    tracking_code: '',
    tracking_carrier: '',
    tracking_url: '',
  })
  assert.equal('fulfillment_status' in trackingRemovalUpdate(), false)
  assert.equal('shipped_at' in trackingRemovalUpdate(), false)
  assert.equal('postnl' in trackingRemovalUpdate(), false)
})
