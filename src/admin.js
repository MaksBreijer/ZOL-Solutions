import './admin.css'
import { formatDate, formatMoney, supabase } from './supabase-client.js'
import {
  Archive, ArrowLeft, BadgePercent, Bell, CalendarDays, ChartNoAxesCombined,
  CheckCircle, ChevronRight, ChevronsUpDown, CircleEuro, CreditCard, Download,
  ExternalLink, FileText, History, House, Images, Link, LogOut, Mail, MapPin,
  Menu, Package, PanelsTopLeft, Pencil, Plus, RadioTower, RefreshCw, RotateCcw,
  Search, Settings, ShoppingBag, Store, Tag, TrendingUp, Truck, UserCog, UserPlus, Users,
  createIcons,
} from 'lucide'

const adminIcons = {
  Archive, ArrowLeft, BadgePercent, Bell, CalendarDays, ChartNoAxesCombined,
  CheckCircle, ChevronRight, ChevronsUpDown, CircleEuro, CreditCard, Download,
  ExternalLink, FileText, History, House, Images, Link, LogOut, Mail, MapPin,
  Menu, Package, PanelsTopLeft, Pencil, Plus, RadioTower, RefreshCw, RotateCcw,
  Search, Settings, ShoppingBag, Store, Tag, TrendingUp, Truck, UserCog, UserPlus, Users,
}

const refreshIcons = () => createIcons({ icons: adminIcons, attrs: { 'aria-hidden': 'true' } })

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
  emailTemplates: [],
  discounts: [],
  orderNotes: [],
  search: '',
}

const routeMeta = {
  dashboard: ['Home', 'Alles wat vandaag aandacht nodig heeft, op één plek.'],
  orders: ['Bestellingen', 'Beheer betalingen, verzending en orderdetails.'],
  customers: ['Klanten', 'Klantgegevens, bestelgeschiedenis en interne notities.'],
  messages: ['Berichten', 'Vragen die via het contactformulier zijn binnengekomen.'],
  emails: ['E-mails', 'Bewerk alle automatische bestel- en bedankmails in de ZOL-huisstijl.'],
  products: ['Producten', 'Prijzen, maten, voorraad en productmedia.'],
  discounts: ['Kortingen', 'Maak kortingscodes en automatische acties voor de ZOL-webshop.'],
  content: ['Website CMS', 'Bewerk teksten, knoppen, beelden, video en SEO zonder code.'],
  media: ['Mediabibliotheek', 'Eén centrale plek voor afbeeldingen, video en iconen.'],
  payments: ['Betalingen', 'Betaalstatussen en terugbetalingen, klaar voor Mollie.'],
  analytics: ['Analytics', 'Verkeer, omzet, winkelgedrag en conversie in één rapport.'],
  live: ['Live View', 'Bekijk live bezoekers, winkelgedrag en bestellingen.'],
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
const roleLabel = (role = '') => ({ owner: 'Eigenaar', admin: 'Beheerder', editor: 'Contentbeheerder', viewer: 'Alleen bekijken' }[role] || role)
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

async function edgeFunctionDetails(error, data) {
  let details = data || null
  if (!details && error?.context?.clone) {
    try { details = await error.context.clone().json() } catch { /* Gebruik de veilige fallback. */ }
  }
  return details || {}
}

async function edgeFunctionMessage(error, data, fallback) {
  const details = await edgeFunctionDetails(error, data)
  return details.error || fallback
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

function globalSearchItems(query) {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const includes = (...values) => values.filter(Boolean).join(' ').toLowerCase().includes(needle)
  const items = []
  Object.entries(routeMeta).forEach(([route, [title, subtitle]]) => {
    if (includes(title, subtitle)) items.push({ route, label: title, meta: 'Pagina', icon: '↗' })
  })
  state.orders.forEach((order) => {
    if (includes(order.order_number, order.customer_name, order.customer_email)) items.push({ route: 'orders', label: `#${order.order_number} · ${order.customer_name || order.customer_email}`, meta: 'Bestelling', icon: 'O', id: order.id, action: 'open-order' })
  })
  state.customers.forEach((customer) => {
    if (includes(fullName(customer), customer.email, customer.phone)) items.push({ route: 'customers', label: fullName(customer), meta: customer.email || 'Klant', icon: 'K', id: customer.id, action: 'open-customer' })
  })
  state.products.forEach((product) => {
    if (includes(product.name, product.slug, product.description)) items.push({ route: 'products', label: product.name, meta: 'Product', icon: 'P', id: product.id, action: 'open-product' })
  })
  state.contactMessages.forEach((message) => {
    if (includes(message.name, message.email, message.subject, message.message)) items.push({ route: 'messages', label: message.subject || message.name || message.email, meta: 'Bericht', icon: 'B', id: message.id, action: 'open-message' })
  })
  state.content.forEach((entry) => {
    if (includes(entry.label, entry.content_key, entry.value, entry.page)) items.push({ route: 'content', label: entry.label, meta: `CMS · ${entry.page}`, icon: 'C', id: entry.id, action: 'open-content' })
  })
  state.media.forEach((entry) => {
    if (includes(entry.filename, entry.alt_text, entry.kind)) items.push({ route: 'media', label: entry.filename, meta: 'Media', icon: 'M', query: entry.filename })
  })
  state.discounts.forEach((discount) => {
    if (includes(discount.title, discount.code, discount.discount_type)) items.push({ route: 'discounts', label: discount.code || discount.title, meta: 'Korting', icon: '%', id: discount.id, action: 'open-discount' })
  })
  return items.slice(0, 7)
}

function hideGlobalSearch() {
  const input = document.querySelector('#global-search')
  const results = document.querySelector('#global-search-results')
  results.hidden = true
  input.setAttribute('aria-expanded', 'false')
}

function renderGlobalSearch(query) {
  const input = document.querySelector('#global-search')
  const results = document.querySelector('#global-search-results')
  if (!query.trim()) { hideGlobalSearch(); return }
  const items = globalSearchItems(query)
  results.innerHTML = items.length
    ? `<p>Zoekresultaten</p>${items.map((item) => `<button type="button" data-search-route="${item.route}" data-search-id="${escapeHtml(item.id || '')}" data-search-action="${escapeHtml(item.action || '')}" data-search-query="${escapeHtml(item.query || query)}"><span>${item.icon}</span><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.meta)}</small></span><em>Openen ↗</em></button>`).join('')}`
    : '<div class="empty-state"><h3>Niets gevonden</h3><p>Probeer een ordernummer, klant, product of CMS-veld.</p></div>'
  results.hidden = false
  input.setAttribute('aria-expanded', 'true')
}

function openGlobalSearchResult(button) {
  const { searchRoute: route, searchId: id, searchAction: action, searchQuery: query } = button.dataset
  hideGlobalSearch()
  document.querySelector('#global-search').value = ''
  if (currentRoute() === route) renderRoute(route)
  else window.location.hash = route
  window.setTimeout(() => {
    if (action && id) {
      document.querySelector(`[data-action="${action}"][data-id="${CSS.escape(id)}"]`)?.click()
      return
    }
    const filter = document.querySelector(`[data-filter="${route}"]`)
    if (filter) { filter.value = query; filter.dispatchEvent(new Event('input', { bubbles: true })) }
  }, 0)
}

function pageHeader(route, actions = '') {
  const [title, subtitle] = routeMeta[route]
  return `<header class="page-header"><div><div class="page-breadcrumb"><span>ZOL Solutions</span><i data-lucide="chevron-right"></i><strong>${title}</strong></div><h1>${title}</h1><p>${subtitle}</p></div><div class="page-actions">${actions}</div></header>`
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
    supabase.from('orders').select('*, order_items(*, products(images))').order('created_at', { ascending: false }).limit(500),
    supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('products').select('*, product_variants(*)').order('updated_at', { ascending: false }),
    supabase.from('payments').select('*, orders(order_number, customer_name)').order('created_at', { ascending: false }).limit(500),
    supabase.from('media').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('site_content').select('*').order('page').order('sort_order'),
    supabase.from('settings').select('*').order('category').order('key'),
    supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('analytics_events').select('*').order('created_at', { ascending: false }).limit(5000),
    supabase.from('admin_profiles').select('*').order('created_at'),
    supabase.from('admin_allowed_emails').select('*').order('created_at'),
    supabase.from('email_messages').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('discounts').select('*').order('created_at', { ascending: false }),
    supabase.from('order_notes').select('*').order('created_at', { ascending: false }).limit(1000),
    supabase.from('email_templates').select('*').order('sort_order'),
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
    state.discounts,
    state.orderNotes,
    state.emailTemplates,
  ] = requests.map((request) => request.data || [])

  const openOrders = state.orders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length
  document.querySelector('#open-order-count').textContent = openOrders || ''
  const newMessages = state.contactMessages.filter((message) => ['new', 'email_failed'].includes(message.status)).length
  document.querySelector('#new-message-count').textContent = newMessages || ''
}

function renderDashboard() {
  const canManageOrders = ['owner', 'admin'].includes(state.profile?.role)
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
    ${pageHeader('dashboard', `<button class="button" data-action="refresh">Vernieuwen</button>${canManageOrders ? '<button class="button button--primary" data-action="new-order">Bestelling maken</button>' : ''}`)}
    <section class="metric-grid" aria-label="Kerncijfers">
      <article class="metric-card"><header><span>Omzet deze maand</span><span class="metric-icon"><i data-lucide="circle-euro"></i></span></header><strong>${formatMoney(revenueSince(startMonth))}</strong><footer><span class="trend-up">${formatMoney(revenueSince(startDay))} vandaag</span><span>Maand</span></footer></article>
      <article class="metric-card"><header><span>Open bestellingen</span><span class="metric-icon"><i data-lucide="shopping-bag"></i></span></header><strong>${openOrders}</strong><footer><span>${state.orders.filter((order) => order.fulfillment_status === 'unfulfilled').length} nog te verzenden</span><span>Actueel</span></footer></article>
      <article class="metric-card"><header><span>Conversie</span><span class="metric-icon"><i data-lucide="trending-up"></i></span></header><strong>${conversionRate.toFixed(1)}%</strong><footer><span>${sessions} sessies gemeten</span><span>30 dagen</span></footer></article>
      <article class="metric-card"><header><span>Nieuwe klanten</span><span class="metric-icon"><i data-lucide="user-plus"></i></span></header><strong>${newCustomers}</strong><footer><span>${state.customers.length} klanten totaal</span><span>Maand</span></footer></article>
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
          <button data-action="new-product"><span><i data-lucide="package"></i></span>Product toevoegen</button><button data-route-jump="media"><span><i data-lucide="images"></i></span>Media uploaden</button><button data-route-jump="content"><span><i data-lucide="panels-top-left"></i></span>Website bewerken</button><button data-route-jump="settings"><span><i data-lucide="settings"></i></span>Instellingen</button>
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
  const canManageOrders = ['owner', 'admin'].includes(state.profile?.role)
  elements.content.innerHTML = `<div class="page-container">${pageHeader('orders', `<button class="button" data-action="export-orders">Exporteren</button>${canManageOrders ? '<button class="button button--primary" data-action="new-order">Bestelling maken</button>' : ''}`)}
    <section class="panel"><div class="filters"><input type="search" data-filter="orders" placeholder="Zoek op ordernummer, klant of e-mail"><select data-filter-status="orders"><option value="">Alle statussen</option><option value="open">Open</option><option value="completed">Afgerond</option><option value="cancelled">Geannuleerd</option></select><select data-filter-payment="orders"><option value="">Elke betaling</option><option value="pending">Openstaand</option><option value="paid">Betaald</option><option value="refunded">Terugbetaald</option></select></div><div id="orders-table">${ordersTable(state.orders)}</div></section>
  </div>`
}

function orderVariantOptions() {
  return state.products
    .filter((product) => product.active)
    .flatMap((product) => (product.product_variants || [])
      .filter((variant) => variant.active)
      .map((variant) => ({
        id: variant.id,
        label: `${product.name} · ${variant.title}`,
        stock: variant.stock,
        price: variant.price_cents ?? product.price_cents,
      })))
}

function newOrderForm() {
  if (!['owner', 'admin'].includes(state.profile?.role)) return
  if (!state.customers.length) { toast('Voeg eerst een klant toe', 'Ga naar Klanten en maak de klant handmatig aan.', true); return }
  const variants = orderVariantOptions()
  if (!variants.length) { toast('Geen verkoopbare producten', 'Activeer eerst een product en maat.', true); return }
  const customerOptions = state.customers.map((customer) => `<option value="${customer.id}">${escapeHtml(fullName(customer))} — ${escapeHtml(customer.email)}</option>`).join('')
  const variantOptions = variants.map((variant) => `<option value="${variant.id}" data-price="${variant.price}" data-stock="${variant.stock}" ${variant.stock < 1 ? 'disabled' : ''}>${escapeHtml(variant.label)} · ${variant.stock < 1 ? 'uitverkocht' : `voorraad ${variant.stock}`} · ${formatMoney(variant.price)}</option>`).join('')

  openDialog('Handmatige bestelling', 'Bestelling', `<form id="new-order-form">
    <div class="form-grid">
      <label class="field field--full">Klant<select name="customer_id" required><option value="">Kies een klant</option>${customerOptions}</select><small>Staat de klant er niet tussen? Voeg deze eerst toe via Klanten.</small></label>
      <label class="field">Orderstatus<select name="status"><option value="open">Open</option><option value="draft">Concept</option><option value="completed">Afgerond</option></select></label>
      <label class="field">Betaalstatus<select name="payment_status"><option value="pending">Openstaand</option><option value="paid">Betaald</option><option value="failed">Mislukt</option></select></label>
      <label class="field">Verzendstatus<select name="fulfillment_status"><option value="unfulfilled">Niet verzonden</option><option value="processing">In behandeling</option><option value="shipped">Verzonden</option><option value="delivered">Bezorgd</option></select></label>
      <label class="field">Verzendkosten (€)<input name="shipping" type="number" min="0" max="10000" step="0.01" value="0.00"></label>
    </div>
    <section class="manual-order-items">
      <header><div><strong>Producten</strong><small>Kies de maten en aantallen voor deze bestelling.</small></div><button class="button button--small" type="button" data-action="add-order-line">＋ Regel toevoegen</button></header>
      <div id="manual-order-lines"></div>
      <footer><span>Voorlopig totaal</span><strong id="manual-order-total">€ 0,00</strong></footer>
    </section>
    <label class="field field--full">Interne notitie<textarea name="note" maxlength="1000" placeholder="Optionele notitie voor deze bestelling"></textarea></label>
    <div class="form-actions"><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit">Bestelling aanmaken</button></div>
  </form>`)
  elements.dialog.classList.add('admin-dialog--wide')
  const form = document.querySelector('#new-order-form')
  const lines = form.querySelector('#manual-order-lines')

  const addLine = () => {
    const row = document.createElement('div')
    row.className = 'manual-order-line'
    row.innerHTML = `<label class="field">Product en maat<select data-order-variant required><option value="">Kies een maat</option>${variantOptions}</select></label><label class="field">Aantal<input data-order-quantity type="number" min="1" max="100" value="1" required></label><button class="button button--danger button--small" type="button" data-action="remove-order-line" aria-label="Orderregel verwijderen">Verwijder</button>`
    lines.append(row)
    updateManualOrderTotal(form)
  }
  addLine()
  form.addEventListener('input', () => updateManualOrderTotal(form))
  form.addEventListener('change', () => updateManualOrderTotal(form))
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = form.querySelector('[type="submit"]')
    const items = [...form.querySelectorAll('.manual-order-line')].map((row) => ({
      variant_id: row.querySelector('[data-order-variant]').value,
      quantity: Number(row.querySelector('[data-order-quantity]').value),
    }))
    if (!items.length || items.some((item) => !item.variant_id || !Number.isInteger(item.quantity) || item.quantity < 1)) { toast('Controleer de producten', 'Kies voor iedere regel een maat en geldig aantal.', true); return }
    if (new Set(items.map((item) => item.variant_id)).size !== items.length) { toast('Dubbele maat gekozen', 'Combineer hetzelfde product en dezelfde maat in één regel.', true); return }
    const values = Object.fromEntries(new FormData(form))
    setBusy(button, true, 'Bestelling aanmaken')
    const { data, error } = await supabase.rpc('create_admin_order', {
      p_customer_id: values.customer_id,
      p_items: items,
      p_status: values.status,
      p_payment_status: values.payment_status,
      p_fulfillment_status: values.fulfillment_status,
      p_shipping_cents: Math.round(Number(values.shipping || 0) * 100),
      p_note: values.note || '',
    })
    if (error) { toast('Bestelling aanmaken mislukt', error.message, true); setBusy(button, false, 'Bestelling aanmaken'); return }
    await recordActivity('Handmatige bestelling aangemaakt', 'order', data.order_id, { order_number: data.order_number })
    toast('Bestelling aangemaakt', `Order #${data.order_number} staat in het overzicht.`)
    closeDialog(); await refreshCurrentRoute()
  })
}

function updateManualOrderTotal(form) {
  let total = Math.round(Number(form.elements.shipping?.value || 0) * 100)
  form.querySelectorAll('.manual-order-line').forEach((row) => {
    const option = row.querySelector('[data-order-variant]')?.selectedOptions[0]
    const quantity = Number(row.querySelector('[data-order-quantity]')?.value || 0)
    total += Number(option?.dataset.price || 0) * Math.max(0, quantity)
  })
  form.querySelector('#manual-order-total').textContent = formatMoney(total)
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

function orderTrackingUrl(carrier, code, postalCode = '') {
  const trackingCode = encodeURIComponent(String(code || '').trim())
  const postal = encodeURIComponent(String(postalCode || '').replaceAll(' ', '').toUpperCase())
  if (!trackingCode) return ''
  if (carrier === 'PostNL') return `https://jouw.postnl.nl/track-and-trace/${trackingCode}-NL-${postal}`
  if (carrier === 'DHL') return `https://www.dhl.com/nl-nl/home/traceren.html?tracking-id=${trackingCode}`
  if (carrier === 'DPD') return `https://tracking.dpd.de/status/nl_NL/parcel/${trackingCode}`
  if (carrier === 'UPS') return `https://www.ups.com/track?tracknum=${trackingCode}`
  if (carrier === 'GLS') return `https://gls-group.com/NL/nl/pakket-volgen/?match=${trackingCode}`
  return ''
}

function orderRisk(order, payment) {
  if (['failed', 'refunded', 'partially_refunded'].includes(payment?.status || order.payment_status) || order.fulfillment_status === 'returned') return ['Hoog', 'is-high', 'Deze bestelling heeft een mislukte betaling, refund of retour. Controleer de tijdlijn.']
  if (!['paid', 'authorized'].includes(payment?.status || order.payment_status)) return ['Gemiddeld', 'is-medium', 'De betaling is nog niet definitief verwerkt.']
  return ['Laag', 'is-low', 'De betaling en klantgegevens geven geen directe risicosignalen.']
}

function orderTimeline(order) {
  const events = []
  state.activity.filter((item) => item.entity_type === 'order' && item.entity_id === order.id).forEach((item) => events.push({ id: `activity-${item.id}`, type: 'activity', title: item.action, detail: item.actor_email || 'Systeem', created_at: item.created_at }))
  state.orderNotes.filter((item) => item.order_id === order.id).forEach((item) => events.push({ id: `note-${item.id}`, type: 'note', title: item.body, detail: item.author_email, created_at: item.created_at, noteId: item.id }))
  state.emailMessages.filter((item) => item.order_id === order.id).forEach((item) => events.push({ id: `email-${item.id}`, type: 'email', title: item.status === 'sent' ? `E-mail verstuurd: ${item.subject}` : `E-mailstatus: ${item.subject}`, detail: prettyStatus(item.status), created_at: item.sent_at || item.created_at }))
  state.payments.filter((item) => item.order_id === order.id).forEach((item) => events.push({ id: `payment-${item.id}`, type: 'payment', title: `Betaling ${prettyStatus(item.status).toLowerCase()} · ${formatMoney(item.amount_cents)}`, detail: item.provider === 'mollie' ? 'Mollie Payments' : 'Handmatige betaling', created_at: item.updated_at || item.created_at }))
  events.push({ id: `order-${order.id}`, type: 'order', title: `${order.customer_name || order.customer_email} heeft deze bestelling geplaatst`, detail: order.source === 'admin' ? 'ZOL Admin' : 'ZOL-webshop', created_at: order.created_at })
  return events.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

async function refreshOrderDetail(orderId) {
  await fetchAllData()
  const order = state.orders.find((item) => item.id === orderId)
  if (order) openOrder(order); else renderOrders()
}

function openOrder(order) {
  if (!order) return
  const canManage = ['owner', 'admin'].includes(state.profile?.role)
  const emailEnabled = Boolean(settingsValue('email_config').enabled)
  const payment = state.payments.find((item) => item.order_id === order.id)
  const customer = state.customers.find((item) => item.id === order.customer_id)
  const address = order.shipping_address || {}
  const timeline = orderTimeline(order)
  const trackingUrl = order.tracking_url || orderTrackingUrl(order.tracking_carrier, order.tracking_code, address.postal_code)
  const refundable = payment ? Math.max(0, payment.amount_cents - payment.refunded_cents) : 0
  const [riskLabel, riskClass, riskCopy] = orderRisk(order, payment)
  const orderEvent = state.analytics.find((event) => event.event_name === 'order_created' && String(event.metadata?.order_number) === String(order.order_number))
  const sessionEvents = orderEvent ? state.analytics.filter((event) => event.session_id === orderEvent.session_id) : []
  const customerOrders = state.orders.filter((item) => item.customer_id === order.customer_id)
  const itemCount = (order.order_items || []).reduce((sum, item) => sum + item.quantity, 0)
  const itemRows = (order.order_items || []).map((item) => {
    const image = Array.isArray(item.products?.images) ? item.products.images[0] : ''
    return `<article class="order-product"><div class="order-product-image">${image ? `<img src="${escapeHtml(image)}" alt="">` : '<span>ZOL</span>'}</div><div><strong>${escapeHtml(item.product_name)}</strong><small>${escapeHtml(item.variant_name || item.sku)}</small></div><p>${formatMoney(item.unit_price_cents)} × ${item.quantity}</p><b>${formatMoney(item.total_cents)}</b></article>`
  }).join('')
  elements.content.innerHTML = `<div class="page-container order-detail-page">
    <header class="order-detail-header"><div><button class="order-back" type="button" data-action="back-orders"><i data-lucide="arrow-left"></i></button><div><div class="order-title-line"><h1>#${order.order_number}</h1>${statusPill(order.payment_status)}${statusPill(order.fulfillment_status)}${order.archived ? '<span class="status-pill">Gearchiveerd</span>' : ''}</div><p>${formatDate(order.created_at, { hour: '2-digit', minute: '2-digit' })} via ${order.source === 'admin' ? 'ZOL Admin' : 'Webshop'}</p></div></div><div class="order-header-actions">${refundable && canManage ? `<button class="button" data-action="refund-order" data-id="${order.id}"><i data-lucide="rotate-ccw"></i> Terugbetalen</button>` : ''}${order.fulfillment_status !== 'returned' && canManage ? `<button class="button" data-action="return-order" data-id="${order.id}">Retourneren</button>` : ''}<button class="button" data-action="toggle-archive" data-id="${order.id}"><i data-lucide="archive"></i>${order.archived ? 'Uit archief' : 'Archiveren'}</button></div></header>
    <div class="order-detail-grid"><main class="order-detail-main">
      <section class="order-card fulfillment-card"><header><div><i data-lucide="truck"></i><div><h2>${prettyStatus(order.fulfillment_status)}</h2><p>${order.shipped_at ? `Verzonden ${formatDate(order.shipped_at, { hour: '2-digit', minute: '2-digit' })}` : 'Klaar voor verwerking'}</p></div></div><span>#${order.order_number}-F1</span></header>
        ${order.tracking_code ? `<div class="tracking-summary"><div><span>${escapeHtml(order.tracking_carrier || 'Tracking')}</span><strong>${escapeHtml(order.tracking_code)}</strong>${trackingUrl ? `<a href="${escapeHtml(trackingUrl)}" target="_blank" rel="noreferrer">Zending volgen <i data-lucide="external-link"></i></a>` : ''}</div>${order.fulfillment_status === 'delivered' ? statusPill('delivered') : statusPill('shipped')}</div>` : ''}
        <div class="order-products">${itemRows || '<p class="no-order-items">Geen orderregels.</p>'}</div>
        <footer><span>${itemCount} artikel${itemCount === 1 ? '' : 'en'}</span><div>${order.tracking_code ? `<button class="button" data-action="add-tracking" data-id="${order.id}"><i data-lucide="pencil"></i> Tracking wijzigen</button>` : `<button class="button button--primary" data-action="add-tracking" data-id="${order.id}"><i data-lucide="plus"></i> Tracking toevoegen</button>`}${order.fulfillment_status === 'shipped' ? `<button class="button" data-action="mark-delivered" data-id="${order.id}"><i data-lucide="check-circle"></i> Markeer bezorgd</button>` : ''}</div></footer>
      </section>
      <section class="order-card payment-card"><header><div><i data-lucide="credit-card"></i><h2>${prettyStatus(payment?.status || order.payment_status)}</h2></div><span>${escapeHtml(payment?.provider === 'mollie' ? 'Mollie Payments' : 'Handmatig')}</span></header><div class="payment-lines"><p><span>Subtotaal</span><small>${itemCount} artikel${itemCount === 1 ? '' : 'en'}</small><strong>${formatMoney(order.subtotal_cents)}</strong></p>${order.discount_cents ? `<p><span>Korting ${order.discount_code ? `(${escapeHtml(order.discount_code)})` : ''}</span><small></small><strong>− ${formatMoney(order.discount_cents)}</strong></p>` : ''}<p><span>Verzending</span><small>Standaard</small><strong>${order.shipping_cents ? formatMoney(order.shipping_cents) : 'Gratis'}</strong></p><p class="payment-total"><span>Totaal</span><small></small><strong>${formatMoney(order.total_cents)}</strong></p>${payment?.refunded_cents ? `<p class="payment-refund"><span>Terugbetaald</span><small>${prettyStatus(payment.status)}</small><strong>− ${formatMoney(payment.refunded_cents)}</strong></p>` : ''}</div></section>
      <section class="order-timeline"><h2>Tijdlijn</h2><form id="order-note-form" class="timeline-note"><span>${escapeHtml(initials(state.profile.full_name || state.profile.email))}</span><textarea name="body" rows="2" maxlength="2000" placeholder="Een interne opmerking plaatsen…" required></textarea><button class="button button--primary" type="submit">Plaatsen</button></form><p class="timeline-privacy">Alleen jij en andere beheerders kunnen opmerkingen zien.</p><ol>${timeline.map((item) => `<li class="is-${item.type}"><i></i><div><p>${escapeHtml(item.title)}</p><small>${escapeHtml(item.detail)} · ${formatDate(item.created_at, { hour: '2-digit', minute: '2-digit' })}</small></div>${item.noteId && canManage ? `<button type="button" data-action="delete-order-note" data-id="${item.noteId}" data-order-id="${order.id}" aria-label="Notitie verwijderen">×</button>` : ''}</li>`).join('')}</ol></section>
    </main><aside class="order-detail-side">
      <section class="order-card order-note-card"><header><h2>Notities</h2>${canManage ? `<button data-action="edit-order-note" data-id="${order.id}" aria-label="Notitie bewerken"><i data-lucide="pencil"></i></button>` : ''}</header><p>${escapeHtml(order.note || 'Geen notities van klant')}</p></section>
      <section class="order-card customer-card"><header><h2>Klant</h2></header><button class="customer-link" data-action="open-customer" data-id="${order.customer_id}">${escapeHtml(order.customer_name || order.customer_email)}</button><a href="#customers">${customerOrders.length} bestelling${customerOrders.length === 1 ? '' : 'en'}</a><h3>Contactgegevens</h3><a href="mailto:${escapeHtml(order.customer_email)}">${escapeHtml(order.customer_email)}</a>${customer?.phone ? `<a href="tel:${escapeHtml(customer.phone)}">${escapeHtml(customer.phone)}</a>` : ''}<h3>Bezorgadres</h3><address>${escapeHtml(order.customer_name)}<br>${escapeHtml(address.street || '')}<br>${escapeHtml(address.postal_code || '')} ${escapeHtml(address.city || '')}<br>${escapeHtml(address.country === 'NL' ? 'Nederland' : address.country || '')}</address>${address.street ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([address.street, address.postal_code, address.city].filter(Boolean).join(' '))}" target="_blank" rel="noreferrer">Kaart weergeven</a>` : ''}</section>
      <section class="order-card conversion-card"><header><h2>Conversieoverzicht</h2></header><p><i data-lucide="shopping-bag"></i>Dit is hun ${customerOrders.length === 1 ? '1e' : `${customerOrders.length}e`} bestelling.</p><p><i data-lucide="link"></i>${orderEvent?.metadata?.referrer && orderEvent.metadata.referrer !== 'Direct' ? escapeHtml(orderEvent.metadata.referrer) : 'Sessie was direct naar de winkel'}</p><p><i data-lucide="chart-no-axes-combined"></i>${sessionEvents.length || 1} gemeten gebeurtenis${sessionEvents.length === 1 ? '' : 'sen'}</p></section>
      <section class="order-card risk-card"><header><h2>Bestelrisico</h2><span class="risk-label ${riskClass}">${riskLabel}</span></header><div class="risk-meter ${riskClass}"><i></i></div><div class="risk-scale"><span>Laag</span><span>Gemiddeld</span><span>Hoog</span></div><p>${riskCopy}</p></section>
      <section class="order-card tags-card"><header><h2>Tags</h2><i data-lucide="tag"></i></header><form id="order-tags-form"><input name="tags" maxlength="400" value="${escapeHtml((order.tags || []).join(', '))}" placeholder="bijv. club, spoed, VIP" ${canManage ? '' : 'disabled'}><button class="button" type="submit" ${canManage ? '' : 'disabled'}>Opslaan</button></form></section>
      <section class="order-card status-card"><header><h2>Status beheren</h2></header><form id="order-status-form"><label>Bestelstatus<select name="status" ${canManage ? '' : 'disabled'}><option value="draft">Concept</option><option value="open">Open</option><option value="completed">Afgerond</option><option value="cancelled">Geannuleerd</option></select></label><label>Verzendstatus<select name="fulfillment_status" ${canManage ? '' : 'disabled'}><option value="unfulfilled">Niet verzonden</option><option value="processing">In behandeling</option><option value="shipped">Verzonden</option><option value="delivered">Bezorgd</option></select></label><button class="button" type="submit" ${canManage ? '' : 'disabled'}>Status opslaan</button></form><div class="order-secondary-actions"><button class="button" data-action="print-invoice" data-id="${order.id}"><i data-lucide="file-text"></i> Factuur</button>${order.payment_status === 'paid' ? `<button class="button" data-action="send-order-email" data-id="${order.id}" ${emailEnabled ? '' : 'disabled title="Activeer eerst de e-mailkoppeling"'}>Bevestiging</button>` : ''}${canManage ? `<button class="button button--danger" data-action="delete-order" data-id="${order.id}">Verwijderen</button>` : ''}</div></section>
    </aside></div>
  </div>`

  const noteForm = document.querySelector('#order-note-form')
  noteForm.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = noteForm.querySelector('[type="submit"]'); setBusy(button, true, 'Plaatsen'); const body = noteForm.elements.body.value.trim()
    const { error } = await supabase.from('order_notes').insert({ order_id: order.id, author_id: state.profile.id, author_email: state.profile.email, body })
    if (error) { toast('Notitie plaatsen mislukt', error.message, true); setBusy(button, false, 'Plaatsen'); return }
    await refreshOrderDetail(order.id)
  })
  const tagsForm = document.querySelector('#order-tags-form')
  tagsForm.addEventListener('submit', async (event) => {
    event.preventDefault(); const tags = [...new Set(tagsForm.elements.tags.value.split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 12).map((tag) => tag.slice(0, 40))
    const { error } = await supabase.from('orders').update({ tags }).eq('id', order.id)
    if (error) { toast('Tags opslaan mislukt', error.message, true); return }
    await recordActivity('Ordertags bijgewerkt', 'order', order.id, { order_number: order.order_number, tags }); toast('Tags opgeslagen'); await refreshOrderDetail(order.id)
  })
  const statusForm = document.querySelector('#order-status-form')
  statusForm.elements.status.value = order.status
  statusForm.elements.fulfillment_status.value = order.fulfillment_status === 'returned' ? 'delivered' : order.fulfillment_status
  statusForm.addEventListener('submit', async (event) => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(statusForm)); const changes = { ...values }
    if (values.fulfillment_status === 'shipped' && !order.shipped_at) changes.shipped_at = new Date().toISOString()
    if (values.fulfillment_status === 'delivered' && !order.delivered_at) changes.delivered_at = new Date().toISOString()
    const { error } = await supabase.from('orders').update(changes).eq('id', order.id)
    if (error) { toast('Status opslaan mislukt', error.message, true); return }
    await recordActivity('Orderstatus bijgewerkt', 'order', order.id, { order_number: order.order_number, ...values }); toast('Status opgeslagen'); await refreshOrderDetail(order.id)
  })
  refreshIcons()
  elements.content.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' })
}

function trackingForm(order) {
  const address = order.shipping_address || {}
  const emailEnabled = Boolean(settingsValue('email_config').enabled)
  openDialog(order.tracking_code ? 'Tracking wijzigen' : 'Tracking toevoegen', `Bestelling #${order.order_number}`, `<form id="tracking-form"><div class="form-grid"><label class="field">Bezorgdienst<select name="tracking_carrier"><option value="PostNL">PostNL</option><option value="DHL">DHL</option><option value="DPD">DPD</option><option value="UPS">UPS</option><option value="GLS">GLS</option><option value="Anders">Anders</option></select></label><label class="field">Trackingcode<input name="tracking_code" maxlength="120" value="${escapeHtml(order.tracking_code || '')}" required></label><label class="field field--full">Trackinglink <span>optioneel; wordt anders automatisch ingevuld</span><input name="tracking_url" type="url" value="${escapeHtml(order.tracking_url || '')}" placeholder="https://…"></label><label class="field">Verzendmoment<input name="shipped_at" type="datetime-local" value="${order.shipped_at ? new Date(order.shipped_at).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)}"></label><label class="checkbox-field"><input name="notify" type="checkbox" ${emailEnabled ? 'checked' : 'disabled'}> Klant per e-mail informeren</label></div>${!emailEnabled ? '<p class="form-hint">Activeer de e-mailkoppeling bij Instellingen om automatisch een verzendmail te sturen.</p>' : ''}<div class="form-actions"><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit">Tracking opslaan</button></div></form>`)
  const form = document.querySelector('#tracking-form'); form.elements.tracking_carrier.value = order.tracking_carrier || 'PostNL'
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); setBusy(button, true, 'Tracking opslaan'); const values = Object.fromEntries(new FormData(form)); const code = values.tracking_code.trim(); const carrier = values.tracking_carrier
    const trackingUrl = values.tracking_url.trim() || orderTrackingUrl(carrier, code, address.postal_code)
    const { error } = await supabase.from('orders').update({ tracking_code: code, tracking_carrier: carrier, tracking_url: trackingUrl, shipped_at: new Date(values.shipped_at).toISOString(), fulfillment_status: 'shipped' }).eq('id', order.id)
    if (error) { toast('Tracking opslaan mislukt', error.message, true); setBusy(button, false, 'Tracking opslaan'); return }
    await recordActivity(order.tracking_code ? 'Tracking bijgewerkt' : 'Tracking toegevoegd', 'order', order.id, { order_number: order.order_number, carrier, tracking_code: code })
    if (values.notify === 'on') {
      const { data, error: emailError } = await supabase.functions.invoke('order-email', { body: { order_id: order.id, action: 'shipping' } })
      if (emailError || data?.error) toast('Tracking opgeslagen, verzendmail mislukt', await edgeFunctionMessage(emailError, data, 'De e-mail kon niet worden verstuurd.'), true)
      else toast('Tracking en verzendmail verwerkt', code)
    } else toast('Tracking opgeslagen', code)
    closeDialog(); await refreshOrderDetail(order.id)
  })
}

function refundOrderForm(order) {
  const payment = state.payments.find((item) => item.order_id === order.id)
  const refundable = payment ? Math.max(0, payment.amount_cents - payment.refunded_cents) : 0
  if (!payment || !refundable) { toast('Geen bedrag beschikbaar voor terugbetaling', '', true); return }
  openDialog('Terugbetalen', `Bestelling #${order.order_number}`, `<form id="refund-form"><div class="dialog-summary"><div><span>Betaald</span><strong>${formatMoney(payment.amount_cents)}</strong></div><div><span>Eerder terugbetaald</span><strong>${formatMoney(payment.refunded_cents)}</strong></div><div><span>Beschikbaar</span><strong>${formatMoney(refundable)}</strong></div></div><label class="field">Terug te betalen bedrag (€)<input name="amount" type="number" min="0.01" max="${(refundable / 100).toFixed(2)}" step="0.01" value="${(refundable / 100).toFixed(2)}" required></label><p class="form-hint">Bij een Mollie-betaling wordt de terugbetaling direct bij Mollie aangevraagd. Handmatige betalingen worden administratief geregistreerd.</p><div class="form-actions"><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--danger" type="submit">Terugbetaling uitvoeren</button></div></form>`)
  const form = document.querySelector('#refund-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); setBusy(button, true, 'Terugbetaling uitvoeren'); const amountCents = Math.round(Number(form.elements.amount.value) * 100)
    const { data, error } = await supabase.functions.invoke('manage-order', { body: { action: 'refund', order_id: order.id, amount_cents: amountCents } })
    if (error || data?.error) { toast('Terugbetaling mislukt', await edgeFunctionMessage(error, data, 'De terugbetaling kon niet worden uitgevoerd.'), true); setBusy(button, false, 'Terugbetaling uitvoeren'); return }
    toast('Terugbetaling verwerkt', formatMoney(amountCents)); closeDialog(); await refreshOrderDetail(order.id)
  })
}

function returnOrderForm(order) {
  openDialog('Retour verwerken', `Bestelling #${order.order_number}`, `<form id="return-form"><p class="form-hint">De bestelling wordt als retour gemarkeerd. Je kunt daarna apart een volledige of gedeeltelijke terugbetaling uitvoeren.</p><label class="checkbox-field"><input name="restore_stock" type="checkbox" checked> Producten terugzetten in de voorraad</label><div class="form-actions"><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit">Retour bevestigen</button></div></form>`)
  const form = document.querySelector('#return-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); setBusy(button, true, 'Retour bevestigen')
    const { data, error } = await supabase.rpc('return_admin_order', { p_order_id: order.id, p_restore_stock: form.elements.restore_stock.checked })
    if (error) { toast('Retour verwerken mislukt', error.message, true); setBusy(button, false, 'Retour bevestigen'); return }
    toast('Retour verwerkt', data.stock_restored ? `${data.stock_restored} artikel(en) terug op voorraad.` : 'Voorraad niet aangepast.'); closeDialog(); await refreshOrderDetail(order.id)
  })
}

function editOrderNoteForm(order) {
  openDialog('Ordernotitie bewerken', `Bestelling #${order.order_number}`, `<form id="order-copy-form"><label class="field">Notitie<textarea name="note" maxlength="1000" rows="7" placeholder="Interne informatie over deze bestelling">${escapeHtml(order.note || '')}</textarea></label><div class="form-actions"><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit">Notitie opslaan</button></div></form>`)
  const form = document.querySelector('#order-copy-form')
  form.addEventListener('submit', async (event) => { event.preventDefault(); const note = form.elements.note.value.trim(); const { error } = await supabase.from('orders').update({ note }).eq('id', order.id); if (error) { toast('Notitie opslaan mislukt', error.message, true); return } await recordActivity('Ordernotitie bijgewerkt', 'order', order.id, { order_number: order.order_number }); closeDialog(); await refreshOrderDetail(order.id) })
}

async function toggleOrderArchive(order) {
  if (!order) return
  const archived = !order.archived
  const { error } = await supabase.from('orders').update({ archived }).eq('id', order.id)
  if (error) { toast('Archiefstatus wijzigen mislukt', error.message, true); return }
  await recordActivity(archived ? 'Bestelling gearchiveerd' : 'Bestelling uit archief gehaald', 'order', order.id, { order_number: order.order_number })
  toast(archived ? 'Bestelling gearchiveerd' : 'Bestelling teruggezet'); await refreshOrderDetail(order.id)
}

async function markOrderDelivered(order) {
  if (!order) return
  const { error } = await supabase.from('orders').update({ fulfillment_status: 'delivered', delivered_at: new Date().toISOString(), status: 'completed' }).eq('id', order.id)
  if (error) { toast('Bezorgstatus wijzigen mislukt', error.message, true); return }
  await recordActivity('Bestelling als bezorgd gemarkeerd', 'order', order.id, { order_number: order.order_number })
  toast('Bestelling is bezorgd'); await refreshOrderDetail(order.id)
}

async function deleteOrderNote(noteId, orderId) {
  if (!window.confirm('Deze interne tijdlijnnotitie verwijderen?')) return
  const { error } = await supabase.from('order_notes').delete().eq('id', noteId)
  if (error) { toast('Notitie verwijderen mislukt', error.message, true); return }
  await refreshOrderDetail(orderId)
}

async function deleteOrder(orderId) {
  if (!['owner', 'admin'].includes(state.profile?.role)) return
  const order = state.orders.find((item) => item.id === orderId)
  if (!order) return
  const paidWarning = ['paid', 'partially_refunded'].includes(order.payment_status) ? ' Let op: regel eerst een eventuele terugbetaling af.' : ''
  if (!window.confirm(`Weet je zeker dat je bestelling #${order.order_number} definitief wilt verwijderen? Productvoorraad wordt teruggezet.${paidWarning}`)) return
  const { data, error } = await supabase.rpc('delete_admin_order', { p_order_id: order.id, p_restore_stock: true })
  if (error) { toast('Bestelling verwijderen mislukt', error.message, true); return }
  await recordActivity('Bestelling verwijderd', 'order', order.id, { order_number: order.order_number, stock_restored: data.stock_restored })
  toast('Bestelling verwijderd', 'Productvoorraad en klanttotalen zijn bijgewerkt.')
  closeDialog(); await refreshCurrentRoute()
}

function customersTable(customers) {
  if (!customers.length) return emptyState('Nog geen klanten', 'Klanten worden automatisch aangemaakt bij een nieuwe bestelling.', '♙')
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>Klant</th><th>E-mail</th><th>Telefoon</th><th>Bestellingen</th><th>Besteed</th><th>Sinds</th></tr></thead><tbody>${customers.map((customer) => `<tr data-action="open-customer" data-id="${customer.id}"><td><strong>${escapeHtml(fullName(customer))}</strong></td><td>${escapeHtml(customer.email)}</td><td>${escapeHtml(customer.phone || '—')}</td><td>${customer.total_orders}</td><td><strong>${formatMoney(customer.total_spent_cents)}</strong></td><td>${formatDate(customer.created_at)}</td></tr>`).join('')}</tbody></table></div><footer class="table-footer"><span>${customers.length} klanten</span><span>Klik om gegevens en bestelgeschiedenis te bekijken</span></footer>`
}

function renderCustomers() {
  const actions = ['owner', 'admin'].includes(state.profile?.role) ? '<button class="button button--primary" data-action="new-customer">Klant toevoegen</button>' : ''
  elements.content.innerHTML = `<div class="page-container">${pageHeader('customers', actions)}<section class="panel"><div class="filters"><input type="search" data-filter="customers" placeholder="Zoek op naam, e-mail of telefoon"><select data-filter-marketing="customers"><option value="">Alle klanten</option><option value="yes">Marketing toegestaan</option><option value="no">Geen marketing</option></select></div><div id="customers-table">${customersTable(state.customers)}</div></section></div>`
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

const emailSampleVariables = {
  customer_first_name: 'Sophie', customer_name: 'Sophie de Vries', customer_email: 'sophie@example.nl',
  order_id: 'voorbeeld', order_number: '1042', order_total: '€ 99,95', order_subtotal: '€ 99,95',
  shipping_cost: 'Gratis', discount_amount: '€ 0,00', discount_code: '', carrier: 'PostNL',
  tracking_code: '3SZOL123456789', tracking_url: 'https://jouw.postnl.nl/', refund_amount: '€ 99,95',
  refunded_total: '€ 99,95', website_url: 'https://zolsolutions.nl', admin_url: 'https://zol-solutions.pages.dev/admin/',
}

function fillEmailVariables(value = '', variables = emailSampleVariables) {
  return String(value).replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_, key) => String(variables[key] ?? `{{${key}}}`))
}

function emailPreviewDocument(template) {
  const email = settingsValue('email_config')
  const logoUrl = email.logo_url || '/media/zol-logo.png'
  const body = fillEmailVariables(template.body_template).split(/\n{2,}/).map((part) => `<p style="margin:0 0 18px;color:#445b70;font-size:15px;line-height:1.72">${escapeHtml(part).replaceAll('\n', '<br>')}</p>`).join('')
  const label = fillEmailVariables(template.button_label_template)
  const url = fillEmailVariables(template.button_url_template) || '#'
  return `<!doctype html><html lang="nl"><meta name="viewport" content="width=device-width"><body style="margin:0;padding:22px 10px;background:#eef1f4;font-family:Arial,sans-serif"><table width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:auto;overflow:hidden;border-radius:18px;background:white"><tr><td style="padding:30px 34px;background:#102b4a;color:white"><img src="${escapeHtml(logoUrl)}" width="96" alt="ZOL Solutions" style="display:block;filter:brightness(0) invert(1)"><p style="margin:22px 0 7px;color:#9fc4e8;font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase">${escapeHtml(fillEmailVariables(template.eyebrow_template))}</p><h1 style="margin:0;font-size:31px;line-height:1.08">${escapeHtml(fillEmailVariables(template.title_template))}</h1><p style="margin:14px 0 0;color:#dfeaf4;font-size:14px;line-height:1.6">${escapeHtml(fillEmailVariables(template.intro_template))}</p></td></tr><tr><td style="padding:30px 34px">${body}<div style="margin:20px 0;padding:16px;border-radius:11px;background:#f3f6f8;color:#53677a;font-size:12px">Bestelgegevens, bedragen of tracking worden hier automatisch toegevoegd wanneer deze mail wordt verstuurd.</div>${label ? `<a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 19px;border-radius:8px;background:#33669b;color:white;font-size:13px;font-weight:700;text-decoration:none">${escapeHtml(label)} →</a>` : ''}</td></tr><tr><td style="padding:20px 34px;border-top:1px solid #e4e9ee;color:#66798c;font-size:11px;line-height:1.6">ZOL Solutions · Zachter landen. Beter sporten.</td></tr></table></body></html>`
}

function renderEmails() {
  const email = settingsValue('email_config')
  const sent = state.emailMessages.filter((item) => item.status === 'sent').length
  const failed = state.emailMessages.filter((item) => item.status === 'failed').length
  const cards = state.emailTemplates.map((template) => `<article class="email-template-card" data-action="edit-email-template" data-id="${escapeHtml(template.template_key)}"><header><span>${template.audience === 'admin' ? 'INTERN' : 'KLANT'}</span>${statusPill(template.enabled ? 'active' : 'inactive')}</header><h2>${escapeHtml(template.name)}</h2><p>${escapeHtml(template.description)}</p><div><strong>${escapeHtml(fillEmailVariables(template.subject_template))}</strong><small>${(template.variables || []).length} beschikbare variabelen</small></div><button class="button" type="button">Bewerken & preview →</button></article>`).join('')
  elements.content.innerHTML = `<div class="page-container">${pageHeader('emails', '<button class="button" data-route-jump="settings">Afzender instellen</button>')}<section class="email-flow-summary"><div class="email-connection ${email.enabled ? 'is-connected' : ''}"><i>${email.enabled ? '✓' : '!'}</i><div><strong>${email.enabled ? 'Automatische verzending staat aan' : 'Sjablonen klaar — verzending staat nog uit'}</strong><small>${email.enabled ? `Verzonden: ${sent} · mislukt: ${failed}` : 'Activeer Resend pas nadat het afzenderdomein en de server-sleutel zijn ingesteld.'}</small></div></div><p><strong>Volledige bestelreis</strong><span>Ontvangen → betaald → verzonden → bezorgd/bedankt → retour of terugbetaling</span></p></section><section class="email-template-grid">${cards || emptyState('Geen e-mailsjablonen', 'Voer de e-mailmigratie uit om de standaardmails toe te voegen.', '✉')}</section></div>`
}

function emailTemplateForm(template) {
  if (!template) return
  const variableButtons = (template.variables || []).map((variable) => `<button type="button" data-email-variable="${escapeHtml(variable)}">{{${escapeHtml(variable)}}}</button>`).join('')
  openDialog(template.name, 'Automatische e-mail', `<form id="email-template-form"><div class="email-editor-grid"><div><div class="form-grid"><label class="field field--full">Onderwerp<input name="subject_template" maxlength="240" value="${escapeHtml(template.subject_template)}" required></label><label class="field">Bovenregel<input name="eyebrow_template" maxlength="160" value="${escapeHtml(template.eyebrow_template)}"></label><label class="field">Grote titel<input name="title_template" maxlength="180" value="${escapeHtml(template.title_template)}" required></label><label class="field field--full">Inleidende regel<input name="intro_template" maxlength="300" value="${escapeHtml(template.intro_template)}"></label><label class="field field--full">Bericht<textarea name="body_template" rows="8" maxlength="5000">${escapeHtml(template.body_template)}</textarea><small>Gebruik een lege regel voor een nieuwe alinea. Bestelregels, bedragen en tracking worden automatisch toegevoegd.</small></label><label class="field">Knoptekst<input name="button_label_template" maxlength="100" value="${escapeHtml(template.button_label_template)}"></label><label class="field">Knoplink<input name="button_url_template" maxlength="500" value="${escapeHtml(template.button_url_template)}"></label><label class="checkbox-field field--full"><input name="enabled" type="checkbox" ${template.enabled ? 'checked' : ''}> Deze automatische e-mail gebruiken</label></div><section class="email-variable-picker"><strong>Variabelen invoegen</strong><p>Klik eerst in een veld en daarna op een variabele.</p><div>${variableButtons}</div></section></div><aside class="email-preview-pane"><header><strong>Mobiele preview</strong><span>LIVE</span></header><iframe id="email-template-preview" title="Voorbeeld van ${escapeHtml(template.name)}"></iframe></aside></div><div class="form-actions"><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit">E-mail opslaan</button></div></form>`)
  elements.dialog.classList.add('admin-dialog--wide')
  const form = document.querySelector('#email-template-form')
  const preview = document.querySelector('#email-template-preview')
  let activeField = form.elements.body_template
  const updatePreview = () => {
    const values = Object.fromEntries(new FormData(form))
    preview.srcdoc = emailPreviewDocument({ ...template, ...values, enabled: form.elements.enabled.checked })
  }
  form.querySelectorAll('input[type="text"], input:not([type]), textarea').forEach((field) => field.addEventListener('focus', () => { activeField = field }))
  form.addEventListener('input', updatePreview)
  form.querySelector('.email-variable-picker').addEventListener('click', (event) => {
    const button = event.target.closest('[data-email-variable]'); if (!button) return
    const token = `{{${button.dataset.emailVariable}}}`
    const start = activeField.selectionStart ?? activeField.value.length
    const end = activeField.selectionEnd ?? start
    activeField.setRangeText(token, start, end, 'end'); activeField.focus(); updatePreview()
  })
  updatePreview()
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); setBusy(button, true, 'E-mail opslaan')
    const values = Object.fromEntries(new FormData(form)); values.enabled = form.elements.enabled.checked; values.updated_by = state.profile.id
    const { error } = await supabase.from('email_templates').update(values).eq('template_key', template.template_key)
    if (error) { toast('E-mail opslaan mislukt', error.message, true); setBusy(button, false, 'E-mail opslaan'); return }
    await recordActivity('E-mailsjabloon bijgewerkt', 'email_template', template.template_key, { name: template.name })
    toast('E-mail opgeslagen', `${template.name} gebruikt voortaan deze tekst.`); closeDialog(); await refreshCurrentRoute()
  })
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
  const canManageCustomers = ['owner', 'admin'].includes(state.profile?.role)
  openDialog(customer.id ? fullName(customer) : 'Nieuwe klant', 'Klant', `<form id="customer-form"><div class="form-grid">
    <label class="field">Voornaam<input name="first_name" value="${escapeHtml(customer.first_name)}" required></label><label class="field">Achternaam<input name="last_name" value="${escapeHtml(customer.last_name)}"></label>
    <label class="field">E-mailadres<input name="email" type="email" value="${escapeHtml(customer.email)}" required></label><label class="field">Telefoon<input name="phone" value="${escapeHtml(customer.phone)}"></label>
    <label class="field field--full">Notities<textarea name="notes" placeholder="Interne notities over deze klant">${escapeHtml(customer.notes)}</textarea></label>
    <label class="checkbox-field field--full"><input name="marketing_opt_in" type="checkbox" ${customer.marketing_opt_in ? 'checked' : ''}> Klant heeft toestemming gegeven voor marketing</label>
  </div>${customer.id ? `<h3>Bestelgeschiedenis</h3><div class="line-items">${orders.map((order) => `<div class="line-item"><div><strong>#${order.order_number}</strong><small>${formatDate(order.created_at)} · ${prettyStatus(order.status)}</small></div><strong>${formatMoney(order.total_cents)}</strong></div>`).join('') || '<div class="line-item">Nog geen bestellingen</div>'}</div><h3>Recente e-mails</h3><div class="line-items">${emailHistory.map((email) => `<div class="line-item"><div><strong>${escapeHtml(email.subject)}</strong><small>${formatDate(email.created_at, { hour: '2-digit', minute: '2-digit' })}</small></div>${statusPill(email.status)}</div>`).join('') || '<div class="line-item">Nog geen e-mails verstuurd</div>'}</div>` : ''}<div class="form-actions">${customer.id && canManageCustomers ? `<button class="button button--danger" type="button" data-action="delete-customer" data-id="${customer.id}">Klant verwijderen</button>` : ''}<button class="button" type="button" data-close-dialog>Annuleren</button>${customer.id ? `<button class="button" type="button" data-action="email-customer" data-id="${customer.id}" ${emailEnabled ? '' : 'disabled title="Activeer eerst de e-mailkoppeling"'}>E-mail sturen</button>` : ''}<button class="button button--primary" type="submit">Klant opslaan</button></div></form>`)
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

async function deleteCustomer(customerId) {
  const customer = state.customers.find((item) => item.id === customerId)
  if (!customer || !['owner', 'admin'].includes(state.profile?.role)) return
  const orderCount = state.orders.filter((order) => order.customer_id === customer.id).length
  const warning = orderCount ? ` De ${orderCount} gekoppelde bestelling${orderCount === 1 ? '' : 'en'} blijven bewaard.` : ''
  if (!window.confirm(`Weet je zeker dat je ${fullName(customer)} wilt verwijderen?${warning}`)) return
  const { error } = await supabase.from('customers').delete().eq('id', customer.id)
  if (error) { toast('Klant verwijderen mislukt', error.message, true); return }
  await recordActivity('Klant verwijderd', 'customer', customer.id, { email: customer.email, preserved_orders: orderCount })
  toast('Klant verwijderd', orderCount ? 'De bestelgeschiedenis is behouden.' : '')
  closeDialog(); await refreshCurrentRoute()
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
  const { data, error } = await supabase.functions.invoke('order-email', { body: { order_id: order.id, action: 'payment_confirmed' } })
  if (error || data?.error) { toast('Bevestiging versturen mislukt', await edgeFunctionMessage(error, data, 'De bevestiging kon niet worden verstuurd.'), true); return }
  toast('Betaalbevestiging verwerkt', `De klant is geïnformeerd over bestelling #${order.order_number}.`)
  await refreshOrderDetail(order.id)
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

const dayKey = (date) => new Date(date).toISOString().slice(0, 10)
const percent = (value, total) => total ? `${((value / total) * 100).toFixed(1)}%` : '0%'
const analyticsSince = (days) => {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1))
  return state.analytics.filter((event) => new Date(event.created_at) >= start)
}
const ordersSince = (days) => {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1))
  return state.orders.filter((order) => new Date(order.created_at) >= start)
}

function barSeriesMarkup(values, formatter = (value) => value) {
  const max = Math.max(...values.map((item) => item.value), 1)
  return `<div class="report-bars">${values.map((item) => `<div class="report-bar" title="${escapeHtml(item.label)}: ${escapeHtml(formatter(item.value))}"><i style="height:${Math.max(3, (item.value / max) * 100)}%"></i><small>${escapeHtml(item.short || item.label)}</small></div>`).join('')}</div>`
}

function analyticsSeries(days, events, orders) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (days - 1 - index))
    const key = dayKey(date)
    return {
      label: date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
      short: index % Math.max(1, Math.floor(days / 7)) === 0 ? date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '',
      sessions: new Set(events.filter((event) => dayKey(event.created_at) === key).map((event) => event.session_id)).size,
      revenue: orders.filter((order) => dayKey(order.created_at) === key && order.payment_status === 'paid').reduce((sum, order) => sum + order.total_cents, 0),
    }
  })
}

function renderAnalytics() {
  const events = analyticsSince(30)
  const periodOrders = ordersSince(30)
  const paidOrders = periodOrders.filter((order) => order.payment_status === 'paid')
  const pageViews = events.filter((event) => event.event_name === 'page_view')
  const sessions = new Set(pageViews.map((event) => event.session_id)).size
  const productViews = events.filter((event) => event.event_name === 'product_view').length
  const carts = events.filter((event) => event.event_name === 'add_to_cart').length
  const checkouts = events.filter((event) => event.event_name === 'begin_checkout').length
  const completed = events.filter((event) => event.event_name === 'order_created').length
  const revenue = paidOrders.reduce((sum, order) => sum + order.total_cents, 0)
  const averageOrder = paidOrders.length ? revenue / paidOrders.length : 0
  const fulfilled = periodOrders.filter((order) => ['shipped', 'delivered'].includes(order.fulfillment_status)).length
  const customerOrderCounts = periodOrders.reduce((result, order) => { const key = order.customer_email || order.customer_id; result[key] = (result[key] || 0) + 1; return result }, {})
  const returningCustomers = Object.values(customerOrderCounts).filter((count) => count > 1).length
  const returningRate = percent(returningCustomers, Object.keys(customerOrderCounts).length)
  const pages = Object.entries(pageViews.reduce((result, event) => { result[event.page || '/'] = (result[event.page || '/'] || 0) + 1; return result }, {})).sort((a, b) => b[1] - a[1])
  const devices = Object.entries(pageViews.reduce((result, event) => { const device = event.metadata?.device || 'Onbekend'; result[device] = (result[device] || 0) + 1; return result }, {})).sort((a, b) => b[1] - a[1])
  const referrers = Object.entries(pageViews.reduce((result, event) => { let referrer = event.metadata?.referrer || 'Direct'; try { referrer = referrer === 'Direct' ? referrer : new URL(referrer).hostname.replace(/^www\./, '') } catch { /* Toon de aangeleverde bron. */ } result[referrer] = (result[referrer] || 0) + 1; return result }, {})).sort((a, b) => b[1] - a[1])
  const series = analyticsSeries(30, events, periodOrders)
  const maxFunnel = Math.max(sessions, 1)
  const productRevenue = paidOrders.flatMap((order) => order.order_items || []).reduce((result, item) => { result[item.product_name] = (result[item.product_name] || 0) + item.total_cents; return result }, {})
  elements.content.innerHTML = `<div class="page-container analytics-page">
    ${pageHeader('analytics', '<button class="button" data-action="export-analytics"><i data-lucide="download"></i> Exporteren</button><button class="button button--primary" data-action="refresh"><i data-lucide="refresh-cw"></i> Vernieuwen</button>')}
    <div class="analytics-toolbar"><button type="button"><i data-lucide="calendar-days"></i>Afgelopen 30 dagen</button><button type="button">Vergelijking: vorige periode</button><span>EUR €</span></div>
    <section class="analytics-summary">
      <article><span>Bruto-omzet</span><strong>${formatMoney(revenue)}</strong><small>${paidOrders.length} betaalde bestellingen</small></article>
      <article><span>Terugkerende klanten</span><strong>${returningRate}</strong><small>${returningCustomers} klanten</small></article>
      <article><span>Afgehandelde bestellingen</span><strong>${fulfilled}</strong><small>Van ${periodOrders.length} bestellingen</small></article>
      <article><span>Conversiepercentage</span><strong>${percent(completed, sessions)}</strong><small>${completed} conversies</small></article>
    </section>
    <section class="analytics-report-grid">
      <article class="report-card report-card--wide"><header><div><span>Totale omzet in de loop van de tijd</span><strong>${formatMoney(revenue)}</strong></div><small>30 dagen</small></header>${barSeriesMarkup(series.map((day) => ({ ...day, value: day.revenue })), formatMoney)}</article>
      <article class="report-card"><header><div><span>Uitsplitsing totale omzet</span><strong>${formatMoney(revenue)}</strong></div></header><ul class="report-breakdown"><li><span>Bruto-omzet</span><b>${formatMoney(paidOrders.reduce((sum, order) => sum + order.subtotal_cents, 0))}</b></li><li><span>Kortingen</span><b>− ${formatMoney(paidOrders.reduce((sum, order) => sum + (order.discount_cents || 0), 0))}</b></li><li><span>Verzendkosten</span><b>${formatMoney(paidOrders.reduce((sum, order) => sum + order.shipping_cents, 0))}</b></li><li><span>Netto-omzet</span><b>${formatMoney(revenue)}</b></li></ul></article>
      <article class="report-card"><header><div><span>Omzet per verkoopkanaal</span><strong>Webshop</strong></div></header><div class="donut-wrap"><div class="report-donut" style="--part:100"></div><p><strong>${formatMoney(revenue)}</strong><small>100% ZOL-webshop</small></p></div></article>
      <article class="report-card"><header><div><span>Gemiddelde bestelwaarde</span><strong>${formatMoney(averageOrder)}</strong></div></header>${barSeriesMarkup(series.map((day) => ({ ...day, value: day.revenue })), formatMoney)}</article>
      <article class="report-card"><header><div><span>Totale omzet per product</span><strong>${Object.keys(productRevenue).length} producten</strong></div></header><ul class="rank-list">${Object.entries(productRevenue).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => `<li><span>${escapeHtml(name)}</span><b>${formatMoney(value)}</b></li>`).join('') || '<li class="no-data">Nog geen betaalde productomzet.</li>'}</ul></article>
      <article class="report-card report-card--wide"><header><div><span>Sessies in de loop van de tijd</span><strong>${sessions}</strong></div><small>${pageViews.length} paginaweergaven</small></header>${barSeriesMarkup(series.map((day) => ({ ...day, value: day.sessions })))}</article>
      <article class="report-card"><header><div><span>Conversietrechter</span><strong>${percent(completed, sessions)}</strong></div></header><div class="conversion-funnel">${[['Sessies', sessions], ['Product bekeken', productViews], ['Winkelwagen', carts], ['Checkout', checkouts], ['Bestelling', completed]].map(([label, value]) => `<div style="--width:${Math.max(8, (value / maxFunnel) * 100)}%"><span>${escapeHtml(label)}</span><i></i><b>${value}</b></div>`).join('')}</div></article>
      <article class="report-card"><header><div><span>Sessies per apparaattype</span><strong>${sessions}</strong></div></header><ul class="rank-list">${devices.map(([name, value]) => `<li><span>${escapeHtml(name)}</span><b>${value} · ${percent(value, pageViews.length)}</b></li>`).join('') || '<li class="no-data">Nog geen apparaatgegevens.</li>'}</ul></article>
      <article class="report-card"><header><div><span>Sessies per landingspagina</span><strong>${pages.length} pagina's</strong></div></header><ul class="rank-list">${pages.slice(0, 7).map(([page, value]) => `<li><span>${escapeHtml(page)}</span><b>${value}</b></li>`).join('') || '<li class="no-data">Nog geen paginaweergaven.</li>'}</ul></article>
      <article class="report-card"><header><div><span>Sessies per verwijzer</span><strong>${referrers.length} bronnen</strong></div></header><ul class="rank-list">${referrers.slice(0, 7).map(([name, value]) => `<li><span>${escapeHtml(name)}</span><b>${value}</b></li>`).join('') || '<li class="no-data">Nog geen verwijzers.</li>'}</ul></article>
    </section>
  </div>`
}

let liveRefreshTimer = null
let liveChannel = null

function liveLocation(event) {
  return event.metadata?.city || event.metadata?.country || 'Locatie niet gedeeld'
}

function renderLive() {
  const now = Date.now()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const recent = state.analytics.filter((event) => now - new Date(event.created_at).getTime() <= 5 * 60 * 1000)
  const todayEvents = state.analytics.filter((event) => new Date(event.created_at) >= today)
  const activeSessions = new Set(recent.map((event) => event.session_id)).size
  const sessionsToday = new Set(todayEvents.filter((event) => event.event_name === 'page_view').map((event) => event.session_id)).size
  const todayOrders = state.orders.filter((order) => new Date(order.created_at) >= today)
  const todayRevenue = todayOrders.filter((order) => order.payment_status === 'paid').reduce((sum, order) => sum + order.total_cents, 0)
  const carts = new Set(recent.filter((event) => event.event_name === 'add_to_cart').map((event) => event.session_id)).size
  const checkouts = new Set(recent.filter((event) => event.event_name === 'begin_checkout').map((event) => event.session_id)).size
  const purchases = recent.filter((event) => event.event_name === 'order_created').length
  const locations = Object.entries(todayEvents.reduce((result, event) => { const name = liveLocation(event); result[name] = (result[name] || 0) + 1; return result }, {})).sort((a, b) => b[1] - a[1])
  const dots = [...new Set(recent.map((event) => event.session_id))].slice(0, 16).map((session, index) => { const seed = [...session].reduce((sum, char) => sum + char.charCodeAt(0), 0); return `<i class="globe-visitor" style="--x:${18 + ((seed * 17 + index * 13) % 64)}%;--y:${19 + ((seed * 29 + index * 7) % 62)}%;--delay:${index * -.17}s"></i>` }).join('')
  elements.content.innerHTML = `<div class="page-container live-page">
    ${pageHeader('live', '<span class="live-now"><i></i>Live</span><button class="button" data-action="refresh-live"><i data-lucide="refresh-cw"></i> Nu verversen</button>')}
    <div class="live-layout">
      <section class="live-insights">
        <div class="live-kpis"><article><span>Bezoekers op dit moment</span><strong>${activeSessions}</strong><small>Laatste 5 minuten</small></article><article><span>Totale omzet vandaag</span><strong>${formatMoney(todayRevenue)}</strong><small>${todayOrders.length} bestellingen</small></article><article><span>Sessies vandaag</span><strong>${sessionsToday}</strong><small>Unieke browsers</small></article><article><span>Bestellingen vandaag</span><strong>${todayOrders.length}</strong><small>Alle statussen</small></article></div>
        <article class="live-panel"><header><span>Klantgedrag</span><small>Laatste 5 minuten</small></header><div class="live-funnel"><div><strong>${carts}</strong><span>Actieve winkelwagens</span></div><div><strong>${checkouts}</strong><span>Bij de checkout</span></div><div><strong>${purchases}</strong><span>Aankoop voltooid</span></div></div></article>
        <article class="live-panel live-locations"><header><span>Sessies per locatie</span><small>Vandaag</small></header><ul>${locations.slice(0, 7).map(([name, value]) => `<li><i data-lucide="map-pin"></i><span>${escapeHtml(name)}</span><b>${value}</b></li>`).join('') || '<li><span>Nog geen locatiegegevens beschikbaar.</span></li>'}</ul></article>
      </section>
      <section class="live-map" aria-label="Live bezoekerskaart"><div class="live-map-search"><i data-lucide="search"></i><span>Wereldwijd overzicht</span></div><div class="zol-globe"><div class="globe-grid"></div>${dots}<strong>ZOL</strong></div><div class="map-legend"><span><i></i>${activeSessions} bezoekers op dit moment</span><span><b></b>${purchases} bestellingen</span></div></section>
    </div>
  </div>`
  refreshIcons()
}

function stopLiveUpdates() {
  if (liveRefreshTimer) window.clearInterval(liveRefreshTimer)
  liveRefreshTimer = null
  if (liveChannel) supabase.removeChannel(liveChannel)
  liveChannel = null
}

function startLiveUpdates() {
  stopLiveUpdates()
  liveChannel = supabase.channel('zol-admin-live').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'analytics_events' }, ({ new: event }) => {
    state.analytics.unshift(event)
    if (currentRoute() === 'live') renderLive()
  }).subscribe()
  liveRefreshTimer = window.setInterval(async () => {
    if (currentRoute() !== 'live') return
    const { data } = await supabase.from('analytics_events').select('*').order('created_at', { ascending: false }).limit(5000)
    if (data) { state.analytics = data; renderLive() }
  }, 15000)
}

function discountStatus(discount) {
  const now = new Date()
  if (!discount.active) return 'inactive'
  if (discount.ends_at && new Date(discount.ends_at) < now) return 'expired'
  if (discount.starts_at && new Date(discount.starts_at) > now) return 'pending'
  if (discount.usage_limit && discount.usage_count >= discount.usage_limit) return 'expired'
  return 'active'
}

function discountValue(discount) {
  if (discount.discount_type === 'percentage') return `${discount.value}%`
  if (discount.discount_type === 'free_shipping') return 'Gratis verzending'
  return formatMoney(discount.value)
}

function renderDiscounts() {
  const canManage = ['owner', 'admin'].includes(state.profile?.role)
  const rows = state.discounts.map((discount) => `<tr data-action="open-discount" data-id="${discount.id}"><td><strong class="discount-code">${escapeHtml(discount.code || discount.title)}</strong><small class="table-subline">${escapeHtml(discount.title)}</small></td><td>${statusPill(discountStatus(discount))}</td><td>${discount.method === 'automatic' ? 'Automatisch' : 'Code'}</td><td>Alle klanten</td><td>${escapeHtml(discountValue(discount))}</td><td>${discount.usage_count}${discount.usage_limit ? ` / ${discount.usage_limit}` : ''}</td><td>${discount.ends_at ? formatDate(discount.ends_at) : 'Geen einddatum'}</td></tr>`).join('')
  elements.content.innerHTML = `<div class="page-container discounts-page">${pageHeader('discounts', `${canManage ? '<button class="button button--primary" data-action="new-discount"><i data-lucide="plus"></i> Korting aanmaken</button>' : ''}`)}<section class="panel"><div class="discount-toolbar"><label><i data-lucide="search"></i><input type="search" data-filter="discounts" placeholder="Zoeken en filteren"></label><select data-filter-status="discounts"><option value="">Alle statussen</option><option value="active">Actief</option><option value="pending">Gepland</option><option value="expired">Verlopen</option><option value="inactive">Uitgeschakeld</option></select></div>${rows ? `<div class="table-scroll"><table class="data-table discount-table"><thead><tr><th>Titel</th><th>Status</th><th>Methode</th><th>Geschiktheid</th><th>Waarde</th><th>Gebruikt</th><th>Einddatum</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState('Nog geen kortingen', 'Maak een kortingscode of automatische korting voor de webshop.', '%')}</section></div>`
}

function discountForm(discount = null) {
  if (!['owner', 'admin'].includes(state.profile?.role)) return
  const starts = discount?.starts_at ? new Date(discount.starts_at).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)
  const ends = discount?.ends_at ? new Date(discount.ends_at).toISOString().slice(0, 16) : ''
  openDialog(discount ? 'Korting bewerken' : 'Korting aanmaken', 'Webshop', `<form id="discount-form"><div class="form-grid"><label class="field field--full">Titel<input name="title" maxlength="100" value="${escapeHtml(discount?.title || '')}" placeholder="Bijvoorbeeld zomeractie" required></label><label class="field">Methode<select name="method"><option value="code">Kortingscode</option><option value="automatic">Automatische korting</option></select></label><label class="field">Code<input name="code" maxlength="40" value="${escapeHtml(discount?.code || '')}" placeholder="ZOMER20"></label><label class="field">Type<select name="discount_type"><option value="percentage">Percentage</option><option value="fixed_amount">Vast bedrag</option><option value="free_shipping">Gratis verzending</option></select></label><label class="field">Waarde<input name="value" type="number" min="0" step="0.01" value="${discount ? (discount.discount_type === 'fixed_amount' ? discount.value / 100 : discount.value) : '20'}"></label><label class="field">Minimale bestelwaarde (€)<input name="minimum_subtotal" type="number" min="0" step="0.01" value="${((discount?.minimum_subtotal_cents || 0) / 100).toFixed(2)}"></label><label class="field">Gebruikslimiet<input name="usage_limit" type="number" min="1" value="${discount?.usage_limit || ''}" placeholder="Onbeperkt"></label><label class="field">Startdatum<input name="starts_at" type="datetime-local" value="${starts}" required></label><label class="field">Einddatum<input name="ends_at" type="datetime-local" value="${ends}"></label><label class="checkbox-field field--full"><input name="active" type="checkbox" ${discount?.active !== false ? 'checked' : ''}> Korting actief</label></div><div class="form-actions">${discount ? '<button class="button button--danger" type="button" data-action="delete-discount" data-id="' + discount.id + '">Verwijderen</button>' : ''}<button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit">Korting opslaan</button></div></form>`)
  const form = document.querySelector('#discount-form')
  form.elements.code.pattern = '[A-Za-z0-9][A-Za-z0-9_-]{2,39}'
  form.elements.code.title = 'Gebruik 3–40 letters, cijfers, koppeltekens of underscores.'
  form.elements.method.value = discount?.method || 'code'; form.elements.discount_type.value = discount?.discount_type || 'percentage'
  const syncDiscountFields = () => { form.elements.code.required = form.elements.method.value === 'code'; form.elements.code.closest('label').hidden = form.elements.method.value === 'automatic'; form.elements.value.closest('label').hidden = form.elements.discount_type.value === 'free_shipping' }
  form.addEventListener('change', syncDiscountFields); syncDiscountFields()
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); setBusy(button, true, 'Korting opslaan')
    const values = Object.fromEntries(new FormData(form)); const fixed = values.discount_type === 'fixed_amount'
    const payload = { title: values.title.trim(), method: values.method, code: values.method === 'code' ? values.code.trim().toUpperCase() : null, discount_type: values.discount_type, value: values.discount_type === 'free_shipping' ? 0 : Math.round(Number(values.value) * (fixed ? 100 : 1)), minimum_subtotal_cents: Math.round(Number(values.minimum_subtotal || 0) * 100), usage_limit: values.usage_limit ? Number(values.usage_limit) : null, starts_at: new Date(values.starts_at).toISOString(), ends_at: values.ends_at ? new Date(values.ends_at).toISOString() : null, active: values.active === 'on', created_by: state.profile.id }
    const query = discount ? supabase.from('discounts').update(payload).eq('id', discount.id) : supabase.from('discounts').insert(payload)
    const { error } = await query
    if (error) { toast('Korting opslaan mislukt', error.message, true); setBusy(button, false, 'Korting opslaan'); return }
    await recordActivity(discount ? 'Korting bijgewerkt' : 'Korting aangemaakt', 'discount', discount?.id || payload.code || payload.title, { code: payload.code, type: payload.discount_type })
    toast('Korting opgeslagen', payload.code || payload.title); closeDialog(); await refreshCurrentRoute()
  })
}

async function deleteDiscount(id) {
  const discount = state.discounts.find((item) => item.id === id)
  if (!discount || !window.confirm(`Korting ${discount.code || discount.title} definitief verwijderen?`)) return
  const { error } = await supabase.from('discounts').delete().eq('id', id)
  if (error) { toast('Korting verwijderen mislukt', error.message, true); return }
  await recordActivity('Korting verwijderd', 'discount', id, { code: discount.code }); toast('Korting verwijderd'); closeDialog(); await refreshCurrentRoute()
}

function filterDiscounts() {
  const query = document.querySelector('[data-filter="discounts"]')?.value.toLowerCase() || ''
  const status = document.querySelector('[data-filter-status="discounts"]')?.value || ''
  document.querySelectorAll('.discount-table tbody tr').forEach((row) => { const discount = state.discounts.find((item) => item.id === row.dataset.id); row.hidden = !discount || (!`${discount.title} ${discount.code || ''}`.toLowerCase().includes(query)) || (status && discountStatus(discount) !== status) })
}

function activityList(items) {
  return `<ul class="activity-list">${items.map((item) => `<li><i>${item.entity_type === 'product' ? '◇' : item.entity_type === 'order' ? '▣' : item.entity_type === 'media' ? '▧' : '✓'}</i><p><strong>${escapeHtml(item.action)}</strong><small>${escapeHtml(item.actor_email || 'Systeem')} · ${formatDate(item.created_at, { hour: '2-digit', minute: '2-digit' })}</small></p></li>`).join('') || '<li><p>Nog geen activiteiten.</p></li>'}</ul>`
}

function renderActivity() {
  elements.content.innerHTML = `<div class="page-container">${pageHeader('activity')}<section class="panel"><header class="panel-header"><div><h2>Activiteitenlogboek</h2><p>De laatste 100 beheeracties</p></div></header>${activityList(state.activity)}</section></div>`
}

function teamManagementMarkup(returnTo = 'team', compact = false) {
  const canManage = state.profile?.role === 'owner'
  const rows = state.profiles.map((profile) => {
    const removable = canManage && profile.id !== state.profile.id && profile.role !== 'owner'
    return `<tr><td><strong>${escapeHtml(profile.full_name || profile.email)}</strong>${profile.id === state.profile.id ? '<small class="table-subline">Jij</small>' : ''}</td><td>${escapeHtml(profile.email)}</td><td>${statusPill(profile.active ? 'active' : 'inactive')}</td><td>${escapeHtml(roleLabel(profile.role))}</td><td>${formatDate(profile.created_at)}</td><td class="table-actions">${removable ? `<button class="button button--danger button--small" data-action="remove-admin" data-id="${profile.id}" data-return="${returnTo}">Verwijderen</button>` : ''}</td></tr>`
  }).join('')
  const pending = state.allowedEmails.filter((allowed) => !state.profiles.some((profile) => profile.email === allowed.email))
  const addButton = canManage ? `<button class="button button--primary" data-action="invite-admin" data-return="${returnTo}">Beheerder toevoegen</button>` : ''
  return `<section class="${compact ? 'settings-team-block' : 'panel'}"><header class="panel-header"><div><h2>Actieve beheerders</h2><p>${canManage ? 'Voeg accounts toe of trek toegang direct in.' : 'Alleen de eigenaar kan toegang wijzigen.'}</p></div>${addButton}</header>${rows ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Naam</th><th>E-mail</th><th>Status</th><th>Rol</th><th>Sinds</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState('Nog geen actieve beheerders', 'De eigenaar kan hier een beheerder toevoegen.', '♧')}</section>${pending.length ? `<section class="${compact ? 'settings-team-block' : 'panel'}"><header class="panel-header"><div><h2>Wacht op activering</h2><p>Account is nog niet geactiveerd</p></div></header><div class="table-scroll"><table class="data-table"><thead><tr><th>E-mail</th><th>Rol</th><th>Toegevoegd</th><th></th></tr></thead><tbody>${pending.map((entry) => `<tr><td>${escapeHtml(entry.email)}</td><td>${escapeHtml(roleLabel(entry.role))}</td><td>${formatDate(entry.created_at)}</td><td class="table-actions">${canManage ? `<button class="button button--danger button--small" data-action="remove-admin" data-email="${escapeHtml(entry.email)}" data-return="${returnTo}">Verwijderen</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`
}

function renderTeam() {
  elements.content.innerHTML = `<div class="page-container">${pageHeader('team')}${teamManagementMarkup('team')}</div>`
}

function inviteAdminForm(returnTo = 'team') {
  openDialog('Beheerder toevoegen', 'Team', `<form id="invite-form"><div class="form-grid"><label class="field field--full">Naam<input name="full_name" type="text" autocomplete="name" maxlength="100" required></label><label class="field field--full">E-mailadres<input name="email" type="email" autocomplete="off" autocapitalize="none" spellcheck="false" required></label><label class="field">Tijdelijk wachtwoord<input name="password" type="password" autocomplete="new-password" minlength="12" required></label><label class="field">Herhaal wachtwoord<input name="password_confirm" type="password" autocomplete="new-password" minlength="12" required></label><label class="field field--full">Rol<select name="role"><option value="admin">Beheerder</option><option value="editor">Contentbeheerder</option><option value="viewer">Alleen bekijken</option></select></label></div><p style="color:#68737e;font-size:10px;line-height:1.6">Gebruik minimaal 12 tekens met een hoofdletter, kleine letter, cijfer en speciaal teken. Deel het tijdelijke wachtwoord via een veilig kanaal.</p><div class="form-actions"><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit">Beheerder aanmaken</button></div></form>`)
  const form = document.querySelector('#invite-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); setBusy(button, true, 'Beheerder aanmaken')
    const payload = Object.fromEntries(new FormData(form)); payload.email = payload.email.trim().toLowerCase(); payload.full_name = payload.full_name.trim()
    if (payload.password !== payload.password_confirm) { toast('Wachtwoorden komen niet overeen', '', true); setBusy(button, false, 'Beheerder aanmaken'); return }
    if (!isStrongPassword(payload.password)) { toast('Kies een sterker wachtwoord', 'Minimaal 12 tekens, hoofdletter, kleine letter, cijfer en speciaal teken.', true); setBusy(button, false, 'Beheerder aanmaken'); return }
    delete payload.password_confirm
    const { data, error } = await supabase.functions.invoke('invite-admin', { body: payload })
    if (error || data?.error) { toast('Beheerder aanmaken mislukt', await edgeFunctionMessage(error, data, 'De beheerder kon niet worden aangemaakt.'), true); setBusy(button, false, 'Beheerder aanmaken'); return }
    await recordActivity('Beheerder aangemaakt', 'admin', payload.email, { role: payload.role })
    toast('Beheerder aangemaakt', `${payload.email} kan nu inloggen.`); closeDialog(); await refreshCurrentRoute(returnTo === 'settings' ? 'team' : undefined)
  })
}

async function removeAdmin(profileId, email, returnTo = 'team') {
  if (state.profile?.role !== 'owner') return
  const profile = state.profiles.find((item) => item.id === profileId)
  const targetEmail = profile?.email || email
  if (!targetEmail || !window.confirm(`Weet je zeker dat je de beheerder ${targetEmail} wilt verwijderen? De toegang wordt direct ingetrokken.`)) return
  const { data, error } = await supabase.functions.invoke('remove-admin', { body: { target_id: profileId || null, email: targetEmail } })
  if (error || data?.error) {
    const details = await edgeFunctionDetails(error, data)
    const message = details.error || 'De beheerder kon niet worden verwijderd.'
    if (details.access_revoked) { toast('Toegang ingetrokken', message, true); await refreshCurrentRoute(returnTo === 'settings' ? 'team' : undefined); return }
    toast('Beheerder verwijderen mislukt', message, true); return
  }
  toast('Beheerder verwijderd', `${targetEmail} kan niet meer inloggen.`)
  await refreshCurrentRoute(returnTo === 'settings' ? 'team' : undefined)
}

function settingsValue(key) { return state.settings.find((setting) => setting.key === key)?.value || {} }

function renderSettings(category = 'company') {
  const company = settingsValue('company_profile'), commerce = settingsValue('commerce'), theme = settingsValue('theme'), seo = settingsValue('seo_defaults'), email = settingsValue('email_config')
  const panels = {
    company: `<h2>Bedrijfsgegevens</h2><p>Gegevens die op facturen en in contactinformatie worden gebruikt.</p><form id="settings-form" data-key="company_profile" data-category="company"><div class="form-grid"><label class="field">Bedrijfsnaam<input name="name" value="${escapeHtml(company.name)}"></label><label class="field">E-mailadres<input name="email" type="email" value="${escapeHtml(company.email)}"></label><label class="field">Telefoon<input name="phone" value="${escapeHtml(company.phone)}"></label><label class="field">KvK-nummer<input name="kvk" value="${escapeHtml(company.kvk)}"></label><label class="field">BTW-nummer<input name="vat_number" value="${escapeHtml(company.vat_number)}"></label><label class="field">Adres<input name="address" value="${escapeHtml(company.address)}"></label></div>${settingsActions()}</form>`,
    checkout: `<h2>Checkout & betalingen</h2><p>Verzending, belasting en de voorbereiding op Mollie.</p><form id="settings-form" data-key="commerce" data-category="checkout"><div class="form-grid"><label class="field">Verzendkosten (€)<input name="shipping_cents" data-cents type="number" min="0" step="0.01" value="${((commerce.shipping_cents || 0) / 100).toFixed(2)}"></label><label class="field">Gratis verzending vanaf (€)<input name="free_shipping_threshold_cents" data-cents type="number" min="0" step="0.01" value="${((commerce.free_shipping_threshold_cents || 0) / 100).toFixed(2)}"></label><label class="field">BTW-percentage<input name="tax_rate" type="number" min="0" step="0.01" value="${commerce.tax_rate ?? 21}"></label><label class="field">Valuta<select name="currency"><option value="EUR" ${commerce.currency === 'EUR' ? 'selected' : ''}>EUR — euro</option></select></label><label class="checkbox-field field--full"><input name="mollie_enabled" type="checkbox" ${commerce.mollie_enabled ? 'checked' : ''}> Mollie activeren zodra de API-sleutel veilig is ingesteld</label></div>${settingsActions()}</form>`,
    website: `<h2>Huisstijl & SEO</h2><p>Pas de basiskleuren en standaard zoekmachinegegevens aan.</p><form id="settings-form" data-key="theme" data-category="website"><div class="form-grid"><label class="field">ZOL-blauw<div class="color-row"><input name="primary" type="color" value="${escapeHtml(theme.primary || '#33669B')}"><input value="${escapeHtml(theme.primary || '#33669B')}" disabled></div></label><label class="field">Accentkleur<div class="color-row"><input name="accent" type="color" value="${escapeHtml(theme.accent || '#F28C57')}"><input value="${escapeHtml(theme.accent || '#F28C57')}" disabled></div></label><label class="field">Tekstkleur<div class="color-row"><input name="ink" type="color" value="${escapeHtml(theme.ink || '#10233B')}"><input value="${escapeHtml(theme.ink || '#10233B')}" disabled></div></label><label class="field">Achtergrond<div class="color-row"><input name="background" type="color" value="${escapeHtml(theme.background || '#F7F5F0')}"><input value="${escapeHtml(theme.background || '#F7F5F0')}" disabled></div></label></div>${settingsActions()}</form><form id="seo-settings-form" style="margin-top:25px"><h2>Standaard SEO</h2><div class="form-grid"><label class="field">Websitetitel<input name="title" value="${escapeHtml(seo.title)}"></label><label class="field">Beschrijving<input name="description" value="${escapeHtml(seo.description)}"></label></div>${settingsActions()}</form>`,
    email: `<h2>E-mail</h2><p>Afzender, antwoordadres en interne meldingen. De geheime API-sleutel wordt nooit in de browser opgeslagen.</p><form id="settings-form" data-key="email_config" data-category="email"><div class="email-connection ${email.enabled ? 'is-connected' : ''}"><i>${email.enabled ? '✓' : '!'}</i><div><strong>${email.enabled ? 'E-mailverzending actief' : 'Wacht op domein en API-sleutel'}</strong><small>${email.enabled ? 'Order-, contact- en klantmails zijn ingeschakeld.' : 'De volledige mailflow staat klaar, maar verstuurt nog niets.'}</small></div></div><div class="form-grid"><label class="field">Afzendernaam<input name="from_name" value="${escapeHtml(email.from_name || 'ZOL Solutions')}"></label><label class="field">Afzenderadres<input name="from_email" type="email" value="${escapeHtml(email.from_email || 'info@zolsolutions.nl')}"></label><label class="field">Antwoordadres<input name="reply_to" type="email" value="${escapeHtml(email.reply_to || 'info@zolsolutions.nl')}"></label><label class="field">Interne meldingen naar<input name="admin_email" type="email" value="${escapeHtml(email.admin_email || 'info@zolsolutions.nl')}"></label><label class="field field--full">Website-URL<input name="website_url" type="url" value="${escapeHtml(email.website_url || 'https://zolsolutions.nl')}"></label><input name="provider" type="hidden" value="resend"><label class="checkbox-field field--full"><input name="enabled" type="checkbox" ${email.enabled ? 'checked' : ''}> Verzending activeren <small>(pas na domeinverificatie en server-side API-sleutel)</small></label></div>${settingsActions('E-mailinstellingen opslaan')}</form>`,
    team: `<h2>Beheerders</h2><p>Beheer wie toegang heeft tot ZOL Admin. Alleen de eigenaar kan accounts toevoegen of verwijderen.</p>${teamManagementMarkup('settings', true)}`,
    security: `<h2>Account & beveiliging</h2><p>Wijzig je eigen wachtwoord. Na de wijziging worden alle andere actieve sessies afgemeld.</p><form id="password-form"><div class="form-grid"><label class="field field--full">Huidig wachtwoord<input name="current_password" type="password" autocomplete="current-password" required></label><label class="field">Nieuw wachtwoord<input name="password" type="password" autocomplete="new-password" minlength="12" required><small>Minimaal 12 tekens met hoofdletter, kleine letter, cijfer en speciaal teken.</small></label><label class="field">Herhaal nieuw wachtwoord<input name="password_confirm" type="password" autocomplete="new-password" minlength="12" required></label></div>${settingsActions('Wachtwoord wijzigen')}</form>`,
  }
  elements.content.innerHTML = `<div class="page-container">${pageHeader('settings')}<div class="settings-layout"><nav class="settings-nav panel"><button data-settings-tab="company" class="${category === 'company' ? 'is-active' : ''}">Bedrijf</button><button data-settings-tab="checkout" class="${category === 'checkout' ? 'is-active' : ''}">Checkout & btw</button><button data-settings-tab="website" class="${category === 'website' ? 'is-active' : ''}">Website & SEO</button><button data-settings-tab="email" class="${category === 'email' ? 'is-active' : ''}">E-mail</button><button data-settings-tab="team" class="${category === 'team' ? 'is-active' : ''}">Beheerders</button><button data-settings-tab="security" class="${category === 'security' ? 'is-active' : ''}">Wachtwoord</button></nav><section class="settings-panel panel">${panels[category] || panels.company}</section></div></div>`
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
  if (route !== 'live') stopLiveUpdates()
  document.querySelectorAll('[data-route]').forEach((link) => link.classList.toggle('is-active', link.dataset.route === route))
  elements.sidebar.classList.remove('is-open')
  const renderers = { dashboard: renderDashboard, orders: renderOrders, customers: renderCustomers, messages: renderMessages, emails: renderEmails, products: renderProducts, discounts: renderDiscounts, content: renderContent, media: renderMedia, payments: renderPayments, analytics: renderAnalytics, live: renderLive, activity: renderActivity, team: renderTeam, settings: () => renderSettings(option) }
  renderers[route]?.()
  if (route === 'live' && !liveRefreshTimer) startLiveUpdates()
  refreshIcons()
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

async function exportAnalytics() {
  const rows = [['Datum', 'Event', 'Sessie', 'Pagina', 'Apparaat', 'Verwijzer'], ...analyticsSince(30).map((event) => [event.created_at, event.event_name, event.session_id, event.page, event.metadata?.device || '', event.metadata?.referrer || ''])]
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = `zol-analytics-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url)
  await recordActivity('Analytics geëxporteerd', 'analytics', '', { events: rows.length - 1 }); toast('Analytics-export aangemaakt')
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
    <div class="totals"><div><span>Subtotaal</span><strong>${formatMoney(order.subtotal_cents)}</strong></div><div><span>Verzending</span><strong>${formatMoney(order.shipping_cents)}</strong></div>${order.discount_cents ? `<div><span>Korting ${order.discount_code ? `(${escapeHtml(order.discount_code)})` : ''}</span><strong>− ${formatMoney(order.discount_cents)}</strong></div>` : ''}<div><span>Inclusief btw</span><strong>${formatMoney(order.tax_cents)}</strong></div><div class="total"><span>Totaal</span><strong>${formatMoney(order.total_cents)}</strong></div></div>
    <footer>Betaalstatus: ${escapeHtml(prettyStatus(order.payment_status))} · Bedankt voor je bestelling bij ZOL Solutions.</footer></body></html>`)
  invoice.document.close()
  window.setTimeout(() => invoice.print(), 250)
}

async function handleContentClick(event) {
  const close = event.target.closest('[data-close-dialog]'); if (close) { closeDialog(); return }
  const jump = event.target.closest('[data-route-jump]'); if (jump) { const fromEmails = currentRoute() === 'emails' && jump.dataset.routeJump === 'settings'; window.location.hash = jump.dataset.routeJump; if (fromEmails) window.setTimeout(() => renderSettings('email'), 0); return }
  const target = event.target.closest('[data-action]'); if (!target) return
  const { action, id } = target.dataset
  if (action === 'refresh') await refreshCurrentRoute()
  if (action === 'refresh-live') await refreshCurrentRoute()
  if (action === 'export-orders') await exportOrders()
  if (action === 'export-analytics') await exportAnalytics()
  if (action === 'print-invoice') printInvoice(state.orders.find((item) => item.id === id))
  if (action === 'open-order') openOrder(state.orders.find((item) => item.id === id))
  if (action === 'back-orders') renderOrders()
  if (action === 'add-tracking') trackingForm(state.orders.find((item) => item.id === id))
  if (action === 'mark-delivered') await markOrderDelivered(state.orders.find((item) => item.id === id))
  if (action === 'toggle-archive') await toggleOrderArchive(state.orders.find((item) => item.id === id))
  if (action === 'refund-order') refundOrderForm(state.orders.find((item) => item.id === id))
  if (action === 'return-order') returnOrderForm(state.orders.find((item) => item.id === id))
  if (action === 'edit-order-note') editOrderNoteForm(state.orders.find((item) => item.id === id))
  if (action === 'delete-order-note') await deleteOrderNote(id, target.dataset.orderId)
  if (action === 'new-order') newOrderForm()
  if (action === 'delete-order') await deleteOrder(id)
  if (action === 'add-order-line') { const form = document.querySelector('#new-order-form'); if (form) { const line = form.querySelector('.manual-order-line')?.cloneNode(true); if (line) { line.querySelector('[data-order-variant]').value = ''; line.querySelector('[data-order-quantity]').value = '1'; form.querySelector('#manual-order-lines').append(line); updateManualOrderTotal(form) } } }
  if (action === 'remove-order-line') { const form = document.querySelector('#new-order-form'); const lines = form?.querySelectorAll('.manual-order-line'); if (lines?.length > 1) { target.closest('.manual-order-line')?.remove(); updateManualOrderTotal(form) } else toast('Minimaal één product nodig', '', true) }
  if (action === 'open-customer') customerForm(state.customers.find((item) => item.id === id))
  if (action === 'open-message') await openContactMessage(state.contactMessages.find((item) => item.id === id))
  if (action === 'new-customer') customerForm()
  if (action === 'delete-customer') await deleteCustomer(id)
  if (action === 'email-customer') { const customer = state.customers.find((item) => item.id === id); closeDialog(); queueMicrotask(() => customerEmailForm(customer)) }
  if (action === 'open-product') productForm(state.products.find((item) => item.id === id))
  if (action === 'new-product') productForm()
  if (action === 'delete-product') await deleteProduct(id)
  if (action === 'new-discount') discountForm()
  if (action === 'open-discount') discountForm(state.discounts.find((item) => item.id === id))
  if (action === 'delete-discount') await deleteDiscount(id)
  if (action === 'preview-product') window.open('/product/', '_blank', 'noopener')
  if (action === 'open-content') contentForm(state.content.find((item) => item.id === id))
  if (action === 'new-content') contentForm()
  if (action === 'filter-icons') { const filter = document.querySelector('[data-filter-type="content"]'); if (filter) { filter.value = 'icon'; filterContent() } }
  if (action === 'preview-site') window.open('/', '_blank', 'noopener')
  if (action === 'copy-media') { await navigator.clipboard.writeText(target.dataset.url); toast('Link gekopieerd') }
  if (action === 'delete-media') await deleteMedia(id)
  if (action === 'open-payment') paymentForm(state.payments.find((item) => item.id === id))
  if (action === 'edit-email-template') emailTemplateForm(state.emailTemplates.find((item) => item.template_key === id))
  if (action === 'send-order-email') await sendOrderEmail(state.orders.find((item) => item.id === id))
  if (action === 'invite-admin') inviteAdminForm(target.dataset.return || 'team')
  if (action === 'remove-admin') await removeAdmin(id, target.dataset.email, target.dataset.return || 'team')
}

function handleFilters(event) {
  if (event.target.matches('[data-filter="orders"], [data-filter-status="orders"], [data-filter-payment="orders"]')) filterOrders()
  if (event.target.matches('[data-filter="customers"], [data-filter-marketing="customers"]')) filterCustomers()
  if (event.target.matches('[data-filter="content"], [data-filter-page="content"], [data-filter-type="content"]')) filterContent()
  if (event.target.matches('[data-filter="media"], [data-filter-kind="media"]')) filterMedia()
  if (event.target.matches('[data-filter="discounts"], [data-filter-status="discounts"]')) filterDiscounts()
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

document.querySelector('#sign-out').addEventListener('click', () => { stopLiveUpdates(); supabase.auth.signOut() })
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
document.querySelector('#global-search').addEventListener('input', (event) => renderGlobalSearch(event.currentTarget.value))
document.querySelector('#global-search').addEventListener('keydown', (event) => {
  const results = document.querySelector('#global-search-results')
  if (event.key === 'Enter') { event.preventDefault(); results.querySelector('button')?.click() }
  if (event.key === 'ArrowDown') { event.preventDefault(); results.querySelector('button')?.focus() }
  if (event.key === 'Escape') hideGlobalSearch()
})
document.querySelector('#global-search-results').addEventListener('click', (event) => {
  const button = event.target.closest('[data-search-route]')
  if (button) openGlobalSearchResult(button)
})
document.addEventListener('click', (event) => { if (!event.target.closest('.global-search-shell')) hideGlobalSearch() })

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') { stopLiveUpdates(); state.session = null; state.profile = null; showLogin() }
  if (event === 'PASSWORD_RECOVERY') { window.location.hash = 'settings'; if (session) showAdmin(session).then(() => renderSettings('security')) }
})

boot()

refreshIcons()
