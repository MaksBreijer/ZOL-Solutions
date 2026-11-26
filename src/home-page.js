import './font-faces.css'
import './home-page.css'
import './site-runtime.js'
import './language.js'

const v = document.getElementById('storyVideo')
const b = document.getElementById('storyPlay')
// Speelt zonder geluid af zodra de video in beeld komt; de knop zet het geluid aan of pauzeert.
new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting) v.play().catch(() => {})
  else v.pause()
}, { threshold: 0.25 }).observe(v)
b.textContent = '🔊 Geluid aan'
b.onclick = () => {
  if (v.muted) { v.muted = false; v.play(); b.textContent = '❚❚ Pauze' }
  else if (v.paused) { v.play(); b.textContent = '❚❚ Pauze' }
  else { v.pause(); b.textContent = '▶ Afspelen' }
}


const socialPhones = document.querySelector('.social-phones')
if (socialPhones && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  socialPhones.addEventListener('pointermove', (event) => {
    const box = socialPhones.getBoundingClientRect()
    socialPhones.style.setProperty('--mx', (((event.clientX - box.left) / box.width) * 2 - 1).toFixed(3))
    socialPhones.style.setProperty('--my', (((event.clientY - box.top) / box.height) * 2 - 1).toFixed(3))
  })
  socialPhones.addEventListener('pointerleave', () => {
    socialPhones.style.setProperty('--mx', '0')
    socialPhones.style.setProperty('--my', '0')
  })
}


const hotspots = document.querySelectorAll('.hs')
hotspots.forEach((spot) => {
  spot.addEventListener('click', (event) => {
    event.stopPropagation()
    const open = !spot.classList.contains('is-open')
    hotspots.forEach((other) => {
      other.classList.remove('is-open')
      other.setAttribute('aria-expanded', 'false')
    })
    spot.classList.toggle('is-open', open)
    spot.setAttribute('aria-expanded', String(open))
  })
})
document.addEventListener('click', () => {
  hotspots.forEach((spot) => {
    spot.classList.remove('is-open')
    spot.setAttribute('aria-expanded', 'false')
  })
})

// Koopbalk op mobiel: pas zichtbaar na de reviews (eerst vertrouwen, dan prijs), weg zolang het productblok in beeld is
const buybar = document.querySelector('.buybar')
const heroEl = document.querySelector('#ervaringen')
const spotEl = document.querySelector('.spot')
if (buybar && heroEl && spotEl) {
  let pastHero = false, spotVisible = false
  const sync = () => buybar.classList.toggle('is-on', pastHero && !spotVisible)
  addEventListener('scroll', () => { pastHero = heroEl.getBoundingClientRect().top < 0; sync() }, { passive: true })
  new IntersectionObserver(([e]) => { spotVisible = e.isIntersecting; sync() }).observe(spotEl)
}

// Headervideo: in de admin (Media → ★) in te stellen; anders blijft de standaardvideo staan
import { selectPublic } from './public-api.js'
const heroVideo = document.querySelector('.hero-bg')
if (heroVideo) {
  selectPublic('settings?select=value&key=eq.home_hero&is_public=eq.true&limit=1').then(({ data }) => {
    const url = Array.isArray(data) ? data[0]?.value?.video_url : ''
    if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co\//.test(url) || heroVideo.currentSrc === url) return
    heroVideo.innerHTML = ''
    heroVideo.src = url
    heroVideo.play().catch(() => {})
  })
}
