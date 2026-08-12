const CART_KEY = 'zol_cart_v1'

export function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || [] } catch { return [] }
}

export function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items))
  window.dispatchEvent(new CustomEvent('zol:cart', { detail: items }))
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

