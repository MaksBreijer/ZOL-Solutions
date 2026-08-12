import { supabase } from './supabase-client.js'

const pageName = window.location.pathname.startsWith('/product')
  ? 'product'
  : window.location.pathname.startsWith('/contact')
    ? 'contact'
    : 'home'

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
    await supabase.from('analytics_events').insert({
      session_id: getSessionId(),
      event_name: eventName,
      page: `${window.location.pathname}${window.location.search}`.slice(0, 300),
      metadata,
    })
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
    if (entry.content_type === 'image' && element.tagName === 'VIDEO') {
      const image = document.createElement('img')
      image.src = entry.value
      image.alt = entry.label
      element.replaceWith(image)
      return
    }
    if (entry.content_type === 'icon' && /^https?:\/\//.test(entry.value) && element.tagName !== 'IMG') {
      const image = document.createElement('img')
      image.src = entry.value
      image.alt = entry.label
      element.replaceChildren(image)
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
