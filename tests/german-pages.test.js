import test from 'node:test'
import assert from 'node:assert/strict'
import { createGermanTranslator } from '../src/german-dynamic.js'
import { dutchPathFor, germanPathFor, isGermanPath } from '../src/german-routes.js'

test('German routes map both ways and unknown pages have no German version', () => {
  assert.equal(germanPathFor('/product'), '/de/produkt/')
  assert.equal(dutchPathFor('/de/produkt/'), '/product/')
  assert.equal(germanPathFor('/kennismaking/'), null)
  assert.equal(isGermanPath('/de'), true)
  assert.equal(isGermanPath('/design/'), false)
})

test('German translator keeps spacing and handles changing values', () => {
  const translate = createGermanTranslator({ Winkelwagen: 'Warenkorb' })
  assert.equal(translate('  Winkelwagen\n'), '  Warenkorb\n')
  assert.equal(translate('Nog maar 2 op voorraad — maat 36/37'), 'Nur noch 2 verfügbar — Größe 36/37')
  assert.equal(translate('Onbekend'), 'Onbekend')
})
