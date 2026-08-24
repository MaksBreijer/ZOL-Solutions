import { addToCart, bindCartCounters } from './cart.js'
import { formatMoney, supabase } from './supabase-client.js'
import { trackEvent } from './site-runtime.js'

bindCartCounters()

const purchase = document.querySelector('.product-purchase')

if (purchase) {
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
  const paymentSupport = purchase.querySelector('[data-payment-support]')
  let product = null

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
  }

  const { data, error } = await supabase.from('products').select('*, product_variants(*)').eq('slug', 'zol-inlegzolen').eq('active', true).single()
  if (!error && data) {
    product = data
    if (price) price.innerHTML = `${formatMoney(product.price_cents)} <span>incl. btw</span>`
    if (product.description) {
      const summary = purchase.querySelector('.product-summary')
      if (summary) summary.textContent = product.description
    }
    const variants = (product.product_variants || []).filter((variant) => variant.active).sort((a, b) => a.sort_order - b.sort_order)
    const firstAvailable = variants.find((variant) => variant.stock > 0)
    selector.innerHTML = `<legend>Kies een maat <a href="#maatadvies">Maatadvies</a></legend>${variants.map((variant) => {
      const stock = Math.max(0, Number(variant.stock) || 0)
      const availability = stock > 4 ? 'Op voorraad' : stock > 0 ? `Nog ${stock}` : 'Uitverkocht'
      const availabilityClass = stock > 4 ? 'is-available' : stock > 0 ? 'is-low' : 'is-unavailable'
      return `<label><input type="radio" name="size" value="${variant.id}" ${variant.id === firstAvailable?.id ? 'checked' : ''} ${stock < 1 ? 'disabled' : ''}><span>${variant.size}<small>${variant.shoe_size}</small></span><em class="size-stock ${availabilityClass}">${availability}</em></label>`
    }).join('')}`
    renderBundlePrices()
    renderStockState()
    void loadPaymentSupport(variants.find((variant) => variant.stock > 0) || variants[0])
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

  function add(direct = false) {
    const item = selectedItem()
    if (!item) return
    addToCart(item)
    trackEvent('add_to_cart', { product_id: item.product_id, variant_id: item.variant_id, quantity: item.quantity })
    if (direct) window.location.href = '/checkout/'
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
    void loadPaymentSupport(selectedVariant())
  })
  selectBundle(bundleInputs.find((input) => input.checked))
  renderBundlePrices()
  addButton?.addEventListener('click', () => add(false))
  buyButton?.addEventListener('click', () => add(true))
}
