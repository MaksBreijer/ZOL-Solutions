import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import {
  adminClient,
  corsHeaders,
  emailShell,
  getEmailConfig,
  getEmailTemplate,
  logEmail,
  markEmail,
  renderTemplate,
  sendEmail,
  templateParagraphs,
} from "../_shared/email.ts"

type Json = Record<string, any>

const TEMPLATE_KEY = "stock_back_in_stock"
const MAX_PER_RUN = 50
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function clean(value: unknown, max = 254) {
  return String(value ?? "").trim().slice(0, max)
}

function relatedProduct(value: unknown): Json {
  if (Array.isArray(value)) return value[0] || {}
  return (value && typeof value === "object" ? value : {}) as Json
}

async function fingerprint(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown"
  const source = `${ip}|${request.headers.get("user-agent") || "unknown"}`
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source))
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")
}

async function subscribe(request: Request, body: Json, headers: Record<string, string>) {
  if (clean(body.company, 200)) return Response.json({ success: true }, { headers })

  const email = clean(body.email).toLowerCase()
  const variantId = clean(body.variant_id, 36)
  if (!EMAIL_PATTERN.test(email) || !UUID_PATTERN.test(variantId)) {
    return Response.json({ error: "Controleer je e-mailadres en kies opnieuw een maat." }, { status: 400, headers })
  }

  const db = adminClient()
  const { data: allowed, error: rateError } = await db.rpc("enforce_stock_alert_rate_limit", { p_fingerprint: await fingerprint(request) })
  if (rateError) throw rateError
  if (!allowed) return Response.json({ error: "Te veel aanvragen. Probeer het over 15 minuten opnieuw." }, { status: 429, headers })

  const { data: variant, error: variantError } = await db
    .from("product_variants")
    .select("id,sku,title,size,shoe_size,stock,active,products!inner(id,name,slug,active)")
    .eq("id", variantId)
    .maybeSingle()
  if (variantError) throw variantError
  const product = relatedProduct(variant?.products)
  if (!variant || !variant.active || !product.active) {
    return Response.json({ error: "Deze maat is niet meer beschikbaar." }, { status: 404, headers })
  }
  if (Number(variant.stock) > 0) {
    return Response.json({ error: "Goed nieuws: deze maat is inmiddels weer op voorraad." }, { status: 409, headers })
  }

  const { data: existing, error: existingError } = await db
    .from("stock_alert_subscriptions")
    .select("id,status")
    .eq("email", email)
    .eq("variant_sku", variant.sku)
    .in("status", ["pending", "processing"])
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return Response.json({ success: true, already_subscribed: true }, { headers })

  const { error: insertError } = await db.from("stock_alert_subscriptions").insert({
    email,
    variant_id: variant.id,
    variant_sku: variant.sku,
    product_name: clean(product.name, 200),
    variant_name: clean(variant.title, 160),
    shoe_size: clean(variant.shoe_size || variant.size, 80),
    source: clean(body.source || "product_page", 80),
  })
  if (insertError && insertError.code !== "23505") throw insertError

  return Response.json({ success: true, already_subscribed: insertError?.code === "23505" }, { headers })
}

async function dispatch(request: Request, headers: Record<string, string>) {
  const db = adminClient()
  const suppliedSecret = request.headers.get("x-zol-stock-alert-secret") || ""
  const { data: verified, error: verificationError } = await db.rpc("verify_stock_alert_cron_secret", { p_secret: suppliedSecret })
  if (verificationError || !verified) return Response.json({ error: "Niet toegestaan." }, { status: 401, headers })

  const config = await getEmailConfig(db)
  if (!config.enabled) return Response.json({ success: true, status: "email_disabled", processed: 0, sent: 0 }, { headers })
  const template = await getEmailTemplate(TEMPLATE_KEY, db)
  if (!template.enabled) return Response.json({ success: true, status: "template_disabled", processed: 0, sent: 0 }, { headers })

  const { data: subscriptions, error: claimError } = await db.rpc("claim_ready_stock_alerts", { p_limit: MAX_PER_RUN })
  if (claimError) throw claimError
  if (!subscriptions?.length) return Response.json({ success: true, processed: 0, sent: 0, failed: 0 }, { headers })

  const skus = [...new Set(subscriptions.map((item: Json) => item.variant_sku))]
  const { data: variants, error: variantError } = await db
    .from("product_variants")
    .select("id,sku,title,size,shoe_size,stock,active,products!inner(name,slug,active)")
    .in("sku", skus)
    .eq("active", true)
    .gt("stock", 0)
  if (variantError) throw variantError
  const variantsBySku = new Map((variants || []).map((variant: Json) => [variant.sku, variant]))
  const websiteUrl = String(config.website_url || "https://zolsolutions.nl").replace(/\/$/, "")
  const results: Json[] = []

  for (const subscription of subscriptions as Json[]) {
    const variant = variantsBySku.get(subscription.variant_sku) as Json | undefined
    const product = relatedProduct(variant?.products)
    if (!variant || !product.active || Number(variant.stock) < 1) {
      await db.from("stock_alert_subscriptions").update({ status: "pending", error_message: "Voorraad veranderde tijdens de controle." }).eq("id", subscription.id)
      results.push({ id: subscription.id, status: "pending" })
      continue
    }

    const shoeSize = clean(variant.shoe_size || subscription.shoe_size || variant.size, 80)
    const productUrl = `${websiteUrl}/product/?maat=${encodeURIComponent(shoeSize.replace("/", "-"))}`
    const variables: Record<string, unknown> = {
      product_name: product.name || subscription.product_name,
      variant_name: variant.title || subscription.variant_name,
      shoe_size: shoeSize,
      product_url: productUrl,
      website_url: websiteUrl,
    }
    const subject = renderTemplate(template.subject_template, variables).slice(0, 240)
    const bodyHtml = templateParagraphs(template.body_template, variables)
    const notice = '<p style="margin:26px 0 0;padding-top:18px;border-top:1px solid #e4e9ee;color:#738496;font-size:11px;line-height:1.6">Dit is de eenmalige voorraadmelding waarvoor je je hebt aangemeld. Je ontvangt hierdoor geen nieuwsbrief.</p>'
    const html = emailShell(`${bodyHtml}${notice}`, {
      eyebrow: renderTemplate(template.eyebrow_template, variables),
      title: renderTemplate(template.title_template, variables),
      intro: renderTemplate(template.intro_template, variables),
      websiteUrl,
      logoUrl: config.logo_url,
      buttonLabel: renderTemplate(template.button_label_template, variables),
      buttonUrl: productUrl,
    })
    const text = [
      renderTemplate(template.title_template, variables),
      renderTemplate(template.intro_template, variables),
      renderTemplate(template.body_template, variables),
      `Bekijk de maat: ${productUrl}`,
      "Dit is de eenmalige voorraadmelding waarvoor je je hebt aangemeld. Je ontvangt hierdoor geen nieuwsbrief.",
    ].filter(Boolean).join("\n\n")
    const dedupeKey = `${TEMPLATE_KEY}-${subscription.id}`
    const { data: existing } = await db.from("email_messages").select("id,status").eq("dedupe_key", dedupeKey).maybeSingle()
    if (existing?.status === "sent") {
      await db.from("stock_alert_subscriptions").update({ status: "sent", notified_at: new Date().toISOString(), error_message: "" }).eq("id", subscription.id)
      results.push({ id: subscription.id, status: "already_sent" })
      continue
    }

    const log = existing || await logEmail(db, {
      kind: TEMPLATE_KEY,
      recipient_email: subscription.email,
      subject,
      body_preview: text.slice(0, 500),
      dedupe_key: dedupeKey,
    })
    try {
      const sent = await sendEmail({ to: subscription.email, subject, html, text, idempotencyKey: dedupeKey, config })
      await markEmail(db, log.id, { status: "sent", providerId: sent.id })
      await db.from("stock_alert_subscriptions").update({ status: "sent", notified_at: new Date().toISOString(), error_message: "" }).eq("id", subscription.id)
      results.push({ id: subscription.id, status: "sent" })
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Voorraadmelding kon niet worden verstuurd."
      await markEmail(db, log.id, { status: "failed", error: message })
      await db.from("stock_alert_subscriptions").update({
        status: Number(subscription.attempts) >= 5 ? "failed" : "pending",
        error_message: message.slice(0, 1000),
      }).eq("id", subscription.id)
      results.push({ id: subscription.id, status: "failed", error: message })
    }
  }

  return Response.json({
    success: true,
    processed: results.length,
    sent: results.filter((result) => ["sent", "already_sent"].includes(result.status)).length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  }, { headers })
}

Deno.serve(async (request) => {
  const headers = { ...corsHeaders(request), "Content-Type": "application/json" }
  if (request.method === "OPTIONS") return new Response("ok", { headers })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers })

  try {
    const body = await request.json().catch(() => ({})) as Json
    if (body.action === "dispatch") return await dispatch(request, headers)
    return await subscribe(request, body, headers)
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "De voorraadmelding kon niet worden verwerkt." }, { status: 500, headers })
  }
})
