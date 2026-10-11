import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { applyGoogleRating } from '../src/google-rating.js'
import { translateEnglish } from '../src/language-core.js'

test('the live Google rating replaces every score and count on the product page', async () => {
  const html = await readFile(new URL('../product/index.html', import.meta.url), 'utf8')
  const updated = applyGoogleRating(html, { rating: 4.8, count: 15 })
  assert.doesNotMatch(updated, /\b4,9\b|\b12 (?:Google-)?reviews/)
  assert.match(updated, /4,8 op Google/)
  assert.match(updated, /<small>15 reviews ↗<\/small>/)
  assert.match(updated, /<strong>4,8<\/strong><span aria-hidden="true">★★★★★<\/span><small>15 Google-reviews/)
  assert.match(updated, /Bekijk alle 15 Google-reviews van ZOL Solutions/)
  assert.match(updated, /4,8\/5 uit 15 Google-reviews/)
})

test('updated Google rating phrases are still translated to English', () => {
  assert.equal(translateEnglish('4,8/5 uit 15 Google-reviews ↗'), '4.8/5 from 15 Google reviews ↗')
  assert.equal(translateEnglish('4,8 op Google'), '4.8 on Google')
  assert.equal(translateEnglish('15 reviews ↗'), '15 reviews ↗')
  assert.equal(translateEnglish('Bekijk de 15 Google-reviews van ZOL Solutions'), translateEnglish('Bekijk de 12 Google-reviews van ZOL Solutions').replace('12', '15'))
})
