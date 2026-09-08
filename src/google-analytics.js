export const GOOGLE_ANALYTICS_MEASUREMENT_ID = 'G-QGJTSYHRH1'

const scriptId = 'zol-google-analytics'
const disableKey = `ga-disable-${GOOGLE_ANALYTICS_MEASUREMENT_ID}`
let initialized = false
let enabled = false

function googleTag() {
  window.dataLayer = window.dataLayer || []
  // Houd exact dezelfde commandovorm aan als Google's officiële gtag-snippet.
  window.dataLayer.push(arguments)
}

function debugMode() {
  return new URLSearchParams(window.location.search).get('ga_debug') === '1'
}

function deleteAnalyticsCookies() {
  try {
    const cookieNames = document.cookie
      .split('; ')
      .map((entry) => entry.split('=')[0])
      .filter((name) => name === '_ga' || name.startsWith('_ga_'))

    for (const name of cookieNames) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.zolsolutions.nl; SameSite=Lax`
    }
  } catch {
    // Sommige privacy-instellingen blokkeren cookietoegang volledig.
  }
}

function consentState(analyticsStorage) {
  return {
    analytics_storage: analyticsStorage,
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  }
}

export function enableGoogleAnalytics() {
  window[disableKey] = false
  window.gtag = window.gtag || googleTag

  if (!initialized) {
    window.gtag('consent', 'default', { ...consentState('denied'), wait_for_update: 500 })

    const script = document.createElement('script')
    script.id = scriptId
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_ANALYTICS_MEASUREMENT_ID)}`
    document.head.append(script)

    window.gtag('js', new Date())
    window.gtag('config', GOOGLE_ANALYTICS_MEASUREMENT_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      debug_mode: debugMode(),
    })
    initialized = true
  }

  window.gtag('consent', 'update', consentState('granted'))
  enabled = true
}

export function disableGoogleAnalytics() {
  enabled = false
  window[disableKey] = true
  if (typeof window.gtag === 'function') window.gtag('consent', 'update', consentState('denied'))
  deleteAnalyticsCookies()
}

function commerceItem(metadata = {}) {
  return {
    item_id: metadata.sku || metadata.variant_id || metadata.product_id || 'zol-inlegzolen',
    item_name: metadata.item_name || 'ZOL 3/4 inlegzolen',
    item_variant: metadata.item_variant || metadata.shoe_size || metadata.size || undefined,
    price: Number(metadata.price ?? metadata.price_cents / 100) || 99.95,
    quantity: Math.max(1, Number(metadata.quantity) || 1),
  }
}

function ecommerceParameters(metadata = {}) {
  const items = Array.isArray(metadata.items) && metadata.items.length
    ? metadata.items.map((item) => commerceItem(item))
    : [commerceItem(metadata)]
  const itemValue = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  return {
    currency: metadata.currency || 'EUR',
    value: Number(metadata.value ?? metadata.total_cents / 100) || itemValue,
    items,
  }
}

export function trackGoogleAnalyticsEvent(eventName, metadata = {}) {
  if (!enabled || typeof window.gtag !== 'function') return
  const diagnostics = debugMode() ? { debug_mode: true } : {}

  if (eventName === 'page_view') {
    window.gtag('event', 'page_view', {
      ...diagnostics,
      page_title: document.title,
      page_location: window.location.href,
      page_path: `${window.location.pathname}${window.location.search}`,
    })
    return
  }

  if (eventName === 'product_view') {
    window.gtag('event', 'view_item', { ...diagnostics, ...ecommerceParameters(metadata) })
    return
  }

  if (eventName === 'add_to_cart' || eventName === 'begin_checkout') {
    window.gtag('event', eventName, { ...diagnostics, ...ecommerceParameters(metadata) })
    return
  }

  if (eventName === 'payment_method_selected') {
    window.gtag('event', 'add_payment_info', {
      ...diagnostics,
      payment_type: metadata.method || '',
      ...ecommerceParameters(metadata),
    })
    return
  }

  if (eventName === 'partner_order_paid') {
    window.gtag('event', 'purchase', {
      ...diagnostics,
      transaction_id: String(metadata.order_number || ''),
      shipping: Number(metadata.shipping_cents || 0) / 100,
      tax: Number(metadata.tax_cents || 0) / 100,
      coupon: metadata.discount_code || undefined,
      ...ecommerceParameters(metadata),
    })
    return
  }

  if (eventName === 'contact_submit') {
    window.gtag('event', 'generate_lead', { ...diagnostics, lead_source: metadata.topic || 'contact' })
    return
  }

  if (eventName === 'cta_click') {
    window.gtag('event', 'select_content', {
      ...diagnostics,
      content_type: 'website_cta',
      item_id: String(metadata.label || 'cta').slice(0, 100),
      link_url: String(metadata.destination || '').slice(0, 300),
    })
  }
}
