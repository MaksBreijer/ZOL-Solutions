const CART_KEY = 'zol_cart_v1'
let memoryCart = []

function parseCart(raw) {
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value : null
  } catch { return null }
}

export function getCart() {
  for (const storageName of ['localStorage', 'sessionStorage']) {
    try {
      const storage = window[storageName]
      const stored = parseCart(storage.getItem(CART_KEY))
      if (stored) return stored
    } catch { /* Safari private mode or blocked storage: try the next option. */ }
  }
  return memoryCart
}

export function saveCart(items) {
  memoryCart = items
  const serialized = JSON.stringify(items)
  let saved = false
  for (const storageName of ['localStorage', 'sessionStorage']) {
    try { window[storageName].setItem(CART_KEY, serialized); saved = true; break } catch { /* Try the next storage option. */ }
  }
  window.dispatchEvent(new CustomEvent('zol:cart', { detail: items }))
  if (!saved) document.documentElement.dataset.cartStorage = 'memory'
  return items
}

export function addToCart(item) {
  const cart = getCart()
  const existing = cart.find((entry) => entry.variant_id === item.variant_id)
  if (existing) existing.quantity = Math.min(10, existing.quantity + item.quantity)
  else cart.push(item)
  return saveCart(cart)
}

export function updateCartItem(variantId, quantity) {
  const cart = getCart()
  const item = cart.find((entry) => entry.variant_id === variantId)
  if (item) item.quantity = Math.min(10, Math.max(0, Number(quantity) || 0))
  return saveCart(cart.filter((entry) => entry.quantity > 0))
}

export function clearCart() { return saveCart([]) }
export function cartCount() { return getCart().reduce((sum, item) => sum + item.quantity, 0) }

export function bindCartCounters() {
  const update = () => document.querySelectorAll('[data-cart-count]').forEach((counter) => { counter.textContent = cartCount(); counter.hidden = cartCount() === 0 })
  update(); window.addEventListener('zol:cart', update); window.addEventListener('storage', update)
}
