import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Google Analytics only loads after analytics consent and keeps advertising storage disabled', async () => {
  const [analytics, runtime, consent, privacy] = await Promise.all([
    readFile(new URL('../src/google-analytics.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/site-runtime.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/cookie-consent.js', import.meta.url), 'utf8'),
    readFile(new URL('../privacy/index.html', import.meta.url), 'utf8'),
  ])

  assert.match(analytics, /G-QGJTSYHRH1/)
  assert.match(analytics, /googletagmanager\.com\/gtag\/js/)
  assert.match(analytics, /analytics_storage: analyticsStorage/)
  assert.match(analytics, /ad_storage: 'denied'/)
  assert.match(analytics, /allow_google_signals: false/)
  assert.match(analytics, /window\.dataLayer\.push\(arguments\)/)
  assert.match(analytics, /debug_mode: debugMode\(\)/)
  assert.match(runtime, /if \(!hasAnalyticsConsent\(\)\) return/)
  assert.match(runtime, /enableGoogleAnalytics\(\)/)
  assert.match(runtime, /disableGoogleAnalytics\(\)/)
  assert.match(consent, /Google Analytics/)
  assert.match(privacy, /<strong>Google Analytics<\/strong>/)
})

test('recommended ecommerce events include purchase value and transaction id', async () => {
  const [analytics, checkout, product] = await Promise.all([
    readFile(new URL('../src/google-analytics.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/checkout.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/product-commerce.js', import.meta.url), 'utf8'),
  ])

  assert.match(analytics, /'view_item'/)
  assert.match(analytics, /eventName === 'add_to_cart' \|\| eventName === 'begin_checkout'/)
  assert.match(analytics, /'purchase'/)
  assert.match(analytics, /transaction_id:/)
  assert.match(checkout, /items: analyticsItems\(purchasedCart\)/)
  assert.match(product, /item_variant: item\.shoe_size/)
})

test('the Google tag is created on consent and records a page view without ad consent', async () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const appendedScripts = []
  const windowMock = {
    dataLayer: [],
    location: {
      href: 'https://zolsolutions.nl/product/?utm_source=test',
      pathname: '/product/',
      search: '?utm_source=test',
    },
  }
  const documentMock = {
    cookie: '',
    title: "De ZOL'tjes — ZOL Solutions",
    createElement: () => ({}),
    head: { append: (script) => appendedScripts.push(script) },
  }

  globalThis.window = windowMock
  globalThis.document = documentMock
  try {
    const analytics = await import(`../src/google-analytics.js?test=${Date.now()}`)
    analytics.enableGoogleAnalytics()
    analytics.trackGoogleAnalyticsEvent('page_view')

    assert.equal(appendedScripts.length, 1)
    assert.match(appendedScripts[0].src, /G-QGJTSYHRH1/)
    assert.deepEqual([...windowMock.dataLayer[0]].slice(0, 2), ['consent', 'default'])
    assert.equal(windowMock.dataLayer[0][2].ad_storage, 'denied')
    assert.ok(windowMock.dataLayer.some((entry) => entry[0] === 'event' && entry[1] === 'page_view'))

    analytics.disableGoogleAnalytics()
    assert.equal(windowMock['ga-disable-G-QGJTSYHRH1'], true)
    assert.deepEqual([...windowMock.dataLayer.at(-1)].slice(0, 2), ['consent', 'update'])
    assert.equal(windowMock.dataLayer.at(-1)[2].analytics_storage, 'denied')
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})

test('the content security policy permits the Google tag and analytics collection endpoints', async () => {
  const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8')

  assert.match(headers, /script-src[^;]+https:\/\/www\.googletagmanager\.com/)
  assert.match(headers, /connect-src[^;]+https:\/\/www\.google-analytics\.com/)
  assert.match(headers, /connect-src[^;]+https:\/\/region1\.google-analytics\.com/)
})
