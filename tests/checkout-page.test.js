import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('checkout goes straight from the cart to customer and payment details', async () => {
  const html = await readFile(new URL('../checkout/index.html', import.meta.url), 'utf8')

  assert.doesNotMatch(html, /checkout-intake|pain_moment|pain_duration|pain_side/)
  assert.match(html, /<section class="checkout-details" id="checkout-details">/)
  assert.match(html, /<header><span>02<\/span><div><h2>Contact, bezorging & betaling<\/h2>/)
})

test('checkout asks for the discovery source and stores it outside customer data', async () => {
  const [html, client, edgeFunction] = await Promise.all([
    readFile(new URL('../checkout/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/checkout.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/create-checkout/index.ts', import.meta.url), 'utf8'),
  ])

  assert.match(html, /name="discovery_source" value="google" required/)
  assert.doesNotMatch(html, />Verplicht</)
  assert.match(html, /id="discovery-help">Kies één antwoord\.<\/p>/)
  assert.match(html, /id="discovery-error" role="alert" hidden>Kies één antwoord om verder te gaan\.<\/p>/)
  assert.match(html, /name="discovery_details"/)
  assert.match(client, /delete customer\.discovery_source/)
  assert.match(client, /body: \{ customer, discovery,/)
  assert.match(client, /Partnercode \$\{linkedPartnerCode\}/)
  assert.match(client, /partner_order_paid/)
  assert.match(client, /if \(isDiscovery\) setDiscoveryError\(true\)/)
  assert.match(edgeFunction, /p_note: discoveryNote/)
  assert.match(edgeFunction, /Gevonden via:/)
  assert.match(edgeFunction, /Zorgprofessional of sportclub/)
})
