import test from 'node:test'
import assert from 'node:assert/strict'
import { checkoutIntake, completedIntakeAnswers, isCheckoutIntakeComplete } from '../src/checkout-intake.js'

const complete = {
  pain_moment: 'during-sport',
  pain_duration: '2-6-weeks',
  pain_side: 'both',
  discovery_source: 'google',
}

test('de betaalstap blijft dicht zolang niet alle vier verplichte keuzes geldig zijn', () => {
  assert.equal(completedIntakeAnswers({ ...complete, discovery_source: '' }), 3)
  assert.equal(isCheckoutIntakeComplete({ ...complete, discovery_source: '' }), false)
})

test('de betaalstap gaat na vier geldige keuzes open', () => {
  assert.equal(completedIntakeAnswers(complete), 4)
  assert.equal(isCheckoutIntakeComplete(complete), true)
})

test('onbekende keuzevelden worden niet als voltooid geaccepteerd', () => {
  assert.equal(isCheckoutIntakeComplete({ ...complete, pain_moment: 'anders' }), false)
  assert.equal(isCheckoutIntakeComplete({ ...complete, discovery_source: 'onbekend' }), false)
})
