// Meta-pixel (dataset "ZOL website"). Laadt alleen na toestemming via de cookiemelding,
// net als Google Analytics. Geen inline scripts: de CSP staat die niet toe.
export const META_PIXEL_ID = '1133146106361727'

let initialized = false
let enabled = false

function ensureFbq() {
  if (window.fbq) return
  const fbq = function (...args) {
    if (fbq.callMethod) fbq.callMethod(...args)
    else fbq.queue.push(args)
  }
  fbq.push = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []
  window.fbq = fbq
  if (!window._fbq) window._fbq = fbq
}

export function enableMetaPixel() {
  ensureFbq()
  if (!initialized) {
    const script = document.createElement('script')
    script.async = true
    script.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.append(script)
    window.fbq('consent', 'grant')
    window.fbq('init', META_PIXEL_ID)
    initialized = true
  } else {
    window.fbq('consent', 'grant')
  }
  enabled = true
}

export function disableMetaPixel() {
  enabled = false
  if (typeof window.fbq === 'function') window.fbq('consent', 'revoke')
  try {
    for (const name of ['_fbp', '_fbc']) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.zolsolutions.nl; SameSite=Lax`
    }
  } catch { /* Cookietoegang kan geblokkeerd zijn. */ }
}

function commerce(metadata = {}) {
  const items = Array.isArray(metadata.items) && metadata.items.length ? metadata.items : [metadata]
  const contents = items.map((item) => ({
    id: String(item.sku || item.variant_id || item.product_id || 'zol-inlegzolen'),
    quantity: Math.max(1, Number(item.quantity) || 1),
    item_price: Number(item.price ?? item.price_cents / 100) || 99.95,
  }))
  const itemValue = contents.reduce((sum, item) => sum + item.item_price * item.quantity, 0)
  return {
    currency: metadata.currency || 'EUR',
    value: Number(metadata.value ?? metadata.total_cents / 100) || itemValue,
    content_type: 'product',
    content_ids: contents.map((item) => item.id),
    contents,
    num_items: contents.reduce((sum, item) => sum + item.quantity, 0),
  }
}

const STANDARD_EVENTS = {
  page_view: 'PageView',
  product_view: 'ViewContent',
  add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  payment_method_selected: 'AddPaymentInfo',
  partner_order_paid: 'Purchase',
  contact_submit: 'Lead',
}

export function trackMetaPixelEvent(eventName, metadata = {}) {
  if (!enabled || typeof window.fbq !== 'function') return
  const metaEvent = STANDARD_EVENTS[eventName]
  if (!metaEvent) return
  if (metaEvent === 'PageView') { window.fbq('track', 'PageView'); return }
  if (metaEvent === 'Lead') { window.fbq('track', 'Lead'); return }
  const options = metaEvent === 'Purchase' && metadata.order_number
    ? { eventID: `order-${metadata.order_number}` }
    : undefined
  window.fbq('track', metaEvent, commerce(metadata), options)
}
