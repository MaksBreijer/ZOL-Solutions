import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const edgeSource = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/stock-alert/index.ts', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from "\.\.\/_shared\/email\.ts"\n/, ''))

function edgeHarness({ stock = 0, verified = true, claimed = [] } = {}) {
  let handler
  const sent = []
  const subscriptions = [...claimed]
  const emails = new Map()
  const variant = {
    id: '00000000-0000-4000-8000-000000000001',
    sku: 'ZOL-XS-3435',
    title: 'XS — 34/35',
    size: 'XS',
    shoe_size: '34/35',
    stock,
    active: true,
    products: { id: '00000000-0000-4000-8000-000000000002', name: "De ZOL'tjes", slug: 'zol-inlegzolen', active: true },
  }
  const db = {
    async rpc(name) {
      if (name === 'enforce_stock_alert_rate_limit') return { data: true, error: null }
      if (name === 'verify_stock_alert_cron_secret') return { data: verified, error: null }
      if (name === 'claim_ready_stock_alerts') return { data: subscriptions, error: null }
      return { data: null, error: null }
    },
    from(table) {
      const filters = new Map()
      const query = {
        select() { return query },
        eq(key, value) { filters.set(key, value); return query },
        in(key, value) { filters.set(key, value); return query },
        gt() { return query },
        async maybeSingle() {
          if (table === 'product_variants') return { data: variant, error: null }
          if (table === 'stock_alert_subscriptions') {
            const existing = subscriptions.find((item) => item.email === filters.get('email') && item.variant_sku === filters.get('variant_sku') && ['pending', 'processing'].includes(item.status))
            return { data: existing || null, error: null }
          }
          if (table === 'email_messages') return { data: emails.get(filters.get('dedupe_key')) || null, error: null }
          return { data: null, error: null }
        },
        async insert(value) {
          if (table === 'stock_alert_subscriptions') subscriptions.push({ id: `subscription-${subscriptions.length + 1}`, status: 'pending', attempts: 0, ...value })
          return { error: null }
        },
        update(value) {
          return {
            async eq(_key, id) {
              const subscription = subscriptions.find((item) => item.id === id)
              if (subscription) Object.assign(subscription, value)
              return { error: null }
            },
          }
        },
        then(resolve, reject) {
          const data = table === 'product_variants' && stock > 0 ? [variant] : []
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
  runInNewContext(edgeSource, {
    Deno: { serve(fn) { handler = fn } }, Response, Request, TextEncoder, crypto,
    adminClient: () => db, corsHeaders: () => ({}),
    getEmailConfig: async () => ({ enabled: true, website_url: 'https://zolsolutions.nl' }),
    getEmailTemplate: async () => ({
      enabled: true, subject_template: 'Maat {{shoe_size}} is terug', eyebrow_template: 'Weer op voorraad',
      title_template: 'Maat {{shoe_size}} is er weer', intro_template: 'Je vroeg om een seintje.',
      body_template: 'De ZOL\'tjes zijn er weer.', button_label_template: 'Bekijk maat {{shoe_size}}',
    }),
    renderTemplate: (value, variables) => String(value || '').replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_, key) => variables[key] || ''),
    templateParagraphs: (value) => `<p>${value}</p>`, emailShell: (content) => content,
    logEmail: async (_db, payload) => { const log = { id: `email-${emails.size + 1}`, status: 'queued', ...payload }; emails.set(payload.dedupe_key, log); return log },
    markEmail: async (_db, id, result) => { const log = [...emails.values()].find((item) => item.id === id); if (log) Object.assign(log, result) },
    sendEmail: async (input) => { sent.push(input); return { id: `sent-${sent.length}` } },
    console,
  })
  return { handler, subscriptions, sent, variant }
}

test('product page offers a one-time alert for a selectable sold-out size', () => {
  const html = readFileSync(new URL('../product/index.html', import.meta.url), 'utf8')
  const client = readFileSync(new URL('../src/product-commerce.js', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/20260908183335_add_stock_alerts.sql', import.meta.url), 'utf8')
  const privacy = readFileSync(new URL('../privacy/index.html', import.meta.url), 'utf8')

  assert.match(html, /data-stock-alert hidden/)
  assert.match(html, /Alleen voor deze voorraadmelding, geen nieuwsbrief/)
  assert.match(client, /supabase\.functions\.invoke\('stock-alert'/)
  assert.doesNotMatch(client, /stock < 1 \? 'disabled'/)
  assert.match(migration, /alter table public\.stock_alert_subscriptions enable row level security/)
  assert.match(migration, /revoke all on table public\.stock_alert_subscriptions from public, anon, authenticated/)
  assert.match(migration, /zol-stock-alerts-every-ten-minutes/)
  assert.match(privacy, /Eenmalig melden dat een door jou gekozen maat weer op voorraad is/)
  assert.match(privacy, /maximaal 180 dagen/i)
})

test('a sold-out size stores one normalized subscription and treats a repeat as success', async () => {
  const harness = edgeHarness({ stock: 0 })
  const request = () => new Request('https://zolsolutions.nl/functions/v1/stock-alert', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ' Ouder@Example.nl ', variant_id: harness.variant.id, source: 'product_page' }),
  })
  const first = await harness.handler(request())
  assert.equal(first.status, 200)
  assert.equal(harness.subscriptions.length, 1)
  assert.equal(harness.subscriptions[0].email, 'ouder@example.nl')
  assert.equal(harness.subscriptions[0].variant_sku, 'ZOL-XS-3435')
  const secondBody = await (await harness.handler(request())).json()
  assert.equal(secondBody.already_subscribed, true)
  assert.equal(harness.subscriptions.length, 1)
})

test('an available size is not added to the waitlist', async () => {
  const harness = edgeHarness({ stock: 3 })
  const response = await harness.handler(new Request('https://zolsolutions.nl/functions/v1/stock-alert', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ouder@example.nl', variant_id: harness.variant.id }),
  }))
  assert.equal(response.status, 409)
  assert.equal(harness.subscriptions.length, 0)
})

test('the protected stock job sends once and marks the claimed alert as sent', async () => {
  const alert = { id: '00000000-0000-4000-8000-000000000003', email: 'ouder@example.nl', variant_sku: 'ZOL-XS-3435', shoe_size: '34/35', status: 'processing', attempts: 1 }
  const harness = edgeHarness({ stock: 4, claimed: [alert] })
  const request = (secret = 'valid') => new Request('https://example.invalid/stock-alert', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-zol-stock-alert-secret': secret },
    body: JSON.stringify({ action: 'dispatch' }),
  })
  const body = await (await harness.handler(request())).json()
  assert.equal(body.sent, 1)
  assert.equal(harness.sent.length, 1)
  assert.equal(harness.sent[0].to, 'ouder@example.nl')
  assert.match(harness.sent[0].subject, /34\/35/)
  assert.match(harness.sent[0].text, /geen nieuwsbrief/i)
  assert.equal(alert.status, 'sent')
  assert.ok(alert.notified_at)

  const denied = edgeHarness({ stock: 4, verified: false, claimed: [alert] })
  assert.equal((await denied.handler(request('invalid'))).status, 401)
  assert.equal(denied.sent.length, 0)
})
