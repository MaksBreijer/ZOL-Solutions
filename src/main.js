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

const revealElements = document.querySelectorAll('.reveal')

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return

        entry.target.classList.add('in-view')
        observer.unobserve(entry.target)
      })
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  )

  revealElements.forEach((element) => {
    element.classList.add('reveal-ready')
    revealObserver.observe(element)
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
