import './styles.css'
import './legal.css'
import './theme.css'
import './chrome.js'
import './site-runtime.js'

document.documentElement.classList.add('js')

const activeSection = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return
    document.querySelectorAll('.legal-toc a').forEach((link) => {
      link.classList.toggle('is-active', link.hash === `#${entry.target.id}`)
    })
  })
}, { rootMargin: '-18% 0px -68% 0px' })

document.querySelectorAll('.legal-section[id]').forEach((section) => activeSection.observe(section))
