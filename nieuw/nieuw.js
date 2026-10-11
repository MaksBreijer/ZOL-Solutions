document.documentElement.classList.add('js')

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))

// Navigatie: compacter na scrollen, mobiel menu
const nav = document.querySelector('[data-nav]')
const toggle = document.querySelector('.nav-toggle')
const links = document.querySelector('.nav-links')
const mobileBar = document.querySelector('.mobile-bar')

function closeMenu() {
  toggle.setAttribute('aria-expanded', 'false')
  toggle.setAttribute('aria-label', 'Menu openen')
  links.classList.remove('is-open')
}

toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true'
  toggle.setAttribute('aria-expanded', String(open))
  toggle.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen')
  links.classList.toggle('is-open', open)
})
links.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu))
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu() })

// Scrollgestuurde onderdelen: hero-video groeit uit, signalenlijst licht op, productfoto parallax
const hero = document.querySelector('[data-hero]')
const signs = document.querySelector('[data-signs]')
const signItems = [...signs.querySelectorAll('.signs-list li')]
const signImages = [...signs.querySelectorAll('.signs-bg img')]
const signIndex = signs.querySelector('.signs-detail-index')
const signText = signs.querySelector('.signs-detail-text')
const parallax = document.querySelector('[data-parallax] img')
let activeSign = 0

function progressThrough(element) {
  const rect = element.getBoundingClientRect()
  const distance = rect.height - window.innerHeight
  return distance > 0 ? clamp(-rect.top / distance) : 0
}

function setSign(index) {
  if (index === activeSign) return
  activeSign = index
  signItems.forEach((item, i) => item.classList.toggle('is-active', i === index))
  signImages.forEach((image, i) => image.classList.toggle('is-active', i === index))
  signIndex.textContent = `0${index + 1} / 0${signItems.length}`
  signText.textContent = signItems[index].querySelector('p').textContent
}

function onScroll() {
  const y = window.scrollY
  nav.classList.toggle('is-scrolled', y > 40)
  mobileBar.classList.toggle('is-visible', y > window.innerHeight * 0.8)

  if (!reduceMotion) hero.style.setProperty('--p', progressThrough(hero).toFixed(4))

  const signProgress = progressThrough(signs)
  setSign(Math.min(signItems.length - 1, Math.floor(signProgress * signItems.length)))

  if (parallax && !reduceMotion) {
    const rect = parallax.parentElement.getBoundingClientRect()
    const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight
    parallax.style.setProperty('--shift', `${(-7 + offset * 7).toFixed(2)}%`)
  }
}

let ticking = false
window.addEventListener('scroll', () => {
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => { onScroll(); ticking = false })
}, { passive: true })
window.addEventListener('resize', onScroll)
onScroll()

// Bij reduced motion: hero meteen in eindstand tonen
if (reduceMotion) hero.style.setProperty('--p', '0')

// Elementen laten verschijnen bij in beeld komen
const reveals = document.querySelectorAll('.reveal')
if ('IntersectionObserver' in window && !reduceMotion) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('in-view')
      observer.unobserve(entry.target)
    })
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
  reveals.forEach((element) => observer.observe(element))
} else {
  reveals.forEach((element) => element.classList.add('in-view'))
}

// Verhaalvideo: speelt in beeld, geluidsknop
const storyVideo = document.querySelector('[data-story-video]')
const storySound = document.querySelector('[data-story-sound]')
new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting) { if (!reduceMotion || !storyVideo.muted) storyVideo.play().catch(() => {}) }
  else storyVideo.pause()
}, { threshold: 0.35 }).observe(storyVideo)
storySound.addEventListener('click', () => {
  storyVideo.muted = !storyVideo.muted
  storySound.setAttribute('aria-pressed', String(!storyVideo.muted))
  storySound.setAttribute('aria-label', storyVideo.muted ? 'Geluid aanzetten' : 'Geluid uitzetten')
  if (!storyVideo.muted) storyVideo.play().catch(() => {})
})

// FAQ: één vraag tegelijk open
const faqItems = document.querySelectorAll('[data-accordion] details')
faqItems.forEach((item) => item.addEventListener('toggle', () => {
  if (item.open) faqItems.forEach((other) => { if (other !== item) other.open = false })
}))

// Stappen: tabbladen met pijltjestoetsen
const tabs = [...document.querySelectorAll('[data-steps] [role="tab"]')]
function selectTab(tab) {
  tabs.forEach((other) => {
    const selected = other === tab
    other.setAttribute('aria-selected', String(selected))
    other.tabIndex = selected ? 0 : -1
    document.getElementById(other.getAttribute('aria-controls')).hidden = !selected
  })
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab))
  tab.addEventListener('keydown', (event) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const next = tabs[(index + step + tabs.length) % tabs.length]
    selectTab(next)
    next.focus()
  })
})

// Ervaringen: wisselen tussen citaten, automatisch elke 7 seconden
const quotes = [...document.querySelectorAll('[data-reviews] .quote')]
const quoteButtons = [...document.querySelectorAll('[data-quote]')]
let quoteIndex = 0
function showQuote(index) {
  quoteIndex = index
  quotes.forEach((quote, i) => quote.classList.toggle('is-active', i === index))
  quoteButtons.forEach((button, i) => button.setAttribute('aria-current', String(i === index)))
}
quoteButtons.forEach((button, i) => button.addEventListener('click', () => { showQuote(i); clearInterval(quoteTimer) }))
const quoteTimer = reduceMotion ? null : setInterval(() => showQuote((quoteIndex + 1) % quotes.length), 7000)
