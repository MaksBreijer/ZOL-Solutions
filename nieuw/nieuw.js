document.documentElement.classList.add('js')

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Navigatie: donker na scrollen, verbergen bij omlaag scrollen, mobiel menu
const nav = document.querySelector('[data-nav]')
const toggle = document.querySelector('.nav-toggle')
const links = document.getElementById('nav-links')
const mobileBar = document.querySelector('.mobile-bar')
let lastY = 0

function setMenu(open) {
  toggle.setAttribute('aria-expanded', String(open))
  toggle.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen')
  links.classList.toggle('is-open', open)
  document.body.style.overflow = open ? 'hidden' : ''
}
toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'))
links.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)))
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setMenu(false) })

function onScroll() {
  const y = window.scrollY
  nav.classList.toggle('is-scrolled', y > 40)
  nav.classList.toggle('is-hidden', y > lastY && y > window.innerHeight && !links.classList.contains('is-open'))
  mobileBar.classList.toggle('is-visible', y > window.innerHeight * 0.8)
  lastY = y
}
window.addEventListener('scroll', onScroll, { passive: true })
onScroll()

// Tekst en beeld komen rustig in beeld
const revealItems = document.querySelectorAll('.reveal, .media-reveal')
if ('IntersectionObserver' in window && !reduceMotion) {
  // Beelden met clip-path tellen voor de observer als onzichtbaar; daarom kijken we naar hun ouder.
  const targets = new Map()
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      targets.get(entry.target).forEach((item) => item.classList.add('in-view'))
      observer.unobserve(entry.target)
    })
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 })
  revealItems.forEach((item) => {
    const target = item.classList.contains('media-reveal') ? item.parentElement : item
    if (!targets.has(target)) targets.set(target, [])
    targets.get(target).push(item)
    observer.observe(target)
  })
} else {
  revealItems.forEach((item) => item.classList.add('in-view'))
}

// Verhaalvideo: speelt in beeld, met geluidsknop
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
