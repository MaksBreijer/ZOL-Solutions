import './welcome-popup.css'
import { invokePublicFunction } from './public-api.js'

const CODE_KEY = 'zol-welcome-code'
const DISMISS_KEY = 'zol-welcome-dismissed'
const DISMISS_DAYS = 14
const skip = /^\/(?:admin|zolsolutions\/admin|meting|nieuw|checkout|uitschrijven|privacy|algemene-voorwaarden)(?:\/|$)/

function read(key) { try { return localStorage.getItem(key) } catch { return null } }
function write(key, value) { try { localStorage.setItem(key, value) } catch { /* opslag niet beschikbaar */ } }

function dismissedRecently() {
  const at = Number(read(DISMISS_KEY))
  return Boolean(at) && Date.now() - at < DISMISS_DAYS * 864e5
}

function build() {
  const root = document.createElement('div')
  root.className = 'wp'
  root.hidden = true
  root.innerHTML = `
    <div class="wp-backdrop" data-wp-close></div>
    <div class="wp-card" role="dialog" aria-modal="true" aria-labelledby="wp-title">
      <button class="wp-close" type="button" data-wp-close aria-label="Sluiten">×</button>
      <div class="wp-photo" role="img" aria-label="ZOL'tjes inlegzolen naast een voetbal"></div>
      <div class="wp-body">
        <div data-wp-step="form">
          <p class="wp-kicker">Welkomstkorting</p>
          <h2 id="wp-title">10% korting op je eerste ZOL'tjes</h2>
          <p class="wp-lead">Schrijf je in voor onze nieuwsbrief en ontvang een persoonlijke kortingscode, plus onze founder story in een mailtje.</p>
          <form class="wp-form" novalidate>
            <input type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true" class="wp-trap">
            <input type="email" name="email" autocomplete="email" placeholder="Jouw e-mailadres" aria-label="E-mailadres" required>
            <button type="submit">Ja, stuur mij mijn korting</button>
            <p class="wp-error" role="alert" hidden></p>
          </form>
          <p class="wp-fine">Met inschrijven doe je mee aan de ZOL-nieuwsbrief. Uitschrijven kan altijd. Lees ons <a href="/privacy/">privacybeleid</a>.</p>
        </div>
        <div data-wp-step="done" hidden>
          <p class="wp-kicker">Gelukt</p>
          <h2>Jouw persoonlijke code</h2>
          <p class="wp-code" data-wp-code></p>
          <p class="wp-lead" data-wp-valid></p>
          <p class="wp-lead">We passen de code automatisch toe als je afrekent. Je ontvangt ook een mail met onze founder story.</p>
          <a class="wp-cta" href="/product/">Bekijk de ZOL'tjes</a>
        </div>
      </div>
    </div>`
  document.body.append(root)
  return root
}

function init() {
  if (skip.test(location.pathname) || read(CODE_KEY) || dismissedRecently()) return
  let root = null
  let shown = false

  function close() {
    if (!root) return
    root.hidden = true
    document.documentElement.classList.remove('wp-open')
    if (!read(CODE_KEY)) write(DISMISS_KEY, String(Date.now()))
    removeEventListener('keydown', onKey)
  }
  function onKey(event) { if (event.key === 'Escape') close() }

  function show() {
    if (shown || document.documentElement.classList.contains('cookie-consent-open')) return
    shown = true
    root = build()
    const form = root.querySelector('form')
    const error = root.querySelector('.wp-error')
    const submit = form.querySelector('button')
    root.addEventListener('click', (event) => { if (event.target.closest('[data-wp-close]')) close() })
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      error.hidden = true
      submit.disabled = true
      const { data, error: failure } = await invokePublicFunction('welcome-discount', { email: form.elements.email.value, company: form.elements.company.value })
      submit.disabled = false
      if (failure || !data?.code) {
        error.textContent = /geldig e-mailadres|al ontvangen|te veel pogingen/i.test(failure?.message || '') ? failure.message : 'Er ging iets mis. Probeer het zo nog eens.'
        error.hidden = false
        return
      }
      write(CODE_KEY, data.code)
      root.querySelector('[data-wp-code]').textContent = data.code
      root.querySelector('[data-wp-valid]').textContent = `Eenmalig te gebruiken en geldig tot ${data.valid_until}.`
      root.querySelector('[data-wp-step="form"]').hidden = true
      root.querySelector('[data-wp-step="done"]').hidden = false
    })
    root.hidden = false
    document.documentElement.classList.add('wp-open')
    addEventListener('keydown', onKey)
    form.elements.email.focus({ preventScroll: true })
  }

  const trigger = () => setTimeout(show, 1500)
  setTimeout(() => {
    if (document.documentElement.classList.contains('cookie-consent-open')) addEventListener('zol:cookie-consent', trigger, { once: true })
    else show()
  }, 12000)
  document.addEventListener('mouseout', (event) => { if (event.clientY <= 0 && !event.relatedTarget && hoverCapable()) show() })
}

function hoverCapable() { return matchMedia('(hover: hover)').matches }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true })
else init()
