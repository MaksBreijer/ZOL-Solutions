import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.112.3"

type Json = Record<string, any>

const POSTNL_BUCKET = "postnl-labels"
const allowedOrigins = new Set(["https://zol-solutions.pages.dev", "https://zolsolutions.nl", "https://www.zolsolutions.nl", "http://localhost:5173", "http://127.0.0.1:5173"])
const POSTNL_ENDPOINTS = {
  sandbox: "https://api-sandbox.postnl.nl/shipment/delivery/v4/labelconfirm",
  production: "https://api.postnl.nl/shipment/delivery/v4/labelconfirm",
} as const

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || ""
  return { "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://zolsolutions.nl", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" }
}

function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } })
}

async function requireAdmin(request: Request, db = adminClient()) {
  const authorization = request.headers.get("Authorization")
  if (!authorization?.startsWith("Bearer ")) throw new Error("Niet ingelogd.")
  const { data: { user }, error } = await db.auth.getUser(authorization.slice(7))
  if (error || !user) throw new Error("Ongeldige sessie.")
  const { data: profile } = await db.from("admin_profiles").select("id,email,role,active").eq("id", user.id).maybeSingle()
  if (!profile?.active) throw new Error("Geen toegang tot ZOL Admin.")
  return profile
}

function clean(value: unknown, max = 180) {
  return String(value ?? "").trim().slice(0, max)
}

function postnlKey(environment: "sandbox" | "production") {
  return Deno.env.get(environment === "production" ? "POSTNL_PRODUCTION_API_KEY" : "POSTNL_SANDBOX_API_KEY") || ""
}

function splitName(value: unknown) {
  const parts = clean(value, 70).split(/\s+/).filter(Boolean)
  return { firstName: parts.shift() || "Klant", lastName: parts.join(" ") || "ZOL" }
}

function splitStreet(value: unknown) {
  const address = clean(value, 180)
  const match = address.match(/^(.*?)\s+(\d{1,10})(?:\s*[-/]?\s*([a-z0-9-]{1,10}))?$/i)
  if (!match) throw new Error("Het bezorgadres moet straat, huisnummer en eventuele toevoeging bevatten.")
  return { street: match[1].trim(), houseNumber: match[2], houseNumberAddition: match[3] || "" }
}

function missingConfig(config: Json) {
  const required = [
    ["customer_number", "klantnummer"], ["customer_code", "klantcode"],
    ["sender_street", "afzenderstraat"], ["sender_house_number", "afzenderhuisnummer"],
    ["sender_postal_code", "afzenderpostcode"], ["sender_city", "afzenderplaats"],
  ]
  return required.filter(([key]) => !clean(config[key])).map(([, label]) => label)
}

function postnlMessages(result: Json) {
  const values = [result.detail, result.title, result.message]
  if (Array.isArray(result.errors)) {
    for (const error of result.errors.slice(0, 5)) values.push(error?.description, error?.message, error?.title)
  }
  return [...new Set(values.map((value) => clean(value, 300)).filter(Boolean))].slice(0, 5)
}

function todayInAmsterdam() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

function decodeBase64(value: string) {
  const binary = atob(value.replace(/^data:[^,]+,/, ""))
  if (binary.length > 5 * 1024 * 1024) throw new Error("Het PostNL-label is groter dan toegestaan.")
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function signedLabelUrl(db: ReturnType<typeof adminClient>, path: string) {
  if (!path) return ""
  const { data, error } = await db.storage.from(POSTNL_BUCKET).createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data.signedUrl
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })

  const db = adminClient()
  try {
    const profile = await requireAdmin(request, db)
    if (!["owner", "admin"].includes(profile.role)) return Response.json({ error: "Geen toestemming voor deze actie." }, { status: 403, headers })
    const body = await request.json().catch(() => ({}))
    const { data: setting, error: settingError } = await db.from("settings").select("value").eq("key", "postnl_config").maybeSingle()
    if (settingError) throw settingError
    const config: Json = setting?.value || {}
    const environment: "sandbox" | "production" = config.environment === "production" ? "production" : "sandbox"
    const missing = missingConfig(config)

    if (body.action === "status") {
      return Response.json({
        success: true,
        environment,
        enabled: Boolean(config.enabled),
        production_enabled: Boolean(config.production_enabled),
        sandbox_key_configured: Boolean(postnlKey("sandbox")),
        production_key_configured: Boolean(postnlKey("production")),
        missing_fields: missing,
        ready: Boolean(config.enabled && postnlKey(environment) && !missing.length && (environment !== "production" || config.production_enabled)),
      }, { headers: { ...headers, "Content-Type": "application/json" } })
    }

    if (body.action === "test") {
      const requestedEnvironment: "sandbox" | "production" = body.environment === "production" ? "production" : "sandbox"
      const apiKey = postnlKey(requestedEnvironment)
      if (!apiKey) return Response.json({ error: `De ${requestedEnvironment === "production" ? "productie" : "sandbox"}sleutel is nog niet ingesteld.` }, { status: 503, headers })
      const response = await fetch(POSTNL_ENDPOINTS[requestedEnvironment], {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json", "apikey": apiKey },
        body: "{}",
      })
      const result = await response.json().catch(() => ({}))
      const keyAccepted = response.status === 400
      return Response.json({
        success: keyAccepted,
        environment: requestedEnvironment,
        http_status: response.status,
        key_accepted: keyAccepted,
        messages: postnlMessages(result),
        error: keyAccepted ? undefined : response.status === 401 ? "PostNL heeft de API-sleutel geweigerd." : "Deze sleutel heeft nog geen toegang tot Shipment API v4.",
      }, { status: keyAccepted ? 200 : 502, headers: { ...headers, "Content-Type": "application/json" } })
    }

    if (body.action !== "create" && body.action !== "label_url") return Response.json({ error: "Onbekende PostNL-actie." }, { status: 400, headers })
    const orderId = clean(body.order_id, 40)
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return Response.json({ error: "Bestelling ontbreekt." }, { status: 400, headers })
    const { data: order, error: orderError } = await db.from("orders").select("*, customers(phone)").eq("id", orderId).maybeSingle()
    if (orderError || !order) return Response.json({ error: "Bestelling niet gevonden." }, { status: 404, headers })

    const existing = order.postnl || {}
    if (body.action === "label_url" || existing.barcode) {
      if (!existing.label_path) return Response.json({ error: "Bij deze zending is geen opgeslagen label gevonden." }, { status: 404, headers })
      return Response.json({ success: true, existing: true, barcode: existing.barcode, label_url: await signedLabelUrl(db, existing.label_path), environment: existing.environment }, { headers: { ...headers, "Content-Type": "application/json" } })
    }

    if (!config.enabled) return Response.json({ error: "Activeer eerst de PostNL-koppeling bij Instellingen." }, { status: 409, headers })
    if (missing.length) return Response.json({ error: `Vul eerst deze PostNL-instellingen in: ${missing.join(", ")}.` }, { status: 409, headers })
    if (environment === "production" && (!config.production_enabled || body.confirm_production !== true)) {
      return Response.json({ error: "Een productiezending vereist de live-schakelaar en een bewuste bevestiging." }, { status: 409, headers })
    }
    if (environment === "production" && order.payment_status !== "paid") return Response.json({ error: "Een productiezending kan alleen voor een betaalde bestelling worden gemaakt." }, { status: 409, headers })
    const apiKey = postnlKey(environment)
    if (!apiKey) return Response.json({ error: `De PostNL-${environment === "production" ? "productie" : "sandbox"}sleutel is nog niet veilig ingesteld.` }, { status: 503, headers })

    const address: Json = order.shipping_address || {}
    const recipientStreet = splitStreet(address.street)
    const recipientName = splitName(order.customer_name)
    const senderName = splitName(config.sender_company || "ZOL Solutions")
    const mobile = clean(order.customers?.phone, 17)
    const payload: Json = {
      receiver: {
        address: {
          city: clean(address.city, 35), countryIso: clean(address.country || "NL", 2).toUpperCase(),
          postalCode: clean(address.postal_code, 17).replaceAll(" ", "").toUpperCase(),
          street: recipientStreet.street.slice(0, 95), houseNumber: recipientStreet.houseNumber,
          ...(recipientStreet.houseNumberAddition ? { houseNumberAddition: recipientStreet.houseNumberAddition } : {}),
        },
        type: "consumer",
        contact: {
          email: clean(order.customer_email, 50), firstName: recipientName.firstName.slice(0, 35), lastName: recipientName.lastName.slice(0, 35),
          ...(mobile.length >= 7 ? { mobileNumber: mobile } : {}),
        },
      },
      sender: {
        customerNumber: clean(config.customer_number, 10), customerCode: clean(config.customer_code, 4).toUpperCase(),
        address: {
          city: clean(config.sender_city, 35), countryIso: clean(config.sender_country || "NL", 2).toUpperCase(),
          postalCode: clean(config.sender_postal_code, 17).replaceAll(" ", "").toUpperCase(),
          street: clean(config.sender_street, 95), houseNumber: clean(config.sender_house_number, 10),
          ...(clean(config.sender_house_number_addition, 10) ? { houseNumberAddition: clean(config.sender_house_number_addition, 10) } : {}),
          companyName: clean(config.sender_company || "ZOL Solutions", 35),
        },
        contact: {
          email: clean(config.sender_email || "info@zolsolutions.nl", 50), firstName: senderName.firstName.slice(0, 35), lastName: senderName.lastName.slice(0, 35),
          ...(clean(config.sender_phone, 17).length >= 7 ? { mobileNumber: clean(config.sender_phone, 17) } : {}),
        },
      },
      items: [{ customerReferences: { shipmentReference: `ZOL-${order.order_number}` } }],
      shipmentType: ["parcel", "letterbox"].includes(config.shipment_type) ? config.shipment_type : "parcel",
      handoverDate: clean(body.handover_date, 10) || todayInAmsterdam(),
      labelSettings: { outputType: "pdf", pageOrientation: "portrait", resolution: "200" },
    }

    const response = await fetch(POSTNL_ENDPOINTS[environment], {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "apikey": apiKey },
      body: JSON.stringify(payload),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      const messages = postnlMessages(result)
      return Response.json({ error: messages[0] || `PostNL heeft de zending geweigerd (${response.status}).`, messages, trace_id: clean(result.traceId, 120) }, { status: 502, headers })
    }
    const item = result.items?.[0] || {}
    const label = item.labels?.find((candidate: Json) => candidate.outputType === "pdf") || item.labels?.[0]
    const barcode = clean(item.barcode, 120)
    if (!barcode || !label?.label) return Response.json({ error: "PostNL gaf geen bruikbaar label of barcode terug.", trace_id: clean(result.traceId, 120) }, { status: 502, headers })

    const labelPath = `${order.id}/${barcode.replace(/[^A-Za-z0-9_-]/g, "")}.pdf`
    const { error: uploadError } = await db.storage.from(POSTNL_BUCKET).upload(labelPath, decodeBase64(label.label), { contentType: "application/pdf", upsert: false })
    if (uploadError) throw uploadError
    const createdAt = new Date().toISOString()
    const postnl = {
      environment, barcode, label_path: labelPath, output_type: "pdf", trace_id: clean(result.traceId, 120),
      shipment_reference: clean(item.shipmentReference, 160) || `ZOL-${order.order_number}`,
      warnings: Array.isArray(result.warnings) ? result.warnings.slice(0, 10).map((warning: Json) => clean(warning.description, 300)).filter(Boolean) : [],
      created_at: createdAt, created_by: profile.id,
    }
    const postal = clean(address.postal_code, 17).replaceAll(" ", "").toUpperCase()
    const trackingUrl = `https://jouw.postnl.nl/track-and-trace/${encodeURIComponent(barcode)}-NL-${encodeURIComponent(postal)}`
    const { error: updateError } = await db.from("orders").update({
      postnl, tracking_code: barcode, tracking_carrier: "PostNL", tracking_url: trackingUrl,
      fulfillment_status: order.fulfillment_status === "unfulfilled" ? "processing" : order.fulfillment_status,
    }).eq("id", order.id)
    if (updateError) throw updateError
    await db.from("activity_log").insert({
      actor_id: profile.id, actor_email: profile.email, action: `PostNL-label gemaakt (${environment})`, entity_type: "order", entity_id: order.id,
      details: { order_number: order.order_number, barcode, environment, trace_id: postnl.trace_id, warnings: postnl.warnings },
    })
    return Response.json({ success: true, barcode, tracking_url: trackingUrl, label_url: await signedLabelUrl(db, labelPath), environment, warnings: postnl.warnings }, { headers: { ...headers, "Content-Type": "application/json" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "De PostNL-zending kon niet worden verwerkt."
    return Response.json({ error: message }, { status: /ingelogd|sessie|toegang/i.test(message) ? 401 : 500, headers })
  }
})
