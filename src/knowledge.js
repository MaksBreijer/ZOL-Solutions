import './styles.css'
import './theme.css'
import './chrome.js'
import './site-runtime.js'

document.documentElement.classList.add('js')
const main = document.querySelector('main')
if (main && !main.id) main.id = 'main-content'

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

  const expandedArticles = ['/kennisbank/hielpijn-tijdens-sporten/', '/kennisbank/kind-pijn-aan-hiel-na-sporten/', '/kennisbank/groeipijn-in-de-hiel/', '/kennisbank/oefeningen-bij-ziekte-van-sever/', '/kennisbank/sporten-met-ziekte-van-sever/', '/kennisbank/sportschoenen-bij-ziekte-van-sever/', '/kennisbank/ziekte-van-sever-voetbal/', '/kennisbank/ziekte-van-sever-hockey/']
  const [updatedIso, updatedLabel] = ['/kennisbank/ziekte-van-sever/', '/kennisbank/inlegzolen-bij-ziekte-van-sever/'].includes(window.location.pathname)
    ? ['2026-10-11', '11 oktober 2026']
    : window.location.pathname === '/kennisbank/inlegzolen-voor-kinderen/'
    ? ['2026-10-03', '3 oktober 2026']
    : expandedArticles.includes(window.location.pathname)
    ? ['2026-10-02', '2 oktober 2026']
    : window.location.pathname === '/kennisbank/hielpijn-bij-kinderen/'
      ? ['2026-09-02', '2 september 2026']
      : ['2026-09-01', '1 september 2026']
  const meta = document.createElement('p')
  meta.className = 'article-meta'
  meta.innerHTML = `Redactie ZOL Solutions <span aria-hidden="true">·</span> Bijgewerkt <time datetime="${updatedIso}">${updatedLabel}</time>`
  article.prepend(meta)

  if (!article.querySelector('.article-sources')) {
    const sources = document.createElement('section')
    sources.className = 'article-sources'
    sources.setAttribute('aria-labelledby', 'article-sources-heading')
    sources.innerHTML = '<h2 id="article-sources-heading">Bronnen</h2><p>De medische basisinformatie op deze pagina is gecontroleerd aan de hand van openbare informatie van:</p><ul><li><a href="https://www.cuh.nhs.uk/patient-information/severs-diseasesevers-disease/">Cambridge University Hospitals NHS — Sever\'s disease</a></li><li><a href="https://www.clinicalguidelines.scot.nhs.uk/rhc-for-health-professionals/guidelines/primary-care-referral-guidelines/orthopaedic-pre-referral-guidance/heel-pain-in-children-advice-for-referrers/">NHS Greater Glasgow and Clyde — Heel pain in children</a></li></ul>'
    article.append(sources)
  }
}
