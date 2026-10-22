import './source-nudge.css'

// Kleine uitnodiging om ZOL als voorkeursbron op Google te kiezen, onderaan een gelezen kennisbank-artikel.
// Rustig houden: pas na de cookiekeuze, niet naast de kortingspopup, en terug tot de bezoeker erop klikt.
const KEY = 'zol-source-nudge'
const REMEMBER_DAYS = 180
const MIN_SECONDS = 12
const MIN_PROGRESS = 0.4
const sourceUrl = 'https://www.google.com/preferences/source?q=zolsolutions.nl'

function read(key) { try { return localStorage.getItem(key) } catch { return null } }
function write(key, value) { try { localStorage.setItem(key, value) } catch { /* opslag niet beschikbaar */ } }

function readSession(key) { try { return sessionStorage.getItem(key) } catch { return null } }
function writeSession(key, value) { try { sessionStorage.setItem(key, value) } catch { /* opslag niet beschikbaar */ } }

// Alleen een klik op de knop telt als afgehandeld; wegklikken verbergt de melding tot het volgende bezoek.
function handledRecently() {
  const at = Number(read(KEY))
  return (Boolean(at) && Date.now() - at < REMEMBER_DAYS * 864e5) || Boolean(readSession(KEY))
}

function init() {
  const article = document.querySelector('.article-content')
  if (!article || handledRecently()) return
  const started = Date.now()
  let card = null

  function progress() {
    const box = article.getBoundingClientRect()
    return (innerHeight - box.top) / box.height
  }

  function close(clicked) {
    if (clicked === true) write(KEY, String(Date.now()))
    else writeSession(KEY, '1')
    card?.classList.remove('is-in')
    setTimeout(() => card?.remove(), 300)
    removeEventListener('scroll', check)
    clearInterval(timer)
  }

  function show() {
    card = document.createElement('aside')
    card.className = 'sn'
    card.setAttribute('aria-label', 'ZOL als voorkeursbron op Google')
    card.innerHTML = `
      <button class="sn-close" type="button" aria-label="Sluiten">×</button>
      <p class="sn-title">Vond je dit nuttig?</p>
      <p class="sn-text">Kies ZOL als voorkeursbron, dan laat Google onze nieuwe artikelen vaker aan je zien.</p>
      <a class="sn-row" href="${sourceUrl}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true"><img src="/favicon-192.png" alt="" width="34" height="34"><span><b>ZOL Solutions</b><small>zolsolutions.nl</small></span><u></u></a>
      <a class="sn-btn" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Ja, laat ZOL vaker zien ↗</a>`
    card.querySelector('.sn-close').addEventListener('click', () => close(false))
    card.querySelectorAll('.sn-btn, .sn-row').forEach((link) => link.addEventListener('click', () => setTimeout(() => close(true), 0)))
    document.body.append(card)
    requestAnimationFrame(() => card.classList.add('is-in'))
  }

  function check() {
    if (card) return
    const html = document.documentElement
    if (html.classList.contains('cookie-consent-open') || html.classList.contains('wp-open')) return
    if (Date.now() - started < MIN_SECONDS * 1000 || progress() < MIN_PROGRESS) return
    show()
  }

  addEventListener('scroll', check, { passive: true })
  const timer = setInterval(check, 3000)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true })
else init()
