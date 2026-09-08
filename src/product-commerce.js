import { addToCart, bindCartCounters } from './cart.js'
import { formatMoney, supabase } from './supabase-client.js'
import { trackEvent } from './site-runtime.js'

bindCartCounters()

const purchase = document.querySelector('.product-purchase')

async function initializeProductCommerce() {
  if (!purchase) return
  const selector = purchase.querySelector('.size-selector')
  const price = purchase.querySelector('.product-price')
  const addButton = purchase.querySelector('#add-to-cart')
  const buyButton = purchase.querySelector('#buy-now')
  const quantityInput = purchase.querySelector('#product-quantity')
  const bundleInputs = [...purchase.querySelectorAll('input[name="bundle"]')]
  const bundlePriceOne = purchase.querySelector('[data-bundle-price="1"]')
  const bundlePriceTwo = purchase.querySelector('[data-bundle-price="2"]')
  const bundleOriginal = purchase.querySelector('[data-bundle-original]')
  const stockStatus = purchase.querySelector('[data-stock-status]')
  const stockAlertForm = purchase.querySelector('[data-stock-alert]')
  const stockAlertTitle = purchase.querySelector('[data-stock-alert-title]')
  const stockAlertMessage = purchase.querySelector('[data-stock-alert-message]')
  const paymentSupport = purchase.querySelector('[data-payment-support]')
  let product = null
  let productLoadPromise = null
  let loadAttempts = 0

  const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

  function showProductStatus(message, state = '') {
    if (!stockStatus) return
    stockStatus.textContent = message
    stockStatus.className = `stock-status${state ? ` is-${state}` : ''}`
  }

  function renderPaymentSupport(methods = []) {
    if (!paymentSupport) return
    const list = paymentSupport.querySelector('.product-payment-methods')
    const visibleMethods = methods.filter((method) => method.id !== 'applepay' || (window.ApplePaySession && window.ApplePaySession.canMakePayments()))
    if (!visibleMethods.length) {
      paymentSupport.hidden = true
      return
    }
    list.replaceChildren(...visibleMethods.map((method) => {
      const badge = document.createElement('i')
      badge.className = `product-payment-method product-payment-method--${method.id}`
      badge.title = method.description || method.id
      const source = String(method.image || '')
      if (source.startsWith('https://')) {
        const image = document.createElement('img')
        image.src = source
        image.alt = method.description || method.id
        image.loading = 'lazy'
        image.addEventListener('error', () => { badge.textContent = method.description || method.id }, { once: true })
        badge.append(image)
      } else badge.textContent = method.description || method.id
      return badge
    }))
  }

  async function loadPaymentSupport(variant) {
    if (!variant || !paymentSupport) return
    const { data } = await supabase.functions.invoke('create-checkout', {
      body: { action: 'quote', items: [{ variant_id: variant.id, quantity: 1 }] },
    })
    renderPaymentSupport(data?.payment_methods || [])
  }

  function selectedVariant() {
    const variantId = selector.querySelector('input[name="size"]:checked')?.value
    return product?.product_variants?.find((item) => item.id === variantId) || null
  }

  function unitPrice() {
    const variant = selectedVariant()
    return variant?.price_cents ?? product?.price_cents ?? 9995
  }

  function renderBundlePrices() {
    const currentUnitPrice = unitPrice()
    const originalBundlePrice = currentUnitPrice * 2
    const discountedBundlePrice = originalBundlePrice - Math.round(originalBundlePrice * 0.1)
    const selectedQuantity = bundleInputs.find((input) => input.checked)?.value === '2' ? 2 : 1
    const selectedPrice = selectedQuantity === 2 ? discountedBundlePrice : currentUnitPrice
    if (price) price.innerHTML = `${formatMoney(selectedPrice)} <span>incl. btw</span>`
    if (bundlePriceOne) bundlePriceOne.textContent = formatMoney(currentUnitPrice)
    if (bundlePriceTwo) bundlePriceTwo.textContent = formatMoney(discountedBundlePrice)
    if (bundleOriginal) bundleOriginal.textContent = formatMoney(originalBundlePrice)
  }

  function selectBundle(input) {
    const quantity = input?.value === '2' ? 2 : 1
    if (quantityInput) quantityInput.value = String(quantity)
    purchase.querySelectorAll('.bundle-option').forEach((option) => {
      option.classList.toggle('is-selected', option.contains(input))
    })
  }

  function renderStockState() {
    const variant = selectedVariant()
    const stock = Math.max(0, Number(variant?.stock) || 0)
    const available = Boolean(variant && stock > 0)
    const bundleOne = bundleInputs.find((input) => input.value === '1')
    const bundleTwo = bundleInputs.find((input) => input.value === '2')

    if (stockStatus) {
      stockStatus.className = `stock-status ${stock > 4 ? 'is-available' : stock > 0 ? 'is-low' : 'is-unavailable'}`
      if (!variant) stockStatus.textContent = 'Deze maten zijn momenteel uitverkocht.'
      else if (stock > 4) stockStatus.textContent = `Op voorraad — maat ${variant.shoe_size || variant.size}`
      else if (stock > 0) stockStatus.textContent = `Nog maar ${stock} op voorraad — maat ${variant.shoe_size || variant.size}`
      else stockStatus.textContent = `Maat ${variant.shoe_size || variant.size} is uitverkocht.`
    }

    if (bundleTwo) {
      bundleTwo.disabled = stock < 2
      const option = bundleTwo.closest('.bundle-option')
      option?.classList.toggle('is-unavailable', stock < 2)
      if (option) option.title = stock < 2 ? 'Voor deze maat zijn geen twee paar meer beschikbaar.' : ''
      if (bundleTwo.checked && bundleTwo.disabled && bundleOne) {
        bundleOne.checked = true
        selectBundle(bundleOne)
        renderBundlePrices()
      }
    }

    if (addButton) addButton.disabled = !available
    if (buyButton) buyButton.disabled = !available

    if (stockAlertForm) {
      const shouldShowAlert = Boolean(variant && stock < 1)
      const previousVariantId = stockAlertForm.dataset.variantId || ''
      stockAlertForm.hidden = !shouldShowAlert
      stockAlertForm.dataset.variantId = shouldShowAlert ? variant.id : ''
      if (stockAlertTitle && shouldShowAlert) stockAlertTitle.textContent = `Ontvang een seintje voor maat ${variant.shoe_size || variant.size}`
      if (previousVariantId !== stockAlertForm.dataset.variantId) {
        stockAlertForm.classList.remove('is-success')
        if (stockAlertMessage) {
          stockAlertMessage.textContent = ''
          stockAlertMessage.className = 'stock-alert-message'
        }
      }
    }
  }

  function renderVariantSelector(preferredVariantId = '') {
    const variants = (product?.product_variants || []).filter((variant) => variant.active).sort((a, b) => a.sort_order - b.sort_order)
    const preferred = variants.find((variant) => variant.id === preferredVariantId)
    const selected = preferred || variants.find((variant) => variant.stock > 0) || variants[0]
    selector.innerHTML = `<legend>Kies een maat <a href="#maatadvies">Maatadvies</a></legend>${variants.map((variant) => {
      const stock = Math.max(0, Number(variant.stock) || 0)
      const unavailable = stock < 1
      return `<label class="${unavailable ? 'is-unavailable' : ''}" title="${unavailable ? `Maat ${variant.shoe_size || variant.size} is uitverkocht — kies deze maat voor een voorraadmelding` : ''}"><input type="radio" name="size" value="${variant.id}" ${variant.id === selected?.id ? 'checked' : ''} aria-label="Maat ${variant.size}, schoenmaat ${variant.shoe_size}${unavailable ? ', uitverkocht' : ''}"><span>${variant.size}<small>${variant.shoe_size}</small></span></label>`
    }).join('')}`
    renderBundlePrices()
    renderStockState()
    return selected || variants[0] || null
  }

  async function fetchProduct() {
    const request = supabase.from('products').select('*, product_variants(*)').eq('slug', 'zol-inlegzolen').eq('active', true).single()
    const timeout = new Promise((resolve) => {
      window.setTimeout(() => resolve({ data: null, error: new Error('Voorraad laden duurde te lang.') }), 6500)
    })
    return Promise.race([request, timeout])
  }

  async function loadProduct() {
    if (product) return product
    if (productLoadPromise) return productLoadPromise

    productLoadPromise = (async () => {
      showProductStatus(loadAttempts ? 'Voorraad opnieuw laden…' : 'Voorraad wordt gecontroleerd…')
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        loadAttempts += 1
        try {
          const { data, error } = await fetchProduct()
          if (error || !data) throw error || new Error('Product niet gevonden.')

          product = data
          if (price) price.innerHTML = `${formatMoney(product.price_cents)} <span>incl. btw</span>`
          if (product.description) {
            const summary = purchase.querySelector('.product-summary')
            if (summary) summary.textContent = product.description
          }
          const requestedSize = new URLSearchParams(window.location.search).get('maat')?.replace('-', '/') || ''
          const requestedVariant = (product.product_variants || []).find((variant) => variant.shoe_size === requestedSize)
          const selected = renderVariantSelector(requestedVariant?.id)
          if (selected?.stock > 0) void loadPaymentSupport(selected)

          const inventoryChannel = supabase.channel(`product-inventory-${product.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'product_variants', filter: `product_id=eq.${product.id}` }, ({ new: updatedVariant }) => {
              const selectedId = selector.querySelector('input[name="size"]:checked')?.value || ''
              product.product_variants = (product.product_variants || []).map((variant) => variant.id === updatedVariant.id ? { ...variant, ...updatedVariant } : variant)
              const selectedAfterUpdate = renderVariantSelector(selectedId)
              if (selectedAfterUpdate?.stock > 0 && (selectedAfterUpdate.id !== selectedId || updatedVariant.id === selectedAfterUpdate.id)) void loadPaymentSupport(selectedAfterUpdate)
            })
            .subscribe()
          window.addEventListener('pagehide', () => { void supabase.removeChannel(inventoryChannel) }, { once: true })
          return product
        } catch (error) {
          trackEvent('product_load_error', { attempt, message: String(error?.message || error).slice(0, 160) })
          if (attempt < 3) await wait(attempt * 350)
        }
      }

      showProductStatus('De voorraad kon niet worden geladen. Tik op een bestelknop om het opnieuw te proberen.', 'unavailable')
      return null
    })()

    const result = await productLoadPromise
    productLoadPromise = null
    return result
  }

  function selectedItem() {
    const variant = selectedVariant()
    if (!product || !variant || variant.stock < 1) return null
    return {
      product_id: product.id,
      variant_id: variant.id,
      product_name: product.name,
      variant_name: variant.title,
      size: variant.size,
      shoe_size: variant.shoe_size,
      sku: variant.sku,
      image: Array.isArray(product.images) ? product.images[0] : '',
      price_cents: variant.price_cents ?? product.price_cents,
      quantity: Math.min(variant.stock, 10, Math.max(1, Number(quantityInput?.value) || 1)),
    }
  }

  async function add(direct = false) {
    if (!product) {
      showProductStatus('Een moment, de voorraad wordt geladen…')
      const loadedProduct = await loadProduct()
      if (!loadedProduct) {
        trackEvent('product_add_blocked', { reason: 'product_load_failed', direct })
        return
      }
    }
    const item = selectedItem()
    if (!item) {
      showProductStatus('Kies een beschikbare maat om verder te gaan.', 'unavailable')
      trackEvent('product_add_blocked', { reason: 'no_available_variant', direct })
      return
    }
    addToCart(item)
    trackEvent('add_to_cart', {
      product_id: item.product_id,
      variant_id: item.variant_id,
      item_name: item.product_name,
      item_variant: item.shoe_size || item.variant_name,
      sku: item.sku,
      price_cents: item.price_cents,
      quantity: item.quantity,
      currency: 'EUR',
      value: (item.price_cents * item.quantity) / 100,
    })
    if (direct) window.location.assign('/checkout/')
    else {
      addButton.textContent = 'Toegevoegd ✓'
      window.setTimeout(() => { addButton.textContent = 'In winkelwagen' }, 1600)
    }
  }

  bundleInputs.forEach((input) => input.addEventListener('change', () => {
    selectBundle(input)
    renderBundlePrices()
  }))
  selector?.addEventListener('change', () => {
    renderStockState()
    renderBundlePrices()
    const variant = selectedVariant()
    if (variant?.stock > 0) void loadPaymentSupport(variant)
  })
  stockAlertForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const variant = selectedVariant()
    const emailInput = stockAlertForm.elements.email
    const button = stockAlertForm.querySelector('[type="submit"]')
    const email = String(emailInput?.value || '').trim().toLowerCase()
    if (!variant || variant.stock > 0) {
      if (stockAlertMessage) {
        stockAlertMessage.textContent = 'Deze maat is inmiddels weer op voorraad.'
        stockAlertMessage.className = 'stock-alert-message is-success'
      }
      renderStockState()
      return
    }
    if (!emailInput?.checkValidity()) {
      emailInput?.focus()
      if (stockAlertMessage) {
        stockAlertMessage.textContent = 'Vul een geldig e-mailadres in.'
        stockAlertMessage.className = 'stock-alert-message is-error'
      }
      return
    }

    button.disabled = true
    button.textContent = 'Aanmelden…'
    if (stockAlertMessage) {
      stockAlertMessage.textContent = ''
      stockAlertMessage.className = 'stock-alert-message'
    }
    const { data, error } = await supabase.functions.invoke('stock-alert', {
      body: {
        email,
        variant_id: variant.id,
        source: 'product_page',
        company: String(stockAlertForm.elements.company?.value || ''),
      },
    })
    button.disabled = false
    button.textContent = 'Laat het mij weten'
    if (error || data?.error) {
      if (stockAlertMessage) {
        stockAlertMessage.textContent = data?.error || 'Aanmelden lukt nu niet. Probeer het straks opnieuw.'
        stockAlertMessage.className = 'stock-alert-message is-error'
      }
      trackEvent('stock_alert_error', { variant_id: variant.id, item_variant: variant.shoe_size || variant.size })
      return
    }

    stockAlertForm.classList.add('is-success')
    if (stockAlertMessage) {
      stockAlertMessage.textContent = data?.already_subscribed
        ? 'Je staat al op de lijst voor deze maat. We laten het weten zodra hij er weer is.'
        : 'Gelukt! We mailen je één keer zodra deze maat weer op voorraad is.'
      stockAlertMessage.className = 'stock-alert-message is-success'
    }
    trackEvent('stock_alert_subscribed', { variant_id: variant.id, item_variant: variant.shoe_size || variant.size })
  })
  selectBundle(bundleInputs.find((input) => input.checked))
  renderBundlePrices()
  addButton?.addEventListener('click', () => { void add(false) })
  buyButton?.addEventListener('click', () => { void add(true) })
  await loadProduct()
}

void initializeProductCommerce()
