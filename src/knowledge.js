import './styles.css'
import './site-runtime.js'

document.documentElement.classList.add('js')
const main = document.querySelector('main')
if (main && !main.id) main.id = 'main-content'

if (!document.querySelector('.site-header')) {
  document.body.insertAdjacentHTML('afterbegin', `<a class="skip-link" href="#main-content">Meteen naar de inhoud</a><header class="site-header"><nav class="nav-shell" aria-label="Hoofdnavigatie"><a class="brand" href="/" aria-label="ZOL Solutions home"><img src="/media/zol-logo.png" alt="ZOL Solutions"></a><div class="nav-links" id="nav-links"><a href="/">Home</a><a href="/product/">De ZOL'tjes</a><a href="/over-ons/">Ons verhaal</a><a href="/kennisbank/">Kennisbank</a><a href="/contact/">Contact</a></div><a class="nav-cta" href="/product/">Bekijk de zool</a><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="nav-links" aria-label="Menu openen"><span></span><span></span></button></nav></header>`)
}

if (!document.querySelector('.site-footer')) {
  document.body.insertAdjacentHTML('beforeend', `<footer class="site-footer"><a class="footer-brand" href="/" aria-label="ZOL Solutions home"><img src="/media/zol-logo.png" alt="ZOL Solutions"></a><p>Zachter landen. Beter sporten.</p><div class="footer-contact"><a href="/product/">De ZOL'tjes</a><a href="/over-ons/">Over ons</a><a href="/kennisbank/">Kennisbank</a><a href="/contact/">Contact</a></div><div class="footer-legal"><span>© 2026 ZOL Solutions</span><a href="/privacy/">Privacy</a><a href="/algemene-voorwaarden/">Voorwaarden</a></div></footer>`)
}

const button = document.querySelector('.menu-toggle')
const navigation = document.querySelector('.nav-links')
button?.addEventListener('click', () => {
  const open = button.getAttribute('aria-expanded') === 'true'
  button.setAttribute('aria-expanded', String(!open))
  button.setAttribute('aria-label', open ? 'Menu openen' : 'Menu sluiten')
  navigation?.classList.toggle('is-open', !open)
})

document.querySelectorAll('.reveal').forEach((element) => element.classList.add('in-view'))

const article = document.querySelector('.article-content')
const heroInner = document.querySelector('.knowledge-hero-inner')
if (article && heroInner) {
  const articleName = document.title.replace(/\s+[—|-]\s+ZOL Solutions$/, '')
  const breadcrumb = document.createElement('nav')
  breadcrumb.className = 'knowledge-breadcrumb'
  breadcrumb.setAttribute('aria-label', 'Broodkruimel')
  const homeLink = document.createElement('a')
  homeLink.href = '/'
  homeLink.textContent = 'Home'
  const knowledgeLink = document.createElement('a')
  knowledgeLink.href = '/kennisbank/'
  knowledgeLink.textContent = 'Kennisbank'
  const current = document.createElement('span')
  current.setAttribute('aria-current', 'page')
  current.textContent = articleName
  breadcrumb.append(homeLink, document.createTextNode(' / '), knowledgeLink, document.createTextNode(' / '), current)
  heroInner.prepend(breadcrumb)

  const isUpdatedToday = ['/kennisbank/hielpijn-bij-kinderen/', '/kennisbank/inlegzolen-bij-ziekte-van-sever/'].includes(window.location.pathname)
  const meta = document.createElement('p')
  meta.className = 'article-meta'
  meta.innerHTML = `Redactie ZOL Solutions <span aria-hidden="true">·</span> Bijgewerkt <time datetime="${isUpdatedToday ? '2026-09-02' : '2026-09-01'}">${isUpdatedToday ? '2 september 2026' : '1 september 2026'}</time>`
  article.prepend(meta)

  if (!article.querySelector('.article-sources')) {
    const sources = document.createElement('section')
    sources.className = 'article-sources'
    sources.setAttribute('aria-labelledby', 'article-sources-heading')
    sources.innerHTML = '<h2 id="article-sources-heading">Bronnen</h2><p>De medische basisinformatie op deze pagina is gecontroleerd aan de hand van openbare informatie van:</p><ul><li><a href="https://www.cuh.nhs.uk/patient-information/severs-diseasesevers-disease/">Cambridge University Hospitals NHS — Sever\'s disease</a></li><li><a href="https://www.clinicalguidelines.scot.nhs.uk/rhc-for-health-professionals/guidelines/primary-care-referral-guidelines/orthopaedic-pre-referral-guidance/heel-pain-in-children-advice-for-referrers/">NHS Greater Glasgow and Clyde — Heel pain in children</a></li></ul>'
    article.append(sources)
  }
}
