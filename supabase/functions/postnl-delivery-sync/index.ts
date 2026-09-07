import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.112.3"

type Json = Record<string, any>

const MAX_PER_RUN = 50
const POSTNL_STATUS_URL = "https://api.postnl.nl/shipment/v2/status/barcode"
const DELIVERED_STATUS_CODE = "11"
const MIN_TRACKING_AGE_MS = 2 * 60 * 60 * 1000
const MAX_TRACKING_AGE_MS = 35 * 24 * 60 * 60 * 1000

function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } })
}

function clean(value: unknown, max = 240) {
  return String(value ?? "").trim().slice(0, max)
}

function currentPostnlStatus(result: Json) {
  const shipment = result?.CurrentStatus?.Shipment || result?.currentStatus?.shipment || result?.CompleteStatus?.Shipment || result?.completeStatus?.shipment || {}
  const status = shipment?.Status || shipment?.status || {}
  return {
    code: clean(status.StatusCode ?? status.statusCode, 20),
    description: clean(status.StatusDescription ?? status.statusDescription, 300),
    phaseCode: clean(status.PhaseCode ?? status.phaseCode, 20),
    phaseDescription: clean(status.PhaseDescription ?? status.phaseDescription, 300),
    timestamp: clean(status.TimeStamp ?? status.Timestamp ?? status.timeStamp ?? status.timestamp, 80),
  }
}

function isDeliveredStatus(result: Json) {
  return currentPostnlStatus(result).code === DELIVERED_STATUS_CODE
}

async function fetchPostnlStatus(barcode: string, apiKey: string) {
  const query = new URLSearchParams({ detail: "false", language: "NL", maxDays: "35" })
  const response = await fetch(`${POSTNL_STATUS_URL}/${encodeURIComponent(barcode)}?${query}`, {
    headers: { "Accept": "application/json", "apikey": apiKey },
  })
  const result = await response.json().catch(() => ({}))
  return { response, result }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 })

  const db = adminClient()
  try {
    const suppliedSecret = request.headers.get("x-zol-postnl-delivery-secret") || ""
    const { data: verified, error: verificationError } = await db.rpc("verify_postnl_delivery_cron_secret", { p_secret: suppliedSecret })
    if (verificationError || !verified) return Response.json({ error: "Niet toegestaan." }, { status: 401 })

    const [{ data: setting, error: settingError }, { data: orders, error: ordersError }] = await Promise.all([
      db.from("settings").select("value").eq("key", "postnl_config").maybeSingle(),
      db.from("orders")
        .select("id,order_number,order_type,status,fulfillment_status,tracking_code,tracking_carrier,created_at,postnl")
        .eq("status", "open")
        .in("fulfillment_status", ["processing", "shipped"])
        .eq("tracking_carrier", "PostNL")
        .order("created_at", { ascending: true })
        .limit(MAX_PER_RUN),
    ])
    if (settingError) throw settingError
    if (ordersError) throw ordersError

    const config: Json = setting?.value || {}
    if (!config.enabled) return Response.json({ success: true, status: "postnl_disabled", checked: 0, delivered: 0 })
    const apiKey = Deno.env.get("POSTNL_PRODUCTION_API_KEY") || ""
    if (!apiKey) return Response.json({ error: "De PostNL-productiesleutel ontbreekt." }, { status: 503 })

    const now = Date.now()
    const candidates = (orders || []).filter((order) => {
      const trackingCreatedAt = Date.parse(order.postnl?.created_at || "")
      const trackingAge = now - trackingCreatedAt
      return clean(order.tracking_code, 120)
        && order.postnl?.environment === "production"
        && order.postnl?.barcode === order.tracking_code
        && Number.isFinite(trackingCreatedAt)
        && trackingAge >= MIN_TRACKING_AGE_MS
        && trackingAge <= MAX_TRACKING_AGE_MS
    })
    const delivered: Array<Record<string, unknown>> = []
    const pending: Array<Record<string, unknown>> = []
    const errors: Array<Record<string, unknown>> = []

    for (const order of candidates) {
      const barcode = clean(order.tracking_code, 120)
      try {
        const { response, result } = await fetchPostnlStatus(barcode, apiKey)
        if (!response.ok) {
          errors.push({ order_id: order.id, order_number: order.order_number, barcode, http_status: response.status })
          continue
        }
        const postnlStatus = currentPostnlStatus(result)
        if (!isDeliveredStatus(result)) {
          pending.push({ order_id: order.id, order_number: order.order_number, barcode, status_code: postnlStatus.code, status: postnlStatus.description })
          continue
        }

        const deliveredAt = new Date().toISOString()
        const postnl = {
          ...(order.postnl || {}),
          last_status_code: postnlStatus.code,
          last_status_description: postnlStatus.description,
          last_status_timestamp: postnlStatus.timestamp,
          status_checked_at: deliveredAt,
          delivered_at: deliveredAt,
        }
        const { data: updated, error: updateError } = await db.from("orders").update({
          fulfillment_status: "delivered",
          status: "completed",
          delivered_at: deliveredAt,
          postnl,
        }).eq("id", order.id).eq("status", "open").in("fulfillment_status", ["processing", "shipped"]).select("id").maybeSingle()
        if (updateError) throw updateError
        if (!updated) continue

        await db.from("activity_log").insert({
          actor_email: "",
          action: "Bestelling automatisch als bezorgd gemarkeerd",
          entity_type: "order",
          entity_id: order.id,
          details: {
            order_number: order.order_number,
            carrier: "PostNL",
            barcode,
            postnl_status_code: postnlStatus.code,
            postnl_status: postnlStatus.description,
            detected_at: deliveredAt,
          },
        })
        delivered.push({ order_id: order.id, order_number: order.order_number, barcode, status_code: postnlStatus.code })
      } catch (error) {
        errors.push({
          order_id: order.id,
          order_number: order.order_number,
          barcode,
          error: error instanceof Error ? error.message : "Statuscontrole mislukt.",
        })
      }
    }

    return Response.json({
      success: true,
      checked: candidates.length,
      delivered: delivered.length,
      pending: pending.length,
      errors: errors.length,
      results: { delivered, pending, errors },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "PostNL-bezorgstatus kon niet worden gecontroleerd."
    return Response.json({ error: message }, { status: 500 })
  }
})
