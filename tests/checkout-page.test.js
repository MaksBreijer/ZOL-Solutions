import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('checkout goes straight from the cart to customer and payment details', async () => {
  const html = await readFile(new URL('../checkout/index.html', import.meta.url), 'utf8')

  assert.doesNotMatch(html, /checkout-intake|pain_moment|pain_duration|pain_side|discovery_source/)
  assert.match(html, /<section class="checkout-details" id="checkout-details">/)
  assert.match(html, /<header><span>02<\/span><div><h2>Contact, bezorging & betaling<\/h2>/)
})
