import test from 'node:test'
import assert from 'node:assert/strict'
import { painInvitationDelayDays, painInvitationEligible } from '../supabase/functions/_shared/pain-invitation.js'

test('pain invitation waits seven days after a registered delivery by default', () => {
  const now = new Date('2026-09-08T12:00:00.000Z')
  assert.equal(painInvitationEligible({ fulfillment_status: 'unfulfilled', delivered_at: null }, {}, now), false)
  assert.equal(painInvitationEligible({ fulfillment_status: 'delivered', delivered_at: '2026-09-02T12:00:01.000Z' }, {}, now), false)
  assert.equal(painInvitationEligible({ fulfillment_status: 'delivered', delivered_at: '2026-09-01T12:00:00.000Z' }, {}, now), true)
})

test('pain invitation delay is configurable within safe bounds', () => {
  assert.equal(painInvitationDelayDays(undefined), 7)
  assert.equal(painInvitationDelayDays(0), 1)
  assert.equal(painInvitationDelayDays(90), 30)
  assert.equal(painInvitationEligible(
    { fulfillment_status: 'delivered', delivered_at: '2026-09-05T12:00:00.000Z' },
    { invitation_delay_days_after_delivery: 3 },
    new Date('2026-09-08T12:00:00.000Z'),
  ), true)
})
