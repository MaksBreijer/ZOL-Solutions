import './admin.css'
import { customerImportTemplateCsv, parseCustomerCsv } from './csv-customers.js'
import { orderImportTemplateCsv, parseOrderCsv } from './csv-orders.js'
import { financeExcelCsv, financeMonthKey, financeMonthLabel, financeMonthOptions, financeRows, financeSummary } from './finance-report.js'
import { trackingRemovalUpdate } from './order-tracking.js'
import { participantOverview, pilotExcelCsv, pilotSummary, timepointSummary } from './pilot-report.js'
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
  mfa: document.querySelector('#mfa-screen'),
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
  pilotEnrollments: [],
  pilotConsentInvites: [],
  pilotCustomerSelection: new Set(),
  pilotReady: true,
  pilotReport: null,
  pilotReportLoading: false,
  pilotReportError: '',
  mfaFactorId: '',
  mfaMode: '',
  mfaFactors: [],
  discounts: [],
  orderNotes: [],
  search: '',
}

const routeMeta = {
  dashboard: ['Home', 'Alles wat vandaag aandacht nodig heeft, op één plek.'],
  orders: ['Bestellingen', 'Beheer betalingen, verzending en orderdetails.'],
  customers: ['Klanten', 'Klantgegevens, bestelgeschiedenis en interne notities.'],
  messages: ['Berichten', 'Vragen die via het contactformulier zijn binnengekomen.'],
  emails: ['E-mails', 'Bewerk automatische bestel-, bedank- en productmails in de ZOL-huisstijl.'],
  pilot: ['Pijnvragenlijsten', 'Volg hoe het met de hielpijn, het sporten en het gebruik van de ZOL’tjes gaat.'],
  products: ['Producten', 'Prijzen, maten, voorraad en productmedia.'],
  discounts: ['Kortingen', 'Maak kortingscodes en automatische acties voor de ZOL-webshop.'],
  content: ['Website CMS', 'Bewerk teksten, knoppen, beelden, video en SEO zonder code.'],
  media: ['Mediabibliotheek', 'Eén centrale plek voor afbeeldingen, video en iconen.'],
  payments: ['Financiën', 'Omzet, btw, betalingen, refunds en boekhoudcontrole in één overzicht.'],
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
  active: 'Actief', inactive: 'Uitgeschakeld', authorized: 'Geautoriseerd', expired: 'Verlopen', withdrawn: 'Gestopt',
  ready: 'Nog uitnodigen', accepted: 'Toestemming gegeven', declined: 'Afgewezen',
  new: 'Nieuw', read: 'Gelezen', replied: 'Beantwoord', email_failed: 'Melding mislukt', sent: 'Verstuurd', queued: 'In wachtrij', started: 'Gestart',
}[value] || value.replaceAll('_', ' '))

const statusClass = (value = '') => {
  if (['paid', 'completed', 'delivered', 'active', 'accepted', 'authorized', 'sent', 'replied'].includes(value)) return 'is-green'
  if (['failed', 'cancelled', 'declined', 'returned', 'refunded', 'email_failed'].includes(value)) return 'is-red'
  if (['open', 'ready', 'shipped', 'processing', 'new'].includes(value)) return 'is-blue'
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
  visibleOrders().forEach((order) => {
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

async function fetchAllRows(table, select = '*', orderColumn = 'created_at') {
  const pageSize = 500
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const result = await supabase
      .from(table)
      .select(select)
      .order(orderColumn, { ascending: false })
      .range(from, from + pageSize - 1)
    if (result.error) return result
    rows.push(...(result.data || []))
    if ((result.data || []).length < pageSize) return { data: rows, error: null }
  }
}

async function fetchPilotEnrollments() {
  const result = await supabase
    .from('pilot_enrollments')
    .select('*, customers(id,email,first_name,last_name), pilot_invites(*)')
    .order('enrolled_at', { ascending: false })
  if (result.error && ['42P01', 'PGRST205'].includes(result.error.code)) {
    state.pilotReady = false
    return { data: [], error: null }
  }
  state.pilotReady = !result.error
  return result
}

async function fetchAllData() {
  const requests = await Promise.all([
    fetchAllRows('orders', '*, order_items(*, products(images))'),
    fetchAllRows('customers'),
    supabase.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('products').select('*, product_variants(*)').order('updated_at', { ascending: false }),
    fetchAllRows('payments', '*, orders(order_number, customer_name)'),
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
    fetchPilotEnrollments(),
    supabase.from('pilot_consent_invites').select('id,customer_id,status,sent_at,accepted_at,declined_at,created_at').order('created_at', { ascending: false }),
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
    state.pilotEnrollments,
    state.pilotConsentInvites,
  ] = requests.map((request) => request.data || [])

  const openOrders = visibleOrders().filter((order) => !['completed', 'cancelled'].includes(order.status)).length
  document.querySelector('#open-order-count').textContent = openOrders || ''
  const newMessages = state.contactMessages.filter((message) => ['new', 'email_failed'].includes(message.status)).length
  document.querySelector('#new-message-count').textContent = newMessages || ''
}

function renderDashboard() {
  const canManageOrders = ['owner', 'admin'].includes(state.profile?.role)
  const orders = visibleOrders()
  const now = new Date()
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startWeek = new Date(startDay); startWeek.setDate(startDay.getDate() - 6)
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const paid = orders.filter((order) => order.payment_status === 'paid')
  const revenueSince = (date) => paid.filter((order) => new Date(order.created_at) >= date).reduce((sum, order) => sum + order.total_cents, 0)
  const totalRevenue = paid.reduce((sum, order) => sum + order.total_cents, 0)
  const openOrders = orders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length
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
      <article class="metric-card"><header><span>Open bestellingen</span><span class="metric-icon"><i data-lucide="shopping-bag"></i></span></header><strong>${openOrders}</strong><footer><span>${orders.filter((order) => order.fulfillment_status === 'unfulfilled').length} nog te verzenden</span><span>Actueel</span></footer></article>
      <article class="metric-card"><header><span>Conversie</span><span class="metric-icon"><i data-lucide="trending-up"></i></span></header><strong>${conversionRate.toFixed(1)}%</strong><footer><span>${sessions} sessies gemeten</span><span>30 dagen</span></footer></article>
      <article class="metric-card"><header><span>Nieuwe klanten</span><span class="metric-icon"><i data-lucide="user-plus"></i></span></header><strong>${newCustomers}</strong><footer><span>${state.customers.length} klanten totaal</span><span>Maand</span></footer></article>
    </section>
    <div class="dashboard-grid">
      <div>
        <section class="panel"><header class="panel-header"><div><h2>Omzet afgelopen 7 dagen</h2><p>Alle betaalde bestellingen</p></div><strong>${formatMoney(revenueSince(startWeek))}</strong></header>
          <div class="chart-wrap"><div class="chart">${lastSevenDays.map((day) => `<div class="chart-column" title="${formatMoney(day.value)}"><i style="height:${Math.max(3, (day.value / maxRevenue) * 170)}px"></i><small>${day.label}</small></div>`).join('')}</div></div>
        </section>
        <section class="panel"><header class="panel-header"><div><h2>Recente bestellingen</h2><p>De laatste vijf orders</p></div><a href="#orders">Alles bekijken →</a></header>${ordersTable(orders.slice(0, 5), false)}</section>
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
    ${orders.map((order) => `<tr data-action="open-order" data-id="${order.id}"><td><strong>#${order.order_number}</strong>${order.external_reference ? `<small class="table-subline">Import: ${escapeHtml(order.external_reference)}</small>` : ''}</td><td>${formatDate(order.created_at, { hour: '2-digit', minute: '2-digit', year: undefined })}</td><td>${escapeHtml(order.customer_name || order.customer_email)}</td><td><strong>${formatMoney(order.total_cents, order.currency)}</strong></td><td>${statusPill(order.payment_status)}</td><td>${statusPill(order.fulfillment_status)}</td><td>${statusPill(order.status)}</td></tr>`).join('')}
  </tbody></table></div>${showAll ? `<footer class="table-footer"><span>${orders.length} bestellingen</span><span>Klik op een bestelling om deze te bewerken</span></footer>` : ''}`
}

function renderOrders() {
  const canManageOrders = ['owner', 'admin'].includes(state.profile?.role)
  elements.content.innerHTML = `<div class="page-container">${pageHeader('orders', `<button class="button" data-action="export-orders">Exporteren</button>${canManageOrders ? '<button class="button" data-action="import-orders">CSV importeren</button><button class="button button--primary" data-action="new-order">Bestelling maken</button>' : ''}`)}
    <section class="panel"><div class="filters"><input type="search" data-filter="orders" placeholder="Zoek op ordernummer, klant of e-mail"><select data-filter-status="orders"><option value="">Alle statussen</option><option value="open">Open</option><option value="completed">Afgerond</option><option value="cancelled">Geannuleerd</option></select><select data-filter-payment="orders"><option value="">Elke betaling</option><option value="pending">Openstaand</option><option value="paid">Betaald</option><option value="refunded">Terugbetaald</option></select></div><p class="form-hint">Onbetaalde webshop-checkouts verdwijnen na ${escapeHtml(settingsValue('commerce').abandoned_checkout_minutes || 10)} minuten automatisch uit dit overzicht. Zodra een betaling alsnog slaagt, verschijnt de bestelling weer.</p><div id="orders-table">${ordersTable(visibleOrders())}</div></section>
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
  const filtered = visibleOrders().filter((order) =>
    (!query || [order.order_number, order.external_reference, order.customer_name, order.customer_email].some((value) => String(value || '').toLowerCase().includes(query))) &&
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
  const postnl = order.postnl || {}
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
    <header class="order-detail-header"><div><button class="order-back" type="button" data-action="back-orders"><i data-lucide="arrow-left"></i></button><div><div class="order-title-line"><h1>#${order.order_number}</h1>${statusPill(order.payment_status)}${statusPill(order.fulfillment_status)}${order.archived ? '<span class="status-pill">Gearchiveerd</span>' : ''}</div><p>${formatDate(order.created_at, { hour: '2-digit', minute: '2-digit' })} via ${order.source === 'admin' ? 'ZOL Admin' : order.source === 'csv-import' ? `CSV-import${order.external_reference ? ` · ${escapeHtml(order.external_reference)}` : ''}` : 'Webshop'}</p></div></div><div class="order-header-actions">${refundable && canManage ? `<button class="button" data-action="refund-order" data-id="${order.id}"><i data-lucide="rotate-ccw"></i> Terugbetalen</button>` : ''}${order.fulfillment_status !== 'returned' && canManage ? `<button class="button" data-action="return-order" data-id="${order.id}">Retourneren</button>` : ''}<button class="button" data-action="toggle-archive" data-id="${order.id}"><i data-lucide="archive"></i>${order.archived ? 'Uit archief' : 'Archiveren'}</button></div></header>
    <div class="order-detail-grid"><main class="order-detail-main">
      <section class="order-card fulfillment-card"><header><div><i data-lucide="truck"></i><div><h2>${prettyStatus(order.fulfillment_status)}</h2><p>${order.shipped_at ? `Verzonden ${formatDate(order.shipped_at, { hour: '2-digit', minute: '2-digit' })}` : 'Klaar voor verwerking'}</p></div></div><span>#${order.order_number}-F1</span></header>
        ${order.tracking_code ? `<div class="tracking-summary"><div><span>${escapeHtml(order.tracking_carrier || 'Tracking')}</span><strong>${escapeHtml(order.tracking_code)}</strong>${trackingUrl ? `<a href="${escapeHtml(trackingUrl)}" target="_blank" rel="noreferrer">Zending volgen <i data-lucide="external-link"></i></a>` : ''}</div>${order.fulfillment_status === 'delivered' ? statusPill('delivered') : statusPill('shipped')}</div>` : ''}
        <div class="order-products">${itemRows || '<p class="no-order-items">Geen orderregels.</p>'}</div>
        ${postnl.barcode ? `<div class="postnl-shipment"><div><span>PostNL ${postnl.environment === 'production' ? 'productie' : 'sandbox'}</span><strong>Label en barcode aangemaakt</strong>${(postnl.warnings || []).length ? `<small>${escapeHtml(postnl.warnings.join(' · '))}</small>` : ''}</div><button class="button" data-action="postnl-label-url" data-id="${order.id}"><i data-lucide="download"></i> Label openen</button></div>` : ''}
        <footer><span>${itemCount} artikel${itemCount === 1 ? '' : 'en'}</span><div>${postnl.barcode ? '' : `<button class="button button--primary" data-action="postnl-label" data-id="${order.id}"><i data-lucide="truck"></i> PostNL-label maken</button>`}${order.tracking_code ? `<button class="button" data-action="add-tracking" data-id="${order.id}"><i data-lucide="pencil"></i> Tracking wijzigen</button>${canManage ? `<button class="button button--danger" data-action="remove-tracking" data-id="${order.id}">Tracking verwijderen</button>` : ''}` : `<button class="button" data-action="add-tracking" data-id="${order.id}"><i data-lucide="plus"></i> Tracking toevoegen</button>`}${order.fulfillment_status === 'shipped' ? `<button class="button" data-action="mark-delivered" data-id="${order.id}"><i data-lucide="check-circle"></i> Markeer bezorgd</button>` : ''}</div></footer>
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

async function removeOrderTracking(order, button) {
  if (!order?.tracking_code) return
  if (!['owner', 'admin'].includes(state.profile?.role)) { toast('Tracking verwijderen mislukt', 'Je hebt geen toegang om tracking te verwijderen.', true); return }
  if (!window.confirm(`Trackingcode ${order.tracking_code} verwijderen uit bestelling #${order.order_number}? De verzendstatus en een eventueel PostNL-label blijven ongewijzigd.`)) return
  setBusy(button, true, 'Tracking verwijderen')
  const { data, error } = await supabase.from('orders').update(trackingRemovalUpdate()).eq('id', order.id).select('id').maybeSingle()
  if (error || !data) {
    toast('Tracking verwijderen mislukt', error?.message || 'Je hebt geen toegang om deze bestelling bij te werken.', true)
    setBusy(button, false, 'Tracking verwijderen')
    return
  }
  await recordActivity('Tracking verwijderd', 'order', order.id, { order_number: order.order_number, carrier: order.tracking_carrier, tracking_code: order.tracking_code })
  toast('Tracking verwijderd', `Bestelling #${order.order_number} heeft geen trackingcode meer.`)
  await refreshOrderDetail(order.id)
}

function postnlLabelForm(order) {
  const config = settingsValue('postnl_config')
  const environment = config.environment === 'production' ? 'production' : 'sandbox'
  const emailEnabled = Boolean(settingsValue('email_config').enabled)
  const isProduction = environment === 'production'
  openDialog('PostNL-label maken', `Bestelling #${order.order_number}`, `<form id="postnl-label-form"><div class="email-connection ${isProduction ? '' : 'is-connected'}"><i>${isProduction ? '!' : '✓'}</i><div><strong>${isProduction ? 'Productie — deze zending wordt echt aangemeld' : 'Veilige sandbox-test'}</strong><small>${isProduction ? 'PostNL kan deze zending factureren. Controleer adres en betaling zorgvuldig.' : 'Er wordt geen echte betaalde zending aangemaakt.'}</small></div></div><div class="form-grid"><label class="field">Pakkettype<input value="${config.shipment_type === 'letterbox' ? 'Brievenbuspakje' : 'Pakket'}" disabled></label><label class="checkbox-field field--full"><input name="notify" type="checkbox" ${emailEnabled && isProduction ? 'checked' : ''} ${emailEnabled ? '' : 'disabled'}> Na het maken als verzonden markeren en de klant mailen</label>${isProduction ? '<label class="checkbox-field field--full"><input name="confirm_production" type="checkbox" required> Ik bevestig dat dit een echte productiezending mag worden</label>' : ''}</div>${!emailEnabled ? '<p class="form-hint">De trackingcode wordt wel opgeslagen; activeer e-mail eerst om de klant automatisch te informeren.</p>' : ''}<div class="form-actions"><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit">${isProduction ? 'Echt label aanmaken' : 'Sandboxlabel maken'}</button></div></form>`)
  const form = document.querySelector('#postnl-label-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = form.querySelector('[type="submit"]')
    setBusy(button, true, isProduction ? 'Echt label aanmaken' : 'Sandboxlabel maken')
    const { data, error } = await supabase.functions.invoke('postnl-shipment', { body: { action: 'create', order_id: order.id, confirm_production: Boolean(form.elements.confirm_production?.checked) } })
    if (error || data?.error) { toast('PostNL-label mislukt', await edgeFunctionMessage(error, data, 'Het label kon niet worden gemaakt.'), true); setBusy(button, false, isProduction ? 'Echt label aanmaken' : 'Sandboxlabel maken'); return }
    if (form.elements.notify.checked) {
      const { error: statusError } = await supabase.from('orders').update({ fulfillment_status: 'shipped', shipped_at: new Date().toISOString() }).eq('id', order.id)
      if (statusError) toast('Label gemaakt, verzendstatus niet bijgewerkt', statusError.message, true)
      else {
        const { data: emailData, error: emailError } = await supabase.functions.invoke('order-email', { body: { order_id: order.id, action: 'shipping' } })
        if (emailError || emailData?.error) toast('Label gemaakt, verzendmail mislukt', await edgeFunctionMessage(emailError, emailData, 'De e-mail kon niet worden verstuurd.'), true)
      }
    }
    if (data.label_url) window.open(data.label_url, '_blank', 'noopener')
    toast('PostNL-label gemaakt', `${data.barcode} · ${data.environment === 'production' ? 'productie' : 'sandbox'}`)
    closeDialog(); await refreshOrderDetail(order.id)
  })
}

async function openPostnlLabel(order) {
  const { data, error } = await supabase.functions.invoke('postnl-shipment', { body: { action: 'label_url', order_id: order.id } })
  if (error || data?.error || !data?.label_url) { toast('Label openen mislukt', await edgeFunctionMessage(error, data, 'Het label is niet beschikbaar.'), true); return }
  window.open(data.label_url, '_blank', 'noopener')
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
  return `<div class="table-scroll customer-table-scroll"><table class="data-table"><thead><tr><th>Klant</th><th>E-mail</th><th>Marketing</th><th>Bestellingen</th><th>Besteed</th><th>Sinds</th></tr></thead><tbody>${customers.map((customer) => `<tr data-action="open-customer" data-id="${customer.id}"><td><strong>${escapeHtml(fullName(customer))}</strong><small class="table-subline">${escapeHtml(customer.phone || 'Geen telefoonnummer')}</small></td><td>${escapeHtml(customer.email)}</td><td>${statusPill(customer.marketing_opt_in ? 'active' : 'inactive')}</td><td>${customer.total_orders}</td><td><strong>${formatMoney(customer.total_spent_cents)}</strong></td><td>${formatDate(customer.created_at)}</td></tr>`).join('')}</tbody></table></div><footer class="table-footer"><span>${customers.length} klanten</span><span>Scroll in de lijst en klik op een klant voor de details</span></footer>`
}

function renderCustomers() {
  const actions = ['owner', 'admin'].includes(state.profile?.role) ? '<button class="button" data-action="import-customers">Klanten importeren</button><button class="button button--primary" data-action="new-customer">Klant toevoegen</button>' : ''
  elements.content.innerHTML = `<div class="page-container">${pageHeader('customers', actions)}<section class="customer-database-note"><span>✓</span><div><strong>Rechtstreeks opgeslagen in de ZOL-klantendatabase</strong><p>Klanten uit de webshop, handmatige bestellingen en contactaanvragen komen samen in één dossier. De aantallen en bestelhistorie worden uit de echte gegevens berekend.</p></div></section><section class="panel"><div class="filters"><input type="search" data-filter="customers" placeholder="Zoek op naam, e-mail of telefoon"><select data-filter-marketing="customers"><option value="">Alle klanten</option><option value="yes">Marketing toegestaan</option><option value="no">Geen marketing</option></select></div><div id="customers-table">${customersTable(state.customers)}</div></section></div>`
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
  refunded_total: '€ 99,95', website_url: 'https://zolsolutions.nl', product_url: 'https://zolsolutions.nl/product/',
  unsubscribe_url: 'https://zolsolutions.nl/uitschrijven/?token=voorbeeld', admin_url: 'https://zol-solutions.pages.dev/admin/',
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
  const automaticDetails = template.template_key === 'marketing_product_update'
    ? `<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e4e9ee;color:#738496;font-size:11px;line-height:1.6">Ontvangers kunnen zich vanuit iedere productmail direct afmelden.</div>`
    : `<div style="margin:20px 0;padding:16px;border-radius:11px;background:#f3f6f8;color:#53677a;font-size:12px">Bestelgegevens, bedragen of tracking worden hier automatisch toegevoegd wanneer deze mail wordt verstuurd.</div>`
  return `<!doctype html><html lang="nl"><meta name="viewport" content="width=device-width"><body style="margin:0;padding:22px 10px;background:#eef1f4;font-family:Arial,sans-serif"><table width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:auto;overflow:hidden;border-radius:18px;background:white"><tr><td style="padding:30px 34px;background:#102b4a;color:white"><img src="${escapeHtml(logoUrl)}" width="96" alt="ZOL Solutions" style="display:block;filter:brightness(0) invert(1)"><p style="margin:22px 0 7px;color:#9fc4e8;font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase">${escapeHtml(fillEmailVariables(template.eyebrow_template))}</p><h1 style="margin:0;font-size:31px;line-height:1.08">${escapeHtml(fillEmailVariables(template.title_template))}</h1><p style="margin:14px 0 0;color:#dfeaf4;font-size:14px;line-height:1.6">${escapeHtml(fillEmailVariables(template.intro_template))}</p></td></tr><tr><td style="padding:30px 34px">${body}${automaticDetails}${label ? `<a href="${escapeHtml(url)}" style="display:inline-block;margin-top:18px;padding:13px 19px;border-radius:8px;background:#33669b;color:white;font-size:13px;font-weight:700;text-decoration:none">${escapeHtml(label)} →</a>` : ''}</td></tr><tr><td style="padding:20px 34px;border-top:1px solid #e4e9ee;color:#66798c;font-size:11px;line-height:1.6">ZOL Solutions · Zachter landen. Beter sporten.</td></tr></table></body></html>`
}

function renderEmails() {
  const email = settingsValue('email_config')
  const sent = state.emailMessages.filter((item) => item.status === 'sent').length
  const failed = state.emailMessages.filter((item) => item.status === 'failed').length
  const cards = state.emailTemplates.map((template) => `<article class="email-template-card" data-action="edit-email-template" data-id="${escapeHtml(template.template_key)}"><header><span>${template.audience === 'admin' ? 'INTERN' : 'KLANT'}</span>${statusPill(template.enabled ? 'active' : 'inactive')}</header><h2>${escapeHtml(template.name)}</h2><p>${escapeHtml(template.description)}</p><div><strong>${escapeHtml(fillEmailVariables(template.subject_template))}</strong><small>${(template.variables || []).length} beschikbare variabelen</small></div><button class="button" type="button">Bewerken & preview →</button></article>`).join('')
  elements.content.innerHTML = `<div class="page-container">${pageHeader('emails', '<button class="button" data-route-jump="settings">Afzender instellen</button>')}<section class="email-flow-summary"><div class="email-connection ${email.enabled ? 'is-connected' : ''}"><i>${email.enabled ? '✓' : '!'}</i><div><strong>${email.enabled ? 'Automatische verzending staat aan' : 'Sjablonen klaar — verzending staat nog uit'}</strong><small>${email.enabled ? `Verzonden: ${sent} · mislukt: ${failed}` : 'Activeer Resend pas nadat het afzenderdomein en de server-sleutel zijn ingesteld.'}</small></div></div><p><strong>Volledige bestelreis</strong><span>Ontvangen → betaald → verzonden → bezorgd/bedankt → retour of terugbetaling</span></p></section><section class="email-template-grid">${cards || emptyState('Geen e-mailsjablonen', 'Voer de e-mailmigratie uit om de standaardmails toe te voegen.', '✉')}</section></div>`
}

const pilotTimepoints = [
  ['baseline', '0-meting', 'Direct'],
  ['week1', 'Week 1', 'Na 7 dagen'],
  ['week4', 'Week 4', 'Na 28 dagen'],
  ['week12', 'Week 12', 'Na 84 dagen'],
]

function pilotCustomer(enrollment) {
  return Array.isArray(enrollment.customers) ? enrollment.customers[0] : enrollment.customers
}

function pilotInvite(enrollment, key) {
  return (enrollment.pilot_invites || []).find((invite) => invite.timepoint === key)
}

function pilotReportParticipant(enrollmentId) {
  return state.pilotReport?.participants?.find((participant) => participant.enrollment_id === enrollmentId)
}

function pilotScore(value) {
  return value === null || value === undefined || value === '' ? '—' : escapeHtml(value)
}

function pilotAverage(value) {
  return value === null || value === undefined ? '—' : Number(value).toFixed(1)
}

function renderPilotResults() {
  if (state.pilotReportLoading) return `<section class="panel pilot-results-state"><span class="spinner"></span><div><strong>Antwoorden worden opgehaald</strong><p>Alleen bevoegde beheerders kunnen de gezondheidsgegevens bekijken.</p></div></section>`
  if (state.pilotReportError) return `<section class="panel pilot-results-state is-error"><span>!</span><div><strong>Antwoorden konden niet worden geladen</strong><p>${escapeHtml(state.pilotReportError)}</p><button class="button" type="button" data-action="refresh-pilot-results">Opnieuw proberen</button></div></section>`
  if (!state.pilotReport?.participants?.length) return `<section class="panel pilot-results-state"><span>◇</span><div><strong>Nog geen antwoorden</strong><p>Zodra een deelnemer een pijnvragenlijst invult, verschijnt het resultaat hier.</p></div></section>`

  const timepoints = timepointSummary(state.pilotReport)
  const overview = participantOverview(state.pilotReport)
  const answerRows = state.pilotReport.participants.flatMap((participant) =>
    (participant.measurements || []).flatMap((measurement) =>
      (measurement.answers || []).filter((answer) => answer.value !== null && answer.value !== '').map((answer) => `
        <tr><td><strong>${escapeHtml(participant.participant_code)}</strong><small>${escapeHtml(participant.name)}</small></td><td>${escapeHtml(measurement.label)}</td><td>${escapeHtml(answer.label)}</td><td><strong>${escapeHtml(answer.display_value)}</strong></td><td>${answer.submitted_at ? formatDate(answer.submitted_at, { hour: '2-digit', minute: '2-digit' }) : '—'}</td></tr>`),
    ),
  ).join('')

  const timepointRows = timepoints.map((item) => `<tr><td><strong>${escapeHtml(item.label)}</strong></td><td>${item.sent}</td><td>${item.started}</td><td>${item.completed}</td><td>${pilotAverage(item.averagePain)}</td><td>${pilotAverage(item.averageComfort)}</td></tr>`).join('')
  const overviewRows = overview.map((item) => `<tr><td><strong>${escapeHtml(item.code)}</strong><small>${escapeHtml(item.name)} · ${escapeHtml(item.email)}</small></td><td>${pilotScore(item.baselinePain)}</td><td>${pilotScore(item.week1Comfort)}</td><td>${pilotScore(item.week1Pain)}</td><td>${pilotScore(item.week4Change)}</td><td>${pilotScore(item.week4Pain)}</td><td>${pilotScore(item.week12Outcome)}</td><td>${pilotScore(item.week12Pain)}</td><td><strong>${item.completed}/4</strong></td></tr>`).join('')

  return `<section class="panel pilot-results-panel">
    <header class="panel-header"><div><h2>Hoe gaat het met onze klanten?</h2><p>Hielpijn, comfort, sportdeelname en gebruik van de ZOL’tjes. De Excel-export gebruikt alleen deelnemercodes.</p></div><span class="pilot-private-badge">Gezondheidsgegevens</span></header>
    <div class="pilot-results-section"><h3>Voortgang per meetmoment</h3><div class="table-scroll"><table class="data-table pilot-results-table"><thead><tr><th>Meetmoment</th><th>Verstuurd</th><th>Gestart</th><th>Afgerond</th><th>Gem. pijn</th><th>Gem. comfort</th></tr></thead><tbody>${timepointRows}</tbody></table></div></div>
    <div class="pilot-results-section"><h3>Ontwikkeling per deelnemer</h3><div class="table-scroll"><table class="data-table pilot-results-table"><thead><tr><th>Deelnemer</th><th>0-meting pijn</th><th>Week 1 comfort</th><th>Week 1 pijn</th><th>Week 4 verandering</th><th>Week 4 pijn</th><th>Week 12 resultaat</th><th>Week 12 pijn</th><th>Afgerond</th></tr></thead><tbody>${overviewRows}</tbody></table></div></div>
    <details class="pilot-answer-details" ${answerRows ? '' : 'hidden'}><summary>Alle ingevulde antwoorden bekijken</summary><div class="table-scroll"><table class="data-table pilot-results-table"><thead><tr><th>Deelnemer</th><th>Meetmoment</th><th>Vraag</th><th>Antwoord</th><th>Ingevuld</th></tr></thead><tbody>${answerRows}</tbody></table></div></details>
  </section>`
}

async function loadPilotReport(force = false) {
  if (!state.pilotReady || state.pilotReportLoading || (state.pilotReport && !force)) return
  state.pilotReportLoading = true
  state.pilotReportError = ''
  renderPilot()
  const { data, error } = await supabase.functions.invoke('pilot-measurement', { body: { action: 'report' } })
  if (error || data?.error) {
    state.pilotReport = null
    state.pilotReportError = await edgeFunctionMessage(error, data, 'De antwoorden konden niet worden opgehaald.')
  } else {
    state.pilotReport = data
  }
  state.pilotReportLoading = false
  renderPilot()
  refreshIcons()
}

async function exportPilotResults(target) {
  setBusy(target, true, 'Excel-export maken')
  const { data, error } = await supabase.functions.invoke('pilot-measurement', { body: { action: 'report', record_export: true } })
  if (error || data?.error) {
    toast('Excel-export mislukt', await edgeFunctionMessage(error, data, 'De antwoorden konden niet worden geëxporteerd.'), true)
    setBusy(target, false, 'Excel-export downloaden')
    return
  }
  const csv = pilotExcelCsv(data)
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `zol-pijnvragenlijsten-anoniem-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
  state.pilotReport = data
  setBusy(target, false, 'Excel-export downloaden')
  toast('Excel-export aangemaakt', 'Namen en e-mailadressen zijn niet opgenomen; iedere deelnemer heeft een code.')
}

function painOrderCustomers() {
  const config = settingsValue('pilot_measurements')
  const excluded = new Set((config.excluded_emails || []).map((email) => String(email).trim().toLowerCase()))
  const additional = new Set((config.additional_invitation_emails || []).map((email) => String(email).trim().toLowerCase()))
  const paidCustomerIds = new Set(state.orders
    .filter((order) => ['paid', 'partially_refunded', 'refunded'].includes(order.payment_status))
    .map((order) => order.customer_id))
  const enrollments = new Map(state.pilotEnrollments.map((item) => [item.customer_id, item]))
  const consentInvites = new Map(state.pilotConsentInvites.map((item) => [item.customer_id, item]))

  return state.customers
    .filter((customer) => {
      const email = String(customer.email).trim().toLowerCase()
      return (paidCustomerIds.has(customer.id) || additional.has(email)) && !excluded.has(email)
    })
    .map((customer) => {
      const enrollment = enrollments.get(customer.id)
      const invite = consentInvites.get(customer.id)
      const status = enrollment?.status === 'active' ? 'accepted' : invite?.status && invite.status !== 'pending' ? invite.status : 'ready'
      return { customer, status, selectable: status === 'ready' }
    })
    .sort((left, right) => fullName(left.customer).localeCompare(fullName(right.customer), 'nl'))
}

function renderPainCustomerSelection(customers) {
  const ready = customers.filter((item) => item.selectable)
  const readyIds = new Set(ready.map((item) => item.customer.id))
  state.pilotCustomerSelection = new Set([...state.pilotCustomerSelection].filter((id) => readyIds.has(id)))
  const rows = customers.map(({ customer, status, selectable }) => `<tr>
    <td class="pilot-customer-check"><input type="checkbox" data-pain-customer-id="${escapeHtml(customer.id)}" aria-label="Selecteer ${escapeHtml(fullName(customer))}" ${state.pilotCustomerSelection.has(customer.id) ? 'checked' : ''} ${selectable ? '' : 'disabled'}></td>
    <td><strong>${escapeHtml(fullName(customer))}</strong></td>
    <td>${escapeHtml(customer.email)}</td>
    <td>${statusPill(status)}</td>
  </tr>`).join('')

  return `<section class="panel pilot-customer-picker" id="pain-customer-picker">
    <header class="panel-header"><div><h2>Bestellers uitnodigen</h2><p>Vink één of meerdere klanten aan. Al uitgenodigde klanten blijven zichtbaar, maar kunnen niet opnieuw worden geselecteerd.</p></div><div class="pilot-selection-buttons"><button type="button" data-action="select-all-pain-customers" ${ready.length ? '' : 'disabled'}>Alles selecteren</button><button type="button" data-action="clear-pain-customers" ${state.pilotCustomerSelection.size ? '' : 'disabled'}>Wis selectie</button></div></header>
    ${rows ? `<div class="table-scroll"><table class="data-table pilot-customer-table"><thead><tr><th></th><th>Klant</th><th>E-mail</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState('Nog geen betaalde bestellers', 'Zodra een bestelling betaald is, verschijnt de klant hier.', '✉')}
    <footer class="pilot-customer-actions"><span data-pain-selection-count>${state.pilotCustomerSelection.size} geselecteerd · ${ready.length} nog uit te nodigen</span><button class="button button--primary" type="button" data-action="invite-order-customers" ${state.pilotCustomerSelection.size ? '' : 'disabled'}>Geselecteerde klanten uitnodigen</button></footer>
  </section>`
}

function syncPainSelectionControls() {
  const selected = state.pilotCustomerSelection.size
  const counter = document.querySelector('[data-pain-selection-count]')
  const sendButton = document.querySelector('[data-action="invite-order-customers"]')
  const clearButton = document.querySelector('[data-action="clear-pain-customers"]')
  if (counter) {
    const ready = painOrderCustomers().filter((item) => item.selectable).length
    counter.textContent = `${selected} geselecteerd · ${ready} nog uit te nodigen`
  }
  if (sendButton) sendButton.disabled = selected === 0
  if (clearButton) clearButton.disabled = selected === 0
}

async function inviteOrderCustomers(target) {
  const customerIds = [...state.pilotCustomerSelection]
  if (!customerIds.length) { toast('Selecteer eerst klanten', 'Vink één of meerdere bestellers aan.'); return }
  setBusy(target, true, 'Bestellers controleren')
  const previewResult = await supabase.functions.invoke('pilot-measurement', { body: { action: 'invite_order_customers', customer_ids: customerIds, dry_run: true } })
  if (previewResult.error || previewResult.data?.error) {
    toast('Bestellers controleren mislukt', await edgeFunctionMessage(previewResult.error, previewResult.data, 'De doelgroep kon niet worden gecontroleerd.'), true)
    setBusy(target, false, 'Geselecteerde klanten uitnodigen')
    return
  }
  const count = Number(previewResult.data?.ready || 0)
  if (!count) {
    toast('Niemand wacht op een uitnodiging', `${previewResult.data?.already_invited || 0} klanten zijn al uitgenodigd en ${previewResult.data?.already_enrolled || 0} klanten doen al mee.`)
    setBusy(target, false, 'Geselecteerde klanten uitnodigen')
    return
  }
  setBusy(target, false, 'Geselecteerde klanten uitnodigen')
  if (!window.confirm(`${count} besteller${count === 1 ? '' : 's'} ontvangt nu een echte uitnodiging voor de pijnvragenlijsten. Pas na expliciete toestemming start de 0-meting. Wil je doorgaan?`)) return
  setBusy(target, true, 'Uitnodigingen versturen')
  const result = await supabase.functions.invoke('pilot-measurement', { body: { action: 'invite_order_customers', customer_ids: customerIds } })
  if (result.error || result.data?.error) toast('Uitnodigen mislukt', await edgeFunctionMessage(result.error, result.data, 'De uitnodigingen konden niet worden verstuurd.'), true)
  else {
    state.pilotCustomerSelection.clear()
    toast('Uitnodigingen verwerkt', `${result.data?.sent || 0} verstuurd${result.data?.failed ? ` · ${result.data.failed} mislukt` : ''}.`)
  }
  setBusy(target, false, 'Geselecteerde klanten uitnodigen')
  await refreshCurrentRoute()
}

function renderPilot() {
  const config = settingsValue('pilot_measurements')
  const allowedEmails = Array.isArray(config.allowed_emails) ? config.allowed_emails : ['thijn@zolsolutions.nl', 'maks@zolsolutions.nl']
  const excludedEmails = Array.isArray(config.excluded_emails) ? config.excluded_emails : []
  const additionalInvitationEmails = Array.isArray(config.additional_invitation_emails) ? config.additional_invitation_emails : []
  const testMode = config.test_mode !== false
  const eligibleCustomers = state.customers.filter((customer) => {
    const email = String(customer.email).trim().toLowerCase()
    return !excludedEmails.includes(email) && (!testMode || allowedEmails.includes(email))
  })
  const fallbackCompleted = state.pilotEnrollments.flatMap((item) => item.pilot_invites || []).filter((invite) => invite.status === 'completed').length
  const summary = state.pilotReport ? pilotSummary(state.pilotReport) : { participants: state.pilotEnrollments.length, completed: fallbackCompleted, answered: 0, responseRate: 0 }
  const orderCustomers = painOrderCustomers()
  const participantCards = state.pilotEnrollments.map((enrollment) => {
    const customer = pilotCustomer(enrollment) || {}
    const reportParticipant = pilotReportParticipant(enrollment.id)
    const moments = pilotTimepoints.map(([key, label, timing]) => {
      const invite = pilotInvite(enrollment, key)
      const reportMeasurement = reportParticipant?.measurements?.find((item) => item.timepoint === key)
      const count = reportMeasurement?.answer_count || 0
      const canSend = invite && invite.status !== 'completed' && enrollment.status === 'active' && settingsValue('email_config').enabled && config.enabled
      return `<article class="pilot-moment ${invite?.status === 'completed' ? 'is-complete' : ''}"><div><span>${escapeHtml(timing)}</span><strong>${escapeHtml(label)}</strong><small>${invite?.sent_at ? `Laatste mail ${formatDate(invite.sent_at, { hour: '2-digit', minute: '2-digit' })}` : 'Nog niet verstuurd'}${count ? ` · ${count} antwoorden` : ''}</small></div>${invite ? statusPill(invite.status) : ''}<button class="button" type="button" data-action="send-pilot-invite" data-id="${escapeHtml(invite?.id || '')}" ${canSend ? '' : 'disabled'}>${invite?.send_count ? 'Opnieuw sturen' : 'Vragenlijst sturen'}</button></article>`
    }).join('')
    return `<section class="panel pilot-participant"><header><div><p class="eyebrow">Deelnemer</p><h2>${escapeHtml(fullName(customer))}</h2><p>${escapeHtml(customer.email || '')}</p></div>${statusPill(enrollment.status)}</header><div class="pilot-timeline">${moments}</div></section>`
  }).join('')

  const setupNotice = state.pilotReady ? '' : `<section class="panel pilot-setup-warning"><strong>De vragenlijsten staan klaar, maar de database-uitbreiding is nog niet geïnstalleerd.</strong><p>Hierdoor kunnen deelnemers en antwoorden nog niet worden opgeslagen. Dit raakt de bestaande webshop niet.</p></section>`
  const canExport = Boolean(state.pilotReport?.participants?.length) && !state.pilotReportLoading
  elements.content.innerHTML = `<div class="page-container">${pageHeader('pilot', `<button class="button button--primary" type="button" data-action="focus-pain-customers" ${config.enabled ? '' : 'disabled'}><i data-lucide="users"></i> Klanten selecteren</button><button class="button" type="button" data-action="export-pilot-results" ${canExport ? '' : 'disabled'}><i data-lucide="download"></i> Excel-export</button><a class="button" href="/meting/?preview=consent" target="_blank" rel="noreferrer">Toestemming bekijken →</a><a class="button" href="/meting/?preview=baseline" target="_blank" rel="noreferrer">Vragenlijst bekijken →</a>`)}
    ${setupNotice}
    <section class="pilot-control-grid">
      <form class="panel pilot-settings" id="pilot-settings-form">
        <div class="pilot-status-line"><span class="pilot-status-light ${config.enabled && testMode ? 'is-test' : config.enabled ? 'is-live' : ''}"></span><div><strong>${!config.enabled ? 'Pijnvragenlijsten staan uit' : testMode ? 'Interne teststand actief' : 'Pijnvragenlijsten zijn live'}</strong><small>Automatisch uitnodigen en versturen staat ${config.automatic_sending ? 'aan' : 'uit'}.</small></div></div>
        <h2>Instellingen</h2>
        <label class="checkbox-field"><input name="test_mode" type="checkbox" ${testMode ? 'checked' : ''}> Alleen adressen uit de interne testlijst</label>
        <label class="checkbox-field"><input name="enabled" type="checkbox" ${config.enabled ? 'checked' : ''}> Pijnvragenlijsten activeren</label>
        <label class="checkbox-field"><input name="automatic_sending" type="checkbox" ${config.automatic_sending ? 'checked' : ''}> Nieuwe betaalde bestellers automatisch uitnodigen en geplande vragenlijsten versturen</label>
        <label class="field">Interne testadressen<textarea name="allowed_emails" rows="3">${escapeHtml(allowedEmails.join('\n'))}</textarea><small>Eén e-mailadres per regel. In de teststand blokkeert de server alle andere adressen.</small></label>
        <label class="field">Uitgesloten adressen<textarea name="excluded_emails" rows="3">${escapeHtml(excludedEmails.join('\n'))}</textarea><small>Deze klanten worden nooit automatisch of via “Bestellers uitnodigen” benaderd.</small></label>
        <label class="field">Extra ontvangers<textarea name="additional_invitation_emails" rows="2">${escapeHtml(additionalInvitationEmails.join('\n'))}</textarea><small>Ook zonder betaalde bestelling zichtbaar in de selectielijst.</small></label>
        <button class="button button--primary" type="submit">Instellingen opslaan</button>
      </form>
      <form class="panel pilot-enroll" id="pilot-enroll-form">
        <p class="eyebrow">Handmatig toevoegen</p><h2>Vier vragenlijsten klaarzetten</h2><p>Gebruik dit alleen wanneer de ouder of verzorger de toestemming al rechtstreeks aan ZOL heeft gegeven.</p>
        <label class="field">Klant<select name="customer_id" required><option value="">Kies een klant…</option>${eligibleCustomers.map((customer) => `<option value="${customer.id}">${escapeHtml(fullName(customer))} · ${escapeHtml(customer.email)}</option>`).join('')}</select></label>
        <label class="checkbox-field pilot-consent"><input name="consent_confirmed" type="checkbox" required> Ouder/verzorger heeft toestemming gegeven voor het verzamelen van deze korte gezondheids- en gebruiksgegevens.</label>
        <button class="button button--primary" type="submit" ${state.pilotReady ? '' : 'disabled'}>Klant toevoegen</button>
      </form>
    </section>
    ${renderPainCustomerSelection(orderCustomers)}
    <section class="pilot-summary"><div><strong>${summary.participants}</strong><span>deelnemers</span></div><div><strong>${summary.completed}</strong><span>vragenlijsten afgerond</span></div><div><strong>${summary.answered}</strong><span>vragen beantwoord</span></div><div><strong>${summary.responseRate}%</strong><span>afgerond van verstuurd</span></div></section>
    ${renderPilotResults()}
    <div class="pilot-participants">${participantCards || emptyState('Nog geen deelnemers', 'Nodig bestellers uit of voeg een klant met vastgelegde toestemming handmatig toe.', '✦')}</div>
  </div>`

  document.querySelectorAll('[data-pain-customer-id]').forEach((input) => input.addEventListener('change', () => {
    if (input.checked) state.pilotCustomerSelection.add(input.dataset.painCustomerId)
    else state.pilotCustomerSelection.delete(input.dataset.painCustomerId)
    syncPainSelectionControls()
  }))

  document.querySelector('#pilot-settings-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const next = {
      enabled: form.elements.enabled.checked,
      test_mode: form.elements.test_mode.checked,
      automatic_sending: form.elements.automatic_sending.checked,
      allowed_emails: form.elements.allowed_emails.value.split(/[\n,;]/).map((email) => email.trim().toLowerCase()).filter(Boolean),
      excluded_emails: form.elements.excluded_emails.value.split(/[\n,;]/).map((email) => email.trim().toLowerCase()).filter(Boolean),
      additional_invitation_emails: form.elements.additional_invitation_emails.value.split(/[\n,;]/).map((email) => email.trim().toLowerCase()).filter(Boolean),
    }
    if (!next.test_mode && !window.confirm('Hiermee verdwijnt de blokkade op testadressen. Wil je deze instelling echt opslaan?')) return
    const { error } = await supabase.from('settings').upsert({ key: 'pilot_measurements', category: 'pilot', label: 'Pijnvragenlijsten', value: next, is_public: false })
    if (error) { toast('Instellingen opslaan mislukt', error.message, true); return }
    await recordActivity('Instellingen pijnvragenlijsten bijgewerkt', 'settings', 'pilot_measurements', { enabled: next.enabled, test_mode: next.test_mode, automatic_sending: next.automatic_sending })
    toast('Instellingen opgeslagen', next.test_mode ? 'Alleen interne testadressen zijn toegestaan.' : next.automatic_sending ? 'Nieuwe bestellers worden automatisch uitgenodigd; vervolgvragen worden op tijd verstuurd.' : 'De vragenlijsten zijn live, maar verzending blijft handmatig.')
    await refreshCurrentRoute()
  })

  document.querySelector('#pilot-enroll-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const button = form.querySelector('[type="submit"]')
    setBusy(button, true, 'Deelnemer toevoegen')
    const { data, error } = await supabase.functions.invoke('pilot-measurement', { body: { action: 'enroll', customer_id: form.elements.customer_id.value, consent_confirmed: form.elements.consent_confirmed.checked, consent_source: 'handmatig bevestigd in ZOL Admin' } })
    if (error || data?.error) { toast('Deelnemer toevoegen mislukt', await edgeFunctionMessage(error, data, 'De deelnemer kon niet worden toegevoegd.'), true); setBusy(button, false, 'Deelnemer toevoegen'); return }
    toast('Vier vragenlijsten klaargezet', 'Er is nog geen mail verstuurd.')
    await refreshCurrentRoute()
  })

  if (state.pilotReady && !state.pilotReport && !state.pilotReportLoading && !state.pilotReportError) queueMicrotask(() => loadPilotReport())
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
  openDialog(message.topic, 'Contactbericht', `<div class="dialog-summary"><div><span>Naam</span><strong>${escapeHtml(message.name)}</strong></div><div><span>E-mail</span><strong>${escapeHtml(message.email)}</strong></div><div><span>Ontvangen</span><strong>${formatDate(message.created_at, { hour: '2-digit', minute: '2-digit' })}</strong></div><div><span>Klantbestand</span><strong>${message.customer_id ? 'Toegevoegd' : 'Niet gekoppeld'}</strong></div><div><span>Productmail</span><strong>${message.metadata?.marketing_opt_in ? 'Toestemming gegeven' : 'Niet aangemeld'}</strong></div></div><div class="contact-message-copy">${escapeHtml(message.message)}</div>${message.phone ? `<p class="contact-message-meta"><strong>Telefoon:</strong> ${escapeHtml(message.phone)}</p>` : ''}<div class="form-actions"><button class="button" type="button" data-close-dialog>Sluiten</button><a class="button button--primary" href="mailto:${escapeHtml(message.email)}?subject=${replySubject}">Beantwoorden →</a></div>`)
  if (message.status === 'new' || message.status === 'email_failed') {
    await supabase.from('contact_messages').update({ status: 'read' }).eq('id', message.id)
    message.status = 'read'
    document.querySelector('#new-message-count').textContent = state.contactMessages.filter((entry) => ['new', 'email_failed'].includes(entry.status)).length || ''
  }
}

function customerForm(customer = {}) {
  const orders = visibleOrders().filter((order) => order.customer_id === customer.id)
  const emailHistory = state.emailMessages.filter((email) => email.customer_id === customer.id).slice(0, 5)
  const emailEnabled = Boolean(settingsValue('email_config').enabled)
  const canManageCustomers = ['owner', 'admin'].includes(state.profile?.role)
  const address = customer.address || {}
  openDialog(customer.id ? fullName(customer) : 'Nieuwe klant', 'Klant', `<form id="customer-form"><div class="form-grid">
    <label class="field">Voornaam<input name="first_name" value="${escapeHtml(customer.first_name)}" required></label><label class="field">Achternaam<input name="last_name" value="${escapeHtml(customer.last_name)}"></label>
    <label class="field">E-mailadres<input name="email" type="email" value="${escapeHtml(customer.email)}" required></label><label class="field">Telefoon<input name="phone" value="${escapeHtml(customer.phone)}"></label>
    <label class="field field--full">Straat en huisnummer<input name="address_street" value="${escapeHtml(address.street)}"></label><label class="field">Postcode<input name="address_postal_code" value="${escapeHtml(address.postal_code)}"></label><label class="field">Plaats<input name="address_city" value="${escapeHtml(address.city)}"></label>
    <label class="field field--full">Notities<textarea name="notes" placeholder="Interne notities over deze klant">${escapeHtml(customer.notes)}</textarea></label>
    <label class="checkbox-field field--full"><input name="marketing_opt_in" type="checkbox" ${customer.marketing_opt_in ? 'checked' : ''}> Klant heeft aantoonbaar toestemming gegeven voor de driewekelijkse productmail</label>
    ${customer.marketing_opt_in_at ? `<p class="form-hint field--full">Toestemming: ${formatDate(customer.marketing_opt_in_at, { hour: '2-digit', minute: '2-digit' })}${customer.marketing_opt_in_source ? ` via ${escapeHtml(customer.marketing_opt_in_source)}` : ''}.${customer.marketing_next_send_at ? ` Volgende mail vanaf ${formatDate(customer.marketing_next_send_at)}.` : ''}</p>` : ''}
  </div>${customer.id ? `<h3>Bestelgeschiedenis</h3><div class="line-items">${orders.map((order) => `<div class="line-item"><div><strong>#${order.order_number}</strong><small>${formatDate(order.created_at)} · ${prettyStatus(order.status)}</small></div><strong>${formatMoney(order.total_cents)}</strong></div>`).join('') || '<div class="line-item">Nog geen bestellingen</div>'}</div><h3>Recente e-mails</h3><div class="line-items">${emailHistory.map((email) => `<div class="line-item"><div><strong>${escapeHtml(email.subject)}</strong><small>${formatDate(email.created_at, { hour: '2-digit', minute: '2-digit' })}</small></div>${statusPill(email.status)}</div>`).join('') || '<div class="line-item">Nog geen e-mails verstuurd</div>'}</div>` : ''}<div class="form-actions">${customer.id && canManageCustomers ? `<button class="button button--danger" type="button" data-action="delete-customer" data-id="${customer.id}">Klant verwijderen</button>` : ''}<button class="button" type="button" data-close-dialog>Annuleren</button>${customer.id ? `<button class="button" type="button" data-action="email-customer" data-id="${customer.id}" ${emailEnabled ? '' : 'disabled title="Activeer eerst de e-mailkoppeling"'}>E-mail sturen</button>` : ''}<button class="button button--primary" type="submit">Klant opslaan</button></div></form>`)
  const form = document.querySelector('#customer-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); setBusy(button, true)
    const data = Object.fromEntries(new FormData(form)); data.email = data.email.toLowerCase(); data.marketing_opt_in = form.elements.marketing_opt_in.checked
    data.address = { street: data.address_street.trim(), postal_code: data.address_postal_code.trim().toUpperCase(), city: data.address_city.trim(), country: address.country || 'NL' }
    delete data.address_street; delete data.address_postal_code; delete data.address_city
    if (data.marketing_opt_in && !customer.marketing_opt_in) {
      data.marketing_opt_in_at = new Date().toISOString(); data.marketing_opt_in_source = 'handmatig vastgelegd in admin'; data.marketing_unsubscribed_at = null; data.marketing_next_send_at = new Date(Date.now() + 21 * 86_400_000).toISOString()
    } else if (!data.marketing_opt_in && customer.marketing_opt_in) {
      data.marketing_unsubscribed_at = new Date().toISOString(); data.marketing_next_send_at = null
    }
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
  const orderCount = visibleOrders().filter((order) => order.customer_id === customer.id).length
  const warning = orderCount ? ` De ${orderCount} gekoppelde bestelling${orderCount === 1 ? '' : 'en'} blijven bewaard.` : ''
  if (!window.confirm(`Weet je zeker dat je ${fullName(customer)} wilt verwijderen?${warning}`)) return
  const { error } = await supabase.from('customers').delete().eq('id', customer.id)
  if (error) { toast('Klant verwijderen mislukt', error.message, true); return }
  await recordActivity('Klant verwijderd', 'customer', customer.id, { email: customer.email, preserved_orders: orderCount })
  toast('Klant verwijderd', orderCount ? 'De bestelgeschiedenis is behouden.' : '')
  closeDialog(); await refreshCurrentRoute()
}

function downloadCustomerImportTemplate() {
  const url = URL.createObjectURL(new Blob([customerImportTemplateCsv()], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'zol-klanten-import-voorbeeld.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function mergeImportedCustomer(imported, existing, now) {
  const currentAddress = existing?.address || {}
  const importedAddress = imported.address || {}
  const address = { ...currentAddress }
  Object.entries(importedAddress).forEach(([key, value]) => { if (value) address[key] = value })
  const previouslySubscribed = Boolean(existing?.marketing_opt_in)
  const hasUnsubscribed = Boolean(existing?.marketing_unsubscribed_at)
  const marketingOptIn = previouslySubscribed || Boolean(imported.marketing_opt_in && !hasUnsubscribed)
  return {
    email: imported.email,
    first_name: imported.first_name || existing?.first_name || '',
    last_name: imported.last_name || existing?.last_name || '',
    phone: imported.phone || existing?.phone || '',
    address,
    notes: imported.notes || existing?.notes || '',
    marketing_opt_in: marketingOptIn,
    marketing_opt_in_at: marketingOptIn ? existing?.marketing_opt_in_at || now : null,
    marketing_opt_in_source: marketingOptIn ? previouslySubscribed ? existing?.marketing_opt_in_source || 'bestaande klant' : 'CSV-import (expliciete toestemming)' : existing?.marketing_opt_in_source || '',
    marketing_unsubscribed_at: marketingOptIn ? null : existing?.marketing_unsubscribed_at || null,
    marketing_next_send_at: marketingOptIn ? existing?.marketing_next_send_at || new Date(Date.parse(now) + 21 * 86_400_000).toISOString() : null,
  }
}

function importCustomersForm() {
  openDialog('Klanten importeren', 'CSV- of TSV-import', `<form id="customer-import-form">
    <section class="csv-import-intro"><strong>Importeer vanuit Excel, Numbers, Google Sheets of Shopify</strong><p>Sla een werkblad op als <strong>CSV UTF-8</strong> of TSV en kies het bestand hieronder. Bestaande klanten worden op e-mailadres herkend; ingevulde gegevens worden aangevuld zonder bestelbedragen te wijzigen.</p></section>
    <label class="csv-file-field"><span>Klantenbestand kiezen</span><input id="customer-import-file" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" required><small>Maximaal 10 MB. Komma, puntkomma en tab worden automatisch herkend.</small></label>
    <section class="csv-import-preview" id="customer-import-preview" aria-live="polite"><span>Nog geen bestand gekozen</span><p>Na het kiezen zie je eerst een controle. Er wordt dan nog niets opgeslagen.</p></section>
    <p class="form-hint">Marketingtoestemming wordt alleen toegevoegd bij een expliciete waarde zoals “ja”. Gebruik dit uitsluitend als de klant aantoonbaar toestemming heeft gegeven.</p>
    <div class="form-actions"><button class="button" type="button" data-action="download-customer-template"><i data-lucide="download"></i> Voorbeeld downloaden</button><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit" disabled>Gecontroleerde klanten importeren</button></div>
  </form>`)
  elements.dialog.classList.add('admin-dialog--wide')
  refreshIcons()
  const form = document.querySelector('#customer-import-form')
  const fileInput = form.querySelector('#customer-import-file')
  const preview = form.querySelector('#customer-import-preview')
  const submit = form.querySelector('[type="submit"]')
  let parsed = null

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    parsed = null
    submit.disabled = true
    if (!file) { preview.innerHTML = '<span>Nog geen bestand gekozen</span><p>Kies een CSV- of TSV-bestand om het te controleren.</p>'; return }
    if (file.size > 10 * 1024 * 1024) { preview.innerHTML = '<span class="is-error">Bestand is te groot</span><p>Gebruik een bestand van maximaal 10 MB.</p>'; return }
    try {
      parsed = parseCustomerCsv(await file.text())
      const existingEmails = new Set(state.customers.map((customer) => String(customer.email || '').trim().toLowerCase()))
      const existingCount = parsed.customers.filter((customer) => existingEmails.has(customer.email)).length
      const newCount = parsed.customers.length - existingCount
      const issuePreview = parsed.issues.slice(0, 6).map((issue) => `<li>${escapeHtml(issue)}</li>`).join('')
      const moreIssues = parsed.issues.length > 6 ? `<li>En nog ${parsed.issues.length - 6} andere regels.</li>` : ''
      preview.innerHTML = `<header><div><span>${escapeHtml(file.name)}</span><small>${parsed.delimiter === '\t' ? 'Tab' : parsed.delimiter === ';' ? 'Puntkomma' : 'Komma'} als scheidingsteken</small></div><strong>${parsed.customers.length} klanten</strong></header><div class="csv-import-stats"><span>${parsed.lineCount} gegevensregels</span><span>${newCount} nieuw</span><span>${existingCount} bestaand</span><span>${parsed.duplicateCount} dubbele e-mails samengevoegd</span><span>${parsed.issues.length} fouten</span></div>${parsed.issues.length ? `<div class="csv-import-errors"><strong>Los deze regels eerst op:</strong><ul>${issuePreview}${moreIssues}</ul></div>` : '<p class="csv-import-ready">✓ Bestand is gecontroleerd en klaar voor import.</p>'}`
      submit.disabled = !parsed.customers.length || parsed.issues.length > 0
    } catch (error) {
      preview.innerHTML = `<span class="is-error">Bestand kon niet worden gelezen</span><p>${escapeHtml(error.message)}</p>`
    }
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!parsed?.customers.length || parsed.issues.length) return
    setBusy(submit, true, 'Importeren')
    const existingByEmail = new Map(state.customers.map((customer) => [String(customer.email || '').trim().toLowerCase(), customer]))
    const now = new Date().toISOString()
    const records = parsed.customers.map((customer) => mergeImportedCustomer(customer, existingByEmail.get(customer.email), now))
    const updated = records.filter((customer) => existingByEmail.has(customer.email)).length
    const added = records.length - updated
    for (let offset = 0; offset < records.length; offset += 200) {
      const { error } = await supabase.from('customers').upsert(records.slice(offset, offset + 200), { onConflict: 'email' })
      if (error) { toast('Klanten importeren mislukt', error.message, true); setBusy(submit, false, 'Gecontroleerde klanten importeren'); return }
    }
    await recordActivity('Klanten via CSV geïmporteerd', 'customer', '', { added, updated, duplicates_merged: parsed.duplicateCount, filename: fileInput.files?.[0]?.name || '' })
    closeDialog()
    await refreshCurrentRoute()
    toast('Klantenimport voltooid', `${added} klanten toegevoegd · ${updated} bestaande klanten bijgewerkt${parsed.duplicateCount ? ` · ${parsed.duplicateCount} dubbele regels samengevoegd` : ''}.`)
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
  const stockEditor = variants.length ? `<section class="variant-stock-editor field--full"><header><div><strong>Voorraad per maat</strong><small>Pas de aantallen aan. Bij 4 of minder ziet de klant automatisch hoeveel er nog zijn.</small></div></header><div class="variant-stock-grid">${variants.map((variant, index) => `<label class="variant-stock-row"><span><strong>${escapeHtml(variant.size)}</strong><small>Maat ${escapeHtml(variant.shoe_size)}</small></span><span><input class="variant-stock-input" type="number" min="0" step="1" value="${variant.stock}" data-variant-index="${index}" aria-label="Voorraad ${escapeHtml(variant.size)}"> stuks</span></label>`).join('')}</div><footer><small>Wijzigingen zijn direct zichtbaar op de webshop.</small><button class="button button--primary" type="button" data-action="save-stock">Voorraad direct opslaan</button></footer></section>` : ''
  const variantEditor = variants.length ? `<details class="variant-advanced field--full"><summary>Maten, schoenmaten en SKU's bewerken</summary><label class="field">Geavanceerd <small>Per regel: maat | schoenmaat | voorraad | SKU</small><textarea name="variants" placeholder="XS|34/35|20|ZOL-XS-3435">${escapeHtml(variantText)}</textarea></label></details>` : `<label class="field field--full">Maten en voorraad <small>Per regel: maat | schoenmaat | voorraad | SKU</small><textarea name="variants" placeholder="XS|34/35|20|ZOL-XS-3435">${escapeHtml(variantText)}</textarea></label>`
  const images = Array.isArray(product.images) ? product.images.join('\n') : ''
  openDialog(product.id ? product.name : 'Nieuw product', 'Product', `<form id="product-form"><div class="form-grid">
    <label class="field">Productnaam<input name="name" value="${escapeHtml(product.name)}" required></label><label class="field">URL-naam<input name="slug" value="${escapeHtml(product.slug)}" placeholder="zol-inlegzolen" required></label>
    <label class="field">Prijs inclusief btw (€)<input name="price" type="number" min="0" step="0.01" value="${product.price_cents != null ? (product.price_cents / 100).toFixed(2) : ''}" required></label><label class="field">BTW-percentage<input name="tax_rate" type="number" min="0" step="0.01" value="${product.tax_rate ?? 21}" required></label>
    <label class="field field--full">Productbeschrijving<textarea name="description" required>${escapeHtml(product.description)}</textarea></label>
    <label class="field field--full">Afbeeldingen <small>Eén URL per regel; de eerste afbeelding is de hoofdafbeelding.</small><textarea name="images">${escapeHtml(images)}</textarea></label>
    <label class="field field--full">Video-URL<input name="video_url" type="url" value="${escapeHtml(product.video_url)}" placeholder="https://…"></label>
    ${stockEditor}${variantEditor}
    <label class="field">SEO-titel<input name="seo_title" value="${escapeHtml(product.seo_title)}"></label><label class="field">SEO-beschrijving<input name="seo_description" value="${escapeHtml(product.seo_description)}"></label>
    <label class="checkbox-field"><input name="active" type="checkbox" ${product.active !== false ? 'checked' : ''}> Product zichtbaar</label><label class="checkbox-field"><input name="featured" type="checkbox" ${product.featured ? 'checked' : ''}> Uitgelicht product</label>
  </div><div class="form-actions">${product.id ? '<button class="button button--danger" type="button" data-action="delete-product" data-id="' + product.id + '">Verwijderen</button>' : ''}<button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit">Product opslaan</button></div></form>`)
  const form = document.querySelector('#product-form')
  form.elements.name.addEventListener('input', () => { if (!product.id) form.elements.slug.value = slugify(form.elements.name.value) })
  const stockInputs = [...form.querySelectorAll('.variant-stock-input')]
  const syncVariantText = () => {
    if (!form.elements.variants || !stockInputs.length) return
    const lines = form.elements.variants.value.split('\n')
    stockInputs.forEach((input) => {
      const index = Number(input.dataset.variantIndex)
      const parts = (lines[index] || '').split('|').map((part) => part.trim())
      parts[2] = String(Math.max(0, Number.parseInt(input.value, 10) || 0))
      lines[index] = parts.join('|')
    })
    form.elements.variants.value = lines.join('\n')
  }
  stockInputs.forEach((input) => input.addEventListener('input', syncVariantText))
  form.querySelector('[data-action="save-stock"]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget
    const invalidInput = stockInputs.find((input) => !Number.isInteger(Number(input.value)) || Number(input.value) < 0)
    if (invalidInput) { invalidInput.focus(); toast('Controleer de voorraad', 'Gebruik per maat een heel getal van 0 of hoger.', true); return }
    setBusy(button, true, 'Voorraad opslaan')
    const stockByVariant = Object.fromEntries(variants.map((variant, index) => [variant.id, Number(stockInputs[index].value)]))
    const { error } = await supabase.rpc('update_product_inventory', { p_product_id: product.id, p_stock: stockByVariant })
    if (error) { toast('Voorraad opslaan mislukt', error.message, true); setBusy(button, false, 'Voorraad direct opslaan'); return }
    const { data: freshVariants, error: verifyError } = await supabase.from('product_variants').select('*').eq('product_id', product.id).order('sort_order')
    if (verifyError) { toast('Voorraad is opgeslagen', 'Ververs de pagina om de gecontroleerde aantallen te zien.'); setBusy(button, false, 'Voorraad direct opslaan'); return }
    const freshById = new Map((freshVariants || []).map((variant) => [variant.id, variant]))
    variants.forEach((variant, index) => {
      Object.assign(variant, freshById.get(variant.id) || { stock: Number(stockInputs[index].value) })
      stockInputs[index].value = String(variant.stock)
    })
    product.product_variants = freshVariants
    syncVariantText()
    await recordActivity('Voorraad bijgewerkt', 'product', product.id, { stock_by_size: Object.fromEntries(variants.map((variant) => [variant.size, variant.stock])) })
    toast('Voorraad opgeslagen', 'De nieuwe aantallen zijn direct zichtbaar op de webshop.')
    setBusy(button, false, 'Voorraad direct opslaan')
  })
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

let financeMonth = financeMonthKey()

const financeStatusLabel = (status) => ({
  matched: 'Klopt',
  open: 'Openstaand',
  failed: 'Mislukt',
  cancelled: 'Geannuleerd',
  missing_payment: 'Betaling ontbreekt',
  amount_mismatch: 'Bedrag wijkt af',
  status_mismatch: 'Status wijkt af',
  missing_provider_id: 'Mollie-ID ontbreekt',
}[status] || status)

const financeStatusPill = (status) => {
  const className = status === 'matched' ? 'is-green' : ['open', 'failed'].includes(status) ? 'is-orange' : status === 'cancelled' ? '' : 'is-red'
  return `<span class="status-pill ${className}">${escapeHtml(financeStatusLabel(status))}</span>`
}

function renderPayments() {
  const months = financeMonthOptions(state.orders)
  if (financeMonth !== 'all' && !months.includes(financeMonth)) financeMonth = months[0]
  const reportRows = financeRows(state.orders, state.payments, financeMonth)
  const summary = financeSummary(reportRows)
  const periodLabel = financeMonthLabel(financeMonth)
  const monthOptions = months.map((month) => `<option value="${month}" ${month === financeMonth ? 'selected' : ''}>${escapeHtml(financeMonthLabel(month))}</option>`).join('')
  const rows = reportRows.map((row) => `<tr data-action="open-order" data-id="${row.order.id}">
    <td><strong>#${row.order.order_number}</strong><small class="table-subline">${escapeHtml(row.order.source === 'webshop' ? 'Webshop' : row.order.source || 'Onbekend')}</small></td>
    <td>${formatDate(row.order.created_at)}</td>
    <td>${escapeHtml(row.order.customer_name || row.order.customer_email)}</td>
    <td><strong>${formatMoney(row.order.total_cents, row.order.currency)}</strong></td>
    <td>${formatMoney(row.receivedCents, row.order.currency)}</td>
    <td>${row.refundedCents ? `− ${formatMoney(row.refundedCents, row.order.currency)}` : '—'}</td>
    <td class="finance-difference ${row.differenceCents ? 'is-different' : ''}">${row.differenceCents ? `${row.differenceCents > 0 ? '+' : '−'} ${formatMoney(Math.abs(row.differenceCents), row.order.currency)}` : '€ 0,00'}</td>
    <td>${financeStatusPill(row.status)}</td>
  </tr>`).join('')

  elements.content.innerHTML = `<div class="page-container">
    ${pageHeader('payments', `<button class="button" data-route-jump="settings">Betaalmethoden beheren</button><button class="button button--primary" data-action="export-finance" ${reportRows.length ? '' : 'disabled'}><i data-lucide="download"></i> Boekhoudingsexport (CSV)</button>`)}
    <section class="panel finance-toolbar">
      <label>Periode op besteldatum<select data-finance-month><option value="all" ${financeMonth === 'all' ? 'selected' : ''}>Alle periodes</option>${monthOptions}</select></label>
      <div><strong>Alleen-lezen financieel overzicht</strong><span>Gebaseerd op ZOL-bestellingen en geregistreerde betalingen. Er wordt niets aangepast.</span></div>
    </section>
    <section class="metric-grid" aria-label="Financiële kerncijfers">
      <article class="metric-card"><header><span>Omzet incl. btw</span><span class="metric-icon"><i data-lucide="circle-euro"></i></span></header><strong>${formatMoney(summary.revenueIncludingTaxCents)}</strong><footer><span>Na geregistreerde refunds</span><span>${escapeHtml(periodLabel)}</span></footer></article>
      <article class="metric-card"><header><span>Omzet excl. btw</span><span class="metric-icon"><i data-lucide="file-text"></i></span></header><strong>${formatMoney(summary.revenueExcludingTaxCents)}</strong><footer><span>${formatMoney(summary.taxCents)} btw</span><span>${summary.orderCount} orders</span></footer></article>
      <article class="metric-card"><header><span>Ontvangen</span><span class="metric-icon"><i data-lucide="credit-card"></i></span></header><strong>${formatMoney(summary.receivedCents)}</strong><footer><span>Netto kas ${formatMoney(summary.netCashCents)}</span><span>${escapeHtml(periodLabel)}</span></footer></article>
      <article class="metric-card"><header><span>Terugbetaald</span><span class="metric-icon"><i data-lucide="rotate-ccw"></i></span></header><strong>${formatMoney(summary.refundedCents)}</strong><footer><span>${summary.openCount} openstaand</span><span>${summary.anomalyCount} afwijkingen</span></footer></article>
    </section>
    <section class="finance-grid">
      <article class="panel finance-summary-card"><header class="panel-header"><div><h2>Boekhoudoverzicht</h2><p>${escapeHtml(periodLabel)}</p></div></header><dl>
        <div><dt>Ontvangen betalingen</dt><dd>${formatMoney(summary.receivedCents)}</dd></div>
        <div><dt>Terugbetalingen</dt><dd>− ${formatMoney(summary.refundedCents)}</dd></div>
        <div><dt>Netto geldstroom</dt><dd>${formatMoney(summary.netCashCents)}</dd></div>
        <div><dt>BTW in netto omzet</dt><dd>${formatMoney(summary.taxCents)}</dd></div>
      </dl></article>
      <article class="panel finance-summary-card"><header class="panel-header"><div><h2>Ordercontrole</h2><p>ZOL-order versus betaalregistratie</p></div></header><dl>
        <div><dt>Bedrag en status kloppen</dt><dd class="is-good">${summary.matchedCount}</dd></div>
        <div><dt>Nog openstaand</dt><dd>${summary.openCount}</dd></div>
        <div><dt>Handmatig controleren</dt><dd class="${summary.anomalyCount ? 'is-alert' : 'is-good'}">${summary.anomalyCount}</dd></div>
        <div><dt>Totaal in periode</dt><dd>${summary.orderCount}</dd></div>
      </dl></article>
    </section>
    <section class="panel finance-table-panel"><header class="panel-header"><div><h2>Controle per bestelling</h2><p>Afwijkingen staan bovenaan. Klik op een regel om de bestelling te bekijken.</p></div><span>${summary.anomalyCount ? `${summary.anomalyCount} te controleren` : 'Alles gecontroleerd'}</span></header>${rows ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Bestelling</th><th>Datum</th><th>Klant</th><th>Ordertotaal</th><th>Ontvangen</th><th>Refund</th><th>Verschil</th><th>Controle</th></tr></thead><tbody>${rows}</tbody></table></div><footer class="table-footer"><span>${reportRows.length} bestellingen in ${escapeHtml(periodLabel)}</span><span>CSV opent direct in Excel</span></footer>` : emptyState('Geen bestellingen in deze periode', 'Kies een andere maand of alle periodes.', '€')}</section>
    <p class="finance-export-note">De export is een algemene boekhoud-CSV voor Excel of je boekhouder. Dit is geen rechtstreekse DigiBoox-synchronisatie.</p>
  </div>`
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
let analyticsDays = 30
let analyticsCompare = true
const analyticsWindow = (items, days, offset = 0) => {
  const end = new Date(); end.setHours(24, 0, 0, 0); end.setDate(end.getDate() - (days * offset))
  const start = new Date(end); start.setDate(start.getDate() - days)
  return items.filter((item) => { const date = new Date(item.created_at); return date >= start && date < end })
}
const comparisonMarkup = (current, previous) => {
  if (!analyticsCompare) return ''
  const change = previous ? ((current - previous) / previous) * 100 : current ? 100 : 0
  const direction = change > 0 ? 'is-up' : change < 0 ? 'is-down' : 'is-even'
  const prefix = change > 0 ? '+' : ''
  return `<em class="analytics-change ${direction}">${prefix}${change.toFixed(1)}% t.o.v. vorige periode</em>`
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
      orderCount: orders.filter((order) => dayKey(order.created_at) === key && order.payment_status === 'paid').length,
    }
  }).map((day) => ({ ...day, averageOrder: day.orderCount ? day.revenue / day.orderCount : 0 }))
}

function renderAnalytics() {
  const events = analyticsWindow(state.analytics, analyticsDays)
  const periodOrders = analyticsWindow(state.orders, analyticsDays)
  const previousEvents = analyticsWindow(state.analytics, analyticsDays, 1)
  const previousOrders = analyticsWindow(state.orders, analyticsDays, 1)
  const paidOrders = periodOrders.filter((order) => order.payment_status === 'paid')
  const previousPaidOrders = previousOrders.filter((order) => order.payment_status === 'paid')
  const pageViews = events.filter((event) => event.event_name === 'page_view')
  const previousPageViews = previousEvents.filter((event) => event.event_name === 'page_view')
  const sessions = new Set(pageViews.map((event) => event.session_id)).size
  const previousSessions = new Set(previousPageViews.map((event) => event.session_id)).size
  const productViews = events.filter((event) => event.event_name === 'product_view').length
  const carts = events.filter((event) => event.event_name === 'add_to_cart').length
  const checkouts = events.filter((event) => event.event_name === 'begin_checkout').length
  const completed = events.filter((event) => event.event_name === 'order_created').length
  const previousCompleted = previousEvents.filter((event) => event.event_name === 'order_created').length
  const ctaClicks = events.filter((event) => event.event_name === 'cta_click').length
  const contactSubmits = events.filter((event) => event.event_name === 'contact_submit').length
  const paymentSelections = events.filter((event) => event.event_name === 'payment_method_selected').length
  const checkoutErrors = events.filter((event) => event.event_name === 'checkout_error').length
  const revenue = paidOrders.reduce((sum, order) => sum + order.total_cents, 0)
  const previousRevenue = previousPaidOrders.reduce((sum, order) => sum + order.total_cents, 0)
  const averageOrder = paidOrders.length ? revenue / paidOrders.length : 0
  const fulfilled = periodOrders.filter((order) => ['shipped', 'delivered'].includes(order.fulfillment_status)).length
  const customerOrderCounts = periodOrders.reduce((result, order) => { const key = order.customer_email || order.customer_id; result[key] = (result[key] || 0) + 1; return result }, {})
  const returningCustomers = Object.values(customerOrderCounts).filter((count) => count > 1).length
  const returningRate = percent(returningCustomers, Object.keys(customerOrderCounts).length)
  const pages = Object.entries(pageViews.reduce((result, event) => { result[event.page || '/'] = (result[event.page || '/'] || 0) + 1; return result }, {})).sort((a, b) => b[1] - a[1])
  const devices = Object.entries(pageViews.reduce((result, event) => { const device = event.metadata?.device || 'Onbekend'; result[device] = (result[device] || 0) + 1; return result }, {})).sort((a, b) => b[1] - a[1])
  const referrers = Object.entries(pageViews.reduce((result, event) => { let referrer = event.metadata?.referrer || 'Direct'; try { referrer = referrer === 'Direct' ? referrer : new URL(referrer).hostname.replace(/^www\./, '') } catch { /* Toon de aangeleverde bron. */ } result[referrer] = (result[referrer] || 0) + 1; return result }, {})).sort((a, b) => b[1] - a[1])
  const series = analyticsSeries(analyticsDays, events, periodOrders)
  const maxFunnel = Math.max(sessions, 1)
  const productRevenue = paidOrders.flatMap((order) => order.order_items || []).reduce((result, item) => { result[item.product_name] = (result[item.product_name] || 0) + item.total_cents; return result }, {})
  elements.content.innerHTML = `<div class="page-container analytics-page">
    ${pageHeader('analytics', '<button class="button" data-action="export-analytics"><i data-lucide="download"></i> Exporteren</button><button class="button button--primary" data-action="refresh"><i data-lucide="refresh-cw"></i> Vernieuwen</button>')}
    <div class="analytics-toolbar"><div class="analytics-period" role="group" aria-label="Analyseperiode"><i data-lucide="calendar-days"></i>${[7, 30, 90].map((days) => `<button type="button" data-action="analytics-range" data-days="${days}" class="${analyticsDays === days ? 'is-active' : ''}">${days} dagen</button>`).join('')}</div><button type="button" data-action="toggle-analytics-compare" class="${analyticsCompare ? 'is-active' : ''}" aria-pressed="${analyticsCompare}">Vergelijking: ${analyticsCompare ? 'aan' : 'uit'}</button><span>EUR €</span></div>
    <section class="analytics-summary">
      <article><span>Bruto-omzet</span><strong>${formatMoney(revenue)}</strong><small>${paidOrders.length} betaalde bestellingen${comparisonMarkup(revenue, previousRevenue)}</small></article>
      <article><span>Terugkerende klanten</span><strong>${returningRate}</strong><small>${returningCustomers} klanten</small></article>
      <article><span>Afgehandelde bestellingen</span><strong>${fulfilled}</strong><small>Van ${periodOrders.length} bestellingen</small></article>
      <article><span>Conversiepercentage</span><strong>${percent(completed, sessions)}</strong><small>${completed} conversies${comparisonMarkup(sessions ? completed / sessions : 0, previousSessions ? previousCompleted / previousSessions : 0)}</small></article>
    </section>
    <section class="analytics-report-grid">
      <article class="report-card report-card--wide"><header><div><span>Totale omzet in de loop van de tijd</span><strong>${formatMoney(revenue)}</strong></div><small>${analyticsDays} dagen</small></header>${barSeriesMarkup(series.map((day) => ({ ...day, value: day.revenue })), formatMoney)}</article>
      <article class="report-card"><header><div><span>Uitsplitsing totale omzet</span><strong>${formatMoney(revenue)}</strong></div></header><ul class="report-breakdown"><li><span>Bruto-omzet</span><b>${formatMoney(paidOrders.reduce((sum, order) => sum + order.subtotal_cents, 0))}</b></li><li><span>Kortingen</span><b>− ${formatMoney(paidOrders.reduce((sum, order) => sum + (order.discount_cents || 0), 0))}</b></li><li><span>Verzendkosten</span><b>${formatMoney(paidOrders.reduce((sum, order) => sum + order.shipping_cents, 0))}</b></li><li><span>Netto-omzet</span><b>${formatMoney(revenue)}</b></li></ul></article>
      <article class="report-card"><header><div><span>Omzet per verkoopkanaal</span><strong>Webshop</strong></div></header><div class="donut-wrap"><div class="report-donut" style="--part:100"></div><p><strong>${formatMoney(revenue)}</strong><small>100% ZOL-webshop</small></p></div></article>
      <article class="report-card"><header><div><span>Gemiddelde bestelwaarde</span><strong>${formatMoney(averageOrder)}</strong></div></header>${barSeriesMarkup(series.map((day) => ({ ...day, value: day.averageOrder })), formatMoney)}</article>
      <article class="report-card"><header><div><span>Totale omzet per product</span><strong>${Object.keys(productRevenue).length} producten</strong></div></header><ul class="rank-list">${Object.entries(productRevenue).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => `<li><span>${escapeHtml(name)}</span><b>${formatMoney(value)}</b></li>`).join('') || '<li class="no-data">Nog geen betaalde productomzet.</li>'}</ul></article>
      <article class="report-card report-card--wide"><header><div><span>Sessies in de loop van de tijd</span><strong>${sessions}</strong></div><small>${pageViews.length} paginaweergaven</small></header>${barSeriesMarkup(series.map((day) => ({ ...day, value: day.sessions })))}</article>
      <article class="report-card"><header><div><span>Conversietrechter</span><strong>${percent(completed, sessions)}</strong></div></header><div class="conversion-funnel">${[['Sessies', sessions], ['Product bekeken', productViews], ['Winkelwagen', carts], ['Checkout', checkouts], ['Bestelling', completed]].map(([label, value]) => `<div style="--width:${Math.max(8, (value / maxFunnel) * 100)}%"><span>${escapeHtml(label)}</span><i></i><b>${value}</b></div>`).join('')}</div></article>
      <article class="report-card"><header><div><span>Sessies per apparaattype</span><strong>${sessions}</strong></div></header><ul class="rank-list">${devices.map(([name, value]) => `<li><span>${escapeHtml(name)}</span><b>${value} · ${percent(value, pageViews.length)}</b></li>`).join('') || '<li class="no-data">Nog geen apparaatgegevens.</li>'}</ul></article>
      <article class="report-card"><header><div><span>Sessies per landingspagina</span><strong>${pages.length} pagina's</strong></div></header><ul class="rank-list">${pages.slice(0, 7).map(([page, value]) => `<li><span>${escapeHtml(page)}</span><b>${value}</b></li>`).join('') || '<li class="no-data">Nog geen paginaweergaven.</li>'}</ul></article>
      <article class="report-card"><header><div><span>Sessies per verwijzer</span><strong>${referrers.length} bronnen</strong></div></header><ul class="rank-list">${referrers.slice(0, 7).map(([name, value]) => `<li><span>${escapeHtml(name)}</span><b>${value}</b></li>`).join('') || '<li class="no-data">Nog geen verwijzers.</li>'}</ul></article>
      <article class="report-card"><header><div><span>Interacties</span><strong>${ctaClicks + contactSubmits}</strong></div></header><ul class="rank-list"><li><span>CTA-klikken</span><b>${ctaClicks}</b></li><li><span>Contactformulieren</span><b>${contactSubmits}</b></li><li><span>Betaalmethode gekozen</span><b>${paymentSelections}</b></li><li><span>Checkoutfouten</span><b>${checkoutErrors}</b></li></ul></article>
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
  const activeManagerCount = state.profiles.filter((profile) => profile.active && ['owner', 'admin'].includes(profile.role)).length
  const rows = state.profiles.map((profile) => {
    const isCurrentAccount = profile.id === state.profile.id
    const isLastActiveManager = profile.active && ['owner', 'admin'].includes(profile.role) && activeManagerCount <= 1
    const removable = canManage && !isCurrentAccount && !isLastActiveManager
    const protectedLabel = isLastActiveManager ? 'Minimaal één actief' : isCurrentAccount ? 'Jouw account' : ''
    return `<tr><td><strong>${escapeHtml(profile.full_name || profile.email)}</strong>${isCurrentAccount ? '<small class="table-subline">Jij</small>' : ''}</td><td>${escapeHtml(profile.email)}</td><td>${statusPill(profile.active ? 'active' : 'inactive')}</td><td>${escapeHtml(roleLabel(profile.role))}</td><td>${formatDate(profile.created_at)}</td><td class="table-actions">${removable ? `<button class="button button--danger button--small" data-action="remove-admin" data-id="${profile.id}" data-return="${returnTo}">Verwijderen</button>` : protectedLabel ? `<small class="admin-protected-label">${protectedLabel}</small>` : ''}</td></tr>`
  }).join('')
  const pending = state.allowedEmails.filter((allowed) => !state.profiles.some((profile) => profile.email === allowed.email))
  const addButton = canManage ? `<button class="button button--primary" data-action="invite-admin" data-return="${returnTo}">Beheerder toevoegen</button>` : ''
  return `<section class="${compact ? 'settings-team-block' : 'panel'}"><header class="panel-header"><div><h2>Actieve beheerders</h2><p>${canManage ? 'Verwijder toegang wanneer nodig. De laatste actieve beheerder blijft altijd beschermd.' : 'Alleen de eigenaar kan toegang wijzigen.'}</p></div>${addButton}</header>${rows ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Naam</th><th>E-mail</th><th>Status</th><th>Rol</th><th>Sinds</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState('Nog geen actieve beheerders', 'De eigenaar kan hier een beheerder toevoegen.', '♧')}</section>${pending.length ? `<section class="${compact ? 'settings-team-block' : 'panel'}"><header class="panel-header"><div><h2>Wacht op activering</h2><p>Account is nog niet geactiveerd</p></div></header><div class="table-scroll"><table class="data-table"><thead><tr><th>E-mail</th><th>Rol</th><th>Toegevoegd</th><th></th></tr></thead><tbody>${pending.map((entry) => `<tr><td>${escapeHtml(entry.email)}</td><td>${escapeHtml(roleLabel(entry.role))}</td><td>${formatDate(entry.created_at)}</td><td class="table-actions">${canManage ? `<button class="button button--danger button--small" data-action="remove-admin" data-email="${escapeHtml(entry.email)}" data-return="${returnTo}">Verwijderen</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`
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
  const activeManagerCount = state.profiles.filter((item) => item.active && ['owner', 'admin'].includes(item.role)).length
  if (profile?.active && ['owner', 'admin'].includes(profile.role) && activeManagerCount <= 1) { toast('Beheerder is beschermd', 'Er moet altijd minimaal één actieve beheerder blijven.', true); return }
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

function visibleOrders() {
  const configuredMinutes = Number.parseInt(String(settingsValue('commerce').abandoned_checkout_minutes || 10), 10)
  const timeoutMinutes = Math.min(1440, Math.max(1, Number.isFinite(configuredMinutes) ? configuredMinutes : 10))
  const cutoff = Date.now() - timeoutMinutes * 60_000
  return state.orders.filter((order) => !(
    order.source === 'zol-webshop' &&
    !['paid', 'partially_refunded', 'refunded'].includes(order.payment_status) &&
    new Date(order.created_at).getTime() <= cutoff
  ))
}

async function resetAuthenticator(event) {
  const factor = state.mfaFactors.find((item) => item.status === 'verified')
  if (!factor || !window.confirm('Authenticator direct intrekken? Je wordt op alle apparaten afgemeld en moet na het inloggen een nieuwe persoonlijke QR-code scannen.')) return
  const button = event.currentTarget
  setBusy(button, true, 'Authenticator intrekken')
  const { data, error } = await supabase.functions.invoke('admin-security', { body: { action: 'reset_totp', factor_id: factor.id } })
  if (error || data?.error) {
    toast('Authenticator intrekken mislukt', await edgeFunctionMessage(error, data, 'Probeer het opnieuw.'), true)
    setBusy(button, false, 'Gecompromitteerde authenticator intrekken')
    return
  }
  await supabase.auth.signOut()
  showLogin('De oude authenticator is ingetrokken. Log opnieuw in en scan de nieuwe persoonlijke QR-code.')
}

function renderSettings(category = 'company') {
  const company = settingsValue('company_profile'), commerce = settingsValue('commerce'), theme = settingsValue('theme'), seo = settingsValue('seo_defaults'), email = settingsValue('email_config'), postnl = settingsValue('postnl_config')
  const verifiedMfaFactors = state.mfaFactors.filter((factor) => factor.status === 'verified')
  const panels = {
    company: `<h2>Bedrijfsgegevens</h2><p>Gegevens die op facturen en in contactinformatie worden gebruikt.</p><form id="settings-form" data-key="company_profile" data-category="company"><div class="form-grid"><label class="field">Bedrijfsnaam<input name="name" value="${escapeHtml(company.name)}"></label><label class="field">E-mailadres<input name="email" type="email" value="${escapeHtml(company.email)}"></label><label class="field">Telefoon<input name="phone" value="${escapeHtml(company.phone)}"></label><label class="field">KvK-nummer<input name="kvk" value="${escapeHtml(company.kvk)}"></label><label class="field">BTW-nummer<input name="vat_number" value="${escapeHtml(company.vat_number)}"></label><label class="field">Adres<input name="address" value="${escapeHtml(company.address)}"></label></div>${settingsActions()}</form>`,
    checkout: `<h2>Checkout & betalingen</h2><p>Verzending, belasting en de voorbereiding op Mollie.</p><form id="settings-form" data-key="commerce" data-category="checkout"><div class="form-grid"><label class="field">Verzendkosten (€)<input name="shipping_cents" data-cents type="number" min="0" step="0.01" value="${((commerce.shipping_cents || 0) / 100).toFixed(2)}"></label><label class="field">Gratis verzending vanaf (€)<input name="free_shipping_threshold_cents" data-cents type="number" min="0" step="0.01" value="${((commerce.free_shipping_threshold_cents || 0) / 100).toFixed(2)}"></label><label class="field">BTW-percentage<input name="tax_rate" type="number" min="0" step="0.01" value="${commerce.tax_rate ?? 21}"></label><label class="field">Valuta<select name="currency"><option value="EUR" ${commerce.currency === 'EUR' ? 'selected' : ''}>EUR — euro</option></select></label><label class="field">Onbetaalde checkout verbergen na (minuten)<input name="abandoned_checkout_minutes" type="number" min="1" max="1440" step="1" value="${Number(commerce.abandoned_checkout_minutes || 10)}"><small>Geldt alleen voor onbetaalde webshop-checkouts; betaalde en handmatige orders blijven zichtbaar.</small></label><label class="checkbox-field field--full"><input name="mollie_enabled" type="checkbox" ${commerce.mollie_enabled ? 'checked' : ''}> Mollie activeren zodra de API-sleutel veilig is ingesteld</label></div>${settingsActions()}</form>`,
    website: `<h2>Huisstijl & SEO</h2><p>Pas de basiskleuren en standaard zoekmachinegegevens aan.</p><form id="settings-form" data-key="theme" data-category="website"><div class="form-grid"><label class="field">ZOL-blauw<div class="color-row"><input name="primary" type="color" value="${escapeHtml(theme.primary || '#33669B')}"><input value="${escapeHtml(theme.primary || '#33669B')}" disabled></div></label><label class="field">Accentkleur<div class="color-row"><input name="accent" type="color" value="${escapeHtml(theme.accent || '#F28C57')}"><input value="${escapeHtml(theme.accent || '#F28C57')}" disabled></div></label><label class="field">Tekstkleur<div class="color-row"><input name="ink" type="color" value="${escapeHtml(theme.ink || '#10233B')}"><input value="${escapeHtml(theme.ink || '#10233B')}" disabled></div></label><label class="field">Achtergrond<div class="color-row"><input name="background" type="color" value="${escapeHtml(theme.background || '#F7F5F0')}"><input value="${escapeHtml(theme.background || '#F7F5F0')}" disabled></div></label></div>${settingsActions()}</form><form id="seo-settings-form" style="margin-top:25px"><h2>Standaard SEO</h2><div class="form-grid"><label class="field">Websitetitel<input name="title" value="${escapeHtml(seo.title)}"></label><label class="field">Beschrijving<input name="description" value="${escapeHtml(seo.description)}"></label></div>${settingsActions()}</form>`,
    email: `<h2>E-mail</h2><p>Afzender, antwoordadres en interne meldingen. De geheime API-sleutel wordt nooit in de browser opgeslagen.</p><form id="settings-form" data-key="email_config" data-category="email"><div class="email-connection ${email.enabled ? 'is-connected' : ''}"><i>${email.enabled ? '✓' : '!'}</i><div><strong>${email.enabled ? 'E-mailverzending actief' : 'Wacht op domein en API-sleutel'}</strong><small>${email.enabled ? 'Order-, contact-, klant- en toegestane productmails zijn ingeschakeld.' : 'De volledige mailflow staat klaar, maar verstuurt nog niets.'}</small></div></div><div class="form-grid"><label class="field">Afzendernaam<input name="from_name" value="${escapeHtml(email.from_name || 'ZOL Solutions')}"></label><label class="field">Afzenderadres<input name="from_email" type="email" value="${escapeHtml(email.from_email || 'info@zolsolutions.nl')}"></label><label class="field">Antwoordadres<input name="reply_to" type="email" value="${escapeHtml(email.reply_to || 'info@zolsolutions.nl')}"></label><label class="field">Interne meldingen naar<input name="admin_email" type="email" value="${escapeHtml(email.admin_email || 'info@zolsolutions.nl')}"></label><label class="field field--full">Website-URL<input name="website_url" type="url" value="${escapeHtml(email.website_url || 'https://zolsolutions.nl')}"></label><input name="provider" type="hidden" value="resend"><label class="checkbox-field field--full"><input name="enabled" type="checkbox" ${email.enabled ? 'checked' : ''}> Verzending activeren <small>(pas na domeinverificatie en server-side API-sleutel)</small></label><label class="checkbox-field field--full"><input name="marketing_enabled" type="checkbox" ${email.marketing_enabled !== false ? 'checked' : ''}> Driewekelijkse productmail versturen, uitsluitend na toestemming</label><label class="field">Minimale tussenperiode in dagen<input name="marketing_interval_days" type="number" min="21" max="90" step="1" value="${Number(email.marketing_interval_days || 21)}"><small>Minimaal 21 dagen om de frequentie rustig te houden.</small></label></div><div class="form-actions"><button class="button" type="button" data-action="test-email" ${email.enabled ? '' : 'disabled'}>Testmail naar info sturen</button><button class="button button--primary" type="submit">E-mailinstellingen opslaan</button></div></form>`,
    postnl: `<h2>PostNL</h2><p>Maak vanuit een bestelling een label en trackingcode. API-sleutels blijven uitsluitend als beveiligde servergeheimen opgeslagen.</p><form id="settings-form" data-key="postnl_config" data-category="shipping"><div class="email-connection ${postnl.enabled ? 'is-connected' : ''}"><i>${postnl.enabled ? '✓' : '!'}</i><div><strong>${postnl.enabled ? `Koppeling actief in ${postnl.environment === 'production' ? 'productie' : 'sandbox'}` : 'Koppeling nog niet actief'}</strong><small>Gebruik eerst ‘Sandboxsleutel testen’. Productie blijft apart beveiligd.</small></div></div><div class="form-grid"><label class="field">Omgeving<select name="environment"><option value="sandbox" ${postnl.environment !== 'production' ? 'selected' : ''}>Sandbox — veilig testen</option><option value="production" ${postnl.environment === 'production' ? 'selected' : ''}>Productie — echte zendingen</option></select></label><label class="field">Pakkettype<select name="shipment_type"><option value="parcel" ${postnl.shipment_type !== 'letterbox' ? 'selected' : ''}>Pakket</option><option value="letterbox" ${postnl.shipment_type === 'letterbox' ? 'selected' : ''}>Brievenbuspakje</option></select></label><label class="field">PostNL-klantnummer<input name="customer_number" maxlength="10" value="${escapeHtml(postnl.customer_number)}" required></label><label class="field">PostNL-klantcode<input name="customer_code" maxlength="4" value="${escapeHtml(postnl.customer_code)}" required></label><label class="field">Collectielocatie (BLS)<input name="collection_location" maxlength="10" value="${escapeHtml(postnl.collection_location)}"></label><label class="field">Niet-EU-klantcode<input name="non_eu_customer_code" maxlength="10" value="${escapeHtml(postnl.non_eu_customer_code)}"></label><label class="field">Barcode-serie NL<input name="barcode_series" maxlength="30" value="${escapeHtml(postnl.barcode_series || '00000000-99999999')}" required></label><label class="field">Barcode-serie niet-EU<input name="non_eu_barcode_series" maxlength="30" value="${escapeHtml(postnl.non_eu_barcode_series || '0000-9999')}"></label><label class="field">PostNL-productcode<input name="product_code" inputmode="numeric" maxlength="4" value="${escapeHtml(postnl.product_code || (postnl.shipment_type === 'letterbox' ? '2928' : '3085'))}" required><small>3085 = standaard pakket; 2928 = brievenbuspakje+.</small></label><label class="field">Standaardgewicht (gram)<input name="default_weight_grams" type="number" min="1" max="23000" step="1" value="${escapeHtml(postnl.default_weight_grams || '500')}" required><small>Controleer dit gewicht voordat productie wordt geactiveerd.</small></label><label class="field">Bedrijfsnaam afzender<input name="sender_company" maxlength="35" value="${escapeHtml(postnl.sender_company || 'ZOL Solutions')}" required></label><label class="field">Straat<input name="sender_street" maxlength="95" value="${escapeHtml(postnl.sender_street || 'Burgemeester Hogguerstraat')}" required></label><label class="field">Huisnummer<input name="sender_house_number" maxlength="10" value="${escapeHtml(postnl.sender_house_number || '1111')}" required></label><label class="field">Toevoeging<input name="sender_house_number_addition" maxlength="10" value="${escapeHtml(postnl.sender_house_number_addition)}"></label><label class="field">Postcode<input name="sender_postal_code" maxlength="17" value="${escapeHtml(postnl.sender_postal_code || '1064 EJ')}" required></label><label class="field">Plaats<input name="sender_city" maxlength="35" value="${escapeHtml(postnl.sender_city || 'Amsterdam')}" required></label><label class="field">Land<select name="sender_country"><option value="NL">Nederland</option></select></label><label class="field">E-mail afzender<input name="sender_email" type="email" maxlength="50" value="${escapeHtml(postnl.sender_email || 'info@zolsolutions.nl')}"></label><label class="field">Telefoon afzender<input name="sender_phone" maxlength="17" value="${escapeHtml(postnl.sender_phone)}"></label><input name="label_output" type="hidden" value="pdf"><label class="checkbox-field field--full"><input name="enabled" type="checkbox" ${postnl.enabled ? 'checked' : ''}> PostNL-labels activeren</label><label class="checkbox-field field--full"><input name="production_enabled" type="checkbox" ${postnl.production_enabled ? 'checked' : ''}> Echte productiezendingen expliciet toestaan</label></div><div class="form-actions"><button class="button" type="button" data-action="test-postnl" data-environment="sandbox">Sandboxsleutel testen</button><button class="button button--primary" type="submit">PostNL-instellingen opslaan</button></div></form>`,
    team: `<h2>Beheerders</h2><p>Beheer wie toegang heeft tot ZOL Admin. Alleen de eigenaar kan accounts toevoegen of verwijderen.</p>${teamManagementMarkup('settings', true)}`,
    security: `<h2>Account & beveiliging</h2><p>De beheeromgeving vereist altijd je persoonlijke beheeraccount, wachtwoord én code uit je eigen authenticator-app.</p><div class="mfa-status-card"><span>✓</span><div><strong>Tweestapsverificatie actief</strong><small>${verifiedMfaFactors.length} geverifieerde authenticator${verifiedMfaFactors.length === 1 ? '' : 's'} gekoppeld aan dit account.</small></div></div>${verifiedMfaFactors.length ? `<button class="button button--danger" type="button" id="reset-authenticator">Gecompromitteerde authenticator intrekken</button><p class="field-help">Je wordt overal afgemeld en stelt daarna een nieuwe, persoonlijke authenticator in.</p>` : ''}<form id="password-form"><h3>Wachtwoord wijzigen</h3><p>Na de wijziging worden alle andere actieve sessies afgemeld.</p><div class="form-grid"><label class="field field--full">Huidig wachtwoord<input name="current_password" type="password" autocomplete="current-password" required></label><label class="field">Nieuw wachtwoord<input name="password" type="password" autocomplete="new-password" minlength="12" required><small>Minimaal 12 tekens met hoofdletter, kleine letter, cijfer en speciaal teken.</small></label><label class="field">Herhaal nieuw wachtwoord<input name="password_confirm" type="password" autocomplete="new-password" minlength="12" required></label><label class="field field--full">Code uit authenticator-app<input name="mfa_code" type="text" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code" required></label></div>${settingsActions('Wachtwoord wijzigen')}</form>`,
  }
  elements.content.innerHTML = `<div class="page-container">${pageHeader('settings')}<div class="settings-layout"><nav class="settings-nav panel"><button data-settings-tab="company" class="${category === 'company' ? 'is-active' : ''}">Bedrijf</button><button data-settings-tab="checkout" class="${category === 'checkout' ? 'is-active' : ''}">Checkout & btw</button><button data-settings-tab="postnl" class="${category === 'postnl' ? 'is-active' : ''}">PostNL</button><button data-settings-tab="website" class="${category === 'website' ? 'is-active' : ''}">Website & SEO</button><button data-settings-tab="email" class="${category === 'email' ? 'is-active' : ''}">E-mail</button><button data-settings-tab="team" class="${category === 'team' ? 'is-active' : ''}">Beheerders</button><button data-settings-tab="security" class="${category === 'security' ? 'is-active' : ''}">Beveiliging</button></nav><section class="settings-panel panel">${panels[category] || panels.company}</section></div></div>`
  bindSettingsForms(category)
}

function settingsActions(label = 'Instellingen opslaan') { return `<div class="form-actions"><button class="button button--primary" type="submit">${label}</button></div>` }

function bindSettingsForms(category) {
  document.querySelector('#reset-authenticator')?.addEventListener('click', resetAuthenticator)
  const form = document.querySelector('#settings-form')
  form?.addEventListener('submit', async (event) => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(form)); form.querySelectorAll('[data-cents]').forEach((input) => values[input.name] = Math.round(Number(input.value) * 100)); form.querySelectorAll('input[type="number"]:not([data-cents])').forEach((input) => values[input.name] = Number(input.value)); form.querySelectorAll('input[type="checkbox"]').forEach((input) => values[input.name] = input.checked)
    const key = form.dataset.key; const { error } = await supabase.from('settings').upsert({ key, category: form.dataset.category, label: key === 'commerce' ? 'Webshopinstellingen' : key === 'theme' ? 'Huisstijl' : key === 'email_config' ? 'E-mailinstellingen' : key === 'postnl_config' ? 'PostNL-koppeling' : 'Bedrijfsgegevens', value: values, is_public: ['commerce', 'theme'].includes(key) })
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
    const { data: factorData, error: factorError } = await supabase.auth.mfa.listFactors()
    const factor = factorData?.totp?.find((item) => item.status === 'verified')
    if (factorError || !factor) { toast('Authenticator ontbreekt', 'Log opnieuw in om tweestapsverificatie in te stellen.', true); setBusy(button, false, 'Wachtwoord wijzigen'); return }
    const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (challenge.error) { toast('Beveiligingscontrole mislukt', challenge.error.message, true); setBusy(button, false, 'Wachtwoord wijzigen'); return }
    const verification = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code: String(values.mfa_code).trim() })
    if (verification.error) { toast('Authenticatorcode is niet juist', 'Probeer de nieuwste zescijferige code.', true); setBusy(button, false, 'Wachtwoord wijzigen'); return }
    state.session = (await supabase.auth.getSession()).data.session
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
  const renderers = { dashboard: renderDashboard, orders: renderOrders, customers: renderCustomers, messages: renderMessages, emails: renderEmails, pilot: renderPilot, products: renderProducts, discounts: renderDiscounts, content: renderContent, media: renderMedia, payments: renderPayments, analytics: renderAnalytics, live: renderLive, activity: renderActivity, team: renderTeam, settings: () => renderSettings(option) }
  renderers[route]?.()
  if (route === 'live' && !liveRefreshTimer) startLiveUpdates()
  refreshIcons()
  elements.content.focus({ preventScroll: true })
  window.scrollTo({ top: 0, behavior: 'instant' })
}

async function refreshCurrentRoute(option) {
  try {
    if (currentRoute() === 'pilot') { state.pilotReport = null; state.pilotReportError = '' }
    await fetchAllData(); renderRoute(currentRoute(), option)
  } catch (error) { toast('Vernieuwen mislukt', error.message, true) }
}

async function exportOrders() {
  const orders = visibleOrders()
  if (!orders.length) { toast('Geen bestellingen om te exporteren'); return }
  const rows = [['Bestelling', 'Extern nummer', 'Datum', 'Klant', 'E-mail', 'Totaal', 'Betaling', 'Verzending', 'Status'], ...orders.map((order) => [order.order_number, order.external_reference || '', order.created_at, order.customer_name, order.customer_email, (order.total_cents / 100).toFixed(2), order.payment_status, order.fulfillment_status, order.status])]
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = `zol-bestellingen-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url)
  await recordActivity('Bestellingen geëxporteerd', 'order', '', { count: orders.length }); toast('Export aangemaakt')
}

function exportFinance() {
  const rows = financeRows(state.orders, state.payments, financeMonth)
  if (!rows.length) { toast('Geen financiële regels om te exporteren'); return }
  const csv = financeExcelCsv(rows)
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `zol-boekhouding-${financeMonth === 'all' ? 'alle-periodes' : financeMonth}.csv`
  link.click()
  URL.revokeObjectURL(url)
  toast('Boekhoudingsexport aangemaakt', `${rows.length} regels voor ${financeMonthLabel(financeMonth)}.`)
}

function downloadOrderImportTemplate() {
  const url = URL.createObjectURL(new Blob([orderImportTemplateCsv()], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'zol-bestellingen-import-voorbeeld.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function importOrdersForm() {
  openDialog('Bestellingen importeren', 'CSV-import', `<form id="order-import-form">
    <section class="csv-import-intro"><strong>CSV uit Excel, Numbers, Shopify of een ander spreadsheetprogramma</strong><p>Bestellingen met hetzelfde bestelnummer worden samengevoegd. Een bestaande import wordt veilig overgeslagen. Historische imports veranderen de huidige voorraad niet.</p></section>
    <label class="csv-file-field"><span>CSV-bestand kiezen</span><input id="order-import-file" type="file" accept=".csv,text/csv,text/plain" required><small>Maximaal 10 MB. Komma, puntkomma en tab worden automatisch herkend.</small></label>
    <section class="csv-import-preview" id="order-import-preview" aria-live="polite"><span>Nog geen bestand gekozen</span><p>Na het kiezen zie je eerst een controle. Er wordt dan nog niets geïmporteerd.</p></section>
    <div class="form-actions"><button class="button" type="button" data-action="download-order-template"><i data-lucide="download"></i> Voorbeeld downloaden</button><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit" disabled>Gecontroleerde orders importeren</button></div>
  </form>`)
  elements.dialog.classList.add('admin-dialog--wide')
  refreshIcons()
  const form = document.querySelector('#order-import-form')
  const fileInput = form.querySelector('#order-import-file')
  const preview = form.querySelector('#order-import-preview')
  const submit = form.querySelector('[type="submit"]')
  let parsed = null

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    parsed = null
    submit.disabled = true
    if (!file) { preview.innerHTML = '<span>Nog geen bestand gekozen</span><p>Kies een CSV-bestand om het te controleren.</p>'; return }
    if (file.size > 10 * 1024 * 1024) { preview.innerHTML = '<span class="is-error">Bestand is te groot</span><p>Gebruik een CSV-bestand van maximaal 10 MB.</p>'; return }
    try {
      parsed = parseOrderCsv(await file.text())
      const issuePreview = parsed.issues.slice(0, 6).map((issue) => `<li>${escapeHtml(issue)}</li>`).join('')
      const moreIssues = parsed.issues.length > 6 ? `<li>En nog ${parsed.issues.length - 6} andere regels.</li>` : ''
      preview.innerHTML = `<header><div><span>${escapeHtml(file.name)}</span><small>${parsed.delimiter === '\t' ? 'Tab' : parsed.delimiter === ';' ? 'Puntkomma' : 'Komma'} als scheidingsteken</small></div><strong>${parsed.orders.length} bestellingen</strong></header><div class="csv-import-stats"><span>${parsed.lineCount} gegevensregels</span><span>${parsed.orders.reduce((sum, order) => sum + order.items.length, 0)} productregels</span><span>${parsed.issues.length} fouten</span></div>${parsed.issues.length ? `<div class="csv-import-errors"><strong>Los deze regels eerst op:</strong><ul>${issuePreview}${moreIssues}</ul></div>` : '<p class="csv-import-ready">✓ Bestand is gecontroleerd en klaar voor import.</p>'}`
      submit.disabled = !parsed.orders.length || parsed.issues.length > 0
    } catch (error) {
      preview.innerHTML = `<span class="is-error">Bestand kon niet worden gelezen</span><p>${escapeHtml(error.message)}</p>`
    }
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!parsed?.orders.length || parsed.issues.length) return
    setBusy(submit, true, 'Importeren')
    let imported = 0
    let skipped = 0
    for (let offset = 0; offset < parsed.orders.length; offset += 200) {
      const { data, error } = await supabase.rpc('import_admin_orders', { p_orders: parsed.orders.slice(offset, offset + 200) })
      if (error) { toast('Importeren mislukt', error.message, true); setBusy(submit, false, 'Gecontroleerde orders importeren'); return }
      imported += Number(data?.imported || 0)
      skipped += Number(data?.skipped || 0)
    }
    await recordActivity('Bestellingen via CSV geïmporteerd', 'order', '', { imported, skipped, filename: fileInput.files?.[0]?.name || '' })
    closeDialog()
    await refreshCurrentRoute()
    toast('CSV-import voltooid', `${imported} bestellingen toegevoegd${skipped ? ` · ${skipped} bestaande imports overgeslagen` : ''}.`)
  })
}

async function exportAnalytics() {
  const rows = [['Datum', 'Event', 'Sessie', 'Pagina', 'Apparaat', 'Verwijzer', 'Campagne', 'Actie'], ...analyticsWindow(state.analytics, analyticsDays).map((event) => [event.created_at, event.event_name, event.session_id, event.page, event.metadata?.device || '', event.metadata?.referrer || '', event.metadata?.utm_campaign || '', event.metadata?.label || event.metadata?.method || ''])]
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = `zol-analytics-${analyticsDays}-dagen-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url)
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
  if (action === 'export-finance') exportFinance()
  if (action === 'import-orders') importOrdersForm()
  if (action === 'download-order-template') downloadOrderImportTemplate()
  if (action === 'import-customers') importCustomersForm()
  if (action === 'download-customer-template') downloadCustomerImportTemplate()
  if (action === 'export-analytics') await exportAnalytics()
  if (action === 'analytics-range') { analyticsDays = Number(target.dataset.days) || 30; renderAnalytics() }
  if (action === 'toggle-analytics-compare') { analyticsCompare = !analyticsCompare; renderAnalytics() }
  if (action === 'print-invoice') printInvoice(state.orders.find((item) => item.id === id))
  if (action === 'open-order') openOrder(state.orders.find((item) => item.id === id))
  if (action === 'back-orders') renderOrders()
  if (action === 'add-tracking') trackingForm(state.orders.find((item) => item.id === id))
  if (action === 'remove-tracking') await removeOrderTracking(state.orders.find((item) => item.id === id), target)
  if (action === 'postnl-label') postnlLabelForm(state.orders.find((item) => item.id === id))
  if (action === 'postnl-label-url') await openPostnlLabel(state.orders.find((item) => item.id === id))
  if (action === 'test-postnl') {
    setBusy(target, true, 'Sandboxsleutel testen')
    const { data, error } = await supabase.functions.invoke('postnl-shipment', { body: { action: 'test', environment: target.dataset.environment || 'sandbox' } })
    if (error || data?.error) toast('PostNL-test mislukt', await edgeFunctionMessage(error, data, 'De API-sleutel kon niet worden gecontroleerd.'), true)
    else toast('PostNL-sandbox geslaagd', 'Sleutel, klantgegevens, barcode en PDF-label werken via Labelling API v2.2.')
    setBusy(target, false, 'Sandboxsleutel testen')
  }
  if (action === 'test-email') {
    if (!window.confirm('Eén herkenbare testmail versturen naar info@zolsolutions.nl?')) return
    setBusy(target, true, 'Testmail naar info sturen')
    const { data, error } = await supabase.functions.invoke('admin-test-email', { body: {} })
    if (error || data?.error) toast('Testmail mislukt', await edgeFunctionMessage(error, data, 'De testmail kon niet worden verstuurd.'), true)
    else toast('Testmail verstuurd', 'Controleer info@zolsolutions.nl.')
    setBusy(target, false, 'Testmail naar info sturen')
  }
  if (action === 'export-pilot-results') await exportPilotResults(target)
  if (action === 'refresh-pilot-results') await loadPilotReport(true)
  if (action === 'focus-pain-customers') document.querySelector('#pain-customer-picker')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (action === 'select-all-pain-customers') {
    document.querySelectorAll('[data-pain-customer-id]:not(:disabled)').forEach((input) => {
      input.checked = true
      state.pilotCustomerSelection.add(input.dataset.painCustomerId)
    })
    syncPainSelectionControls()
  }
  if (action === 'clear-pain-customers') {
    state.pilotCustomerSelection.clear()
    document.querySelectorAll('[data-pain-customer-id]').forEach((input) => { input.checked = false })
    syncPainSelectionControls()
  }
  if (action === 'invite-order-customers') await inviteOrderCustomers(target)
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
  if (action === 'send-pilot-invite') {
    if (!id || !window.confirm('Deze ene pijnvragenlijst nu versturen?')) return
    setBusy(target, true, 'Vragenlijst sturen')
    const { data, error } = await supabase.functions.invoke('pilot-measurement', { body: { action: 'send', invite_id: id } })
    if (error || data?.error) toast('Vragenlijst versturen mislukt', await edgeFunctionMessage(error, data, 'De vragenlijst kon niet worden verstuurd.'), true)
    else { toast('Vragenlijst verstuurd', data?.warning ? 'De mail is bezorgd, maar vernieuw het overzicht om de status te controleren.' : 'De ontvanger kan direct op een antwoord in de mail klikken.'); await refreshCurrentRoute() }
    setBusy(target, false, 'Vragenlijst sturen')
  }
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
  if (event.target.matches('[data-finance-month]')) { financeMonth = event.target.value; renderPayments() }
}

async function showAdmin(session) {
  state.session = session
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assurance.error || assurance.data?.currentLevel !== 'aal2') { await showMfa(session); return }
  const { data: profile, error } = await supabase.from('admin_profiles').select('*').eq('id', session.user.id).single()
  if (error || !profile?.active) {
    await supabase.auth.signOut()
    showLogin('Dit account heeft geen toegang tot ZOL Admin. Vraag de eigenaar om een uitnodiging.')
    return
  }
  state.profile = profile
  const factors = await supabase.auth.mfa.listFactors()
  state.mfaFactors = factors.data?.totp || []
  document.querySelector('#account-name').textContent = profile.full_name || profile.email.split('@')[0]
  document.querySelector('#account-role').textContent = prettyStatus(profile.role === 'owner' ? 'Eigenaar' : profile.role)
  document.querySelector('#account-initials').textContent = initials(profile.full_name || profile.email)
  elements.loading.hidden = true; elements.login.hidden = true; elements.mfa.hidden = true; elements.app.hidden = false
  try { await fetchAllData(); renderRoute() } catch (fetchError) { toast('Admin laden mislukt', fetchError.message, true); elements.content.innerHTML = `<div class="page-container">${emptyState('Gegevens konden niet worden geladen', fetchError.message, '×')}</div>` }
}

async function showMfa(session) {
  state.session = session
  state.mfaFactorId = ''
  state.mfaMode = ''
  elements.loading.hidden = true; elements.login.hidden = true; elements.app.hidden = true; elements.mfa.hidden = false
  const title = document.querySelector('#mfa-title')
  const description = document.querySelector('#mfa-description')
  const enrollment = document.querySelector('#mfa-enrollment')
  const message = document.querySelector('#mfa-message')
  const form = document.querySelector('#mfa-form')
  message.textContent = 'Beveiliging controleren…'; message.classList.remove('is-error'); enrollment.hidden = true; form.reset()

  const access = await supabase.functions.invoke('admin-security', { body: { action: 'check_access' } })
  if (access.error || access.data?.allowed !== true) {
    await supabase.auth.signOut()
    showLogin('Dit account heeft geen toegang tot ZOL Admin. Vraag de eigenaar om een uitnodiging.')
    return
  }

  const factors = await supabase.auth.mfa.listFactors()
  if (factors.error) { message.textContent = factors.error.message; message.classList.add('is-error'); return }
  const verified = factors.data?.totp?.find((factor) => factor.status === 'verified')
  if (verified) {
    state.mfaMode = 'challenge'; state.mfaFactorId = verified.id
    title.innerHTML = 'Vul je code<br><em>in.</em>'
    description.textContent = 'Open je authenticator-app en vul de actuele zescijferige code in.'
    message.textContent = ''
    form.elements.code.focus()
    return
  }

  for (const factor of factors.data?.totp || []) {
    if (factor.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: factor.id })
  }
  const enrolled = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'ZOL Admin' })
  if (enrolled.error) { message.textContent = enrolled.error.message; message.classList.add('is-error'); return }
  state.mfaMode = 'enroll'; state.mfaFactorId = enrolled.data.id
  title.innerHTML = 'Authenticator<br><em>instellen.</em>'
  description.textContent = 'Scan de QR-code met Google Authenticator, Microsoft Authenticator, 1Password of een vergelijkbare app.'
  document.querySelector('#mfa-qr-code').src = enrolled.data.totp.qr_code
  enrollment.hidden = false; message.textContent = ''
  form.elements.code.focus()
}

function showLogin(message = '') {
  elements.loading.hidden = true; elements.app.hidden = true; elements.mfa.hidden = true; elements.login.hidden = false
  const messageElement = document.querySelector('#login-message'); messageElement.textContent = message; messageElement.classList.toggle('is-error', Boolean(message))
}

async function continueAfterPrimaryAuth(session) {
  if (!session) { showLogin(); return }
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!assurance.error && assurance.data?.currentLevel === 'aal2') await showAdmin(session)
  else await showMfa(session)
}

async function boot() {
  const { data: { session } } = await supabase.auth.getSession()
  await continueAfterPrimaryAuth(session)
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type="submit"]'); const message = document.querySelector('#login-message'); setBusy(button, true, 'Inloggen'); message.textContent = ''; message.classList.remove('is-error')
  const values = Object.fromEntries(new FormData(form)); const { data, error } = await supabase.auth.signInWithPassword({ email: values.email.trim().toLowerCase(), password: values.password })
  if (error) { message.textContent = 'E-mailadres of wachtwoord is niet juist.'; message.classList.add('is-error'); setBusy(button, false, 'Inloggen'); return }
  setBusy(button, false, 'Inloggen')
  await continueAfterPrimaryAuth(data.session)
})

document.querySelector('#mfa-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const button = form.querySelector('[type="submit"]')
  const message = document.querySelector('#mfa-message')
  const code = form.elements.code.value.trim()
  if (!/^\d{6}$/.test(code) || !state.mfaFactorId) { message.textContent = 'Vul een geldige zescijferige code in.'; message.classList.add('is-error'); return }
  setBusy(button, true, 'Controleren'); message.textContent = ''; message.classList.remove('is-error')
  const challenge = await supabase.auth.mfa.challenge({ factorId: state.mfaFactorId })
  if (challenge.error) { message.textContent = challenge.error.message; message.classList.add('is-error'); setBusy(button, false, 'Controleren'); return }
  const verification = await supabase.auth.mfa.verify({ factorId: state.mfaFactorId, challengeId: challenge.data.id, code })
  if (verification.error) { message.textContent = 'De code is niet juist of verlopen. Gebruik de nieuwste code uit je app.'; message.classList.add('is-error'); setBusy(button, false, 'Controleren'); form.elements.code.select(); return }
  const { data: { session } } = await supabase.auth.getSession()
  setBusy(button, false, 'Controleren')
  await showAdmin(session)
})

document.querySelector('#mfa-sign-out').addEventListener('click', () => supabase.auth.signOut())

document.querySelector('#reset-password').addEventListener('click', async () => {
  const email = document.querySelector('#login-form [name="email"]').value.trim().toLowerCase()
  if (!email) { toast('Vul eerst je e-mailadres in', '', true); return }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/admin/` })
  if (error) { toast('E-mail versturen mislukt', error.message, true); return }
  toast('Herstellink verstuurd', 'Controleer je inbox.')
})

document.querySelector('#sign-out').addEventListener('click', () => { stopLiveUpdates(); supabase.auth.signOut() })
document.querySelector('#notification-button').addEventListener('click', () => { window.location.hash = 'activity' })
document.querySelector('#account-button').addEventListener('click', () => { window.location.hash = 'settings'; window.setTimeout(() => renderSettings('security'), 0) })
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
