import './fonts.css'
import './chrome.css'
import { bindCartCounters } from './cart.js'

// Gedeelde navigatie: actieve link, scroll-staat, verbergen bij omlaag scrollen en mobiel menu.
const header = document.querySelector('[data-zol-header]')

if (header) {
  const links = header.querySelector('.zh-links')
  const toggle = header.querySelector('[data-menu-toggle]')
  const overHero = header.classList.contains('zh--over-hero')
  let lastY = 0

  const path = window.location.pathname
  links.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href')
    if (!href.includes('#') && href !== '/' && path.startsWith(href)) link.setAttribute('aria-current', 'page')
  })

  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open))
    toggle.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen')
    links.classList.toggle('is-open', open)
    document.body.style.overflow = open ? 'hidden' : ''
  }
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'))
  links.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)))
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setMenu(false) })

  const onScroll = () => {
    const y = window.scrollY
    header.classList.toggle('is-scrolled', y > 40)
    const threshold = overHero ? window.innerHeight : 200
    header.classList.toggle('is-hidden', y > lastY && y > threshold && !links.classList.contains('is-open'))
    lastY = y
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
}

bindCartCounters()
