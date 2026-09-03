import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeTrackingDestination,
  trackingDestinationFromForm,
  trackingDestinationLabel,
  trackingRemovalUpdate,
} from '../src/order-tracking.js'

test('removes only tracking fields from an order', () => {
  assert.deepEqual(trackingRemovalUpdate(), {
    tracking_code: '',
    tracking_carrier: '',
    tracking_url: '',
    tracking_destination: { type: 'customer' },
  })
  assert.equal('fulfillment_status' in trackingRemovalUpdate(), false)
  assert.equal('shipped_at' in trackingRemovalUpdate(), false)
  assert.equal('postnl' in trackingRemovalUpdate(), false)
})

test('keeps the physio recipient when tracking is removed from a physio order', () => {
  assert.deepEqual(trackingRemovalUpdate({
    type: 'physio',
    practice_name: ' Fysio De Lijn ',
    email: ' INFO@DELIJN.NL ',
    street: ' Wilhelminasingel 18 ',
    postal_code: ' 6221 bk ',
    city: ' Maastricht ',
  }).tracking_destination, {
    type: 'physio',
    practice_name: 'Fysio De Lijn',
    contact_name: '',
    email: 'info@delijn.nl',
    street: 'Wilhelminasingel 18',
    postal_code: '6221 BK',
    city: 'Maastricht',
    country: 'NL',
  })
})

test('normalizes a manual physio destination', () => {
  assert.deepEqual(trackingDestinationFromForm({
    tracking_destination_type: 'physio',
    physio_practice_name: '  Fysio De Lijn ',
    physio_contact_name: ' Sophie van Dijk ',
    physio_email: ' INFO@DELIJN.NL ',
    physio_street: ' Wilhelminasingel 18 ',
    physio_postal_code: ' 6221 bk ',
    physio_city: ' Maastricht ',
  }), {
    type: 'physio',
    practice_name: 'Fysio De Lijn',
    contact_name: 'Sophie van Dijk',
    email: 'info@delijn.nl',
    street: 'Wilhelminasingel 18',
    postal_code: '6221 BK',
    city: 'Maastricht',
    country: 'NL',
  })
})

test('falls back to the customer for missing or unknown destination types', () => {
  assert.deepEqual(normalizeTrackingDestination(), { type: 'customer' })
  assert.deepEqual(normalizeTrackingDestination({ type: 'warehouse' }), { type: 'customer' })
  assert.equal(trackingDestinationLabel({ type: 'customer' }), 'Klant')
  assert.equal(trackingDestinationLabel({ type: 'physio', practice_name: 'Fysio De Lijn' }), 'Fysio De Lijn')
})
