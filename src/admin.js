import './admin.css'
import { formatDate, formatMoney, supabase } from './supabase-client.js'

const elements = {
  loading: document.querySelector('#admin-loading'),
  login: document.querySelector('#login-screen'),
  app: document.querySelector('#admin-app'),
  content: document.querySelector('#admin-content'),
  sidebar: document.querySelector('#admin-sidebar'),
  backdrop: document.querySelector('#sidebar-backdrop'),
  dialog: document.querySelector('#admin-dialog'),
  dialogTitle: document.querySelector('#dialog-title'),
  dialogEyebrow: document.querySelector('#dialog-eyebrow'),
  dialogBody: document.querySelector('#dialog-body'),
  toastRegion: document.querySelector('#toast-region'),
}

const state = {
  session: null,
  profile: null,
  orders: [],
  customers: [],
  contactMessages: [],
  products: [],
  payments: [],
  media: [],
  content: [],
  settings: [],
  activity: [],
  analytics: [],
  profiles: [],
  allowedEmails: [],
  emailMessages: [],
  search: '',
}

const routeMeta = {
  dashboard: ['Dashboard', 'Een helder overzicht van ZOL Solutions.'],
  orders: ['Bestellingen', 'Beheer betalingen, verzending en orderdetails.'],
  customers: ['Klanten', 'Klantgegevens, bestelgeschiedenis en interne notities.'],
  messages: ['Berichten', 'Vragen die via het contactformulier zijn binnengekomen.'],
  products: ['Producten', 'Prijzen, maten, voorraad en productmedia.'],
  content: ['Website CMS', 'Bewerk teksten, knoppen, beelden, video en SEO zonder code.'],
  media: ['Mediabibliotheek', 'Eén centrale plek voor afbeeldingen, video en iconen.'],
  payments: ['Betalingen', 'Betaalstatussen en terugbetalingen, klaar voor Mollie.'],
  analytics: ['Analytics', 'Verkeer, winkelwagenacties en conversie.'],
  activity: ['Activiteiten', 'Recente wijzigingen door beheerders.'],
  team: ['Beheerders', 'Nodig beheerders uit en beheer hun rechten.'],
  settings: ['Instellingen', 'Bedrijf, checkout, btw, verzending en huisstijl.'],
}

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const slugify = (value = '') =>
  String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const prettyStatus = (value = '') => ({
  open: 'Open', draft: 'Concept', completed: 'Afgerond', cancelled: 'Geannuleerd',
  pending: 'Openstaand', paid: 'Betaald', failed: 'Mislukt', refunded: 'Terugbetaald', partially_refunded: 'Deels terugbetaald',
  unfulfilled: 'Niet verzonden', processing: 'In behandeling', shipped: 'Verzonden', delivered: 'Bezorgd', returned: 'Retour',
  active: 'Actief', inactive: 'Uitgeschakeld', authorized: 'Geautoriseerd', expired: 'Verlopen',
  new: 'Nieuw', read: 'Gelezen', replied: 'Beantwoord', email_failed: 'Melding mislukt', sent: 'Verstuurd', queued: 'In wachtrij',
}[value] || value.replaceAll('_', ' '))

const statusClass = (value = '') => {
  if (['paid', 'completed', 'delivered', 'active', 'authorized', 'sent', 'replied'].includes(value)) return 'is-green'
  if (['failed', 'cancelled', 'returned', 'refunded', 'email_failed'].includes(value)) return 'is-red'
  if (['open', 'shipped', 'processing', 'new'].includes(value)) return 'is-blue'
  return 'is-orange'
}

const statusPill = (value) => `<span class="status-pill ${statusClass(value)}">${escapeHtml(prettyStatus(value))}</span>`
const fullName = (item) => [item?.first_name, item?.last_name].filter(Boolean).join(' ') || item?.customer_name || 'Onbekend'
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'ZO'
const isStrongPassword = (value = '') =>
  value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value)
const visualContentTypes = new Set(['image', 'video', 'icon'])
const iconChoices = [
  ['builtin:place', 'Plaats'], ['builtin:fit', 'Pasvorm'], ['builtin:move', 'Bewegen'],
  ['✓', 'Check'], ['→', 'Pijl'], ['↗', 'Schuin'], ['↓', 'Omlaag'], ['+', 'Plus'], ['●', 'Punt'], ['◇', 'Ruit'],
]

const isMediaUrl = (value = '') => /^(https?:\/\/|\/|blob:|data:image\/)/i.test(value.trim())
const builtinIcon = (value = '') => ({ 'builtin:place': '◉', 'builtin:fit': '⌒', 'builtin:move': '↗' }[value] || '')

function contentVisualMarkup(entry) {
  const value = escapeHtml(entry.value)
  if (entry.content_type === 'image') return `<div class="content-card-visual"><img src="${value}" alt="${escapeHtml(entry.label)}" loading="lazy"></div>`
  if (entry.content_type === 'video') return `<div class="content-card-visual"><video src="${value}" muted playsinline preload="metadata"></video><span>VIDEO</span></div>`
  if (entry.content_type === 'icon') {
    const icon = isMediaUrl(entry.value) ? `<img src="${value}" alt="">` : `<b>${escapeHtml(builtinIcon(entry.value) || entry.value || '◇')}</b>`
    return `<div class="content-card-visual content-card-visual--icon">${icon}<span>${isMediaUrl(entry.value) ? 'ICOON ALS BEELD' : 'ICOON'}</span></div>`
  }
  if (entry.content_type === 'color') return `<div class="content-card-visual content-card-visual--color"><i style="background:${value}"></i><span>${value}</span></div>`
  return ''
}

function contentCardMarkup(entry) {
  return `<article class="content-card" data-action="open-content" data-id="${entry.id}">${contentVisualMarkup(entry)}<div class="content-card-body"><header><div><h3>${escapeHtml(entry.label)}</h3><code>${escapeHtml(entry.content_key)}</code></div>${statusPill(entry.active ? 'active' : 'inactive')}</header><p>${escapeHtml(entry.value)}</p></div></article>`
}

function sanitizePreviewHtml(value) {
  const template = document.createElement('template')
  template.innerHTML = value
  template.content.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach((element) => element.remove())
  template.content.querySelectorAll('*').forEach((element) => {
    ;[...element.attributes].forEach((attribute) => {
      if (attribute.name.startsWith('on') || /^(javascript|data:text\/html):/i.test(attribute.value.trim())) element.removeAttribute(attribute.name)
    })
  })
  return template.content
}

function renderContentPreview(container, type, value, label = 'Preview') {
  container.replaceChildren()
  container.dataset.type = type
  if (!value) {
    const empty = document.createElement('p'); empty.className = 'content-preview-empty'; empty.textContent = 'Kies media of vul inhoud in om de preview te zien.'; container.append(empty); return
  }
  if (type === 'image') {
    const image = document.createElement('img'); image.src = value; image.alt = label; image.addEventListener('error', () => { image.replaceWith(Object.assign(document.createElement('p'), { className: 'content-preview-empty', textContent: 'Deze afbeelding kan niet worden geladen.' })) }); container.append(image); return
  }
  if (type === 'video') {
    const video = document.createElement('video'); video.src = value; video.controls = true; video.muted = true; video.playsInline = true; video.preload = 'metadata'; container.append(video); return
  }
  if (type === 'icon') {
    if (isMediaUrl(value)) { const image = document.createElement('img'); image.src = value; image.alt = label; container.append(image) }
    else { const icon = document.createElement('span'); icon.className = 'content-preview-icon'; icon.textContent = builtinIcon(value) || value; container.append(icon) }
    return
  }
  if (type === 'color') {
    const swatch = document.createElement('span'); swatch.className = 'content-preview-swatch'; swatch.style.backgroundColor = value; const code = document.createElement('code'); code.textContent = value; container.append(swatch, code); return
  }
  if (type === 'button') { const button = document.createElement('button'); button.type = 'button'; button.className = 'content-preview-button'; button.textContent = value; container.append(button); return }
  if (type === 'link') { const link = document.createElement('span'); link.className = 'content-preview-link'; link.textContent = value; container.append(link); return }
  const copy = document.createElement('div'); copy.className = 'content-preview-copy'
  if (type === 'html') copy.append(sanitizePreviewHtml(value)); else copy.textContent = value
  container.append(copy)
}

function toast(title, message = '', error = false) {
  const item = document.createElement('div')
  item.className = `toast${error ? ' is-error' : ''}`
  item.innerHTML = `<strong>${escapeHtml(title)}</strong>${escapeHtml(message)}`
  elements.toastRegion.append(item)
  window.setTimeout(() => item.remove(), 4200)
}

function setBusy(button, busy, label = 'Opslaan') {
  if (!button) return
  button.disabled = busy
  button.textContent = busy ? 'Even geduld…' : label
}

async function edgeFunctionMessage(error, data, fallback) {
  let details = data || null
  if (!details && error?.context?.clone) {
    try { details = await error.context.clone().json() } catch { /* Gebruik de veilige fallback. */ }
  }
  return details?.error || fallback
}

function openDialog(title, eyebrow, body) {
  elements.dialog.classList.remove('admin-dialog--wide')
  elements.dialogTitle.textContent = title
  elements.dialogEyebrow.textContent = eyebrow
  elements.dialogBody.innerHTML = body
  elements.dialog.showModal()
}

function closeDialog() {
  elements.dialog.close()
  elements.dialog.classList.remove('admin-dialog--wide')
  elements.dialogBody.innerHTML = ''
}

function currentRoute() {
  const route = window.location.hash.replace('#', '') || 'dashboard'
  return routeMeta[route] ? route : 'dashboard'
}

function pageHeader(route, actions = '') {
  const [title, subtitle] = routeMeta[route]
  return `<header class="page-header"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="page-actions">${actions}</div></header>`
}

function emptyState(title, text, icon = '◇') {
  return `<div class="empty-state"><span>${icon}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`
}

async function recordActivity(action, entityType, entityId = '', details = {}) {
  if (!state.profile) return
  await supabase.from('activity_log').insert({
    actor_id: state.profile.id,
    actor_email: state.profile.email,
    action,
    entity_type: entityType,
    entity_id: String(entityId || ''),
    details,
  })
}

async function fetchAllData() {
  const requests = await Promise.all([
    supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).limit(500),
    supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('products').select('*, product_variants(*)').order('updated_at', { ascending: false }),
    supabase.from('payments').select('*, orders(order_number, customer_name)').order('created_at', { ascending: false }).limit(500),
    supabase.from('media').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('site_content').select('*').order('page').order('sort_order'),
    supabase.from('settings').select('*').order('category').order('key'),
    supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('analytics_events').select('*').order('created_at', { ascending: false }).limit(5000),
    supabase.from('admin_profiles').select('*').order('created_at'),
    supabase.from('admin_allowed_emails').select('*').order('created_at'),
    supabase.from('email_messages').select('*').order('created_at', { ascending: false }).limit(200),
  ])

  const firstError = requests.find((request) => request.error)?.error
  if (firstError) throw firstError

  ;[
    state.orders,
    state.customers,
    state.contactMessages,
    state.products,
    state.payments,
    state.media,
    state.content,
    state.settings,
    state.activity,
    state.analytics,
    state.profiles,
    state.allowedEmails,
    state.emailMessages,
  ] = requests.map((request) => request.data || [])

  const openOrders = state.orders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length
  document.querySelector('#open-order-count').textContent = openOrders || ''
  const newMessages = state.contactMessages.filter((message) => ['new', 'email_failed'].includes(message.status)).length
  document.querySelector('#new-message-count').textContent = newMessages || ''
}

function renderDashboard() {
  const now = new Date()
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startWeek = new Date(startDay); startWeek.setDate(startDay.getDate() - 6)
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const paid = state.orders.filter((order) => order.payment_status === 'paid')
  const revenueSince = (date) => paid.filter((order) => new Date(order.created_at) >= date).reduce((sum, order) => sum + order.total_cents, 0)
  const totalRevenue = paid.reduce((sum, order) => sum + order.total_cents, 0)
  const openOrders = state.orders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length
  const newCustomers = state.customers.filter((customer) => new Date(customer.created_at) >= startMonth).length
  const sessions = new Set(state.analytics.filter((event) => event.event_name === 'page_view').map((event) => event.session_id)).size
  const conversions = state.analytics.filter((event) => event.event_name === 'order_created').length
  const conversionRate = sessions ? (conversions / sessions) * 100 : 0
  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startWeek); date.setDate(startWeek.getDate() + index)
    const dayRevenue = paid.filter((order) => new Date(order.created_at).toDateString() === date.toDateString()).reduce((sum, order) => sum + order.total_cents, 0)
    return { label: date.toLocaleDateString('nl-NL', { weekday: 'short' }), value: dayRevenue }
  })
  const maxRevenue = Math.max(...lastSevenDays.map((day) => day.value), 100)

  elements.content.innerHTML = `<div class="page-container">
    ${pageHeader('dashboard', '<button class="button" data-action="refresh">Vernieuwen</button><button class="button button--primary" data-action="new-order">Bestelling maken</button>')}
    <section class="metric-grid" aria-label="Kerncijfers">
      <article class="metric-card"><header><span>Omzet vandaag</span><i>€</i></header><strong>${formatMoney(revenueSince(startDay))}</strong><footer><span class="trend-neutral">Actuele omzet</span><span>Vandaag</span></footer></article>
      <article class="metric-card"><header><span>Omzet 7 dagen</span><i>↗</i></header><strong>${formatMoney(revenueSince(startWeek))}</strong><footer><span class="trend-up">${state.orders.length} bestellingen totaal</span><span>7 dagen</span></footer></article>
      <article class="metric-card"><header><span>Open bestellingen</span><i>▣</i></header><strong>${openOrders}</strong><footer><span>${state.orders.filter((order) => order.fulfillment_status === 'unfulfilled').length} nog te verzenden</span><span>Actueel</span></footer></article>
      <article class="metric-card"><header><span>Conversie</span><i>%</i></header><strong>${conversionRate.toFixed(1)}%</strong><footer><span>${sessions} sessies gemeten</span><span>30 dagen</span></footer></article>
    </section>
    <section class="metric-grid" aria-label="Aanvullende cijfers">
      <article class="metric-card"><header><span>Omzet deze maand</span><i>€</i></header><strong>${formatMoney(revenueSince(startMonth))}</strong><footer><span>Totaal ${formatMoney(totalRevenue)}</span><span>Maand</span></footer></article>
      <article class="metric-card"><header><span>Bestellingen</span><i>▤</i></header><strong>${state.orders.length}</strong><footer><span>${paid.length} betaald</span><span>Totaal</span></footer></article>
      <article class="metric-card"><header><span>Nieuwe klanten</span><i>+</i></header><strong>${newCustomers}</strong><footer><span>${state.customers.length} klanten totaal</span><span>Maand</span></footer></article>
      <article class="metric-card"><header><span>Voorraad</span><i>◇</i></header><strong>${state.products.flatMap((product) => product.product_variants || []).reduce((sum, variant) => sum + variant.stock, 0)}</strong><footer><span>${state.products.length} producten</span><span>Stuks</span></footer></article>
    </section>
    <div class="dashboard-grid">
      <div>
        <section class="panel"><header class="panel-header"><div><h2>Omzet afgelopen 7 dagen</h2><p>Alle betaalde bestellingen</p></div><strong>${formatMoney(revenueSince(startWeek))}</strong></header>
          <div class="chart-wrap"><div class="chart">${lastSevenDays.map((day) => `<div class="chart-column" title="${formatMoney(day.value)}"><i style="height:${Math.max(3, (day.value / maxRevenue) * 170)}px"></i><small>${day.label}</small></div>`).join('')}</div></div>
        </section>
        <section class="panel"><header class="panel-header"><div><h2>Recente bestellingen</h2><p>De laatste vijf orders</p></div><a href="#orders">Alles bekijken →</a></header>${ordersTable(state.orders.slice(0, 5), false)}</section>
      </div>
      <aside class="dashboard-side">
        <section class="panel"><header class="panel-header"><div><h2>Recente activiteit</h2><p>Wijzigingen in de admin</p></div><a href="#activity">Logboek →</a></header>${activityList(state.activity.slice(0, 7))}</section>
        <section class="panel"><header class="panel-header"><div><h2>Snel beheren</h2><p>Direct naar een veelgebruikte actie</p></div></header><div class="quick-actions">
          <button data-action="new-product"><span>＋</span>Product toevoegen</button><button data-route-jump="media"><span>▧</span>Media uploaden</button><button data-route-jump="content"><span>▤</span>Website bewerken</button><button data-route-jump="settings"><span>⚙</span>Instellingen</button>
        </div></section>
      </aside>
    </div>
  </div>`
}

function ordersTable(orders, showAll = true) {
  if (!orders.length) return emptyState('Nog geen bestellingen', 'Nieuwe bestellingen verschijnen hier zodra de checkout wordt gebruikt.', '▣')
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>Bestelling</th><th>Datum</th><th>Klant</th><th>Totaal</th><th>Betaling</th><th>Verzending</th><th>Status</th></tr></thead><tbody>
    ${orders.map((order) => `<tr data-action="open-order" data-id="${order.id}"><td><strong>#${order.order_number}</strong></td><td>${formatDate(order.created_at, { hour: '2-digit', minute: '2-digit', year: undefined })}</td><td>${escapeHtml(order.customer_name || order.customer_email)}</td><td><strong>${formatMoney(order.total_cents, order.currency)}</strong></td><td>${statusPill(order.payment_status)}</td><td>${statusPill(order.fulfillment_status)}</td><td>${statusPill(order.status)}</td></tr>`).join('')}
  </tbody></table></div>${showAll ? `<footer class="table-footer"><span>${orders.length} bestellingen</span><span>Klik op een bestelling om deze te bewerken</span></footer>` : ''}`
}

function renderOrders() {
  elements.content.innerHTML = `<div class="page-container">${pageHeader('orders', '<button class="button" data-action="export-orders">Exporteren</button><button class="button button--primary" data-action="new-order">Bestelling maken</button>')}
    <section class="panel"><div class="filters"><input type="search" data-filter="orders" placeholder="Zoek op ordernummer, klant of e-mail"><select data-filter-status="orders"><option value="">Alle statussen</option><option value="open">Open</option><option value="completed">Afgerond</option><option value="cancelled">Geannuleerd</option></select><select data-filter-payment="orders"><option value="">Elke betaling</option><option value="pending">Openstaand</option><option value="paid">Betaald</option><option value="refunded">Terugbetaald</option></select></div><div id="orders-table">${ordersTable(state.orders)}</div></section>
  </div>`
}

function filterOrders() {
  const query = document.querySelector('[data-filter="orders"]')?.value.toLowerCase() || ''
  const orderStatus = document.querySelector('[data-filter-status="orders"]')?.value || ''
  const paymentStatus = document.querySelector('[data-filter-payment="orders"]')?.value || ''
  const filtered = state.orders.filter((order) =>
    (!query || [order.order_number, order.customer_name, order.customer_email].some((value) => String(value || '').toLowerCase().includes(query))) &&
    (!orderStatus || order.status === orderStatus) && (!paymentStatus || order.payment_status === paymentStatus))
  document.querySelector('#orders-table').innerHTML = ordersTable(filtered)
}

function openOrder(order) {
  const emailEnabled = Boolean(settingsValue('email_config').enabled)
  openDialog(`Bestelling #${order.order_number}`, 'Bestelling', `<form id="order-form">
    <div class="dialog-summary"><div><span>Klant</span><strong>${escapeHtml(order.customer_name || order.customer_email)}</strong></div><div><span>Datum</span><strong>${formatDate(order.created_at)}</strong></div><div><span>Totaal</span><strong>${formatMoney(order.total_cents)}</strong></div></div>
    <div class="line-items">${(order.order_items || []).map((item) => `<div class="line-item"><div><strong>${escapeHtml(item.product_name)}</strong><small>${escapeHtml(item.variant_name)} · ${item.quantity} × ${formatMoney(item.unit_price_cents)}</small></div><strong>${formatMoney(item.total_cents)}</strong></div>`).join('') || '<div class="line-item">Geen orderregels</div>'}</div>
    <div class="form-grid">
      <label class="field">Orderstatus<select name="status"><option value="draft">Concept</option><option value="open">Open</option><option value="completed">Afgerond</option><option value="cancelled">Geannuleerd</option></select></label>
      <label class="field">Betaalstatus<select name="payment_status"><option value="pending">Openstaand</option><option value="paid">Betaald</option><option value="failed">Mislukt</option><option value="partially_refunded">Deels terugbetaald</option><option value="refunded">Terugbetaald</option></select></label>
      <label class="field">Verzendstatus<select name="fulfillment_status"><option value="unfulfilled">Niet verzonden</option><option value="processing">In behandeling</option><option value="shipped">Verzonden</option><option value="delivered">Bezorgd</option><option value="returned">Retour</option></select></label>
      <label class="field">Trackingcode<input name="tracking_code" value="${escapeHtml(order.tracking_code)}"></label>
      <label class="field field--full">Interne notitie<textarea name="note">${escapeHtml(order.note)}</textarea></label>
      <label class="field field--full">Factuurlink<input name="invoice_url" type="url" value="${escapeHtml(order.invoice_url)}" placeholder="https://…"></label>
    </div>
    <div class="form-actions"><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button" type="button" data-action="print-invoice" data-id="${order.id}">Factuur bekijken</button>${order.payment_status === 'paid' ? `<button class="button" type="button" data-action="send-order-email" data-id="${order.id}" ${emailEnabled ? '' : 'disabled title="Activeer eerst de e-mailkoppeling"'}>Bevestiging versturen</button>` : ''}${order.invoice_url ? `<a class="button" href="${escapeHtml(order.invoice_url)}" target="_blank" rel="noreferrer">Externe factuur ↗</a>` : ''}<button class="button button--primary" type="submit">Wijzigingen opslaan</button></div>
  </form>`)
  const form = document.querySelector('#order-form')
  form.elements.status.value = order.status
  form.elements.payment_status.value = order.payment_status
  form.elements.fulfillment_status.value = order.fulfillment_status
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = form.querySelector('[type="submit"]'); setBusy(button, true)
    const values = Object.fromEntries(new FormData(form))
    const { error } = await supabase.from('orders').update(values).eq('id', order.id)
    if (error) { toast('Opslaan mislukt', error.message, true); setBusy(button, false, 'Wijzigingen opslaan'); return }
    await recordActivity('Bestelling bijgewerkt', 'order', order.id, { order_number: order.order_number })
    toast('Bestelling opgeslagen', `Order #${order.order_number} is bijgewerkt.`)
    closeDialog(); await refreshCurrentRoute()
  })
}

function customersTable(customers) {
  if (!customers.length) return emptyState('Nog geen klanten', 'Klanten worden automatisch aangemaakt bij een nieuwe bestelling.', '♙')
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>Klant</th><th>E-mail</th><th>Telefoon</th><th>Bestellingen</th><th>Besteed</th><th>Sinds</th></tr></thead><tbody>${customers.map((customer) => `<tr data-action="open-customer" data-id="${customer.id}"><td><strong>${escapeHtml(fullName(customer))}</strong></td><td>${escapeHtml(customer.email)}</td><td>${escapeHtml(customer.phone || '—')}</td><td>${customer.total_orders}</td><td><strong>${formatMoney(customer.total_spent_cents)}</strong></td><td>${formatDate(customer.created_at)}</td></tr>`).join('')}</tbody></table></div><footer class="table-footer"><span>${customers.length} klanten</span><span>Klik om gegevens en bestelgeschiedenis te bekijken</span></footer>`
}

function renderCustomers() {
  elements.content.innerHTML = `<div class="page-container">${pageHeader('customers', '<button class="button button--primary" data-action="new-customer">Klant toevoegen</button>')}<section class="panel"><div class="filters"><input type="search" data-filter="customers" placeholder="Zoek op naam, e-mail of telefoon"><select data-filter-marketing="customers"><option value="">Alle klanten</option><option value="yes">Marketing toegestaan</option><option value="no">Geen marketing</option></select></div><div id="customers-table">${customersTable(state.customers)}</div></section></div>`
}

function filterCustomers() {
  const query = document.querySelector('[data-filter="customers"]')?.value.toLowerCase() || ''
  const marketing = document.querySelector('[data-filter-marketing="customers"]')?.value || ''
  const filtered = state.customers.filter((customer) => (!query || [fullName(customer), customer.email, customer.phone].some((value) => String(value || '').toLowerCase().includes(query))) && (!marketing || customer.marketing_opt_in === (marketing === 'yes')))
  document.querySelector('#customers-table').innerHTML = customersTable(filtered)
}

function renderMessages() {
  const rows = state.contactMessages.map((message) => `<tr data-action="open-message" data-id="${message.id}"><td><strong>${escapeHtml(message.name)}</strong></td><td>${escapeHtml(message.topic)}</td><td>${escapeHtml(message.email)}</td><td>${statusPill(message.status)}</td><td>${formatDate(message.created_at, { hour: '2-digit', minute: '2-digit' })}</td></tr>`).join('')
  elements.content.innerHTML = `<div class="page-container">${pageHeader('messages', '<button class="button" data-action="refresh">Vernieuwen</button>')}<section class="metric-grid"><article class="metric-card"><header><span>Nieuwe berichten</span><i>✉</i></header><strong>${state.contactMessages.filter((message) => ['new', 'email_failed'].includes(message.status)).length}</strong><footer><span>Wacht op reactie</span><span>Actueel</span></footer></article><article class="metric-card"><header><span>Totaal ontvangen</span><i>▤</i></header><strong>${state.contactMessages.length}</strong><footer><span>Contactformulier</span><span>Totaal</span></footer></article></section><section class="panel">${rows ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Naam</th><th>Onderwerp</th><th>E-mail</th><th>Status</th><th>Ontvangen</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState('Nog geen berichten', 'Nieuwe vragen via het contactformulier verschijnen hier.', '✉')}</section></div>`
}

async function openContactMessage(message) {
  if (!message) return
  const replySubject = encodeURIComponent(`Re: ${message.topic}`)
  openDialog(message.topic, 'Contactbericht', `<div class="dialog-summary"><div><span>Naam</span><strong>${escapeHtml(message.name)}</strong></div><div><span>E-mail</span><strong>${escapeHtml(message.email)}</strong></div><div><span>Ontvangen</span><strong>${formatDate(message.created_at, { hour: '2-digit', minute: '2-digit' })}</strong></div></div><div class="contact-message-copy">${escapeHtml(message.message)}</div>${message.phone ? `<p class="contact-message-meta"><strong>Telefoon:</strong> ${escapeHtml(message.phone)}</p>` : ''}<div class="form-actions"><button class="button" type="button" data-close-dialog>Sluiten</button><a class="button button--primary" href="mailto:${escapeHtml(message.email)}?subject=${replySubject}">Beantwoorden →</a></div>`)
  if (message.status === 'new' || message.status === 'email_failed') {
    await supabase.from('contact_messages').update({ status: 'read' }).eq('id', message.id)
    message.status = 'read'
    document.querySelector('#new-message-count').textContent = state.contactMessages.filter((entry) => ['new', 'email_failed'].includes(entry.status)).length || ''
  }
}

function customerForm(customer = {}) {
  const orders = state.orders.filter((order) => order.customer_id === customer.id)
  const emailHistory = state.emailMessages.filter((email) => email.customer_id === customer.id).slice(0, 5)
  const emailEnabled = Boolean(settingsValue('email_config').enabled)
  openDialog(customer.id ? fullName(customer) : 'Nieuwe klant', 'Klant', `<form id="customer-form"><div class="form-grid">
    <label class="field">Voornaam<input name="first_name" value="${escapeHtml(customer.first_name)}" required></label><label class="field">Achternaam<input name="last_name" value="${escapeHtml(customer.last_name)}"></label>
    <label class="field">E-mailadres<input name="email" type="email" value="${escapeHtml(customer.email)}" required></label><label class="field">Telefoon<input name="phone" value="${escapeHtml(customer.phone)}"></label>
    <label class="field field--full">Notities<textarea name="notes" placeholder="Interne notities over deze klant">${escapeHtml(customer.notes)}</textarea></label>
    <label class="checkbox-field field--full"><input name="marketing_opt_in" type="checkbox" ${customer.marketing_opt_in ? 'checked' : ''}> Klant heeft toestemming gegeven voor marketing</label>
  </div>${customer.id ? `<h3>Bestelgeschiedenis</h3><div class="line-items">${orders.map((order) => `<div class="line-item"><div><strong>#${order.order_number}</strong><small>${formatDate(order.created_at)} · ${prettyStatus(order.status)}</small></div><strong>${formatMoney(order.total_cents)}</strong></div>`).join('') || '<div class="line-item">Nog geen bestellingen</div>'}</div><h3>Recente e-mails</h3><div class="line-items">${emailHistory.map((email) => `<div class="line-item"><div><strong>${escapeHtml(email.subject)}</strong><small>${formatDate(email.created_at, { hour: '2-digit', minute: '2-digit' })}</small></div>${statusPill(email.status)}</div>`).join('') || '<div class="line-item">Nog geen e-mails verstuurd</div>'}</div>` : ''}<div class="form-actions"><button class="button" type="button" data-close-dialog>Annuleren</button>${customer.id ? `<button class="button" type="button" data-action="email-customer" data-id="${customer.id}" ${emailEnabled ? '' : 'disabled title="Activeer eerst de e-mailkoppeling"'}>E-mail sturen</button>` : ''}<button class="button button--primary" type="submit">Klant opslaan</button></div></form>`)
  const form = document.querySelector('#customer-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); setBusy(button, true)
    const data = Object.fromEntries(new FormData(form)); data.email = data.email.toLowerCase(); data.marketing_opt_in = form.elements.marketing_opt_in.checked
    const query = customer.id ? supabase.from('customers').update(data).eq('id', customer.id) : supabase.from('customers').insert(data)
    const { error } = await query
    if (error) { toast('Klant opslaan mislukt', error.message, true); setBusy(button, false, 'Klant opslaan'); return }
    await recordActivity(customer.id ? 'Klant bijgewerkt' : 'Klant toegevoegd', 'customer', customer.id || data.email)
    toast('Klant opgeslagen'); closeDialog(); await refreshCurrentRoute()
  })
}

function customerEmailForm(customer) {
  if (!customer) return
  openDialog(`E-mail naar ${fullName(customer)}`, 'Klantcontact', `<form id="customer-email-form"><div class="form-grid">
    <label class="field field--full">Aan<input value="${escapeHtml(customer.email)}" disabled></label>
    <label class="field field--full">Onderwerp<input name="subject" maxlength="160" placeholder="Bijvoorbeeld: Antwoord op je vraag over ZOL" required></label>
    <label class="field field--full">Bericht<textarea name="message" maxlength="10000" rows="10" placeholder="Schrijf hier je bericht…" required></textarea><small>De ZOL-header, huisstijl en afsluiting worden automatisch toegevoegd.</small></label>
    <section class="mail-style-note field--full"><span>ZOL</span><div><strong>Automatisch in de ZOL-huisstijl</strong><small>De klant ontvangt een nette, mobiele e-mail met jullie kleuren en antwoordadres.</small></div></section>
  </div><div class="form-actions"><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit">E-mail versturen</button></div></form>`)
  const form = document.querySelector('#customer-email-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); setBusy(button, true, 'E-mail versturen')
    const values = Object.fromEntries(new FormData(form))
    const { data, error } = await supabase.functions.invoke('send-customer-email', { body: { customer_id: customer.id, subject: values.subject.trim(), message: values.message.trim() } })
    if (error || data?.error) { toast('E-mail versturen mislukt', await edgeFunctionMessage(error, data, 'De e-mail kon niet worden verstuurd.'), true); setBusy(button, false, 'E-mail versturen'); return }
    toast('E-mail verstuurd', `${customer.email} ontvangt het bericht in de ZOL-huisstijl.`); closeDialog(); await refreshCurrentRoute()
  })
}

async function sendOrderEmail(order) {
  if (!order) return
  const { data, error } = await supabase.functions.invoke('order-email', { body: { order_id: order.id } })
  if (error || data?.error) { toast('Bevestiging versturen mislukt', await edgeFunctionMessage(error, data, 'De bevestiging kon niet worden verstuurd.'), true); return }
  toast('Ordermails verstuurd', `De klant en info@zolsolutions.nl zijn geïnformeerd over #${order.order_number}.`)
  closeDialog(); await refreshCurrentRoute()
}

function renderProducts() {
  const cards = state.products.map((product) => {
    const variants = product.product_variants || []
    const stock = variants.reduce((sum, variant) => sum + variant.stock, 0)
    const image = Array.isArray(product.images) ? product.images[0] : ''
    return `<article class="product-card"><div class="product-image">${image ? `<img src="${escapeHtml(image)}" alt="">` : ''}</div><div class="product-card-body"><div>${statusPill(product.active ? 'active' : 'inactive')}</div><h3>${escapeHtml(product.name)}</h3><div class="product-meta"><span>${variants.length} varianten · ${stock} op voorraad</span><strong>${formatMoney(product.price_cents)}</strong></div></div><footer><button data-action="open-product" data-id="${product.id}">Bewerken</button><button data-action="preview-product" data-slug="${escapeHtml(product.slug)}">Voorbeeld ↗</button></footer></article>`
  }).join('')
  elements.content.innerHTML = `<div class="page-container">${pageHeader('products', '<button class="button button--primary" data-action="new-product">Product toevoegen</button>')}<div class="product-grid">${cards || emptyState('Nog geen producten', 'Voeg je eerste product toe om de webshop te vullen.', '◇')}</div></div>`
}

function productForm(product = {}) {
  const variants = (product.product_variants || []).sort((a, b) => a.sort_order - b.sort_order)
  const variantText = variants.map((variant) => `${variant.size}|${variant.shoe_size}|${variant.stock}|${variant.sku}`).join('\n')
  const images = Array.isArray(product.images) ? product.images.join('\n') : ''
  openDialog(product.id ? product.name : 'Nieuw product', 'Product', `<form id="product-form"><div class="form-grid">
    <label class="field">Productnaam<input name="name" value="${escapeHtml(product.name)}" required></label><label class="field">URL-naam<input name="slug" value="${escapeHtml(product.slug)}" placeholder="zol-inlegzolen" required></label>
    <label class="field">Prijs inclusief btw (€)<input name="price" type="number" min="0" step="0.01" value="${product.price_cents != null ? (product.price_cents / 100).toFixed(2) : ''}" required></label><label class="field">BTW-percentage<input name="tax_rate" type="number" min="0" step="0.01" value="${product.tax_rate ?? 21}" required></label>
    <label class="field field--full">Productbeschrijving<textarea name="description" required>${escapeHtml(product.description)}</textarea></label>
    <label class="field field--full">Afbeeldingen <small>Eén URL per regel; de eerste afbeelding is de hoofdafbeelding.</small><textarea name="images">${escapeHtml(images)}</textarea></label>
    <label class="field field--full">Video-URL<input name="video_url" type="url" value="${escapeHtml(product.video_url)}" placeholder="https://…"></label>
    <label class="field field--full">Maten en voorraad <small>Per regel: maat | schoenmaat | voorraad | SKU</small><textarea name="variants" placeholder="XS|34/35|20|ZOL-XS-3435">${escapeHtml(variantText)}</textarea></label>
    <label class="field">SEO-titel<input name="seo_title" value="${escapeHtml(product.seo_title)}"></label><label class="field">SEO-beschrijving<input name="seo_description" value="${escapeHtml(product.seo_description)}"></label>
    <label class="checkbox-field"><input name="active" type="checkbox" ${product.active !== false ? 'checked' : ''}> Product zichtbaar</label><label class="checkbox-field"><input name="featured" type="checkbox" ${product.featured ? 'checked' : ''}> Uitgelicht product</label>
  </div><div class="form-actions">${product.id ? '<button class="button button--danger" type="button" data-action="delete-product" data-id="' + product.id + '">Verwijderen</button>' : ''}<button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit">Product opslaan</button></div></form>`)
  const form = document.querySelector('#product-form')
  form.elements.name.addEventListener('input', () => { if (!product.id) form.elements.slug.value = slugify(form.elements.name.value) })
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); setBusy(button, true)
    const raw = Object.fromEntries(new FormData(form))
    const payload = {
      name: raw.name.trim(), slug: slugify(raw.slug), description: raw.description.trim(), price_cents: Math.round(Number(raw.price) * 100), tax_rate: Number(raw.tax_rate),
      images: raw.images.split('\n').map((value) => value.trim()).filter(Boolean), video_url: raw.video_url.trim(), seo_title: raw.seo_title.trim(), seo_description: raw.seo_description.trim(), active: form.elements.active.checked, featured: form.elements.featured.checked,
    }
    const productQuery = product.id ? supabase.from('products').update(payload).eq('id', product.id).select().single() : supabase.from('products').insert(payload).select().single()
    const { data: savedProduct, error } = await productQuery
    if (error) { toast('Product opslaan mislukt', error.message, true); setBusy(button, false, 'Product opslaan'); return }
    const parsedVariants = raw.variants.split('\n').map((line, index) => {
      const [size, shoeSize, stock = '0', sku] = line.split('|').map((part) => part?.trim())
      if (!size) return null
      return { product_id: savedProduct.id, title: `${size}${shoeSize ? ` — ${shoeSize}` : ''}`, sku: sku || `${payload.slug}-${size}`.toUpperCase(), size, shoe_size: shoeSize || '', stock: Math.max(0, Number.parseInt(stock, 10) || 0), active: true, sort_order: index + 1 }
    }).filter(Boolean)
    if (product.id) await supabase.from('product_variants').delete().eq('product_id', product.id)
    if (parsedVariants.length) {
      const { error: variantError } = await supabase.from('product_variants').insert(parsedVariants)
      if (variantError) { toast('Maten niet volledig opgeslagen', variantError.message, true); setBusy(button, false, 'Product opslaan'); return }
    }
    await recordActivity(product.id ? 'Product bijgewerkt' : 'Product toegevoegd', 'product', savedProduct.id, { name: savedProduct.name })
    toast('Product opgeslagen', `${savedProduct.name} staat in het productbeheer.`); closeDialog(); await refreshCurrentRoute()
  })
}

async function deleteProduct(productId) {
  const product = state.products.find((item) => item.id === productId)
  if (!product || !window.confirm(`Weet je zeker dat je ${product.name} wilt verwijderen?`)) return
  const { error } = await supabase.from('products').delete().eq('id', productId)
  if (error) { toast('Verwijderen mislukt', error.message, true); return }
  await recordActivity('Product verwijderd', 'product', productId, { name: product.name })
  toast('Product verwijderd'); closeDialog(); await refreshCurrentRoute()
}

function renderContent() {
  const pages = [...new Set(state.content.map((entry) => entry.page))]
  const cards = state.content.map(contentCardMarkup).join('')
  elements.content.innerHTML = `<div class="page-container">${pageHeader('content', '<button class="button" data-action="filter-icons">Iconen beheren</button><button class="button" data-action="preview-site">Website bekijken ↗</button><button class="button button--primary" data-action="new-content">Content toevoegen</button>')}<section class="panel"><div class="filters"><input type="search" data-filter="content" placeholder="Zoek op label, sleutel of inhoud"><select data-filter-page="content"><option value="">Alle pagina's</option>${pages.map((page) => `<option>${escapeHtml(page)}</option>`).join('')}</select><select data-filter-type="content"><option value="">Alle typen</option><option value="text">Tekst</option><option value="html">Opgemaakte tekst</option><option value="image">Afbeelding</option><option value="video">Video</option><option value="icon">Icoon</option><option value="button">Button</option><option value="color">Kleur</option></select></div></section><div class="content-grid" id="content-grid">${cards || emptyState('Nog geen CMS-content', 'Voeg contentvelden toe en koppel ze aan onderdelen van de website.', '▤')}</div></div>`
}

function filterContent() {
  const query = document.querySelector('[data-filter="content"]')?.value.toLowerCase() || ''
  const page = document.querySelector('[data-filter-page="content"]')?.value || ''
  const type = document.querySelector('[data-filter-type="content"]')?.value || ''
  const filtered = state.content.filter((entry) => (!query || [entry.label, entry.content_key, entry.value].some((value) => value.toLowerCase().includes(query))) && (!page || entry.page === page) && (!type || entry.content_type === type))
  document.querySelector('#content-grid').innerHTML = filtered.map(contentCardMarkup).join('') || emptyState('Geen resultaten', 'Pas je zoekopdracht of filters aan.', '⌕')
}

function contentForm(entry = {}) {
  const mediaChoices = state.media.slice(0, 30).map((item) => `<button class="content-media-choice" type="button" data-content-media data-url="${escapeHtml(item.public_url)}" data-kind="${escapeHtml(item.kind)}" title="${escapeHtml(item.filename)}">${item.kind === 'video' ? `<video src="${escapeHtml(item.public_url)}" muted playsinline preload="metadata"></video>` : `<img src="${escapeHtml(item.public_url)}" alt="">`}<span>${escapeHtml(item.filename)}</span></button>`).join('')
  const quickIcons = iconChoices.map(([value, label]) => `<button type="button" data-icon-value="${escapeHtml(value)}" title="${escapeHtml(label)}"><span>${escapeHtml(builtinIcon(value) || value)}</span><small>${escapeHtml(label)}</small></button>`).join('')
  openDialog(entry.id ? entry.label : 'Nieuw contentveld', 'Website CMS', `<form id="content-form"><div class="form-grid">
    <label class="field">Label<input name="label" value="${escapeHtml(entry.label)}" required></label><label class="field">Unieke sleutel<input name="content_key" value="${escapeHtml(entry.content_key)}" placeholder="home.hero.title" required></label>
    <label class="field">Pagina<input name="page" value="${escapeHtml(entry.page || 'global')}" required></label><label class="field">Sectie<input name="section" value="${escapeHtml(entry.section || 'general')}" required></label>
    <label class="field">Type<select name="content_type"><option value="text">Tekst</option><option value="html">Opgemaakte tekst</option><option value="image">Afbeelding</option><option value="video">Video</option><option value="icon">Icoon</option><option value="button">Button</option><option value="color">Kleur</option><option value="link">Link</option></select></label><label class="field">Eigenschap<select name="attribute"><option value="textContent">Tekst</option><option value="innerHTML">HTML</option><option value="src">Bronbestand (src)</option><option value="href">Link (href)</option><option value="style.backgroundColor">Achtergrondkleur</option></select></label>
    <label class="field field--full">CSS-koppeling <small>Hiermee wordt het juiste website-element gevonden.</small><input name="selector" value="${escapeHtml(entry.selector)}" placeholder="#hero-title"></label>
    <label class="field field--full">Inhoud of media-URL<textarea name="value" id="content-value">${escapeHtml(entry.value)}</textarea></label>
    <section class="content-media-tools field--full" id="content-media-tools" hidden>
      <div class="content-icon-source" id="content-icon-source" hidden><strong>Hoe wil je dit icoon tonen?</strong><div><button type="button" data-icon-source="builtin">Basisicoon</button><button type="button" data-icon-source="image">Eigen afbeelding</button></div><small>Een eigen JPG, PNG, WebP of SVG wordt passend binnen het bestaande icoonvlak getoond.</small></div>
      <div class="content-media-toolbar" id="content-media-toolbar"><label class="content-inline-upload"><input id="content-media-upload" type="file"><span>＋ Upload nieuw bestand</span></label><small id="content-file-status">Of kies hieronder uit je mediabibliotheek.</small></div>
      <div class="content-icon-picker" id="content-icon-picker" hidden><strong>Kies een basisicoon</strong><div>${quickIcons}</div></div>
      <div class="content-media-library" id="content-media-library">${mediaChoices || '<p>Nog geen media beschikbaar. Upload hierboven je eerste bestand.</p>'}</div>
    </section>
    <section class="content-live-preview field--full"><header><div><strong>Directe preview</strong><small>Je wijziging wordt pas gepubliceerd nadat je op Publiceren klikt.</small></div><span>LIVE</span></header><div class="content-preview-stage" id="content-preview"></div></section>
    <label class="checkbox-field field--full"><input name="active" type="checkbox" ${entry.active !== false ? 'checked' : ''}> Direct zichtbaar op de website</label>
  </div><div class="form-actions"><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit">Publiceren</button></div></form>`)
  elements.dialog.classList.add('admin-dialog--wide')
  const form = document.querySelector('#content-form')
  const preview = document.querySelector('#content-preview')
  const mediaTools = document.querySelector('#content-media-tools')
  const mediaLibrary = document.querySelector('#content-media-library')
  const mediaToolbar = document.querySelector('#content-media-toolbar')
  const iconSource = document.querySelector('#content-icon-source')
  const iconPicker = document.querySelector('#content-icon-picker')
  const uploadInput = document.querySelector('#content-media-upload')
  const fileStatus = document.querySelector('#content-file-status')
  let pendingMediaFile = null
  let pendingObjectUrl = ''
  let iconSourceMode = entry.content_type === 'icon' && isMediaUrl(entry.value) ? 'image' : 'builtin'
  form.elements.content_type.value = entry.content_type || 'text'; form.elements.attribute.value = entry.attribute || 'textContent'

  const cleanupObjectUrl = () => { if (pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl); pendingObjectUrl = '' }
  elements.dialog.addEventListener('close', cleanupObjectUrl, { once: true })

  const updatePreview = () => {
    const type = form.elements.content_type.value
    const value = pendingObjectUrl || form.elements.value.value.trim()
    const iconValueMatchesMode = type !== 'icon' || (iconSourceMode === 'image' ? isMediaUrl(value) : !isMediaUrl(value))
    renderContentPreview(preview, type, iconValueMatchesMode ? value : '', form.elements.label.value || 'Websitecontent')
    if (type === 'icon' && !iconValueMatchesMode) preview.querySelector('.content-preview-empty').textContent = iconSourceMode === 'image' ? 'Upload een afbeelding of kies er één uit de mediabibliotheek.' : 'Kies hieronder een basisicoon.'
    mediaTools.hidden = !visualContentTypes.has(type)
    iconSource.hidden = type !== 'icon'
    iconPicker.hidden = type !== 'icon' || iconSourceMode !== 'builtin'
    mediaToolbar.hidden = type === 'icon' && iconSourceMode !== 'image'
    mediaLibrary.hidden = type === 'icon' && iconSourceMode !== 'image'
    iconSource.querySelectorAll('[data-icon-source]').forEach((button) => button.classList.toggle('is-active', button.dataset.iconSource === iconSourceMode))
    uploadInput.accept = type === 'video' ? 'video/mp4,video/webm' : type === 'icon' ? 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml,.svg' : 'image/*'
    mediaLibrary.querySelectorAll('[data-content-media]').forEach((button) => {
      const matches = type === 'video' ? button.dataset.kind === 'video' : type === 'icon' ? ['icon', 'image'].includes(button.dataset.kind) : ['image', 'icon'].includes(button.dataset.kind)
      button.hidden = !matches
      button.classList.toggle('is-selected', !pendingMediaFile && button.dataset.url === form.elements.value.value.trim())
    })
  }

  form.elements.content_type.addEventListener('change', () => {
    const type = form.elements.content_type.value
    if (type === 'icon') iconSourceMode = isMediaUrl(form.elements.value.value) ? 'image' : 'builtin'
    if (!visualContentTypes.has(type) && pendingMediaFile) { pendingMediaFile = null; cleanupObjectUrl(); uploadInput.value = ''; fileStatus.textContent = 'Of kies hieronder uit je mediabibliotheek.' }
    if (['image', 'video'].includes(type)) form.elements.attribute.value = 'src'
    else if (type === 'icon') form.elements.attribute.value = 'textContent'
    else if (type === 'html') form.elements.attribute.value = 'innerHTML'
    else if (type === 'color') form.elements.attribute.value = 'style.backgroundColor'
    else if (type === 'link') form.elements.attribute.value = 'href'
    else form.elements.attribute.value = 'textContent'
    updatePreview()
  })
  form.elements.value.addEventListener('input', (event) => {
    if (event.isTrusted && pendingMediaFile) { pendingMediaFile = null; cleanupObjectUrl(); uploadInput.value = ''; fileStatus.textContent = 'Of kies hieronder uit je mediabibliotheek.' }
    updatePreview()
  })
  form.elements.label.addEventListener('input', updatePreview)
  mediaLibrary.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-content-media]'); if (!choice) return
    pendingMediaFile = null; cleanupObjectUrl(); uploadInput.value = ''
    const currentType = form.elements.content_type.value
    form.elements.content_type.value = choice.dataset.kind === 'video' ? 'video' : currentType === 'icon' || choice.dataset.kind === 'icon' ? 'icon' : 'image'
    if (form.elements.content_type.value === 'icon') iconSourceMode = 'image'
    form.elements.attribute.value = form.elements.content_type.value === 'icon' ? 'textContent' : 'src'
    form.elements.value.value = choice.dataset.url
    fileStatus.textContent = 'Media geselecteerd uit de bibliotheek.'
    updatePreview()
  })
  iconPicker.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-icon-value]'); if (!choice) return
    iconSourceMode = 'builtin'; pendingMediaFile = null; cleanupObjectUrl(); uploadInput.value = ''; form.elements.value.value = choice.dataset.iconValue; fileStatus.textContent = 'Basisicoon geselecteerd.'; updatePreview()
  })
  iconSource.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-icon-source]'); if (!choice || choice.dataset.iconSource === iconSourceMode) return
    iconSourceMode = choice.dataset.iconSource
    pendingMediaFile = null; cleanupObjectUrl(); uploadInput.value = ''
    fileStatus.textContent = iconSourceMode === 'image' ? 'Upload een afbeelding of kies er hieronder één.' : 'Kies hieronder een basisicoon.'
    updatePreview()
  })
  uploadInput.addEventListener('change', () => {
    const [file] = uploadInput.files || []; if (!file) return
    const validationError = validateMediaFile(file)
    if (validationError) { toast('Bestand niet bruikbaar', validationError, true); uploadInput.value = ''; return }
    pendingMediaFile = file; cleanupObjectUrl(); pendingObjectUrl = URL.createObjectURL(file)
    const extension = file.name.split('.').pop()?.toLowerCase()
    const detectedType = file.type.startsWith('video/') ? 'video' : extension === 'svg' ? 'icon' : 'image'
    if (form.elements.content_type.value !== 'icon' || detectedType === 'video') form.elements.content_type.value = detectedType
    if (form.elements.content_type.value === 'icon') iconSourceMode = 'image'
    form.elements.attribute.value = form.elements.content_type.value === 'icon' ? 'textContent' : 'src'
    fileStatus.textContent = `${file.name} staat klaar om bij Publiceren te uploaden.`
    updatePreview()
  })
  updatePreview()
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); setBusy(button, true)
    const payload = Object.fromEntries(new FormData(form)); payload.active = form.elements.active.checked
    if (pendingMediaFile) {
      try {
        const uploaded = await saveMediaFile(pendingMediaFile)
        payload.value = uploaded.public_url
        payload.content_type = form.elements.content_type.value
      } catch (error) {
        toast('Upload mislukt', error.message, true); setBusy(button, false, 'Publiceren'); return
      }
    }
    if (payload.content_type === 'icon' && iconSourceMode === 'image' && !isMediaUrl(payload.value)) { toast('Kies een afbeelding', 'Upload een afbeelding of kies er één uit de mediabibliotheek.', true); setBusy(button, false, 'Publiceren'); return }
    if (payload.content_type === 'icon' && iconSourceMode === 'builtin' && isMediaUrl(payload.value)) { toast('Kies een basisicoon', 'Selecteer eerst het gewenste basisicoon.', true); setBusy(button, false, 'Publiceren'); return }
    if (!String(payload.value || '').trim()) { toast('Inhoud ontbreekt', 'Kies media of vul een waarde in.', true); setBusy(button, false, 'Publiceren'); return }
    const query = entry.id ? supabase.from('site_content').update(payload).eq('id', entry.id) : supabase.from('site_content').insert(payload)
    const { error } = await query
    if (error) { toast('Publiceren mislukt', error.message, true); setBusy(button, false, 'Publiceren'); return }
    await recordActivity(entry.id ? 'Websitecontent bijgewerkt' : 'Websitecontent toegevoegd', 'content', entry.id || payload.content_key, { key: payload.content_key })
    cleanupObjectUrl()
    toast('Website bijgewerkt', 'De wijziging is direct gepubliceerd.'); closeDialog(); await refreshCurrentRoute()
  })
}

function renderMedia() {
  const cards = state.media.map((item) => `<article class="media-card"><div class="media-preview">${item.kind === 'image' || item.kind === 'icon' ? `<img src="${escapeHtml(item.public_url)}" alt="${escapeHtml(item.alt_text)}">` : item.kind === 'video' ? `<video src="${escapeHtml(item.public_url)}" muted></video>` : '<span>▤</span>'}</div><div class="media-card-actions"><button data-action="copy-media" data-url="${escapeHtml(item.public_url)}" title="Link kopiëren">⧉</button><button data-action="delete-media" data-id="${item.id}" title="Verwijderen">×</button></div><div class="media-card-body"><strong>${escapeHtml(item.filename)}</strong><small>${escapeHtml(item.kind)} · ${(item.size_bytes / 1024 / 1024).toFixed(1)} MB</small></div></article>`).join('')
  elements.content.innerHTML = `<div class="page-container">${pageHeader('media')}<label class="upload-zone"><input id="media-upload" type="file" accept="image/*,video/mp4,video/webm,.svg" multiple><div><span>⇧</span><strong>Sleep bestanden hierheen of klik om te uploaden</strong><small>Afbeeldingen, video en SVG · maximaal 50 MB per bestand</small></div></label><div class="filters panel"><input type="search" data-filter="media" placeholder="Zoek in media"><select data-filter-kind="media"><option value="">Alle media</option><option value="image">Afbeeldingen</option><option value="video">Video's</option><option value="icon">Iconen</option></select></div><div class="media-grid" id="media-grid">${cards || emptyState('Nog geen media', 'Upload beelden, video of iconen voor hergebruik op de website.', '▧')}</div></div>`
  document.querySelector('#media-upload').addEventListener('change', uploadMedia)
}

function filterMedia() {
  const query = document.querySelector('[data-filter="media"]')?.value.toLowerCase() || ''
  const kind = document.querySelector('[data-filter-kind="media"]')?.value || ''
  const filtered = state.media.filter((item) => (!query || [item.filename, item.alt_text].some((value) => value.toLowerCase().includes(query))) && (!kind || item.kind === kind))
  document.querySelector('#media-grid').innerHTML = filtered.map((item) => `<article class="media-card"><div class="media-preview">${item.kind === 'image' || item.kind === 'icon' ? `<img src="${escapeHtml(item.public_url)}" alt="${escapeHtml(item.alt_text)}">` : item.kind === 'video' ? `<video src="${escapeHtml(item.public_url)}" muted></video>` : '<span>▤</span>'}</div><div class="media-card-actions"><button data-action="copy-media" data-url="${escapeHtml(item.public_url)}">⧉</button><button data-action="delete-media" data-id="${item.id}">×</button></div><div class="media-card-body"><strong>${escapeHtml(item.filename)}</strong><small>${escapeHtml(item.kind)}</small></div></article>`).join('') || emptyState('Geen media gevonden', 'Probeer een andere zoekopdracht.', '⌕')
}

function validateMediaFile(file) {
  if (file.size > 50 * 1024 * 1024) return `${file.name} is groter dan 50 MB.`
  const extension = file.name.split('.').pop()?.toLowerCase()
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'video/mp4', 'video/webm'])
  if (!allowedTypes.has(file.type) && extension !== 'svg') return 'Gebruik JPG, PNG, WebP, GIF, SVG, MP4 of WebM.'
  return ''
}

async function saveMediaFile(file) {
  const validationError = validateMediaFile(file); if (validationError) throw new Error(validationError)
  const extension = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  const safeName = slugify(file.name.replace(/\.[^.]+$/, '')) || 'bestand'
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}.${extension}`
  const { error: uploadError } = await supabase.storage.from('zol-media').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined })
  if (uploadError) throw uploadError
  const { data: urlData } = supabase.storage.from('zol-media').getPublicUrl(path)
  const kind = file.type.startsWith('video/') ? 'video' : extension === 'svg' ? 'icon' : 'image'
  const { data, error } = await supabase.from('media').insert({ filename: file.name, storage_path: path, public_url: urlData.publicUrl, mime_type: file.type || 'application/octet-stream', size_bytes: file.size, kind, created_by: state.profile.id }).select().single()
  if (error) { await supabase.storage.from('zol-media').remove([path]); throw error }
  await recordActivity('Media geüpload', 'media', data.id, { filename: file.name })
  return data
}

async function uploadMedia(event) {
  const files = [...event.target.files]
  for (const file of files) {
    toast('Upload gestart', file.name)
    try { await saveMediaFile(file); toast('Upload voltooid', file.name) }
    catch (error) { toast('Upload mislukt', error.message, true) }
  }
  await refreshCurrentRoute()
}

async function deleteMedia(mediaId) {
  const item = state.media.find((media) => media.id === mediaId)
  if (!item || !window.confirm(`Weet je zeker dat je ${item.filename} wilt verwijderen?`)) return
  const { error: storageError } = await supabase.storage.from('zol-media').remove([item.storage_path])
  if (storageError) { toast('Bestand verwijderen mislukt', storageError.message, true); return }
  const { error } = await supabase.from('media').delete().eq('id', item.id)
  if (error) { toast('Mediarecord verwijderen mislukt', error.message, true); return }
  await recordActivity('Media verwijderd', 'media', item.id, { filename: item.filename })
  toast('Media verwijderd'); await refreshCurrentRoute()
}

function renderPayments() {
  const rows = state.payments.map((payment) => `<tr data-action="open-payment" data-id="${payment.id}"><td><strong>${escapeHtml(payment.provider_payment_id || 'Nog niet gekoppeld')}</strong></td><td>#${payment.orders?.order_number || '—'}</td><td>${escapeHtml(payment.orders?.customer_name || '—')}</td><td>${formatMoney(payment.amount_cents, payment.currency)}</td><td>${statusPill(payment.status)}</td><td>${escapeHtml(payment.method || '—')}</td><td>${formatDate(payment.created_at)}</td></tr>`).join('')
  elements.content.innerHTML = `<div class="page-container">${pageHeader('payments', '<button class="button" data-route-jump="settings">Betaalmethoden beheren</button>')}<section class="metric-grid"><article class="metric-card"><header><span>Ontvangen</span><i>€</i></header><strong>${formatMoney(state.payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount_cents, 0))}</strong><footer><span>Mollie-ready</span><span>Totaal</span></footer></article><article class="metric-card"><header><span>Openstaand</span><i>◷</i></header><strong>${formatMoney(state.payments.filter((p) => ['open', 'pending'].includes(p.status)).reduce((sum, p) => sum + p.amount_cents, 0))}</strong><footer><span>${state.payments.filter((p) => ['open', 'pending'].includes(p.status)).length} betalingen</span><span>Actueel</span></footer></article><article class="metric-card"><header><span>Terugbetaald</span><i>↩</i></header><strong>${formatMoney(state.payments.reduce((sum, p) => sum + p.refunded_cents, 0))}</strong><footer><span>Geregistreerde refunds</span><span>Totaal</span></footer></article><article class="metric-card"><header><span>Betaalpercentage</span><i>%</i></header><strong>${state.payments.length ? ((state.payments.filter((p) => p.status === 'paid').length / state.payments.length) * 100).toFixed(1) : '0.0'}%</strong><footer><span>Succesvolle betalingen</span><span>Totaal</span></footer></article></section><section class="panel">${rows ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Betaling</th><th>Order</th><th>Klant</th><th>Bedrag</th><th>Status</th><th>Methode</th><th>Datum</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState('Nog geen betalingen', 'Betalingen verschijnen hier zodra de checkout actief wordt.', '€')}</section></div>`
}

function paymentForm(payment) {
  openDialog('Betaling beheren', 'Betalingen', `<form id="payment-form"><div class="dialog-summary"><div><span>Order</span><strong>#${payment.orders?.order_number || '—'}</strong></div><div><span>Bedrag</span><strong>${formatMoney(payment.amount_cents)}</strong></div><div><span>Provider</span><strong>${escapeHtml(payment.provider)}</strong></div></div><div class="form-grid"><label class="field">Status<select name="status"><option value="open">Open</option><option value="pending">Openstaand</option><option value="authorized">Geautoriseerd</option><option value="paid">Betaald</option><option value="failed">Mislukt</option><option value="cancelled">Geannuleerd</option><option value="expired">Verlopen</option><option value="partially_refunded">Deels terugbetaald</option><option value="refunded">Terugbetaald</option></select></label><label class="field">Betaalmethode<input name="method" value="${escapeHtml(payment.method)}" placeholder="iDEAL"></label><label class="field">Provider-ID<input name="provider_payment_id" value="${escapeHtml(payment.provider_payment_id)}"></label><label class="field">Terugbetaald bedrag (€)<input name="refunded" type="number" min="0" max="${payment.amount_cents / 100}" step="0.01" value="${(payment.refunded_cents / 100).toFixed(2)}"></label></div><div class="form-actions"><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit">Betaling opslaan</button></div></form>`)
  const form = document.querySelector('#payment-form'); form.elements.status.value = payment.status
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(form)); data.refunded_cents = Math.round(Number(data.refunded) * 100); delete data.refunded
    const { error } = await supabase.from('payments').update(data).eq('id', payment.id)
    if (error) { toast('Betaling opslaan mislukt', error.message, true); return }
    await recordActivity('Betaling bijgewerkt', 'payment', payment.id, { status: data.status }); toast('Betaling opgeslagen'); closeDialog(); await refreshCurrentRoute()
  })
}

function renderAnalytics() {
  const pageViews = state.analytics.filter((event) => event.event_name === 'page_view')
  const sessions = new Set(pageViews.map((event) => event.session_id)).size
  const productViews = state.analytics.filter((event) => event.event_name === 'product_view').length
  const carts = state.analytics.filter((event) => event.event_name === 'add_to_cart').length
  const checkouts = state.analytics.filter((event) => event.event_name === 'begin_checkout').length
  const orders = state.analytics.filter((event) => event.event_name === 'order_created').length
  const conversion = sessions ? (orders / sessions) * 100 : 0
  const pages = Object.entries(pageViews.reduce((result, event) => { result[event.page || '/'] = (result[event.page || '/'] || 0) + 1; return result }, {})).sort((a, b) => b[1] - a[1])
  elements.content.innerHTML = `<div class="page-container">${pageHeader('analytics', '<button class="button" data-action="refresh">Vernieuwen</button>')}<section class="metric-grid"><article class="metric-card"><header><span>Sessies</span><i>◉</i></header><strong>${sessions}</strong><footer><span>${pageViews.length} paginaweergaven</span><span>Gemeten</span></footer></article><article class="metric-card"><header><span>Product bekeken</span><i>◇</i></header><strong>${productViews}</strong><footer><span>${sessions ? ((productViews / sessions) * 100).toFixed(1) : 0}% van sessies</span><span>Totaal</span></footer></article><article class="metric-card"><header><span>Toegevoegd aan winkelwagen</span><i>＋</i></header><strong>${carts}</strong><footer><span>${checkouts} checkouts gestart</span><span>Totaal</span></footer></article><article class="metric-card"><header><span>Conversie</span><i>%</i></header><strong>${conversion.toFixed(1)}%</strong><footer><span>${orders} orders</span><span>Totaal</span></footer></article></section><div class="dashboard-grid"><section class="panel"><header class="panel-header"><div><h2>Conversietrechter</h2><p>Van bezoek tot bestelling</p></div></header><div class="chart-wrap"><div class="chart">${[['Sessies', sessions], ['Product', productViews], ['Winkelwagen', carts], ['Checkout', checkouts], ['Order', orders]].map(([label, value]) => `<div class="chart-column"><i style="height:${Math.max(3, sessions ? (value / sessions) * 170 : 3)}px"></i><small>${label}</small></div>`).join('')}</div></div></section><section class="panel"><header class="panel-header"><div><h2>Populaire pagina's</h2><p>Op basis van paginaweergaven</p></div></header><ul class="activity-list">${pages.slice(0, 8).map(([page, count]) => `<li><i>↗</i><p><strong>${escapeHtml(page)}</strong><small>${count} weergaven</small></p></li>`).join('') || '<li><p>Nog geen gegevens.</p></li>'}</ul></section></div></div>`
}

function activityList(items) {
  return `<ul class="activity-list">${items.map((item) => `<li><i>${item.entity_type === 'product' ? '◇' : item.entity_type === 'order' ? '▣' : item.entity_type === 'media' ? '▧' : '✓'}</i><p><strong>${escapeHtml(item.action)}</strong><small>${escapeHtml(item.actor_email || 'Systeem')} · ${formatDate(item.created_at, { hour: '2-digit', minute: '2-digit' })}</small></p></li>`).join('') || '<li><p>Nog geen activiteiten.</p></li>'}</ul>`
}

function renderActivity() {
  elements.content.innerHTML = `<div class="page-container">${pageHeader('activity')}<section class="panel"><header class="panel-header"><div><h2>Activiteitenlogboek</h2><p>De laatste 100 beheeracties</p></div></header>${activityList(state.activity)}</section></div>`
}

function renderTeam() {
  const rows = state.profiles.map((profile) => `<tr><td><strong>${escapeHtml(profile.full_name || profile.email)}</strong></td><td>${escapeHtml(profile.email)}</td><td>${statusPill(profile.active ? 'active' : 'inactive')}</td><td>${escapeHtml(profile.role)}</td><td>${formatDate(profile.created_at)}</td></tr>`).join('')
  const pending = state.allowedEmails.filter((allowed) => !state.profiles.some((profile) => profile.email === allowed.email))
  const actions = state.profile?.role === 'owner' ? '<button class="button button--primary" data-action="invite-admin">Beheerder toevoegen</button>' : ''
  elements.content.innerHTML = `<div class="page-container">${pageHeader('team', actions)}<section class="panel"><header class="panel-header"><div><h2>Actieve beheerders</h2><p>Toegang tot de ZOL-beheeromgeving</p></div></header>${rows ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Naam</th><th>E-mail</th><th>Status</th><th>Rol</th><th>Sinds</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState('Nog geen actieve beheerders', 'De eigenaar kan hier een beheerder toevoegen.', '♧')}</section>${pending.length ? `<section class="panel"><header class="panel-header"><div><h2>Wacht op activering</h2><p>Account is nog niet geactiveerd</p></div></header><div class="table-scroll"><table class="data-table"><thead><tr><th>E-mail</th><th>Rol</th><th>Toegevoegd</th></tr></thead><tbody>${pending.map((entry) => `<tr><td>${escapeHtml(entry.email)}</td><td>${escapeHtml(entry.role)}</td><td>${formatDate(entry.created_at)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}</div>`
}

function inviteAdminForm() {
  openDialog('Beheerder toevoegen', 'Team', `<form id="invite-form"><div class="form-grid"><label class="field field--full">Naam<input name="full_name" type="text" autocomplete="name" maxlength="100" required></label><label class="field field--full">E-mailadres<input name="email" type="email" autocomplete="off" autocapitalize="none" spellcheck="false" required></label><label class="field">Tijdelijk wachtwoord<input name="password" type="password" autocomplete="new-password" minlength="12" required></label><label class="field">Herhaal wachtwoord<input name="password_confirm" type="password" autocomplete="new-password" minlength="12" required></label><label class="field field--full">Rol<select name="role"><option value="admin">Beheerder</option><option value="editor">Contentbeheerder</option><option value="viewer">Alleen bekijken</option></select></label></div><p style="color:#68737e;font-size:10px;line-height:1.6">Gebruik minimaal 12 tekens met een hoofdletter, kleine letter, cijfer en speciaal teken. Deel het tijdelijke wachtwoord via een veilig kanaal.</p><div class="form-actions"><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit">Beheerder aanmaken</button></div></form>`)
  const form = document.querySelector('#invite-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); setBusy(button, true, 'Beheerder aanmaken')
    const payload = Object.fromEntries(new FormData(form)); payload.email = payload.email.trim().toLowerCase(); payload.full_name = payload.full_name.trim()
    if (payload.password !== payload.password_confirm) { toast('Wachtwoorden komen niet overeen', '', true); setBusy(button, false, 'Beheerder aanmaken'); return }
    if (!isStrongPassword(payload.password)) { toast('Kies een sterker wachtwoord', 'Minimaal 12 tekens, hoofdletter, kleine letter, cijfer en speciaal teken.', true); setBusy(button, false, 'Beheerder aanmaken'); return }
    delete payload.password_confirm
    const { data, error } = await supabase.functions.invoke('invite-admin', { body: payload })
    if (error || data?.error) { toast('Beheerder aanmaken mislukt', data?.error || error.message, true); setBusy(button, false, 'Beheerder aanmaken'); return }
    await recordActivity('Beheerder aangemaakt', 'admin', payload.email, { role: payload.role })
    toast('Beheerder aangemaakt', `${payload.email} kan nu inloggen.`); closeDialog(); await refreshCurrentRoute()
  })
}

function settingsValue(key) { return state.settings.find((setting) => setting.key === key)?.value || {} }

function renderSettings(category = 'company') {
  const company = settingsValue('company_profile'), commerce = settingsValue('commerce'), theme = settingsValue('theme'), seo = settingsValue('seo_defaults'), email = settingsValue('email_config')
  const panels = {
    company: `<h2>Bedrijfsgegevens</h2><p>Gegevens die op facturen en in contactinformatie worden gebruikt.</p><form id="settings-form" data-key="company_profile" data-category="company"><div class="form-grid"><label class="field">Bedrijfsnaam<input name="name" value="${escapeHtml(company.name)}"></label><label class="field">E-mailadres<input name="email" type="email" value="${escapeHtml(company.email)}"></label><label class="field">Telefoon<input name="phone" value="${escapeHtml(company.phone)}"></label><label class="field">KvK-nummer<input name="kvk" value="${escapeHtml(company.kvk)}"></label><label class="field">BTW-nummer<input name="vat_number" value="${escapeHtml(company.vat_number)}"></label><label class="field">Adres<input name="address" value="${escapeHtml(company.address)}"></label></div>${settingsActions()}</form>`,
    checkout: `<h2>Checkout & betalingen</h2><p>Verzending, belasting en de voorbereiding op Mollie.</p><form id="settings-form" data-key="commerce" data-category="checkout"><div class="form-grid"><label class="field">Verzendkosten (€)<input name="shipping_cents" data-cents type="number" min="0" step="0.01" value="${((commerce.shipping_cents || 0) / 100).toFixed(2)}"></label><label class="field">Gratis verzending vanaf (€)<input name="free_shipping_threshold_cents" data-cents type="number" min="0" step="0.01" value="${((commerce.free_shipping_threshold_cents || 0) / 100).toFixed(2)}"></label><label class="field">BTW-percentage<input name="tax_rate" type="number" min="0" step="0.01" value="${commerce.tax_rate ?? 21}"></label><label class="field">Valuta<select name="currency"><option value="EUR" ${commerce.currency === 'EUR' ? 'selected' : ''}>EUR — euro</option></select></label><label class="checkbox-field field--full"><input name="mollie_enabled" type="checkbox" ${commerce.mollie_enabled ? 'checked' : ''}> Mollie activeren zodra de API-sleutel veilig is ingesteld</label></div>${settingsActions()}</form>`,
    website: `<h2>Huisstijl & SEO</h2><p>Pas de basiskleuren en standaard zoekmachinegegevens aan.</p><form id="settings-form" data-key="theme" data-category="website"><div class="form-grid"><label class="field">ZOL-blauw<div class="color-row"><input name="primary" type="color" value="${escapeHtml(theme.primary || '#33669B')}"><input value="${escapeHtml(theme.primary || '#33669B')}" disabled></div></label><label class="field">Accentkleur<div class="color-row"><input name="accent" type="color" value="${escapeHtml(theme.accent || '#F28C57')}"><input value="${escapeHtml(theme.accent || '#F28C57')}" disabled></div></label><label class="field">Tekstkleur<div class="color-row"><input name="ink" type="color" value="${escapeHtml(theme.ink || '#10233B')}"><input value="${escapeHtml(theme.ink || '#10233B')}" disabled></div></label><label class="field">Achtergrond<div class="color-row"><input name="background" type="color" value="${escapeHtml(theme.background || '#F7F5F0')}"><input value="${escapeHtml(theme.background || '#F7F5F0')}" disabled></div></label></div>${settingsActions()}</form><form id="seo-settings-form" style="margin-top:25px"><h2>Standaard SEO</h2><div class="form-grid"><label class="field">Websitetitel<input name="title" value="${escapeHtml(seo.title)}"></label><label class="field">Beschrijving<input name="description" value="${escapeHtml(seo.description)}"></label></div>${settingsActions()}</form>`,
    email: `<h2>E-mail</h2><p>Afzender, antwoordadres en interne meldingen. De geheime API-sleutel wordt nooit in de browser opgeslagen.</p><form id="settings-form" data-key="email_config" data-category="email"><div class="email-connection ${email.enabled ? 'is-connected' : ''}"><i>${email.enabled ? '✓' : '!'}</i><div><strong>${email.enabled ? 'E-mailverzending actief' : 'Wacht op domein en API-sleutel'}</strong><small>${email.enabled ? 'Order-, contact- en klantmails zijn ingeschakeld.' : 'De volledige mailflow staat klaar, maar verstuurt nog niets.'}</small></div></div><div class="form-grid"><label class="field">Afzendernaam<input name="from_name" value="${escapeHtml(email.from_name || 'ZOL Solutions')}"></label><label class="field">Afzenderadres<input name="from_email" type="email" value="${escapeHtml(email.from_email || 'info@zolsolutions.nl')}"></label><label class="field">Antwoordadres<input name="reply_to" type="email" value="${escapeHtml(email.reply_to || 'info@zolsolutions.nl')}"></label><label class="field">Interne meldingen naar<input name="admin_email" type="email" value="${escapeHtml(email.admin_email || 'info@zolsolutions.nl')}"></label><label class="field field--full">Website-URL<input name="website_url" type="url" value="${escapeHtml(email.website_url || 'https://zolsolutions.nl')}"></label><input name="provider" type="hidden" value="resend"><label class="checkbox-field field--full"><input name="enabled" type="checkbox" ${email.enabled ? 'checked' : ''}> Verzending activeren <small>(pas na domeinverificatie en server-side API-sleutel)</small></label></div>${settingsActions('E-mailinstellingen opslaan')}</form>`,
    security: `<h2>Account & beveiliging</h2><p>Wijzig je eigen wachtwoord. Na de wijziging worden alle andere actieve sessies afgemeld.</p><form id="password-form"><div class="form-grid"><label class="field field--full">Huidig wachtwoord<input name="current_password" type="password" autocomplete="current-password" required></label><label class="field">Nieuw wachtwoord<input name="password" type="password" autocomplete="new-password" minlength="12" required><small>Minimaal 12 tekens met hoofdletter, kleine letter, cijfer en speciaal teken.</small></label><label class="field">Herhaal nieuw wachtwoord<input name="password_confirm" type="password" autocomplete="new-password" minlength="12" required></label></div>${settingsActions('Wachtwoord wijzigen')}</form>`,
  }
  elements.content.innerHTML = `<div class="page-container">${pageHeader('settings')}<div class="settings-layout"><nav class="settings-nav panel"><button data-settings-tab="company" class="${category === 'company' ? 'is-active' : ''}">Bedrijf</button><button data-settings-tab="checkout" class="${category === 'checkout' ? 'is-active' : ''}">Checkout & btw</button><button data-settings-tab="website" class="${category === 'website' ? 'is-active' : ''}">Website & SEO</button><button data-settings-tab="email" class="${category === 'email' ? 'is-active' : ''}">E-mail</button><button data-settings-tab="security" class="${category === 'security' ? 'is-active' : ''}">Wachtwoord</button></nav><section class="settings-panel panel">${panels[category] || panels.company}</section></div></div>`
  bindSettingsForms(category)
}

function settingsActions(label = 'Instellingen opslaan') { return `<div class="form-actions"><button class="button button--primary" type="submit">${label}</button></div>` }

function bindSettingsForms(category) {
  const form = document.querySelector('#settings-form')
  form?.addEventListener('submit', async (event) => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(form)); form.querySelectorAll('[data-cents]').forEach((input) => values[input.name] = Math.round(Number(input.value) * 100)); form.querySelectorAll('input[type="number"]:not([data-cents])').forEach((input) => values[input.name] = Number(input.value)); form.querySelectorAll('input[type="checkbox"]').forEach((input) => values[input.name] = input.checked)
    const key = form.dataset.key; const { error } = await supabase.from('settings').upsert({ key, category: form.dataset.category, label: key === 'commerce' ? 'Webshopinstellingen' : key === 'theme' ? 'Huisstijl' : key === 'email_config' ? 'E-mailinstellingen' : 'Bedrijfsgegevens', value: values, is_public: ['commerce', 'theme'].includes(key) })
    if (error) { toast('Instellingen opslaan mislukt', error.message, true); return }
    await recordActivity('Instellingen bijgewerkt', 'settings', key); toast('Instellingen opgeslagen'); await refreshCurrentRoute(category)
  })
  document.querySelector('#seo-settings-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const { error } = await supabase.from('settings').upsert({ key: 'seo_defaults', category: 'website', label: 'Standaard SEO', value: values, is_public: true }); if (error) { toast('SEO opslaan mislukt', error.message, true); return } await recordActivity('SEO bijgewerkt', 'settings', 'seo_defaults'); toast('SEO opgeslagen'); await refreshCurrentRoute('website')
  })
  document.querySelector('#password-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const passwordForm = event.currentTarget
    const button = passwordForm.querySelector('[type="submit"]')
    const values = Object.fromEntries(new FormData(passwordForm))
    if (values.password !== values.password_confirm) { toast('Wachtwoorden komen niet overeen', '', true); return }
    if (!isStrongPassword(values.password)) { toast('Kies een sterker wachtwoord', 'Minimaal 12 tekens, hoofdletter, kleine letter, cijfer en speciaal teken.', true); return }
    setBusy(button, true, 'Wachtwoord wijzigen')
    const email = state.session?.user?.email
    const { data: reauthenticated, error: reauthenticationError } = await supabase.auth.signInWithPassword({ email, password: values.current_password })
    if (reauthenticationError) { toast('Huidig wachtwoord is niet juist', '', true); setBusy(button, false, 'Wachtwoord wijzigen'); return }
    state.session = reauthenticated.session
    const { error } = await supabase.auth.updateUser({ password: values.password, currentPassword: values.current_password })
    if (error) { toast('Wachtwoord wijzigen mislukt', error.message, true); setBusy(button, false, 'Wachtwoord wijzigen'); return }
    await supabase.auth.signOut({ scope: 'others' })
    await recordActivity('Wachtwoord gewijzigd', 'admin', state.profile.id)
    toast('Wachtwoord gewijzigd', 'Andere actieve sessies zijn afgemeld.')
    passwordForm.reset(); setBusy(button, false, 'Wachtwoord wijzigen')
  })
}

function renderRoute(route = currentRoute(), option) {
  document.querySelectorAll('[data-route]').forEach((link) => link.classList.toggle('is-active', link.dataset.route === route))
  elements.sidebar.classList.remove('is-open')
  const renderers = { dashboard: renderDashboard, orders: renderOrders, customers: renderCustomers, messages: renderMessages, products: renderProducts, content: renderContent, media: renderMedia, payments: renderPayments, analytics: renderAnalytics, activity: renderActivity, team: renderTeam, settings: () => renderSettings(option) }
  renderers[route]?.()
  elements.content.focus({ preventScroll: true })
  window.scrollTo({ top: 0, behavior: 'instant' })
}

async function refreshCurrentRoute(option) {
  try { await fetchAllData(); renderRoute(currentRoute(), option) } catch (error) { toast('Vernieuwen mislukt', error.message, true) }
}

async function exportOrders() {
  if (!state.orders.length) { toast('Geen bestellingen om te exporteren'); return }
  const rows = [['Bestelling', 'Datum', 'Klant', 'E-mail', 'Totaal', 'Betaling', 'Verzending', 'Status'], ...state.orders.map((order) => [order.order_number, order.created_at, order.customer_name, order.customer_email, (order.total_cents / 100).toFixed(2), order.payment_status, order.fulfillment_status, order.status])]
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = `zol-bestellingen-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url)
  await recordActivity('Bestellingen geëxporteerd', 'order', '', { count: state.orders.length }); toast('Export aangemaakt')
}

function printInvoice(order) {
  const company = settingsValue('company_profile')
  const address = order.shipping_address || {}
  const invoice = window.open('', '_blank', 'noopener,noreferrer')
  if (!invoice) { toast('Pop-up geblokkeerd', 'Sta pop-ups toe om de factuur te openen.', true); return }
  invoice.document.write(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Factuur ZOL-${order.order_number}</title><style>
    body{max-width:820px;margin:50px auto;padding:0 25px;color:#17212d;font:14px/1.55 Arial,sans-serif}header{display:flex;justify-content:space-between;gap:30px;padding-bottom:28px;border-bottom:3px solid #33669b}.logo{font:bold 34px Arial;color:#33669b}h1{font-size:30px;margin:0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:35px;margin:35px 0}.meta h2{font-size:12px;text-transform:uppercase;color:#33669b}table{width:100%;border-collapse:collapse;margin-top:25px}th,td{padding:12px 8px;border-bottom:1px solid #dfe3e8;text-align:left}th:last-child,td:last-child{text-align:right}.totals{width:310px;margin:25px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:6px}.totals .total{margin-top:7px;padding-top:12px;border-top:2px solid #17212d;font-size:18px;font-weight:bold}footer{margin-top:65px;padding-top:18px;border-top:1px solid #dfe3e8;color:#68737e;font-size:11px}@media print{body{margin:0}.no-print{display:none}}</style></head><body>
    <header><div><div class="logo">ZOL</div><strong>${escapeHtml(company.name || 'ZOL Solutions')}</strong></div><div><h1>Factuur</h1><p>Factuurnummer: ZOL-${order.order_number}<br>Factuurdatum: ${formatDate(order.created_at)}</p></div></header>
    <section class="meta"><div><h2>Van</h2><p><strong>${escapeHtml(company.name || 'ZOL Solutions')}</strong><br>${escapeHtml(company.address || '')}<br>${escapeHtml(company.email || 'info@zolsolutions.nl')}<br>${company.kvk ? `KvK: ${escapeHtml(company.kvk)}<br>` : ''}${company.vat_number ? `BTW: ${escapeHtml(company.vat_number)}` : ''}</p></div><div><h2>Factuur aan</h2><p><strong>${escapeHtml(order.customer_name)}</strong><br>${escapeHtml(address.street || '')}<br>${escapeHtml(address.postal_code || '')} ${escapeHtml(address.city || '')}<br>${escapeHtml(order.customer_email)}</p></div></section>
    <table><thead><tr><th>Product</th><th>Aantal</th><th>Prijs</th><th>Totaal</th></tr></thead><tbody>${(order.order_items || []).map((item) => `<tr><td><strong>${escapeHtml(item.product_name)}</strong><br><small>${escapeHtml(item.variant_name)}</small></td><td>${item.quantity}</td><td>${formatMoney(item.unit_price_cents)}</td><td>${formatMoney(item.total_cents)}</td></tr>`).join('')}</tbody></table>
    <div class="totals"><div><span>Subtotaal</span><strong>${formatMoney(order.subtotal_cents)}</strong></div><div><span>Verzending</span><strong>${formatMoney(order.shipping_cents)}</strong></div><div><span>Inclusief btw</span><strong>${formatMoney(order.tax_cents)}</strong></div><div class="total"><span>Totaal</span><strong>${formatMoney(order.total_cents)}</strong></div></div>
    <footer>Betaalstatus: ${escapeHtml(prettyStatus(order.payment_status))} · Bedankt voor je bestelling bij ZOL Solutions.</footer></body></html>`)
  invoice.document.close()
  window.setTimeout(() => invoice.print(), 250)
}

async function handleContentClick(event) {
  const close = event.target.closest('[data-close-dialog]'); if (close) { closeDialog(); return }
  const jump = event.target.closest('[data-route-jump]'); if (jump) { window.location.hash = jump.dataset.routeJump; return }
  const target = event.target.closest('[data-action]'); if (!target) return
  const { action, id } = target.dataset
  if (action === 'refresh') await refreshCurrentRoute()
  if (action === 'export-orders') await exportOrders()
  if (action === 'print-invoice') printInvoice(state.orders.find((item) => item.id === id))
  if (action === 'open-order') openOrder(state.orders.find((item) => item.id === id))
  if (action === 'new-order') toast('Bestelling aanmaken', 'Nieuwe handmatige orders worden in de volgende checkoutfase toegevoegd.')
  if (action === 'open-customer') customerForm(state.customers.find((item) => item.id === id))
  if (action === 'open-message') await openContactMessage(state.contactMessages.find((item) => item.id === id))
  if (action === 'new-customer') customerForm()
  if (action === 'email-customer') { const customer = state.customers.find((item) => item.id === id); closeDialog(); queueMicrotask(() => customerEmailForm(customer)) }
  if (action === 'open-product') productForm(state.products.find((item) => item.id === id))
  if (action === 'new-product') productForm()
  if (action === 'delete-product') await deleteProduct(id)
  if (action === 'preview-product') window.open('/product/', '_blank', 'noopener')
  if (action === 'open-content') contentForm(state.content.find((item) => item.id === id))
  if (action === 'new-content') contentForm()
  if (action === 'filter-icons') { const filter = document.querySelector('[data-filter-type="content"]'); if (filter) { filter.value = 'icon'; filterContent() } }
  if (action === 'preview-site') window.open('/', '_blank', 'noopener')
  if (action === 'copy-media') { await navigator.clipboard.writeText(target.dataset.url); toast('Link gekopieerd') }
  if (action === 'delete-media') await deleteMedia(id)
  if (action === 'open-payment') paymentForm(state.payments.find((item) => item.id === id))
  if (action === 'send-order-email') await sendOrderEmail(state.orders.find((item) => item.id === id))
  if (action === 'invite-admin') inviteAdminForm()
}

function handleFilters(event) {
  if (event.target.matches('[data-filter="orders"], [data-filter-status="orders"], [data-filter-payment="orders"]')) filterOrders()
  if (event.target.matches('[data-filter="customers"], [data-filter-marketing="customers"]')) filterCustomers()
  if (event.target.matches('[data-filter="content"], [data-filter-page="content"], [data-filter-type="content"]')) filterContent()
  if (event.target.matches('[data-filter="media"], [data-filter-kind="media"]')) filterMedia()
}

async function showAdmin(session) {
  state.session = session
  const { data: profile, error } = await supabase.from('admin_profiles').select('*').eq('id', session.user.id).single()
  if (error || !profile?.active) {
    await supabase.auth.signOut()
    showLogin('Dit account heeft geen toegang tot ZOL Admin. Vraag de eigenaar om een uitnodiging.')
    return
  }
  state.profile = profile
  document.querySelector('#account-name').textContent = profile.full_name || profile.email.split('@')[0]
  document.querySelector('#account-role').textContent = prettyStatus(profile.role === 'owner' ? 'Eigenaar' : profile.role)
  document.querySelector('#account-initials').textContent = initials(profile.full_name || profile.email)
  elements.loading.hidden = true; elements.login.hidden = true; elements.app.hidden = false
  try { await fetchAllData(); renderRoute() } catch (fetchError) { toast('Admin laden mislukt', fetchError.message, true); elements.content.innerHTML = `<div class="page-container">${emptyState('Gegevens konden niet worden geladen', fetchError.message, '×')}</div>` }
}

function showLogin(message = '') {
  elements.loading.hidden = true; elements.app.hidden = true; elements.login.hidden = false
  const messageElement = document.querySelector('#login-message'); messageElement.textContent = message; messageElement.classList.toggle('is-error', Boolean(message))
}

async function boot() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) await showAdmin(session); else showLogin()
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type="submit"]'); const message = document.querySelector('#login-message'); setBusy(button, true, 'Inloggen'); message.textContent = ''; message.classList.remove('is-error')
  const values = Object.fromEntries(new FormData(form)); const { data, error } = await supabase.auth.signInWithPassword({ email: values.email.trim().toLowerCase(), password: values.password })
  if (error) { message.textContent = 'E-mailadres of wachtwoord is niet juist.'; message.classList.add('is-error'); setBusy(button, false, 'Inloggen'); return }
  await showAdmin(data.session)
})

document.querySelector('#reset-password').addEventListener('click', async () => {
  const email = document.querySelector('#login-form [name="email"]').value.trim().toLowerCase()
  if (!email) { toast('Vul eerst je e-mailadres in', '', true); return }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/admin/` })
  if (error) { toast('E-mail versturen mislukt', error.message, true); return }
  toast('Herstellink verstuurd', 'Controleer je inbox.')
})

document.querySelector('#sign-out').addEventListener('click', () => supabase.auth.signOut())
document.querySelector('#mobile-menu-button').addEventListener('click', () => elements.sidebar.classList.toggle('is-open'))
elements.backdrop.addEventListener('click', () => elements.sidebar.classList.remove('is-open'))
document.querySelector('#dialog-close').addEventListener('click', closeDialog)
elements.dialog.addEventListener('click', (event) => { if (event.target === elements.dialog) closeDialog() })
elements.content.addEventListener('click', handleContentClick)
elements.dialogBody.addEventListener('click', handleContentClick)
elements.content.addEventListener('input', handleFilters)
elements.content.addEventListener('change', handleFilters)
elements.content.addEventListener('click', (event) => { const tab = event.target.closest('[data-settings-tab]'); if (tab) renderSettings(tab.dataset.settingsTab) })
window.addEventListener('hashchange', () => renderRoute())
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#global-search').focus() } if (event.key === 'Escape') elements.sidebar.classList.remove('is-open') })
document.querySelector('#global-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') { state.search = event.currentTarget.value; window.location.hash = 'orders'; requestAnimationFrame(() => { const input = document.querySelector('[data-filter="orders"]'); if (input) { input.value = state.search; filterOrders() } }) } })

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') { state.session = null; state.profile = null; showLogin() }
  if (event === 'PASSWORD_RECOVERY') { window.location.hash = 'settings'; if (session) showAdmin(session).then(() => renderSettings('security')) }
})

boot()
