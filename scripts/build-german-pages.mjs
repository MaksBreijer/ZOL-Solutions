// Turns the built Dutch pages into real German pages under /de/, so search engines
// can read them. Runs after `vite build`, which keeps the design identical to Dutch.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { JSDOM } from 'jsdom'
import { createGermanTranslator } from '../src/german-dynamic.js'
import { germanRoutes } from '../src/german-routes.js'

const GERMAN_PAGES_PUBLIC = true
const origin = 'https://zolsolutions.nl'
const dist = join(import.meta.dirname, '..', 'dist')
const dictionary = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src', 'german.json'), 'utf8'))
const translate = createGermanTranslator(dictionary)
const excluded = 'script, style, textarea, code, pre, [translate="no"], [data-language-switcher]'
const attributes = ['alt', 'title', 'aria-label', 'placeholder']
const clean = value => value.replace(/\s+/g, ' ').trim()
const fileFor = route => join(dist, route, 'index.html')

// Sentences that referred to articles which do not exist in German yet.
const removeText = {
  '/kennisbank/': ['Speelt je kind hockey of voetbal'],
  '/kennisbank/ziekte-van-sever/': ['Lees meer bij oefeningen'],
}
const replaceText = {
  '/': [['Waarschijnlijk niet. Hielspoor', 'Wahrscheinlich nicht. Fersensporn tritt vor allem bei Erwachsenen auf. Bei Kindern von etwa 8 bis 14 Jahren mit Schmerzen an der Ferse nach dem Sport steckt meist Morbus Sever dahinter.']],
}

function innermost(doc, start) {
  return [...doc.querySelectorAll('p, li, div')].reverse().find(element => clean(element.textContent).startsWith(start))
}

function rewriteLinks(doc) {
  for (const link of [...doc.querySelectorAll('a[href^="/"]')]) {
    const url = new URL(link.getAttribute('href'), origin)
    const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
    const target = germanRoutes[path]
    if (target) { link.setAttribute('href', `${target}${url.search}${url.hash}`); continue }
    if (/\.[a-z0-9]+\/$/i.test(path)) continue
    // No German version: a Dutch page must not appear in the German journey.
    const parent = link.parentElement
    const stands = link.previousElementSibling?.tagName === 'A' || link.nextElementSibling?.tagName === 'A' || clean(parent.textContent) === clean(link.textContent)
    if (stands) link.remove()
    else link.replaceWith(...link.childNodes)
  }
}

function translateTree(node) {
  if (node.nodeType === 3) {
    if (!node.parentElement || node.parentElement.closest(excluded)) return
    if (node.parentElement.tagName === 'OPTION' && !node.parentElement.hasAttribute('value')) node.parentElement.setAttribute('value', node.parentElement.value)
    node.nodeValue = translate(node.nodeValue)
    return
  }
  if (node.nodeType !== 1 || node.matches(excluded)) return
  for (const name of attributes) if (node.hasAttribute(name)) node.setAttribute(name, translate(node.getAttribute(name)))
  node.childNodes.forEach(translateTree)
}

function setHead(doc, route, target, nlRoute) {
  doc.documentElement.lang = 'de'
  doc.title = translate(doc.title)
  doc.querySelectorAll('script[type="application/ld+json"], link[rel="alternate"][hreflang], meta[name="robots"], meta[name="googlebot"]').forEach(element => element.remove())
  const description = doc.querySelector('meta[name="description"]')
  if (description) description.content = translate(description.content)
  const url = `${origin}${target}`
  doc.querySelector('link[rel="canonical"]')?.setAttribute('href', url)
  for (const [selector, value] of [['meta[property="og:url"]', url], ['meta[property="og:locale"]', 'de_DE'], ['meta[property="og:title"]', doc.title], ['meta[name="twitter:title"]', doc.title], ['meta[property="og:image:alt"]', doc.title], ['meta[property="og:description"]', description?.content], ['meta[name="twitter:description"]', description?.content]]) {
    if (value) doc.querySelector(selector)?.setAttribute('content', value)
  }
  const add = (tag, properties) => { const element = doc.createElement(tag); Object.entries(properties).forEach(([key, value]) => element.setAttribute(key, value)); doc.head.append(element) }
  add('meta', { name: 'robots', content: GERMAN_PAGES_PUBLIC ? 'index,follow' : 'noindex,nofollow' })
  add('link', { rel: 'alternate', hreflang: 'de-DE', href: url })
  if (nlRoute) add('link', { rel: 'alternate', hreflang: 'nl-NL', href: `${origin}${nlRoute}` })
}

function addImprint(doc) {
  const terms = [...doc.querySelectorAll('.zf-legal a')].find(link => link.getAttribute('href') === '/de/agb/')
  if (!terms) return
  const link = doc.createElement('a')
  link.href = '/de/impressum/'
  link.textContent = 'Impressum'
  terms.after(doc.createTextNode(' · '), link)
}

function adaptCheckout(doc) {
  const select = doc.querySelector('select[name="country"]')
  select.insertAdjacentHTML('afterbegin', '<option value="DE" selected>Deutschland</option>')
  doc.querySelector('#delivery-promise').textContent = 'Deutschland · 3–5 Werktage'
  const postal = doc.querySelector('input[name="postal_code"]')
  postal.setAttribute('pattern', '[0-9]{5}')
  postal.setAttribute('maxlength', '5')
  postal.setAttribute('inputmode', 'numeric')
  doc.querySelector('.checkout-submit').innerHTML = 'Zahlungspflichtig bestellen <span>→</span>'
}

const audit = new Set()
function collectUntranslated(node) {
  if (node.nodeType === 3) {
    const text = clean(node.nodeValue)
    if (text && /[a-z]{3}/.test(text) && !node.parentElement.closest(excluded) && !Object.values(dictionary).includes(text)) audit.add(text)
    return
  }
  if (node.nodeType === 1 && !node.matches(excluded)) node.childNodes.forEach(collectUntranslated)
}

function write(route, dom) {
  const file = fileFor(route)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, dom.serialize())
}

let imprintSource
for (const [nlRoute, target] of Object.entries(germanRoutes)) {
  const source = readFileSync(fileFor(nlRoute), 'utf8')
  if (GERMAN_PAGES_PUBLIC) writeFileSync(fileFor(nlRoute), source.replace('</head>', `<link rel="alternate" hreflang="de-DE" href="${origin}${target}"></head>`))
  const dom = new JSDOM(source)
  const doc = dom.window.document
  for (const start of removeText[nlRoute] || []) innermost(doc, start)?.remove()
  doc.querySelectorAll('a[href="/kennisbank/inlegzolen-voor-kinderen/"]').forEach(link => { if (clean(link.textContent) === 'Lees hoe je de juiste zool kiest') link.remove() })
  for (const [start, text] of replaceText[nlRoute] || []) { const element = innermost(doc, start); if (element) element.textContent = text }
  rewriteLinks(doc)
  translateTree(doc.body)
  setHead(doc, nlRoute, target, nlRoute)
  addImprint(doc)
  if (nlRoute === '/checkout/') adaptCheckout(doc)
  collectUntranslated(doc.body)
  if (nlRoute === '/algemene-voorwaarden/') imprintSource = dom.serialize()
  write(target, dom)
}

const imprint = new JSDOM(imprintSource)
const page = imprint.window.document
page.title = 'Impressum — ZOL Solutions'
page.querySelector('meta[name="description"]')?.setAttribute('content', 'Impressum von ZOL Solutions, Amsterdam.')
page.querySelector('link[rel="canonical"]')?.setAttribute('href', `${origin}/de/impressum/`)
page.querySelectorAll('link[rel="alternate"][hreflang]').forEach(element => element.remove())
page.querySelector('main').innerHTML = `<section class="legal-hero"><div><p class="legal-eyebrow">Angaben gemäß § 5 DDG</p><h1>Impressum<em>.</em></h1></div></section>
<div class="legal-layout"><article class="legal-content">
<section class="legal-section"><h2>Anbieter</h2><p><strong>ZOL Solutions</strong>, offene Handelsgesellschaft niederländischen Rechts (vennootschap onder firma)<br>Burgemeester Hogguerstraat 1111<br>1064 EJ Amsterdam, Niederlande</p></section>
<section class="legal-section"><h2>Vertreten durch</h2><p>Maks Breijer und Thijn Koelemij</p></section>
<section class="legal-section"><h2>Kontakt</h2><p>E-Mail: <a href="mailto:info@zolsolutions.nl">info@zolsolutions.nl</a><br>Kontaktformular: <a href="/de/kontakt/">zolsolutions.nl/de/kontakt</a></p></section>
<section class="legal-section"><h2>Register und Umsatzsteuer</h2><p>Handelsregister der niederländischen Handelskammer (KvK): 42039518<br>USt-IdNr.: NL869428664B01</p></section>
<section class="legal-section"><h2>Verbraucherstreitbeilegung</h2><p>Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p></section>
</article></div>`
write('/de/impressum/', imprint)

if (GERMAN_PAGES_PUBLIC) {
  const sitemapFile = join(dist, 'sitemap.xml')
  const entries = [...Object.values(germanRoutes), '/de/impressum/'].map(route => `  <url><loc>${origin}${route}</loc></url>`).join('\n')
  writeFileSync(sitemapFile, readFileSync(sitemapFile, 'utf8').replace('</urlset>', `${entries}\n</urlset>`))
}
console.log(`German pages built. Texts without a German match: ${audit.size}`)
if (process.env.GERMAN_AUDIT) console.log([...audit].join('\n'))
