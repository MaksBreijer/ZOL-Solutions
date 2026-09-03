export const ids = { user: '10000000-0000-4000-8000-000000000001', customer: '10000000-0000-4000-8000-000000000002', product: '10000000-0000-4000-8000-000000000003', variant: '10000000-0000-4000-8000-000000000004', secondVariant: '10000000-0000-4000-8000-000000000005', order: '10000000-0000-4000-8000-000000000006' }
export function createOrderFixture() {
  let serial = 100
  const nextId = () => `10000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`
  const now = new Date().toISOString()
  const customer = { id: ids.customer, email: 'customer@example.invalid', first_name: 'Test', last_name: 'Klant', address: { street: 'Teststraat 1', postal_code: '1234AB', city: 'Teststad', country: 'NL' }, tags: [], total_orders: 1, total_spent_cents: 9995 }
  const product = { id: ids.product, name: 'Testproduct', price_cents: 9995, active: true, images: [], product_variants: [{ id: ids.variant, title: 'M', stock: 10, active: true, price_cents: null }, { id: ids.secondVariant, title: 'L', stock: 10, active: true, price_cents: 7995 }] }
  const order = { id: ids.order, order_number: 9001, created_at: now, customer_id: customer.id, customer_email: customer.email, customer_name: 'Test Klant', shipping_address: customer.address, order_type: 'customer', source: 'admin', status: 'open', payment_status: 'paid', fulfillment_status: 'unfulfilled', subtotal_cents: 9995, total_cents: 9995, shipping_cents: 0, tax_cents: 1735, currency: 'EUR', tags: [], note: '', archived: false, tracking_code: '', tracking_destination: { type: 'customer' }, order_items: [{ product_id: product.id, variant_id: ids.variant, product_name: product.name, variant_name: 'M', quantity: 1, unit_price_cents: 9995, total_cents: 9995, products: { images: [] } }] }
  const profile = { id: ids.user, full_name: 'Test Beheerder', email: 'admin@example.invalid', role: 'owner', active: true }
  const db = { orders: [order], customers: [customer], products: [product], payments: [{ id: nextId(), order_id: order.id, provider: 'manual', status: 'paid', amount_cents: 9995, refunded_cents: 0, currency: 'EUR', created_at: now }], admin_profiles: [profile], settings: [{ key: 'email_config', value: { enabled: true } }, { key: 'postnl_config', value: { enabled: true, environment: 'sandbox' } }], order_notes: [], activity_log: [] }
  const calls = []
  let nextFailure = null
  let nextFunctionResult = null
  const failNext = (kind = 'error') => { nextFailure = kind }
  function checkFailure() {
    const failure = nextFailure; nextFailure = null
    if (failure === 'throw') throw new Error('Netwerk tijdelijk niet beschikbaar')
    if (failure === 'error') return { data: null, error: { message: 'Test: opslaan geweigerd' } }
    if (failure === 'empty') return { data: null, error: null }
  }
  function from(table) {
    let operation = 'select', payload, single = false, wantsData = false, bounds, filters = []
    const builder = {
      select() { wantsData = true; return this }, update(value) { operation = 'update'; payload = value; return this },
      insert(value) { operation = 'insert'; payload = value; return this }, delete() { operation = 'delete'; return this },
      upsert(value) { operation = 'insert'; payload = value; return this },
      eq(key, value) { filters.push(row => row[key] === value); return this },
      in(key, values) { filters.push(row => values.includes(row[key])); return this },
      order() { return this }, limit(count) { bounds = [0, count - 1]; return this }, range(a, b) { bounds = [a, b]; return this },
      single() { single = true; return this }, maybeSingle() { single = true; return this },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (operation !== 'select') { calls.push({ table, operation, payload }); const failed = checkFailure(); if (failed) return failed }
        const rows = db[table] ||= []
        let found = rows.filter(row => filters.every(filter => filter(row)))
        if (operation === 'update') found.forEach(row => Object.assign(row, payload))
        if (operation === 'insert') { found = (Array.isArray(payload) ? payload : [payload]).map(row => ({ id: nextId(), created_at: now, ...row })); rows.push(...found) }
        if (operation === 'delete') db[table] = rows.filter(row => !found.includes(row))
        if (bounds) found = found.slice(bounds[0], bounds[1] + 1)
        return { data: operation === 'select' || wantsData ? structuredClone(single ? found[0] || null : found) : null, error: null }
      }).then(resolve, reject) },
    }
    return builder
  }
  const supabase = {
    from,
    auth: { getSession: async () => ({ data: { session: { user: { id: ids.user } } } }), onAuthStateChange() {}, mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2' } }), listFactors: async () => ({ data: { totp: [] } }) } },
    async rpc(name, args) {
      calls.push({ rpc: name, args }); const failed = checkFailure(); if (failed) return failed
      if (name === 'create_admin_order') {
        const items = args.p_items.map(item => { const variant = product.product_variants.find(v => v.id === item.variant_id); const price = item.unit_price_cents ?? variant.price_cents ?? product.price_cents; return { ...item, product_name: product.name, variant_name: variant.title, unit_price_cents: price, total_cents: price * item.quantity } })
        const subtotal = items.reduce((sum, item) => sum + item.total_cents, 0)
        const created = { ...order, id: nextId(), order_number: 9000 + serial, order_type: args.p_order_type, customer_id: args.p_customer_id, status: args.p_status, payment_status: args.p_payment_status, fulfillment_status: args.p_fulfillment_status, order_items: items, subtotal_cents: subtotal, shipping_cents: args.p_shipping_cents, total_cents: subtotal + args.p_shipping_cents }
        if (args.p_order_type === 'physio') Object.assign(created, { customer_name: args.p_physio.practice_name, customer_email: args.p_physio.email, shipping_address: args.p_physio, tracking_destination: { ...args.p_physio, type: 'physio' } })
        db.orders.unshift(created); return { data: { order_id: created.id, order_number: created.order_number }, error: null }
      }
      if (name === 'return_admin_order') { Object.assign(db.orders.find(o => o.id === args.p_order_id), { fulfillment_status: 'returned', status: 'completed', returned_at: now }); return { data: { stock_restored: args.p_restore_stock ? 1 : 0 }, error: null } }
      if (name === 'delete_admin_order') { db.orders = db.orders.filter(o => o.id !== args.p_order_id); return { data: { stock_restored: true }, error: null } }
      if (name === 'import_admin_orders') return { data: { imported: args.p_orders.length, skipped: 0 }, error: null }
      throw new Error(`Unhandled test RPC: ${name}`)
    },
    functions: { async invoke(name, { body }) {
      calls.push({ function: name, body }); const failed = checkFailure(); if (failed) return failed
      if (nextFunctionResult) { const data = nextFunctionResult; nextFunctionResult = null; return { data, error: null } }
      if (name === 'order-email') return { data: { success: true, results: [{ status: 'sent' }] }, error: null }
      if (name === 'manage-order') { const payment = db.payments.find(p => p.order_id === body.order_id); payment.refunded_cents += body.amount_cents; payment.status = payment.refunded_cents >= payment.amount_cents ? 'refunded' : 'partially_refunded'; db.orders.find(o => o.id === body.order_id).payment_status = payment.status; return { data: { success: true }, error: null } }
      if (name === 'postnl-shipment') { const environment = db.settings.find(s => s.key === 'postnl_config').value.environment; const target = db.orders.find(o => o.id === body.order_id); if (body.action === 'create') { target.postnl = { barcode: 'TEST-BARCODE', environment }; target.tracking_code = 'TEST-BARCODE' } return { data: { label_url: '/tests/label.html', barcode: 'TEST-BARCODE', environment }, error: null } }
      throw new Error(`Unhandled test function: ${name}`)
    } },
  }
  return { db, profile, calls, supabase, failNext, respondWith(data) { nextFunctionResult = data } }
}
