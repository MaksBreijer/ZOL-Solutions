import './checkout.css'
import { clearCart, getCart, updateCartItem } from './cart.js'
import { formatMoney, supabase } from './supabase-client.js'
import { trackEvent } from './site-runtime.js'

const cartElement = document.querySelector('#checkout-cart')
const summaryElement = document.querySelector('#checkout-summary')
const form = document.querySelector('#checkout-form')
const checkoutFlow = document.querySelector('.checkout-flow')
const discountInput = form.elements.discount_code
const discountButton = document.querySelector('#apply-discount')
const discountStatus = document.querySelector('#discount-status')
const { data: commerceSetting } = await supabase.from('settings').select('value').eq('key', 'commerce').eq('is_public', true).maybeSingle()
const commerce = commerceSetting?.value || { shipping_cents: 0, free_shipping_threshold_cents: 0, tax_rate: 21 }
const returnParams = new URLSearchParams(window.location.search)
const returnOrderId = returnParams.get('ref')
const returnToken = returnParams.get('token')
const linkedDiscountCode = String(returnParams.get('discount') || '').trim().toUpperCase().slice(0, 40)
let currentQuote = null
let quotedCart = ''
let quotedCode = null
let quoteRequest = 0

if (!returnOrderId) trackEvent('begin_checkout', { page: '/checkout/' })

function discountCode() {
  return String(discountInput.value || '').trim().toUpperCase().slice(0, 40)
}

function cartSignature(cart = getCart()) {
  return cart.map((item) => `${item.variant_id}:${item.quantity}`).sort().join('|')
}

function localTotals(cart) {
  const subtotalCents = cart.reduce((sum, item) => sum + item.price_cents * item.quantity, 0)
  const threshold = Number(commerce.free_shipping_threshold_cents || 0)
  const shippingCents = threshold > 0 && subtotalCents >= threshold ? 0 : Number(commerce.shipping_cents || 0)
  const taxRate = Number(commerce.tax_rate || 21)
  return {
    subtotal_cents: subtotalCents,
    shipping_cents: shippingCents,
    discount_cents: 0,
    tax_cents: Math.round(subtotalCents - subtotalCents / (1 + taxRate / 100)),
    total_cents: subtotalCents + shippingCents,
  }
}

function setDiscountStatus(message = '', type = '') {
  discountStatus.textContent = message
  discountStatus.className = type ? `is-${type}` : ''
}

async function functionErrorMessage(error, data, fallback) {
  if (data?.error) return data.error
  try {
    const response = error?.context?.clone ? error.context.clone() : error?.context
    const payload = await response?.json()
    if (payload?.error) return payload.error
  } catch { /* Fall back to the client message below. */ }
  return error?.message || fallback
}

function renderSummary(cart) {
  const code = discountCode()
  const hasCurrentQuote = currentQuote && quotedCart === cartSignature(cart) && quotedCode === code
  const totals = hasCurrentQuote ? currentQuote : localTotals(cart)
  const discountLabel = totals.discount_code
    ? `Korting (${totals.discount_code})`
    : totals.automatic && totals.discount_title ? `Automatische korting` : 'Korting'
  const paymentNote = commerce.mollie_enabled
    ? 'Na het plaatsen van je bestelling reken je veilig af in de betaalomgeving van Mollie.'
    : 'Je bestelling wordt veilig vastgelegd. ZOL neemt persoonlijk contact met je op over de betaling.'
  summaryElement.innerHTML = `<h2>Besteloverzicht</h2><div class="summary-line"><span>Subtotaal</span><strong>${formatMoney(totals.subtotal_cents)}</strong></div><div class="summary-line"><span>Verzending</span><strong>${totals.shipping_cents ? formatMoney(totals.shipping_cents) : 'Gratis'}</strong></div>${totals.discount_cents ? `<div class="summary-line summary-discount"><span>${discountLabel}</span><strong>− ${formatMoney(totals.discount_cents)}</strong></div>` : ''}<div class="summary-line"><span>Inclusief btw</span><strong>${formatMoney(totals.tax_cents)}</strong></div><div class="summary-line total"><span>Totaal</span><strong>${formatMoney(totals.total_cents)}</strong></div>${hasCurrentQuote && totals.discount_title ? `<p class="summary-saving"><span>✓</span>${totals.automatic ? 'Automatisch toegepast' : 'Kortingscode toegepast'}<strong>${totals.discount_title}</strong></p>` : ''}<p class="summary-note">${paymentNote}</p>`
}

async function requestQuote({ code = discountCode(), announce = true } = {}) {
  const cart = getCart()
  if (!cart.length) return false
  const normalizedCode = String(code || '').trim().toUpperCase().slice(0, 40)
  discountInput.value = normalizedCode
  const requestId = ++quoteRequest
  discountButton.disabled = true
  discountButton.textContent = 'Controleren…'
  if (announce) setDiscountStatus(normalizedCode ? 'Kortingscode controleren…' : 'Prijs opnieuw berekenen…')
  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: { action: 'quote', discount_code: normalizedCode, items: cart.map((item) => ({ variant_id: item.variant_id, quantity: item.quantity })) },
  })
  if (requestId !== quoteRequest) return false
  discountButton.disabled = false
  discountButton.textContent = 'Toepassen'
  if (error || data?.error) {
    currentQuote = null; quotedCart = ''; quotedCode = null
    renderSummary(cart)
    setDiscountStatus(await functionErrorMessage(error, data, 'De kortingscode kon niet worden gecontroleerd.'), 'error')
    return false
  }
  currentQuote = data
  quotedCart = cartSignature(cart)
  quotedCode = normalizedCode
  renderSummary(cart)
  if (data.discount_title) {
    const saving = data.discount_cents ? `${formatMoney(data.discount_cents)} korting` : 'geldig voor deze bestelling'
    setDiscountStatus(`${data.automatic ? 'Automatische korting' : `Code ${data.discount_code || normalizedCode}`} toegepast — ${saving}.`, 'success')
  } else if (normalizedCode) setDiscountStatus('De code is geldig, maar levert bij deze bestelling geen extra korting op.', 'success')
  else setDiscountStatus('')
  return true
}

function render() {
  const cart = getCart()
  if (!cart.length) {
    cartElement.innerHTML = `<section class="cart-block"><div class="empty-cart"><span>◇</span><h2>Je winkelwagen is leeg</h2><p>Kies eerst de juiste maat ZOL'tjes.</p><a href="/product/">Bekijk het product</a></div></section>`
    summaryElement.innerHTML = `<h2>Overzicht</h2><div class="summary-line total"><span>Totaal</span><strong>${formatMoney(0)}</strong></div>`
    form.hidden = true
    return
  }
  form.hidden = false
  cartElement.innerHTML = `<section class="cart-block"><header><span>01</span><div><h2>Winkelwagen</h2><p>Controleer de maat en het aantal.</p></div></header>${cart.map((item) => `<article class="checkout-cart-item"><img src="${item.image || '/images/zol-familie.jpg'}" alt="${item.product_name}"><div class="checkout-cart-copy"><h3>${item.product_name}</h3><p>${item.variant_name}</p><div class="cart-item-actions"><div class="quantity-control" aria-label="Aantal aanpassen"><button type="button" data-quantity="${item.variant_id}" data-step="-1" aria-label="Aantal verlagen">−</button><span aria-label="Aantal ${item.quantity}">${item.quantity}</span><button type="button" data-quantity="${item.variant_id}" data-step="1" aria-label="Aantal verhogen">+</button></div><button type="button" class="remove-cart" data-remove="${item.variant_id}" aria-label="${item.product_name} verwijderen">Verwijder</button></div></div><div class="checkout-cart-price"><strong>${formatMoney(item.price_cents * item.quantity)}</strong><small>${formatMoney(item.price_cents)} per paar</small></div></article>`).join('')}</section>`
  renderSummary(cart)
}

async function renderPaymentReturn() {
  checkoutFlow.innerHTML = `<section class="cart-block"><div class="checkout-success"><span>…</span><h2>Betaling controleren</h2><p>Een ogenblik, we controleren de actuele betaalstatus.</p></div></section>`
  summaryElement.innerHTML = `<h2>Controleren</h2><p class="summary-note">Sluit deze pagina nog niet.</p>`
  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: { action: 'status', order_id: returnOrderId, token: returnToken },
  })
  if (error || data?.error) {
    checkoutFlow.innerHTML = `<section class="cart-block"><div class="checkout-success checkout-success--error"><span>!</span><h2>Status niet beschikbaar</h2><p>We konden de betaling niet automatisch controleren. Neem contact op met ZOL en vermeld je bestelnummer.</p><a href="/contact/">Neem contact op</a></div></section>`
    summaryElement.innerHTML = `<h2>Hulp nodig?</h2><p class="summary-note">We zoeken je bestelling graag persoonlijk voor je op.</p>`
    return
  }

  const status = data.payment_status
  const successful = ['paid', 'authorized'].includes(status)
  const processing = ['open', 'pending'].includes(status)
  const retryable = ['failed', 'cancelled', 'expired'].includes(status)
  if (successful || processing) clearCart()

  const title = successful ? 'Betaling gelukt' : processing ? 'Betaling wordt verwerkt' : retryable ? 'Betaling niet afgerond' : 'Bestelling ontvangen'
  const message = successful
    ? 'Bedankt! Je bestelling is betaald en staat klaar voor verwerking.'
    : processing
      ? 'De betaalstatus is nog niet definitief. ZOL verwerkt je bestelling zodra Mollie de betaling bevestigt.'
      : 'Je bestelling bestaat nog, maar de betaling is niet gelukt of afgebroken. Je kunt de betaling veilig opnieuw starten.'
  const action = retryable ? '<button class="checkout-retry" type="button">Opnieuw betalen →</button>' : '<a href="/">Terug naar ZOL Solutions</a>'
  checkoutFlow.innerHTML = `<section class="cart-block"><div class="checkout-success"><span>${successful ? '✓' : processing ? '…' : '!'}</span><h2>${title}</h2><p>${message}</p>${action}</div></section>`
  summaryElement.innerHTML = `<h2>Bestelling #${data.order_number}</h2>${data.subtotal_cents != null ? `<div class="summary-line"><span>Subtotaal</span><strong>${formatMoney(data.subtotal_cents)}</strong></div><div class="summary-line"><span>Verzending</span><strong>${data.shipping_cents ? formatMoney(data.shipping_cents) : 'Gratis'}</strong></div>${data.discount_cents ? `<div class="summary-line summary-discount"><span>Korting${data.discount_code ? ` (${data.discount_code})` : ''}</span><strong>− ${formatMoney(data.discount_cents)}</strong></div>` : ''}` : ''}<div class="summary-line total"><span>Totaal</span><strong>${formatMoney(data.total_cents)}</strong></div><p class="summary-note">Bewaar dit bestelnummer voor vragen over je bestelling.</p>`

  checkoutFlow.querySelector('.checkout-retry')?.addEventListener('click', async (event) => {
    const button = event.currentTarget
    button.disabled = true
    button.textContent = 'Betaallink openen…'
    const { data: retry, error: retryError } = await supabase.functions.invoke('create-checkout', {
      body: { action: 'retry', order_id: returnOrderId, token: returnToken },
    })
    if (!retryError && retry?.checkout_url) window.location.href = retry.checkout_url
    else {
      button.disabled = false
      button.textContent = 'Opnieuw betalen →'
      checkoutFlow.querySelector('.checkout-success p').textContent = retry?.error || 'Opnieuw betalen is niet gelukt. Neem contact op met ZOL.'
    }
  })
}

cartElement.addEventListener('click', (event) => {
  const quantity = event.target.closest('[data-quantity]')
  const remove = event.target.closest('[data-remove]')
  if (quantity) {
    const item = getCart().find((entry) => entry.variant_id === quantity.dataset.quantity)
    if (item) updateCartItem(item.variant_id, item.quantity + Number(quantity.dataset.step))
  }
  if (remove) updateCartItem(remove.dataset.remove, 0)
})

discountButton.addEventListener('click', () => { void requestQuote() })
discountInput.addEventListener('input', () => {
  const upper = discountInput.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40)
  if (discountInput.value !== upper) discountInput.value = upper
  if (quotedCode !== discountCode()) {
    currentQuote = null; quotedCart = ''; quotedCode = null
    renderSummary(getCart())
    setDiscountStatus(discountCode() ? 'Klik op toepassen om je code te controleren.' : '')
  }
})
discountInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); void requestQuote() }
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const cart = getCart()
  if (!cart.length) return
  const button = form.querySelector('[type="submit"]')
  const status = document.querySelector('#checkout-status')
  button.disabled = true; button.innerHTML = 'Bestelling verwerken…'; status.textContent = ''; status.classList.remove('is-error')
  const customer = Object.fromEntries(new FormData(form))
  const discountCode = String(customer.discount_code || '').trim().toUpperCase()
  delete customer.discount_code
  const quoteIsCurrent = currentQuote && quotedCart === cartSignature(cart) && quotedCode === discountCode
  if (!quoteIsCurrent && !await requestQuote({ code: discountCode, announce: false })) {
    status.textContent = discountCode ? 'Controleer eerst de kortingscode hierboven.' : 'De actuele prijs kon niet worden gecontroleerd. Probeer het opnieuw.'
    status.classList.add('is-error'); button.disabled = false; button.innerHTML = 'Bestelling plaatsen <span>→</span>'; return
  }
  const sessionId = sessionStorage.getItem('zol_session_id') || crypto.randomUUID()
  const { data, error } = await supabase.functions.invoke('create-checkout', { body: { customer, discount_code: discountCode, note: customer.note, session_id: sessionId, items: cart.map((item) => ({ variant_id: item.variant_id, quantity: item.quantity })) } })
  if (error || data?.error) {
    status.textContent = await functionErrorMessage(error, data, 'Afrekenen is niet gelukt.'); status.classList.add('is-error'); button.disabled = false; button.innerHTML = 'Bestelling plaatsen <span>→</span>'; return
  }
  if (data.checkout_url) { window.location.href = data.checkout_url; return }
  clearCart()
  document.querySelector('.checkout-flow').innerHTML = `<section class="cart-block"><div class="checkout-success"><span>✓</span><h2>Bestelling #${data.order_number} is ontvangen</h2><p>Je bestelling staat veilig in ZOL Admin. Online betalen wordt geactiveerd zodra Mollie is gekoppeld; ZOL neemt tot die tijd persoonlijk contact met je op over de betaling.</p><a href="/">Terug naar ZOL Solutions</a></div></section>`
  summaryElement.innerHTML = `<h2>Ontvangen</h2>${data.discount_cents ? `<div class="summary-line"><span>Korting ${data.discount_code ? `(${data.discount_code})` : ''}</span><strong>− ${formatMoney(data.discount_cents)}</strong></div>` : ''}<div class="summary-line total"><span>Totaal</span><strong>${formatMoney(data.total_cents)}</strong></div><p class="summary-note">Bewaar bestelnummer #${data.order_number} voor vragen over je bestelling.</p>`
})

window.addEventListener('zol:cart', () => { render(); if (getCart().length) void requestQuote({ code: discountCode(), announce: false }) })
if (returnOrderId && returnToken) renderPaymentReturn()
else {
  if (linkedDiscountCode) discountInput.value = linkedDiscountCode
  render()
  if (getCart().length) void requestQuote({ code: linkedDiscountCode, announce: Boolean(linkedDiscountCode) })
}
