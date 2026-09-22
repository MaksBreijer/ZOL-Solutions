import test from 'node:test'
import assert from 'node:assert/strict'

function createStorage() {
  const values = new Map()
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, String(value)) },
  }
}

test('buy now replaces the selected cart item quantity instead of adding another pair', async (t) => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousCustomEvent = globalThis.CustomEvent
  t.after(() => {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.CustomEvent = previousCustomEvent
  })
  const localStorage = createStorage()
  globalThis.window = {
    localStorage,
    sessionStorage: createStorage(),
    dispatchEvent() {},
    addEventListener() {},
  }
  globalThis.document = { documentElement: { dataset: {} }, querySelectorAll: () => [] }
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail } }

  const cart = await import(`../src/cart.js?test=${Date.now()}`)
  cart.addToCart({ variant_id: 'xs', quantity: 1, price_cents: 9995 })
  cart.setCartItem({ variant_id: 'xs', quantity: 1, price_cents: 9995 })

  assert.deepEqual(cart.getCart(), [{ variant_id: 'xs', quantity: 1, price_cents: 9995 }])
})
