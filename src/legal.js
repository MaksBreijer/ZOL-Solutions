import './styles.css'
import './legal.css'
import { bindCartCounters } from './cart.js'

document.documentElement.classList.add('js')
bindCartCounters()

const menuButton = document.querySelector('.menu-toggle')
const navigation = document.querySelector('.nav-links')

function closeMenu() {
  menuButton?.setAttribute('aria-expanded', 'false')
  menuButton?.setAttribute('aria-label', 'Menu openen')
  navigation?.classList.remove('is-open')
}

menuButton?.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true'
  menuButton.setAttribute('aria-expanded', String(!isOpen))
  menuButton.setAttribute('aria-label', isOpen ? 'Menu openen' : 'Menu sluiten')
  navigation?.classList.toggle('is-open', !isOpen)
})

navigation?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu))
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu() })

const activeSection = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return
    document.querySelectorAll('.legal-toc a').forEach((link) => {
      link.classList.toggle('is-active', link.hash === `#${entry.target.id}`)
    })
  })
}, { rootMargin: '-18% 0px -68% 0px' })

document.querySelectorAll('.legal-section[id]').forEach((section) => activeSection.observe(section))
