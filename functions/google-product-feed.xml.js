import { applyStock } from '../src/feed-stock.js'

const supabaseUrl = 'https://hghlthmkpskxiuohrutw.supabase.co'
const publishableKey = 'sb_publishable_tAmAawC4btjhCp1tsKSG7w_g7TSDEu8'

// Serveert de statische feed, met voorraad live uit Supabase. Valt terug op het statische bestand als dat niet lukt.
export async function onRequestGet(context) {
  const asset = await context.next()
  if (!asset.ok) return asset
  const xml = await asset.text()
  const headers = new Headers(asset.headers)
  headers.set('Content-Type', 'application/xml; charset=utf-8')
  headers.set('Cache-Control', 'public, max-age=900')
  try {
    const url = context.env.VITE_SUPABASE_URL || supabaseUrl
    const key = context.env.VITE_SUPABASE_PUBLISHABLE_KEY || publishableKey
    const response = await fetch(`${url}/rest/v1/product_variants?select=sku,stock&active=eq.true`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    if (!response.ok) throw new Error(`Supabase ${response.status}`)
    const variants = await response.json()
    const stockBySku = Object.fromEntries(variants.filter((variant) => variant.sku).map((variant) => [variant.sku, Number(variant.stock) || 0]))
    return new Response(applyStock(xml, stockBySku), { headers })
  } catch {
    return new Response(xml, { headers })
  }
}
