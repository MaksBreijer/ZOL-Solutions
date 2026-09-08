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

test('checkout supports Belgium with its own shipping quote and address rules', async () => {
  const [html, client, edgeFunction, postnl, migration, countryFix] = await Promise.all([
    readFile(new URL('../checkout/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/checkout.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/create-checkout/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/postnl-shipment/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260908183000_add_belgium_checkout.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260908185443_fix_checkout_country_initializer.sql', import.meta.url), 'utf8'),
  ])

  assert.match(html, /<option value="BE">België<\/option>/)
  assert.match(html, /id="delivery-promise">Nederland · 1–2 werkdagen<\/output>/)
  assert.match(client, /belgium_shipping_cents: 495/)
  assert.match(client, /body: \{ action: 'quote', country: selectedCountry\(\)/)
  assert.match(client, /België · 2–4 werkdagen/)
  assert.match(edgeFunction, /p_country: country/)
  assert.match(edgeFunction, /billingCountry: country/)
  assert.match(edgeFunction, /geldige Belgische postcode/)
  assert.match(postnl, /belgium_product_code \|\| "4946"/)
  assert.match(postnl, /Countrycode: recipientCountry/)
  assert.match(migration, /'belgium_shipping_cents', 495/)
  assert.match(migration, /create function public\.quote_checkout_order\(/)
  assert.match(migration, /'country', v_country/)
  assert.match(countryFix, /p_customer ->> ''country'', ''NL''/)
})

test('checkout offers a separate optional pain evaluation invitation and stores that choice', async () => {
  const [html, client, edgeFunction, painFunction, migration] = await Promise.all([
    readFile(new URL('../checkout/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/checkout.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/create-checkout/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/pilot-measurement/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260908184954_add_checkout_pain_evaluation_opt_in.sql', import.meta.url), 'utf8'),
  ])

  assert.match(html, /name="pain_evaluation_opt_in" type="checkbox"/)
  assert.doesNotMatch(html, /name="pain_evaluation_opt_in"[^>]*required/)
  assert.match(html, /korte evaluaties over hoe het met de hielpijn gaat/)
  assert.doesNotMatch(html, /producttip/)
  assert.match(html, /class="checkout-consent-reminder" aria-hidden="true">!<\/span>/)
  assert.match(client, /customer\.pain_evaluation_opt_in = customer\.pain_evaluation_opt_in === 'on'/)
  assert.match(edgeFunction, /customer\.pain_evaluation_opt_in = customer\.pain_evaluation_opt_in === true/)
  assert.match(painFunction, /customer\.pain_evaluation_opt_in !== true/)
  assert.match(migration, /pain_evaluation_opt_in_source/)
  assert.match(migration, /checkout_pain_evaluation/)
})
