import test from 'node:test'
import assert from 'node:assert/strict'
import { checkoutIntake, completedIntakeAnswers, isCheckoutIntakeComplete } from '../src/checkout-intake.js'

const complete = {
  pain_moment: 'during-sport',
  pain_duration: '2-6-weeks',
  pain_side: 'both',
  discovery_source: 'google',
  pain_details: 'Vooral na een voetbaltraining.',
}

test('de betaalstap blijft dicht zolang niet alle vijf antwoorden geldig zijn', () => {
  assert.equal(completedIntakeAnswers({ ...complete, discovery_source: '' }), 4)
  assert.equal(isCheckoutIntakeComplete({ ...complete, pain_details: 'te kort' }), false)
})

test('de betaalstap gaat open na vier geldige keuzes en een toelichting', () => {
  assert.equal(completedIntakeAnswers(complete), 5)
  assert.equal(isCheckoutIntakeComplete(complete), true)
})

test('onbekende keuzevelden worden niet als voltooid geaccepteerd', () => {
  assert.equal(isCheckoutIntakeComplete({ ...complete, pain_moment: 'anders' }), false)
  assert.equal(isCheckoutIntakeComplete({ ...complete, discovery_source: 'onbekend' }), false)
})

test('vrije tekst wordt opgeschoond en begrensd', () => {
  const intake = checkoutIntake({ ...complete, pain_details: `  ${'a'.repeat(520)}  ` })
  assert.equal(intake.pain_details.length, 500)
  assert.equal(intake.pain_details.startsWith(' '), false)
})
