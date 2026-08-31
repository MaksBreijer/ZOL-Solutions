import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.112.3"

type Json = Record<string, any>

const POSTNL_BUCKET = "postnl-labels"
const allowedOrigins = new Set(["https://zol-solutions.pages.dev", "https://zolsolutions.nl", "https://www.zolsolutions.nl", "http://localhost:5173", "http://127.0.0.1:5173"])
const POSTNL_BASE_URLS = {
  sandbox: "https://api-sandbox.postnl.nl",
  production: "https://api.postnl.nl",
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
  const token = authorization.slice(7)
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) throw new Error("Ongeldige sessie.")
  const { data: assurance, error: assuranceError } = await db.auth.mfa.getAuthenticatorAssuranceLevel(token)
  if (assuranceError || assurance?.currentLevel !== "aal2") throw new Error("Tweestapsverificatie is vereist voor ZOL Admin.")
  const sessionId = String((await db.auth.getClaims(token)).data?.claims?.session_id || "")
  const { data: activeSession, error: sessionError } = await db.rpc("admin_session_is_active", { p_user_id: user.id, p_session_id: sessionId || null })
  if (sessionError || activeSession !== true) throw new Error("Deze beheerderssessie is ingetrokken. Log opnieuw in.")
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
  const errors = [...(Array.isArray(result.errors) ? result.errors : []), ...(Array.isArray(result.Errors) ? result.Errors : [])]
  for (const shipment of Array.isArray(result.ResponseShipments) ? result.ResponseShipments : []) {
    if (Array.isArray(shipment?.Errors)) errors.push(...shipment.Errors)
  }
  for (const error of errors.slice(0, 5)) {
    values.push(error?.description, error?.Description, error?.message, error?.Message, error?.title)
  }
  return [...new Set(values.map((value) => clean(value, 300)).filter(Boolean))].slice(0, 5)
}

function postnlWarnings(result: Json) {
  const warnings = [...(Array.isArray(result.warnings) ? result.warnings : []), ...(Array.isArray(result.Warnings) ? result.Warnings : [])]
  for (const shipment of Array.isArray(result.ResponseShipments) ? result.ResponseShipments : []) {
    if (Array.isArray(shipment?.Warnings)) warnings.push(...shipment.Warnings)
  }
  return [...new Set(warnings.map((warning) => clean(warning?.Description || warning?.description || warning?.Message || warning?.message, 300)).filter(Boolean))].slice(0, 10)
}

function postnlTimestamp() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {} as Record<string, string>)
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`
}

async function generateBarcode(environment: "sandbox" | "production", apiKey: string, config: Json) {
  const query = new URLSearchParams({
    CustomerCode: clean(config.customer_code, 4).toUpperCase(),
    CustomerNumber: clean(config.customer_number, 10),
    Type: "3S",
  })
  const serie = clean(config.barcode_series, 30)
  if (serie) query.set("Serie", serie)
  const response = await fetch(`${POSTNL_BASE_URLS[environment]}/shipment/v1_1/barcode?${query}`, {
    headers: { "Accept": "application/json", "apikey": apiKey },
  })
  const result = await response.json().catch(() => ({}))
  const barcode = clean(result.Barcode || result.barcode, 120)
  return { response, result, barcode }
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
      if (missing.length) return Response.json({ error: `Vul eerst deze PostNL-instellingen in: ${missing.join(", ")}.` }, { status: 409, headers })
      const { response, result, barcode } = await generateBarcode(requestedEnvironment, apiKey, config)
      const keyAccepted = response.ok && Boolean(barcode)
      if (!keyAccepted) {
        const messages = postnlMessages(result)
        return Response.json({
          success: false, environment: requestedEnvironment, http_status: response.status, key_accepted: false,
          messages, error: response.status === 401 ? "PostNL heeft de API-sleutel geweigerd." : messages[0] || "PostNL kon met deze gegevens geen sandboxbarcode maken.",
        }, { status: 502, headers: { ...headers, "Content-Type": "application/json" } })
      }
      if (requestedEnvironment === "production") {
        return Response.json({ success: true, environment: requestedEnvironment, key_accepted: true, barcode_created: true, label_created: false }, { headers: { ...headers, "Content-Type": "application/json" } })
      }
      const productCode = clean(config.product_code || "3085", 4)
      const weight = Math.max(1, Math.min(23000, Number.parseInt(clean(config.default_weight_grams, 8), 10) || 500))
      const sandboxPayload = {
        Customer: {
          Address: {
            AddressType: "02", City: clean(config.sender_city, 35), CompanyName: clean(config.sender_company || "ZOL Solutions", 35), Countrycode: "NL",
            HouseNr: clean(config.sender_house_number, 10), ...(clean(config.sender_house_number_addition, 10) ? { HouseNrExt: clean(config.sender_house_number_addition, 10) } : {}),
            Street: clean(config.sender_street, 95), Zipcode: clean(config.sender_postal_code, 17).replaceAll(" ", "").toUpperCase(),
          },
          CollectionLocation: clean(config.collection_location, 10), ContactPerson: "ZOL Solutions", CustomerCode: clean(config.customer_code, 4).toUpperCase(),
          CustomerNumber: clean(config.customer_number, 10), Email: clean(config.sender_email || "info@zolsolutions.nl", 50), Name: "ZOL Solutions",
        },
        Message: { MessageID: "1", MessageTimeStamp: postnlTimestamp(), Printertype: "GraphicFile|PDF" },
        Shipments: [{
          Addresses: [{ AddressType: "01", City: clean(config.sender_city, 35), Countrycode: "NL", FirstName: "ZOL", HouseNr: clean(config.sender_house_number, 10), Name: "Sandboxtest", Street: clean(config.sender_street, 95), Zipcode: clean(config.sender_postal_code, 17).replaceAll(" ", "").toUpperCase() }],
          Barcode: barcode, Contacts: [{ ContactType: "01", Email: clean(config.sender_email || "info@zolsolutions.nl", 50) }],
          CustomerOrderNumber: "ZOL-SANDBOX", Dimension: { Weight: weight }, ProductCodeDelivery: productCode, Reference: "ZOL-SANDBOX-TEST",
        }],
      }
      const labelResponse = await fetch(`${POSTNL_BASE_URLS.sandbox}/shipment/v2_2/label?confirm=false`, {
        method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/json", "apikey": apiKey }, body: JSON.stringify(sandboxPayload),
      })
      const labelResult = await labelResponse.json().catch(() => ({}))
      const testShipment = labelResult.ResponseShipments?.[0] || {}
      const labelCreated = labelResponse.ok && Boolean(testShipment.Barcode && testShipment.Labels?.[0]?.Content)
      if (!labelCreated) {
        const messages = postnlMessages(labelResult)
        return Response.json({ success: false, environment: "sandbox", key_accepted: true, barcode_created: true, label_created: false, messages, error: messages[0] || `De sandboxbarcode lukte, maar het testlabel niet (${labelResponse.status}).` }, { status: 502, headers: { ...headers, "Content-Type": "application/json" } })
      }
      return Response.json({
        success: true,
        environment: requestedEnvironment,
        http_status: labelResponse.status,
        key_accepted: true,
        barcode_created: true,
        label_created: true,
        warnings: postnlWarnings(labelResult),
      }, { headers: { ...headers, "Content-Type": "application/json" } })
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
    if (clean(address.country || "NL", 2).toUpperCase() !== "NL") {
      return Response.json({ error: "Deze koppeling is nu veilig ingesteld voor Nederlandse zendingen. Internationale zendingen vereisen aanvullende douane- en productgegevens." }, { status: 409, headers })
    }
    const recipientStreet = splitStreet(address.street)
    const recipientName = splitName(order.customer_name)
    const mobile = clean(order.customers?.phone, 17)
    const barcodeResult = await generateBarcode(environment, apiKey, config)
    if (!barcodeResult.response.ok || !barcodeResult.barcode) {
      const messages = postnlMessages(barcodeResult.result)
      return Response.json({ error: messages[0] || `PostNL kon geen barcode maken (${barcodeResult.response.status}).`, messages }, { status: 502, headers })
    }
    const barcode = barcodeResult.barcode
    const weight = Math.max(1, Math.min(23000, Number.parseInt(clean(config.default_weight_grams, 8), 10) || 500))
    const productCode = clean(config.product_code || (config.shipment_type === "letterbox" ? "2928" : "3085"), 4)
    const payload: Json = {
      Customer: {
        Address: {
          AddressType: "02", City: clean(config.sender_city, 35), CompanyName: clean(config.sender_company || "ZOL Solutions", 35),
          Countrycode: clean(config.sender_country || "NL", 2).toUpperCase(), HouseNr: clean(config.sender_house_number, 10),
          ...(clean(config.sender_house_number_addition, 10) ? { HouseNrExt: clean(config.sender_house_number_addition, 10) } : {}),
          Street: clean(config.sender_street, 95), Zipcode: clean(config.sender_postal_code, 17).replaceAll(" ", "").toUpperCase(),
        },
        CollectionLocation: clean(config.collection_location, 10), ContactPerson: clean(config.sender_company || "ZOL Solutions", 35),
        CustomerCode: clean(config.customer_code, 4).toUpperCase(), CustomerNumber: clean(config.customer_number, 10),
        Email: clean(config.sender_email || "info@zolsolutions.nl", 50), Name: clean(config.sender_company || "ZOL Solutions", 35),
      },
      Message: { MessageID: clean(order.order_number, 10), MessageTimeStamp: postnlTimestamp(), Printertype: "GraphicFile|PDF" },
      Shipments: [{
        Addresses: [{
          AddressType: "01", City: clean(address.city, 35), Countrycode: "NL", FirstName: recipientName.firstName.slice(0, 35),
          HouseNr: recipientStreet.houseNumber, ...(recipientStreet.houseNumberAddition ? { HouseNrExt: recipientStreet.houseNumberAddition } : {}),
          Name: recipientName.lastName.slice(0, 35), Street: recipientStreet.street.slice(0, 95),
          Zipcode: clean(address.postal_code, 17).replaceAll(" ", "").toUpperCase(),
        }],
        Barcode: barcode,
        Contacts: [{ ContactType: "01", Email: clean(order.customer_email, 50), ...(mobile.length >= 7 ? { SMSNr: mobile, TelNr: mobile } : {}) }],
        CustomerOrderNumber: clean(order.order_number, 35), Dimension: { Weight: weight }, ProductCodeDelivery: productCode,
        Reference: `ZOL-${clean(order.order_number, 30)}`,
      }],
    }

    const response = await fetch(`${POSTNL_BASE_URLS[environment]}/shipment/v2_2/label?confirm=true`, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "apikey": apiKey },
      body: JSON.stringify(payload),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      const messages = postnlMessages(result)
      return Response.json({ error: messages[0] || `PostNL heeft de zending geweigerd (${response.status}).`, messages, trace_id: clean(result.traceId, 120) }, { status: 502, headers })
    }
    const item = result.ResponseShipments?.[0] || {}
    const label = item.Labels?.find((candidate: Json) => clean(candidate.OutputType, 10).toUpperCase() === "PDF") || item.Labels?.[0]
    const responseBarcode = clean(item.Barcode || barcode, 120)
    if (!responseBarcode || !label?.Content) return Response.json({ error: "PostNL gaf geen bruikbaar label of barcode terug." }, { status: 502, headers })

    const labelPath = `${order.id}/${responseBarcode.replace(/[^A-Za-z0-9_-]/g, "")}.pdf`
    const { error: uploadError } = await db.storage.from(POSTNL_BUCKET).upload(labelPath, decodeBase64(label.Content), { contentType: "application/pdf", upsert: false })
    if (uploadError) throw uploadError
    const createdAt = new Date().toISOString()
    const postnl = {
      environment, barcode: responseBarcode, label_path: labelPath, output_type: "pdf", trace_id: "",
      shipment_reference: `ZOL-${order.order_number}`, product_code: clean(item.ProductCodeDelivery || productCode, 4), weight_grams: weight,
      warnings: postnlWarnings(result),
      created_at: createdAt, created_by: profile.id,
    }
    const postal = clean(address.postal_code, 17).replaceAll(" ", "").toUpperCase()
    const trackingUrl = `https://jouw.postnl.nl/track-and-trace/${encodeURIComponent(responseBarcode)}-NL-${encodeURIComponent(postal)}`
    const { error: updateError } = await db.from("orders").update({
      postnl, tracking_code: responseBarcode, tracking_carrier: "PostNL", tracking_url: trackingUrl,
      fulfillment_status: order.fulfillment_status === "unfulfilled" ? "processing" : order.fulfillment_status,
    }).eq("id", order.id)
    if (updateError) throw updateError
    await db.from("activity_log").insert({
      actor_id: profile.id, actor_email: profile.email, action: `PostNL-label gemaakt (${environment})`, entity_type: "order", entity_id: order.id,
      details: { order_number: order.order_number, barcode: responseBarcode, environment, product_code: postnl.product_code, warnings: postnl.warnings },
    })
    return Response.json({ success: true, barcode: responseBarcode, tracking_url: trackingUrl, label_url: await signedLabelUrl(db, labelPath), environment, warnings: postnl.warnings }, { headers: { ...headers, "Content-Type": "application/json" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "De PostNL-zending kon niet worden verwerkt."
    return Response.json({ error: message }, { status: /ingelogd|sessie|toegang/i.test(message) ? 401 : 500, headers })
  }
})
