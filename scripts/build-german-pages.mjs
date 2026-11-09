// Turns the built Dutch pages into real German pages under /de/, so search engines
// can read them. Runs after `vite build`, which keeps the design identical to Dutch.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { JSDOM } from 'jsdom'
import { createGermanTranslator } from '../src/german-dynamic.js'
import { germanRoutes } from '../src/german-routes.js'
import { germanArticles } from './german-articles.mjs'

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

// Google's product and page details, in German and for delivery to Germany.
const offerExtras = {
  shippingDetails: { '@type': 'OfferShippingDetails', shippingRate: { '@type': 'MonetaryAmount', value: '6.95', currency: 'EUR' }, shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'DE' }, deliveryTime: { '@type': 'ShippingDeliveryTime', handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' }, transitTime: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 5, unitCode: 'DAY' } } },
  hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', applicableCountry: 'DE', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: 14, returnMethod: 'https://schema.org/ReturnByMail', returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility' },
}
const sizes = [['ZOL-XS-3435', '34/35'], ['ZOL-S-3637', '36/37'], ['ZOL-M-3839', '38/39'], ['ZOL-L-4041', '40/41'], ['ZOL-XL-4243', '42/43'], ['ZOL-XXL-4445', '44/45']]
const productDescription = 'ZOL 3/4-Einlagen mit gezielter Dämpfung, Fersenunterstützung und fester Fersenschale für sportliche Kinder mit Fersenschmerzen.'

function readGraph(doc) {
  try { return JSON.parse(doc.querySelector('script[type="application/ld+json"]')?.textContent || '{}')['@graph'] || [] } catch { return [] }
}

function structuredData(doc, nlRoute, target, dutchGraph, extraQuestions = [], dateModified = '') {
  const url = `${origin}${target}`
  const organization = { '@id': `${origin}/#organization` }
  const title = doc.title
  const description = doc.querySelector('meta[name="description"]')?.content || ''
  const crumbs = [['Startseite', '/de/']]
  if (target.startsWith('/de/ratgeber/')) crumbs.push(['Ratgeber', '/de/ratgeber/'])
  if (target !== '/de/' && target !== '/de/ratgeber/') crumbs.push([clean(doc.querySelector('h1')?.textContent || title), target])
  const graph = [
    { '@type': 'Organization', ...organization, name: 'ZOL Solutions', url: `${origin}/de/`, logo: { '@type': 'ImageObject', url: `${origin}/favicon-512.png`, width: 512, height: 512 }, email: 'info@zolsolutions.nl', contactPoint: { '@type': 'ContactPoint', email: 'info@zolsolutions.nl', contactType: 'customer service', availableLanguage: ['German', 'Dutch', 'English'] }, address: { '@type': 'PostalAddress', addressLocality: 'Amsterdam', addressCountry: 'NL' }, areaServed: { '@type': 'Country', name: 'Deutschland' } },
    { '@type': 'WebSite', '@id': `${origin}/de/#website`, url: `${origin}/de/`, name: 'ZOL Solutions', inLanguage: 'de-DE', publisher: organization },
    { '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title, description, inLanguage: 'de-DE', isPartOf: { '@id': `${origin}/de/#website` } },
  ]
  if (crumbs.length > 1) graph.push({ '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`, itemListElement: crumbs.map(([name, path], index) => ({ '@type': 'ListItem', position: index + 1, name, item: `${origin}${path}` })) })
  if (nlRoute === '/product/') {
    graph.push({
      '@type': 'ProductGroup', '@id': `${url}#product`, name: 'ZOL 3/4-Einlagen', description: productDescription, url, image: [`${origin}/images/zol-familie.jpg`, `${origin}/media/product-blue.jpg`, `${origin}/media/product-detail.jpg`], brand: { '@type': 'Brand', name: 'ZOL Solutions' }, color: 'Blau', productGroupID: 'ZOL-3-4', variesBy: ['https://schema.org/size'],
      hasVariant: sizes.map(([sku, size]) => ({ '@type': 'Product', name: `ZOL 3/4-Einlagen – Größe ${size}`, description: productDescription, sku, size, image: `${origin}/images/zol-familie.jpg`, offers: { '@type': 'Offer', url: `${url}?maat=${size.replace('/', '-')}`, priceCurrency: 'EUR', price: '99.95', availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition', seller: organization, ...offerExtras } })),
    })
  }
  if (target.startsWith('/de/ratgeber/') && target !== '/de/ratgeber/') {
    const dutch = dutchGraph.find(item => item['@type'] === 'Article' || item['@type'] === 'MedicalWebPage' || item.datePublished) || {}
    graph.push({ '@type': 'Article', '@id': `${url}#article`, headline: title.replace(/\s+[—|]\s+ZOL Solutions$/, ''), description, inLanguage: 'de-DE', mainEntityOfPage: { '@id': `${url}#webpage` }, author: organization, publisher: organization, image: `${origin}/og-zol.jpg?v=2`, ...(dutch.datePublished ? { datePublished: dutch.datePublished } : {}), ...(dateModified || dutch.dateModified ? { dateModified: dateModified || dutch.dateModified } : {}) })
  }
  const questions = [...doc.querySelectorAll('details')].map(item => {
    const question = clean(item.querySelector('summary')?.textContent || '')
    const answer = clean([...item.childNodes].filter(node => node.nodeName !== 'SUMMARY').map(node => node.textContent).join(' '))
    return question && answer ? { '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } } : null
  }).filter(Boolean).concat(extraQuestions.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } })))
  if (questions.length) graph.push({ '@type': 'FAQPage', '@id': `${url}#faq`, inLanguage: 'de-DE', mainEntity: questions })
  const script = doc.createElement('script')
  script.type = 'application/ld+json'
  script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
  doc.head.append(script)
}

function buildGermanFeed() {
  const source = readFileSync(join(dist, 'google-product-feed.xml'), 'utf8')
  const items = source.replace(/<title>.*?<\/title>/, '<title>ZOL Solutions Produktfeed Deutschland</title>').replace('<link>https://zolsolutions.nl/</link>', '<link>https://zolsolutions.nl/de/</link>').replace(/<description>.*?<\/description>/, '<description>Aktuelle Produktdaten von ZOL Solutions für Deutschland.</description>')
  const feed = items.replace(/<item>[\s\S]*?<\/item>/g, item => {
    const size = item.match(/<g:size>(.*?)<\/g:size>/)[1]
    const highlights = ['Kompakte 3/4-Form für Sportschuhe', 'Gezielte Dämpfung unter der Ferse', 'Handgefertigt in der EU'].map(text => `<g:product_highlight>${text}</g:product_highlight>`).join('')
    const shipping = '<g:shipping><g:country>DE</g:country><g:service>Standard</g:service><g:price>6.95 EUR</g:price></g:shipping>'
    return item
      .replace(/<g:title>.*?<\/g:title>/, `<g:title>ZOL Einlagen für Kinder mit Fersenschmerzen – 3/4-Sporteinlage – Größe ${size}</g:title>`)
      .replace(/<g:description>.*?<\/g:description>/, `<g:description>${productDescription} Passend für Fußball-, Hockey- und andere Sportschuhe.</g:description>`)
      .replace(/<g:link>.*?<\/g:link>/, `<g:link>${origin}/de/produkt/?maat=${size.replace('/', '-')}</g:link>`)
      .replace(/<g:product_type>.*?<\/g:product_type>/, '<g:product_type>Sport &gt; Schuhzubehör &gt; Einlagen</g:product_type>')
      .replace(/<g:shipping>[\s\S]*?<\/g:shipping>/g, '')
      .replace(/<g:product_highlight>.*?<\/g:product_highlight>/g, '')
      .replace('</item>', `  ${highlights}${shipping}\n    </item>`)
  })
  writeFileSync(join(dist, 'google-product-feed-de.xml'), feed)
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
let articleSource
for (const [nlRoute, target] of Object.entries(germanRoutes)) {
  const source = readFileSync(fileFor(nlRoute), 'utf8')
  if (GERMAN_PAGES_PUBLIC) writeFileSync(fileFor(nlRoute), source.replace('</head>', `<link rel="alternate" hreflang="de-DE" href="${origin}${target}"></head>`))
  const dom = new JSDOM(source)
  const doc = dom.window.document
  const dutchGraph = readGraph(doc)
  for (const start of removeText[nlRoute] || []) innermost(doc, start)?.remove()
  doc.querySelectorAll('a[href="/kennisbank/inlegzolen-voor-kinderen/"]').forEach(link => { if (clean(link.textContent) === 'Lees hoe je de juiste zool kiest') link.remove() })
  for (const [start, text] of replaceText[nlRoute] || []) { const element = innermost(doc, start); if (element) element.textContent = text }
  rewriteLinks(doc)
  // The review strip is marked "do not translate"; a Dutch quote must not appear on German pages.
  doc.querySelectorAll('.zr').forEach(strip => {
    const quote = strip.querySelector('blockquote')
    const german = quote && dictionary[clean(quote.textContent)]
    if (german) quote.textContent = german
    else strip.remove()
  })
  translateTree(doc.body)
  setHead(doc, nlRoute, target, nlRoute)
  structuredData(doc, nlRoute, target, dutchGraph)
  addImprint(doc)
  if (nlRoute === '/checkout/') adaptCheckout(doc)
  collectUntranslated(doc.body)
  if (nlRoute === '/algemene-voorwaarden/') imprintSource = dom.serialize()
  if (nlRoute === '/kennisbank/ziekte-van-sever/') articleSource = dom.serialize()
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

for (const article of germanArticles) {
  const dom = new JSDOM(articleSource)
  const doc = dom.window.document
  doc.title = article.title
  doc.querySelector('meta[name="description"]').content = article.description
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(element => element.remove())
  doc.querySelector('.knowledge-hero-inner').innerHTML = `<p class="section-index">${article.eyebrow}</p><h1>${article.h1[0]} <em>${article.h1[1]}</em></h1><p>${article.lead}</p>`
  const faq = article.faq.map(([question, answer]) => `<h3>${question}</h3><p>${answer}</p>`).join('')
  const sources = article.sources.map(([name, url]) => `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a></li>`).join('')
  doc.querySelector('.article-content').innerHTML = `${article.body}<h2>Häufige Fragen</h2>${faq}<div class="article-note"><strong>Wichtig</strong><p>Diese Seite bietet allgemeine Informationen und ersetzt keine Diagnose oder persönliche Beratung durch Arzt, Kinderphysiotherapeut oder Orthopäde.</p></div><section class="article-sources"><h2>Quellen</h2><ul>${sources}</ul></section>`
  doc.querySelector('.article-aside').innerHTML = `<strong>Weiterlesen</strong>${article.asideHtml}`
  setHead(doc, null, article.target, null)
  structuredData(doc, '', article.target, [], article.faq, '2026-11-09')
  write(article.target, dom)
}

// Make the new articles reachable from the guide and the existing articles.
function amend(route, change) {
  const dom = new JSDOM(readFileSync(fileFor(route), 'utf8'))
  change(dom.window.document)
  writeFileSync(fileFor(route), dom.serialize())
}
amend('/de/ratgeber/', doc => {
  doc.querySelector('.knowledge-index-grid').insertAdjacentHTML('beforeend', germanArticles.map(({ target, card: [label, heading, text] }) => `<a class="knowledge-index-card" href="${target}"><span>${label}</span><h2>${heading}</h2><p>${text}</p></a>`).join(''))
})
for (const route of ['/de/ratgeber/morbus-sever/', '/de/ratgeber/fersenschmerzen-bei-kindern/', '/de/ratgeber/einlagen-bei-morbus-sever/']) {
  amend(route, doc => {
    const product = doc.querySelector('.article-aside a[href="/de/produkt/"]')
    if (product) product.insertAdjacentHTML('beforebegin', '<a href="/de/ratgeber/morbus-sever-behandlung/">Morbus Sever behandeln</a><a href="/de/ratgeber/morbus-sever-dauer/">Wie lange dauert Morbus Sever?</a>')
  })
}

buildGermanFeed()

if (GERMAN_PAGES_PUBLIC) {
  const sitemapFile = join(dist, 'sitemap.xml')
  const entries = [...Object.values(germanRoutes), '/de/impressum/', ...germanArticles.map(article => article.target)].map(route => `  <url><loc>${origin}${route}</loc></url>`).join('\n')
  writeFileSync(sitemapFile, readFileSync(sitemapFile, 'utf8').replace('</urlset>', `${entries}\n</urlset>`))
}
console.log(`German pages built. Texts without a German match: ${audit.size}`)
if (process.env.GERMAN_AUDIT) console.log([...audit].join('\n'))
