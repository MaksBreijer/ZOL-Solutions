import './styles.css'

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

const productCheckoutLink = document.querySelector('.product-checkout-link')
const sizeOptions = document.querySelectorAll('.size-selector input[name="size"]')

if (productCheckoutLink && sizeOptions.length) {
  sizeOptions.forEach((option) => {
    option.addEventListener('change', () => {
      if (!option.checked) return

      const selectedSize = option.dataset.size
      productCheckoutLink.href = `https://zolsolutions.nl/products/zol-inlegzolen-voor-kinderen-met-hielpijn?variant=${option.value}`
      productCheckoutLink.firstChild.textContent = `Kies ${selectedSize} en bestel `
    })
  })
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

if (contactForm) {
  contactForm.addEventListener('submit', (event) => {
    event.preventDefault()

    const formData = new FormData(contactForm)
    const name = String(formData.get('name') || '')
    const email = String(formData.get('email') || '')
    const phone = String(formData.get('phone') || 'Niet ingevuld')
    const topic = String(formData.get('topic') || 'Contact via de website')
    const message = String(formData.get('message') || '')
    const subject = encodeURIComponent(`${topic} — ${name}`)
    const body = encodeURIComponent(
      `Naam: ${name}\nE-mailadres: ${email}\nTelefoonnummer: ${phone}\n\nBericht:\n${message}`,
    )
    const formStatus = contactForm.querySelector('.form-status')

    formStatus.textContent = 'Je e-mailapp wordt geopend met het bericht klaar om te versturen.'
    window.location.href = `mailto:info@zolsolutions.nl?subject=${subject}&body=${body}`
  })
}
