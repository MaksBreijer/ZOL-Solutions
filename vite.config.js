import { relative, resolve } from 'node:path'
import { defineConfig } from 'vite'

const siteOrigin = 'https://zolsolutions.nl'
const imageDimensions = new Map([
  ['/media/zol-logo.png', [180, 49]],
  ['/media/story-team.jpg', [1000, 667]],
  ['/media/product-blue.jpg', [960, 1200]],
  ['/media/product-detail.jpg', [960, 1200]],
  ['/media/product-use.jpg', [960, 1200]],
  ['/media/contact-team.jpg', [1200, 799]],
  ['/media/sport-kids.jpg', [1400, 933]],
  ['/media/heel-anatomy.png', [1200, 655]],
  ['/media/partner-bootfitter.png', [400, 163]],
  ['/media/partner-bpcollege.png', [400, 153]],
  ['/media/partner-kidscare.png', [271, 92]],
  ['/media/partner-tulp.png', [400, 116]],
  ['/media/press-ad-logo.png', [152, 152]],
  ['/media/press-ad.png', [1080, 1350]],
  ['/media/press-hockey-logo.png', [339, 338]],
  ['/media/press-hockey.png', [1080, 1350]],
  ['/images/zol-familie.jpg', [933, 1400]],
])

function routeForHtml(filename) {
  const path = relative(import.meta.dirname, filename).replaceAll('\\', '/')
  return path === 'index.html' ? '/' : `/${path.replace(/index\.html$/, '')}`
}

function htmlValue(html, pattern, fallback = '') {
  return (html.match(pattern)?.[1] || fallback).replace(/\s+/g, ' ').trim()
}

function htmlAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function seoPlugin() {
  return {
    name: 'zol-seo',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        const route = routeForHtml(context.filename)
        const canonical = `${siteOrigin}${route}`
        const title = htmlValue(html, /<title>([\s\S]*?)<\/title>/i, 'ZOL Solutions')
        const description = htmlValue(html, /<meta[^>]+name=["']description["'][^>]+content="([^"]*)"/i) || htmlValue(html, /<meta[^>]+name=["']description["'][^>]+content='([^']*)'/i, 'Dempende en stabiele 3/4 inlegzolen voor sportende kinderen.')
        const safeTitle = htmlAttribute(title)
        const safeDescription = htmlAttribute(description)
        const noIndex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)
        const isKnowledgeIndex = route === '/kennisbank/'
        const isArticle = route.startsWith('/kennisbank/') && !isKnowledgeIndex
        const image = route === '/product/' ? `${siteOrigin}/images/zol-familie.jpg` : ['/', '/contact/', '/over-ons/', '/kennisbank/'].includes(route) ? `${siteOrigin}/og.png` : ''
        const additions = [
          '<link rel="icon" href="/favicon.ico" sizes="any">',
          '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
          '<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png">',
          '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
          '<link rel="manifest" href="/site.webmanifest">',
        ]
        if (!noIndex) {
          if (!/<link[^>]+rel=["']canonical["']/i.test(html)) additions.push(`<link rel="canonical" href="${canonical}">`)
          additions.push(`<link rel="alternate" hreflang="nl-NL" href="${canonical}">`, `<link rel="alternate" hreflang="x-default" href="${canonical}">`)
          additions.push('<link rel="preload" href="/fonts/barlow-semi-condensed-400.woff2" as="font" type="font/woff2" crossorigin>', '<link rel="preload" href="/fonts/barlow-condensed-700.woff2" as="font" type="font/woff2" crossorigin>')
          if (!/name=["']robots["']/i.test(html)) additions.push('<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">')
          if (!/property=["']og:title["']/i.test(html)) additions.push(`<meta property="og:title" content="${safeTitle}">`)
          if (!/property=["']og:description["']/i.test(html)) additions.push(`<meta property="og:description" content="${safeDescription}">`)
          if (!/property=["']og:type["']/i.test(html)) additions.push(`<meta property="og:type" content="${isArticle ? 'article' : 'website'}">`)
          additions.push(`<meta property="og:url" content="${canonical}">`, '<meta property="og:site_name" content="ZOL Solutions">', '<meta property="og:locale" content="nl_NL">')
          if (image && !/property=["']og:image["']/i.test(html)) additions.push(`<meta property="og:image" content="${image}">`)
          if (image && !/property=["']og:image:alt["']/i.test(html)) additions.push(`<meta property="og:image:alt" content="${safeTitle}">`)
          if (!/name=["']twitter:card["']/i.test(html)) additions.push(`<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`)
          additions.push(`<meta name="twitter:title" content="${safeTitle}">`, `<meta name="twitter:description" content="${safeDescription}">`)
          if (image) additions.push(`<meta name="twitter:image" content="${image}">`)

          const shortTitle = title.replace(/\s+[—|-]\s+ZOL Solutions$/, '')
          const organization = { '@type': 'Organization', '@id': `${siteOrigin}/#organization`, name: 'ZOL Solutions', url: `${siteOrigin}/`, logo: { '@type': 'ImageObject', url: `${siteOrigin}/favicon-512.png`, width: 512, height: 512 }, email: 'info@zolsolutions.nl', contactPoint: { '@type': 'ContactPoint', email: 'info@zolsolutions.nl', contactType: 'customer service', availableLanguage: ['Dutch', 'English'] }, foundingDate: '2026', foundingLocation: { '@type': 'Place', name: 'Amsterdam, Nederland' }, founder: [{ '@type': 'Person', name: 'Maks Breijer' }, { '@type': 'Person', name: 'Thijn Koelemij' }], address: { '@type': 'PostalAddress', addressLocality: 'Amsterdam', addressCountry: 'NL' }, areaServed: { '@type': 'Country', name: 'Nederland' }, sameAs: ['https://www.instagram.com/zolsolutions/', 'https://www.linkedin.com/company/zolsolutions/', 'https://maps.google.com/?cid=654808623137506283'] }
          const website = { '@type': 'WebSite', '@id': `${siteOrigin}/#website`, url: `${siteOrigin}/`, name: 'ZOL Solutions', inLanguage: 'nl-NL', publisher: { '@id': `${siteOrigin}/#organization` } }
          const graph = [organization, website]
          if (route === '/') graph.push({ '@type': 'WebPage', '@id': `${canonical}#webpage`, url: canonical, name: title, description, inLanguage: 'nl-NL', isPartOf: { '@id': `${siteOrigin}/#website` }, about: { '@id': `${siteOrigin}/#organization` } })
          else if (route === '/product/') {
            const returnPolicy = { '@type': 'MerchantReturnPolicy', applicableCountry: 'NL', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: 14, returnMethod: 'https://schema.org/ReturnByMail', returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility' }
            const variants = [
              ['ZOL-XS-3435', '34/35', '34-35'],
              ['ZOL-S-3637', '36/37', '36-37'],
              ['ZOL-M-3839', '38/39', '38-39'],
              ['ZOL-L-4041', '40/41', '40-41'],
              ['ZOL-XL-4243', '42/43', '42-43'],
            ]
            graph.push({
              '@type': 'ProductGroup',
              '@id': `${canonical}#product`,
              name: 'ZOL 3/4 inlegzolen',
              description,
              url: canonical,
              image: [`${siteOrigin}/images/zol-familie.jpg`, `${siteOrigin}/media/product-blue.jpg`, `${siteOrigin}/media/product-detail.jpg`],
              mainEntityOfPage: { '@id': `${canonical}#webpage` },
              brand: { '@type': 'Brand', name: 'ZOL Solutions' },
              productGroupID: 'ZOL-3-4',
              variesBy: ['https://schema.org/size'],
              hasVariant: variants.map(([sku, size, querySize]) => ({
                '@type': 'Product',
                name: `ZOL 3/4 inlegzolen – maat ${size}`,
                sku,
                size,
                image: `${siteOrigin}/images/zol-familie.jpg`,
                offers: { '@type': 'Offer', url: `${canonical}?maat=${querySize}`, priceCurrency: 'EUR', price: '99.95', availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition', seller: { '@id': `${siteOrigin}/#organization` }, hasMerchantReturnPolicy: returnPolicy },
              })),
            })
          }
          else if (isArticle) {
            const footTypes = route === '/kennisbank/voettypes-en-enkelstanden/'
            const modifiedToday = ['/kennisbank/hielpijn-bij-kinderen/', '/kennisbank/inlegzolen-bij-ziekte-van-sever/'].includes(route)
            graph.push({ '@type': 'Article', '@id': `${canonical}#article`, headline: shortTitle, description, url: canonical, mainEntityOfPage: { '@id': `${canonical}#webpage` }, inLanguage: 'nl-NL', image: `${siteOrigin}/media/heel-anatomy.png`, dateModified: modifiedToday ? '2026-09-02' : '2026-09-01', author: { '@id': `${siteOrigin}/#organization` }, publisher: { '@id': `${siteOrigin}/#organization` }, about: footTypes ? ['Voettypes bij kinderen', 'Enkelstanden', 'Pronatie'] : ['Hielpijn bij kinderen', 'Ziekte van Sever'], citation: footTypes ? ['https://www.nhs.uk/conditions/flat-feet/', 'https://www.guysandstthomas.nhs.uk/health-information/flat-feet-children', 'https://www.nhs.uk/baby/health/leg-and-foot-problems-in-children/'] : ['https://www.cuh.nhs.uk/patient-information/severs-diseasesevers-disease/', 'https://www.clinicalguidelines.scot.nhs.uk/rhc-for-health-professionals/guidelines/primary-care-referral-guidelines/orthopaedic-pre-referral-guidance/heel-pain-in-children-advice-for-referrers/'] })
          }
          else graph.push({ '@type': isKnowledgeIndex ? 'CollectionPage' : route === '/contact/' ? 'ContactPage' : route === '/over-ons/' ? 'AboutPage' : 'WebPage', '@id': `${canonical}#webpage`, name: title, description, url: canonical, inLanguage: 'nl-NL', isPartOf: { '@id': `${siteOrigin}/#website` }, about: route === '/over-ons/' ? { '@id': `${siteOrigin}/#organization` } : undefined })

          if (route !== '/') {
            const items = [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${siteOrigin}/` }]
            if (route.startsWith('/kennisbank/')) items.push({ '@type': 'ListItem', position: 2, name: 'Kennisbank', item: `${siteOrigin}/kennisbank/` })
            if (!isKnowledgeIndex) items.push({ '@type': 'ListItem', position: items.length + 1, name: shortTitle, item: canonical })
            graph.push({ '@type': 'BreadcrumbList', '@id': `${canonical}#breadcrumb`, itemListElement: items })
          }
          const structuredData = { '@context': 'https://schema.org', '@graph': graph }
          additions.push(`<script type="application/ld+json">${JSON.stringify(structuredData).replaceAll('<', '\\u003c')}</script>`)
        }
        let optimizedHtml = html.replace(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, (tag, source) => {
          const dimensions = imageDimensions.get(source)
          if (!dimensions) return tag
          let result = tag
          if (!/\bwidth=["']/i.test(result)) result = result.replace(/\s*\/?>$/, ` width="${dimensions[0]}"$&`)
          if (!/\bheight=["']/i.test(result)) result = result.replace(/\s*\/?>$/, ` height="${dimensions[1]}"$&`)
          if (!/\bdecoding=["']/i.test(result)) result = result.replace(/\s*\/?>$/, ' decoding="async"$&')
          return result
        })
        if (!noIndex) optimizedHtml = optimizedHtml
          .replace(/\s*<link\b[^>]*href=["']https:\/\/fonts\.googleapis\.com[^>]*>\s*/gi, '\n')
          .replace(/\s*<link\b[^>]*href=["']https:\/\/fonts\.gstatic\.com[^>]*>\s*/gi, '\n')
        return optimizedHtml.replace(/<\/head>/i, `  ${additions.join('\n    ')}\n  </head>`)
      },
    },
  }
}

export default defineConfig({
  plugins: [seoPlugin()],
  build: {
    target: 'safari13',
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        product: resolve(import.meta.dirname, 'product/index.html'),
        contact: resolve(import.meta.dirname, 'contact/index.html'),
        about: resolve(import.meta.dirname, 'over-ons/index.html'),
        knowledge: resolve(import.meta.dirname, 'kennisbank/index.html'),
        sever: resolve(import.meta.dirname, 'kennisbank/ziekte-van-sever/index.html'),
        heelPainChildren: resolve(import.meta.dirname, 'kennisbank/hielpijn-bij-kinderen/index.html'),
        heelPainSports: resolve(import.meta.dirname, 'kennisbank/hielpijn-tijdens-sporten/index.html'),
        severHockey: resolve(import.meta.dirname, 'kennisbank/ziekte-van-sever-hockey/index.html'),
        severFootball: resolve(import.meta.dirname, 'kennisbank/ziekte-van-sever-voetbal/index.html'),
        growingHeelPain: resolve(import.meta.dirname, 'kennisbank/groeipijn-in-de-hiel/index.html'),
        heelPainAfterSports: resolve(import.meta.dirname, 'kennisbank/kind-pijn-aan-hiel-na-sporten/index.html'),
        sportsWithSever: resolve(import.meta.dirname, 'kennisbank/sporten-met-ziekte-van-sever/index.html'),
        severExercises: resolve(import.meta.dirname, 'kennisbank/oefeningen-bij-ziekte-van-sever/index.html'),
        severInsoles: resolve(import.meta.dirname, 'kennisbank/inlegzolen-bij-ziekte-van-sever/index.html'),
        footTypes: resolve(import.meta.dirname, 'kennisbank/voettypes-en-enkelstanden/index.html'),
        checkout: resolve(import.meta.dirname, 'checkout/index.html'),
        privacy: resolve(import.meta.dirname, 'privacy/index.html'),
        terms: resolve(import.meta.dirname, 'algemene-voorwaarden/index.html'),
        unsubscribe: resolve(import.meta.dirname, 'uitschrijven/index.html'),
        measurement: resolve(import.meta.dirname, 'meting/index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
        adminAlias: resolve(import.meta.dirname, 'zolsolutions/admin/index.html'),
      },
    },
  },
})
