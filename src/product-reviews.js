import { rpcPublic } from './public-api.js'
import { trackEvent } from './site-runtime.js'
import { renderReviews, reviewStructuredData } from './product-reviews-core.js'

const PRODUCT_SLUG = 'zol-inlegzolen'
const root = document.querySelector('[data-product-reviews]')

function canonicalUrl() {
  return document.querySelector('link[rel="canonical"]')?.href || `${window.location.origin}${window.location.pathname}`
}

function publishStructuredData(data) {
  document.querySelector('script[data-review-structured-data]')?.remove()
  const structuredData = reviewStructuredData(data, canonicalUrl())
  if (!structuredData) return
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.dataset.reviewStructuredData = ''
  script.textContent = JSON.stringify(structuredData).replaceAll('<', '\\u003c')
  document.head.append(script)
}

async function loadReviews() {
  const { data, error } = await rpcPublic('get_product_reviews', { p_product_slug: PRODUCT_SLUG, p_limit: 50 })
  if (error) return
  renderReviews(root, data, document.documentElement.lang)
  publishStructuredData(data)
}

function initializeForm() {
  const form = root.querySelector('[data-review-form]')
  const message = root.querySelector('[data-review-message]')
  const toggles = root.querySelectorAll('[data-review-toggle]')
  const opener = root.querySelector('.product-review-write-link')
  if (!form) return

  function showMessage(text, state = '') {
    if (!message) return
    message.textContent = text
    message.className = `product-review-form-message${state ? ` is-${state}` : ''}`
  }

  function setOpen(open) {
    form.hidden = !open
    opener?.setAttribute('aria-expanded', String(open))
    if (open) {
      form.classList.remove('is-success')
      showMessage('')
      form.querySelector('input[name="rating"]')?.focus({ preventScroll: true })
      form.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' })
    } else opener?.focus({ preventScroll: true })
  }

  toggles.forEach((toggle) => toggle.addEventListener('click', () => setOpen(form.hidden)))
  if (window.location.hash === '#review-schrijven') setOpen(true)

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(form))
    const rating = Number(values.rating)
    if (!(rating >= 1 && rating <= 5)) { showMessage('Kies eerst een score van 1 tot 5 sterren.', 'error'); return }
    if (String(values.title || '').trim().length < 2) { showMessage('Geef je review een korte titel.', 'error'); form.elements.title.focus(); return }
    if (String(values.body || '').trim().length < 10) { showMessage('Schrijf minimaal 10 tekens over je ervaring.', 'error'); form.elements.body.focus(); return }
    if (String(values.author_name || '').trim().length < 2) { showMessage('Vul je voornaam in.', 'error'); form.elements.author_name.focus(); return }
    const email = String(values.email || '').trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMessage('Controleer je e-mailadres of laat het veld leeg.', 'error'); form.elements.email.focus(); return }
    if (!form.elements.consent.checked) { showMessage('Vink aan dat we je review en voornaam mogen tonen.', 'error'); return }

    const button = form.querySelector('[type="submit"]')
    button.disabled = true
    showMessage('Review versturen…')
    const { data, error } = await rpcPublic('submit_product_review', {
      p_rating: rating,
      p_title: values.title,
      p_body: values.body,
      p_author_name: values.author_name,
      p_email: email || null,
      p_company: values.company || '',
    })
    button.disabled = false
    if (error || !data?.success) {
      showMessage(error?.message && !/fetch|network/i.test(error.message) ? error.message : 'Versturen lukt nu niet. Probeer het straks opnieuw.', 'error')
      trackEvent('review_error', { rating })
      return
    }
    form.reset()
    form.classList.add('is-success')
    showMessage('Bedankt voor je review! We lezen hem en plaatsen hem daarna op deze pagina.', 'success')
    trackEvent('review_submitted', { rating })
  })
}

if (root) {
  initializeForm()
  void loadReviews()
}
