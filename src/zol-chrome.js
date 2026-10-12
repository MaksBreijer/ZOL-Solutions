import './font-faces.css'
import './zol-chrome.css'

const nav = document.querySelector('.zn')
if (nav) {
  const hero = nav.classList.contains('zn--hero') ? document.querySelector('.hero') : null
  if (hero) {
    const sync = () => nav.classList.toggle('is-solid', hero.getBoundingClientRect().bottom <= nav.offsetHeight + 10)
    addEventListener('scroll', sync, { passive: true })
    addEventListener('resize', sync)
    sync()
  } else {
    document.body.classList.add('has-zn')
  }
  const toggle = nav.querySelector('.zn-toggle')
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open')
    toggle.setAttribute('aria-expanded', String(open))
    toggle.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen')
    if (open && hero) nav.classList.add('is-solid')
    else if (hero) dispatchEvent(new Event('scroll'))
  })
}
