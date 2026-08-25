import './cookie-consent.css'

const CONSENT_COOKIE = 'zol_cookie_choice_v1'
const CONSENT_MAX_AGE = 60 * 60 * 24 * 365
const ALLOWED_CHOICES = new Set(['accepted', 'necessary'])
let memoryChoice = null
let preferencesOpener = null

function cookieValue() {
  try {
    const value = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${CONSENT_COOKIE}=`))
      ?.split('=')[1]
    return ALLOWED_CHOICES.has(value) ? value : null
  } catch { return memoryChoice }
}

export function getCookieConsent() {
  return cookieValue() || memoryChoice
}

export function hasAnalyticsConsent() {
  return getCookieConsent() === 'accepted'
}

function saveChoice(choice) {
  memoryChoice = choice
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`
  } catch { /* De keuze blijft voor deze pagina in het geheugen beschikbaar. */ }
}

function currentChoiceLabel() {
  if (getCookieConsent() === 'accepted') return 'Huidige keuze: noodzakelijke opslag en analytics.'
  if (getCookieConsent() === 'necessary') return 'Huidige keuze: alleen noodzakelijke opslag.'
  return ''
}

function ensureConsentUi() {
  if (document.querySelector('[data-cookie-consent]')) return
  document.body.insertAdjacentHTML('beforeend', `
    <aside class="cookie-consent" data-cookie-consent role="dialog" aria-modal="false" aria-labelledby="cookie-consent-title" hidden>
      <div class="cookie-consent-copy">
        <span class="cookie-consent-label">Privacyvoorkeur</span>
        <h2 id="cookie-consent-title">Jouw privacy, jouw keuze.</h2>
        <p>We gebruiken noodzakelijke browseropslag voor je winkelwagen en veilig afrekenen. Met jouw toestemming meten we beperkte gebruiksgegevens om de website te verbeteren. We gebruiken geen advertentiecookies.</p>
        <p class="cookie-consent-current" data-cookie-current></p>
        <a href="/privacy/#cookies">Lees hoe we cookies en browseropslag gebruiken</a>
      </div>
      <div class="cookie-consent-actions" aria-label="Cookiekeuze">
        <button type="button" data-cookie-choice="necessary">Alleen noodzakelijk</button>
        <button type="button" data-cookie-choice="accepted">Alles accepteren</button>
      </div>
    </aside>
    <button class="cookie-preferences-trigger" data-cookie-preferences type="button">Cookievoorkeuren</button>
  `)

  const panel = document.querySelector('[data-cookie-consent]')
  const current = panel.querySelector('[data-cookie-current]')
  panel.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-cookie-choice]')?.dataset.cookieChoice
    if (!ALLOWED_CHOICES.has(choice)) return
    saveChoice(choice)
    panel.hidden = true
    document.documentElement.classList.remove('cookie-consent-open')
    window.dispatchEvent(new CustomEvent('zol:cookie-consent', { detail: { choice } }))
    preferencesOpener?.focus()
    preferencesOpener = null
  })

  document.querySelector('[data-cookie-preferences]').addEventListener('click', (event) => {
    preferencesOpener = event.currentTarget
    current.textContent = currentChoiceLabel()
    current.hidden = !current.textContent
    panel.hidden = false
    document.documentElement.classList.add('cookie-consent-open')
    panel.querySelector('[data-cookie-choice="necessary"]').focus()
  })

  if (!getCookieConsent()) {
    current.hidden = true
    panel.hidden = false
    document.documentElement.classList.add('cookie-consent-open')
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureConsentUi, { once: true })
else ensureConsentUi()
