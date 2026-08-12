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
  let product = null

  const { data, error } = await supabase.from('products').select('*, product_variants(*)').eq('slug', 'zol-inlegzolen').eq('active', true).single()
  if (!error && data) {
    product = data
    if (price) price.innerHTML = `${formatMoney(product.price_cents)} <span>incl. btw</span>`
    if (product.description) {
      const summary = purchase.querySelector('.product-summary')
      if (summary) summary.textContent = product.description
    }
    const variants = (product.product_variants || []).filter((variant) => variant.active).sort((a, b) => a.sort_order - b.sort_order)
    selector.innerHTML = `<legend>Kies een maat <a href="#maatadvies">Maatadvies</a></legend>${variants.map((variant, index) => `<label><input type="radio" name="size" value="${variant.id}" ${index === 0 ? 'checked' : ''} ${variant.stock < 1 ? 'disabled' : ''}><span>${variant.size}<small>${variant.shoe_size}</small></span></label>`).join('')}`
  }

  function selectedItem() {
    const variantId = selector.querySelector('input[name="size"]:checked')?.value
    const variant = product?.product_variants?.find((item) => item.id === variantId)
    if (!product || !variant) return null
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
      quantity: Math.min(10, Math.max(1, Number(quantityInput?.value) || 1)),
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

  addButton?.addEventListener('click', () => add(false))
  buyButton?.addEventListener('click', () => add(true))
}

