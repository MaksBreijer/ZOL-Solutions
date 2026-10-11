// Server-side GA4 purchase tracking via the Measurement Protocol.
// Only used for visitors who accepted analytics cookies: the browser sends its GA client id at checkout.

type Db = { from: (table: string) => any }
type Payment = { id: string, order_id: string, metadata?: Record<string, any> | null }

const measurementId = Deno.env.get("GA4_MEASUREMENT_ID") || "G-QGJTSYHRH1"

export function analyticsMetadata(input: unknown) {
  const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const clientId = String(value.client_id || "")
  const sessionId = String(value.session_id || "")
  if (!/^\d{1,20}\.\d{1,20}$/.test(clientId)) return {}
  return { ga_client_id: clientId, ...(/^\d{1,20}$/.test(sessionId) ? { ga_session_id: sessionId } : {}) }
}

// One purchase event per order: whichever comes first (the return page or the Mollie webhook) reports it.
export async function claimPurchaseTracking(db: Db, payment: Payment, by: "client" | "server") {
  if (payment.metadata?.ga_purchase_tracked) return false
  const metadata = { ...(payment.metadata || {}), ga_purchase_tracked: by }
  const { data, error } = await db.from("payments")
    .update({ metadata })
    .eq("id", payment.id)
    .is("metadata->>ga_purchase_tracked", null)
    .select("id")
  // If the claim itself fails, keep today's behaviour: the browser still reports the purchase.
  if (error) return by === "client"
  if (!data?.length) return false
  payment.metadata = metadata
  return true
}

export async function sendServerPurchase(db: Db, payment: Payment) {
  const apiSecret = Deno.env.get("GA4_API_SECRET")
  const clientId = String(payment.metadata?.ga_client_id || "")
  if (!apiSecret || !clientId) return
  if (!await claimPurchaseTracking(db, payment, "server")) return

  const [{ data: order }, { data: items }] = await Promise.all([
    db.from("orders").select("order_number,total_cents,shipping_cents,tax_cents,discount_code,currency").eq("id", payment.order_id).maybeSingle(),
    db.from("order_items").select("sku,variant_id,product_name,variant_name,quantity,unit_price_cents").eq("order_id", payment.order_id),
  ])
  if (!order) return
  const sessionId = String(payment.metadata?.ga_session_id || "")
  const params: Record<string, unknown> = {
    transaction_id: String(order.order_number),
    currency: order.currency || "EUR",
    value: Number(order.total_cents || 0) / 100,
    shipping: Number(order.shipping_cents || 0) / 100,
    tax: Number(order.tax_cents || 0) / 100,
    items: (items || []).map((item: Record<string, any>) => ({
      item_id: item.sku || item.variant_id || "zol-inlegzolen",
      item_name: item.product_name || "ZOL 3/4 inlegzolen",
      item_variant: item.variant_name || undefined,
      price: Number(item.unit_price_cents || 0) / 100,
      quantity: Number(item.quantity || 1),
    })),
    engagement_time_msec: 1,
  }
  if (order.discount_code) params.coupon = order.discount_code
  if (sessionId) params.session_id = sessionId

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`
  await fetch(url, { method: "POST", body: JSON.stringify({ client_id: clientId, events: [{ name: "purchase", params }] }) })
}
