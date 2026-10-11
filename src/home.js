import './chrome.js'
import './home.css'
import './site-runtime.js'

document.documentElement.classList.add('js')

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Mobiele bestelbalk verschijnt na de hero
const mobileBar = document.querySelector('.mobile-bar')
const syncMobileBar = () => mobileBar.classList.toggle('is-visible', window.scrollY > window.innerHeight * 0.8)
window.addEventListener('scroll', syncMobileBar, { passive: true })
syncMobileBar()

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
