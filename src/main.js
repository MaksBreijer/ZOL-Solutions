import './styles.css'
import './site-runtime.js'
import './product-commerce.js'
import { supabase } from './supabase-client.js'

document.documentElement.classList.add('js')

const menuButton = document.querySelector('.menu-toggle')
const navigation = document.querySelector('.nav-links')

function closeMenu() {
  if (!menuButton || !navigation) return

  menuButton.setAttribute('aria-expanded', 'false')
  menuButton.setAttribute('aria-label', 'Menu openen')
  navigation.classList.remove('is-open')
}

if (menuButton && navigation) {
  menuButton.addEventListener('click', () => {
    const isOpen = menuButton.getAttribute('aria-expanded') === 'true'

    menuButton.setAttribute('aria-expanded', String(!isOpen))
    menuButton.setAttribute('aria-label', isOpen ? 'Menu openen' : 'Menu sluiten')
    navigation.classList.toggle('is-open', !isOpen)
  })

  navigation.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu))

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu()
  })

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.nav-shell')) closeMenu()
  })
}

const processSection = document.querySelector('#werking')
const signalSection = document.querySelector('.signal-strip')
const solutionSection = document.querySelector('#oplossing')
const storySection = document.querySelector('#ons-verhaal')
const pressSection = document.querySelector('#in-de-media')
const partnersSection = document.querySelector('#samenwerkingen')

// Houd de sterke sportvideo vooraan en laat daarna direct zien wat ZOL verkoopt.
if (signalSection && solutionSection) {
  signalSection.after(solutionSection)
}

// Bouw daarna op van probleem en techniek naar het persoonlijke verhaal en extern bewijs.
if (processSection && storySection && pressSection && partnersSection) {
  processSection.after(storySection, pressSection, partnersSection)
}

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const revealElements = document.querySelectorAll('.reveal')

if ('IntersectionObserver' in window && !prefersReducedMotion) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return

        entry.target.classList.add('in-view')
        observer.unobserve(entry.target)
      })
    },
    { rootMargin: '0px 0px -7% 0px', threshold: 0.08 },
  )

  revealElements.forEach((element, index) => {
    element.classList.add('reveal-ready')
    element.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 45}ms`)
    revealObserver.observe(element)
  })
}

const floatingProduct = document.querySelector('[data-float]')

if (floatingProduct && !prefersReducedMotion) {
  let ticking = false

  const updateProductPosition = () => {
    const rect = floatingProduct.getBoundingClientRect()
    const viewportCenter = window.innerHeight / 2
    const elementCenter = rect.top + rect.height / 2
    const offset = Math.max(-14, Math.min(14, (viewportCenter - elementCenter) * 0.025))

    floatingProduct.style.setProperty('--float-offset', `${offset}px`)
    ticking = false
  }

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(updateProductPosition)
    },
    { passive: true },
  )

  updateProductPosition()
}

document.querySelectorAll('.faq-list details').forEach((item) => {
  item.addEventListener('toggle', () => {
    if (!item.open) return

    document.querySelectorAll('.faq-list details').forEach((otherItem) => {
      if (otherItem !== item) otherItem.removeAttribute('open')
    })
  })
})

const contactForm = document.querySelector('#contact-form')

async function edgeFunctionFailure(error, data, fallback) {
  let details = data || null
  if (!details && error?.context?.clone) {
    try { details = await error.context.clone().json() } catch { /* Gebruik de veilige fallback. */ }
  }
  return { message: details?.error || fallback, saved: Boolean(details?.saved) }
}

if (contactForm) {
  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const formStatus = contactForm.querySelector('.form-status')
    const button = contactForm.querySelector('[type="submit"]')
    const payload = Object.fromEntries(new FormData(contactForm))
    button.disabled = true
    button.innerHTML = 'Bericht versturen…'
    formStatus.textContent = ''
    formStatus.classList.remove('is-error')
    const { data, error } = await supabase.functions.invoke('contact-email', { body: payload })
    if (error || data?.error) {
      const failure = await edgeFunctionFailure(error, data, 'Versturen is niet gelukt. Probeer het later opnieuw.')
      if (failure.saved) {
        contactForm.reset()
        formStatus.textContent = 'Je bericht is veilig ontvangen. De e-mailmelding wordt nog gekoppeld.'
        button.disabled = false
        button.innerHTML = 'Verstuur bericht <span>→</span>'
        return
      }
      formStatus.textContent = failure.message
      formStatus.classList.add('is-error')
      button.disabled = false
      button.innerHTML = 'Verstuur bericht <span>→</span>'
      return
    }
    contactForm.reset()
    formStatus.textContent = 'Bedankt! Je bericht is rechtstreeks naar ZOL Solutions verstuurd.'
    button.disabled = false
    button.innerHTML = 'Verstuur bericht <span>→</span>'
  })
}
