import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { installLanguageChoice, translateEnglish } from '../src/language-core.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

test('language switching preserves form data, listeners, cart storage and payment return parameters', async () => {
  const dom = new JSDOM(read('contact/index.html'), { url: 'https://zolsolutions.nl/contact/?ref=order1&token=secret&partner=CLUB#form' })
  const { window: w } = dom
  const form = w.document.querySelector('form')
  form.elements.name.value = 'Anders'
  form.elements.email.value = 'customer@example.com'
  form.elements.message.value = 'Voorraad wordt gecontroleerd…'
  const before = [...new w.FormData(form)]
  w.localStorage.setItem('zol_cart_v1', '[{"variant_id":"v1","quantity":2,"price_cents":9995}]')
  let clicks = 0
  const original = w.document.querySelector('.menu-toggle')
  original.addEventListener('click', () => clicks++)
  const language = installLanguageChoice(w)
  language.setLanguage('en')
  assert.equal(w.document.documentElement.lang, 'en')
  assert.match(w.document.querySelector('h1').textContent, /conversation/)
  assert.deepEqual([...new w.FormData(form)], before)
  assert.match(w.localStorage.getItem('zol_cart_v1'), /"price_cents":9995/)
  assert.equal(new URL(w.location.href).searchParams.get('token'), 'secret')
  assert.equal(w.location.hash, '#form')
  original.click()
  assert.equal(clicks, 1)
  language.setLanguage('nl')
  assert.match(w.document.querySelector('h1').textContent, /gesprek/)
  assert.deepEqual([...new w.FormData(form)], before)
  language.disconnect(); w.close()
})

test('late stock updates, labels and errors translate and restore to the latest Dutch source', async () => {
  const { window: w } = new JSDOM('<body><p id="stock">Voorraad wordt gecontroleerd…</p><button id="buy">In winkelwagen</button></body>', { url: 'https://zolsolutions.nl/product/?lang=en&maat=38-39' })
  const language = installLanguageChoice(w)
  const stock = w.document.querySelector('#stock')
  assert.equal(stock.textContent, 'Checking stock…')
  stock.textContent = 'Nog maar 2 op voorraad — maat 38/39'
  w.document.querySelector('#buy').setAttribute('aria-label', 'Aantal verhogen')
  await tick()
  assert.equal(stock.textContent, 'Only 2 left in stock — size 38/39')
  assert.equal(w.document.querySelector('#buy').getAttribute('aria-label'), 'Increase quantity')
  language.setLanguage('nl')
  assert.equal(stock.textContent, 'Nog maar 2 op voorraad — maat 38/39')
  language.disconnect(); w.close()
})

test('English works with blocked storage and does not run in admin or private health surveys', () => {
  const { window: w } = new JSDOM('<h1>Kennisbank</h1>', { url: 'https://zolsolutions.nl/kennisbank/?lang=en' })
  Object.defineProperty(w, 'localStorage', { get() { throw new Error('blocked') } })
  const language = installLanguageChoice(w)
  assert.equal(w.document.querySelector('h1').textContent, 'Knowledge centre')
  language.setLanguage('nl')
  assert.equal(w.document.querySelector('h1').textContent, 'Kennisbank')
  language.disconnect(); w.close()
  for (const path of ['/admin/', '/zolsolutions/admin/', '/meting/']) {
    const dom = new JSDOM('<h1>Bestelling</h1>', { url: `https://zolsolutions.nl${path}?lang=en` })
    assert.equal(installLanguageChoice(dom.window), null)
    assert.equal(dom.window.document.querySelector('h1').textContent, 'Bestelling')
    dom.window.close()
  }
})

test('the real checkout sends identical order data in Dutch and English (mocked services only)', async () => {
  async function checkout(language) {
    const dom = new JSDOM(read('checkout/index.html'), { url: `https://zolsolutions.nl/checkout/?lang=${language}`, runScripts: 'outside-only' })
    const w = dom.window
    w.HTMLElement.prototype.scrollIntoView = () => {}
    const requests = []
    const cart = [{ product_id: 'p1', variant_id: 'v1', product_name: 'ZOL 3/4 inlegzolen', variant_name: 'M', quantity: 2, price_cents: 9995 }]
    w.getCart = () => cart
    w.clearCart = () => { throw new Error('Must not clear unpaid cart') }
    w.updateCartItem = () => {}
    w.formatMoney = cents => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)
    w.getPartnerAttributionCode = () => ''
    w.getSessionId = () => 'same-session'
    w.trackEvent = () => {}
    w.supabase = {
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
      functions: { invoke: async (name, { body }) => {
        if (body.action === 'quote') return { data: { subtotal_cents: 19990, shipping_cents: 0, total_cents: 17991, discount_cents: 1999, automatic: true, discount_title: '10% bundelkorting', payment_methods: [{ id: 'ideal' }] } }
        requests.push(body)
        return { error: { message: 'Test stopped before payment' } }
      } },
    }
    w.eval(read('src/checkout.js').replace(/^import .*$/gm, ''))
    await tick()
    const locale = installLanguageChoice(w)
    const form = w.document.querySelector('form')
    for (const [name, value] of Object.entries({ first_name: 'Anders', last_name: 'Test', email: 'customer@example.com', phone: '0612345678', street: 'Teststraat 1', postal_code: '1234 AB', city: 'Amsterdam', country: 'NL' })) {
      assert.ok(form.elements[name], name)
      form.elements[name].value = value
    }
    form.elements.discovery_source[0].checked = true
    form.elements.terms_accepted.checked = true
    assert.equal(form.checkValidity(), true)
    // Switch twice while filled; no reload and no data changes.
    locale.setLanguage(language === 'en' ? 'nl' : 'en')
    locale.setLanguage(language)
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }))
    await tick()
    assert.equal(requests.length, 1)
    if (language === 'en') {
      assert.match(w.document.querySelector('#checkout-summary').textContent, /Order summary/)
      assert.match(w.document.querySelector('#checkout-summary').textContent, /179\.91/)
    }
    locale.disconnect(); w.close()
    return JSON.parse(JSON.stringify(requests[0]))
  }
  assert.deepEqual(await checkout('en'), await checkout('nl'))
})

test('payment state messages retain their distinctions in English', () => {
  assert.equal(translateEnglish('Betaling gelukt'), 'Payment successful')
  assert.equal(translateEnglish('Betaling wordt verwerkt'), 'Payment is being processed')
  assert.equal(translateEnglish('Betaling niet afgerond'), 'Payment not completed')
  assert.equal(translateEnglish('Korting (CLUB10)'), 'Discount (CLUB10)')
})
