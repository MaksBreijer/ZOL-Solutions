import { supabase } from './supabase-client.js'

const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/'
const pageName = normalizedPath === '/'
  ? 'home'
  : normalizedPath.slice(1).replaceAll('/', '.')

function getSessionId() {
  const key = 'zol_session_id'
  let sessionId = sessionStorage.getItem(key)
  if (!sessionId) {
    sessionId = crypto.randomUUID()
    sessionStorage.setItem(key, sessionId)
  }
  return sessionId
}

export async function trackEvent(eventName, metadata = {}) {
  try {
    const search = new URLSearchParams(window.location.search)
    const attribution = Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
      .map((key) => [key, search.get(key)])
      .filter(([, value]) => value))
    const { error } = await supabase.from('analytics_events').insert({
      session_id: getSessionId(),
      event_name: eventName,
      page: `${window.location.pathname}${window.location.search}`.slice(0, 300),
      metadata: {
        device: window.innerWidth < 768 ? 'Mobiel' : window.innerWidth < 1100 ? 'Tablet' : 'Desktop',
        referrer: document.referrer || 'Direct',
        language: navigator.language || 'nl-NL',
        ...attribution,
        ...metadata,
      },
    })
    if (error && import.meta.env.DEV) console.warn('Analytics-event niet opgeslagen:', error.message)
  } catch {
    // Analytics mag de website nooit blokkeren.
  }
}

function applyEntry(entry) {
  if (!entry.selector) return
  document.querySelectorAll(entry.selector).forEach((element) => {
    if (entry.content_type === 'video' && element.tagName === 'IMG') {
      const video = document.createElement('video')
      video.src = entry.value
      video.autoplay = true
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.setAttribute('aria-label', element.alt || entry.label)
      element.replaceWith(video)
      return
    }
    if (entry.content_type === 'image' && (element.tagName === 'VIDEO' || element.tagName === 'SOURCE')) {
      const image = document.createElement('img')
      image.src = entry.value
      image.alt = entry.label
      if (element.tagName === 'SOURCE' && element.parentElement?.tagName === 'VIDEO') element.parentElement.replaceWith(image)
      else element.replaceWith(image)
      return
    }
    if (entry.content_type === 'icon') {
      if (entry.value.startsWith('builtin:')) return
      element.dataset.cmsIcon = 'true'
      if (/^(https?:\/\/|\/|data:image\/)/i.test(entry.value) && element.tagName !== 'IMG') {
        const image = document.createElement('img')
        image.src = entry.value
        image.alt = entry.label
        element.replaceChildren(image)
      } else if (element.tagName === 'IMG') element.src = entry.value
      else element.textContent = entry.value
      return
    }
    if (entry.attribute === 'innerHTML') element.innerHTML = entry.value
    else if (entry.attribute === 'textContent') element.textContent = entry.value
    else if (entry.attribute === 'style.backgroundColor') element.style.backgroundColor = entry.value
    else if (['src', 'href', 'alt', 'title'].includes(entry.attribute)) {
      element.setAttribute(entry.attribute, entry.value)
      if (element.tagName === 'SOURCE' && entry.attribute === 'src') element.parentElement?.load()
    }
  })
}

async function loadCms() {
  const [{ data: entries }, { data: settings }] = await Promise.all([
    supabase.from('site_content').select('*').in('page', ['global', pageName]).eq('active', true).order('sort_order'),
    supabase.from('settings').select('key,value').in('key', ['theme', 'seo_defaults']).eq('is_public', true),
  ])

  ;(entries || []).forEach(applyEntry)
  const theme = settings?.find((setting) => setting.key === 'theme')?.value
  if (theme) {
    const root = document.documentElement
    if (theme.primary) root.style.setProperty('--blue', theme.primary)
    if (theme.accent) root.style.setProperty('--orange', theme.accent)
    if (theme.ink) root.style.setProperty('--ink', theme.ink)
    if (theme.background) root.style.setProperty('--paper', theme.background)
  }

  const seo = settings?.find((setting) => setting.key === 'seo_defaults')?.value
  if (seo && pageName === 'home') {
    if (seo.title) document.title = seo.title
    const description = document.querySelector('meta[name="description"]')
    if (description && seo.description) description.content = seo.description
  }
}

loadCms().catch(() => {})
trackEvent('page_view', { page: pageName })

if (pageName === 'product') trackEvent('product_view', { slug: 'zol-inlegzolen' })

document.addEventListener('click', (event) => {
  const target = event.target.closest('a, button')
  if (!target || target.closest('.admin-app')) return
  const isCta = target.matches('.button, .nav-cta, .cart-link, .text-link, .knowledge-index-card, .contact-path a, .checkout-submit')
  if (!isCta) return
  trackEvent('cta_click', {
    label: (target.textContent || target.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 120),
    destination: target instanceof HTMLAnchorElement ? target.href.slice(0, 300) : '',
  })
})
