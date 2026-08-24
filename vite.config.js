import { relative, resolve } from 'node:path'
import { defineConfig } from 'vite'

const siteOrigin = 'https://zolsolutions.nl'

function routeForHtml(filename) {
  const path = relative(import.meta.dirname, filename).replaceAll('\\', '/')
  return path === 'index.html' ? '/' : `/${path.replace(/index\.html$/, '')}`
}

function htmlValue(html, pattern, fallback = '') {
  return (html.match(pattern)?.[1] || fallback).replace(/\s+/g, ' ').trim()
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
        const description = htmlValue(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i, 'Dempende en stabiele 3/4 inlegzolen voor sportende kinderen.')
        const noIndex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)
        const isKnowledgeIndex = route === '/kennisbank/'
        const isArticle = route.startsWith('/kennisbank/') && !isKnowledgeIndex
        const image = route === '/product/' ? `${siteOrigin}/images/zol-familie.jpg` : ['/', '/contact/', '/kennisbank/'].includes(route) ? `${siteOrigin}/og.png` : ''
        const additions = [
          '<link rel="icon" href="/favicon.ico" sizes="any">',
          '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
          '<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png">',
          '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
          '<link rel="manifest" href="/site.webmanifest">',
        ]
        if (!noIndex) {
          additions.push(`<link rel="canonical" href="${canonical}">`)
          if (!/property=["']og:title["']/i.test(html)) additions.push(`<meta property="og:title" content="${title}">`)
          if (!/property=["']og:description["']/i.test(html)) additions.push(`<meta property="og:description" content="${description}">`)
          if (!/property=["']og:type["']/i.test(html)) additions.push(`<meta property="og:type" content="${isArticle ? 'article' : 'website'}">`)
          additions.push(`<meta property="og:url" content="${canonical}">`, '<meta property="og:site_name" content="ZOL Solutions">', '<meta property="og:locale" content="nl_NL">')
          if (image && !/property=["']og:image["']/i.test(html)) additions.push(`<meta property="og:image" content="${image}">`)
          if (!/name=["']twitter:card["']/i.test(html)) additions.push(`<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`)
          additions.push(`<meta name="twitter:title" content="${title}">`, `<meta name="twitter:description" content="${description}">`)
          if (image) additions.push(`<meta name="twitter:image" content="${image}">`)

          let structuredData
          if (route === '/') structuredData = [
            { '@context': 'https://schema.org', '@type': 'Organization', '@id': `${siteOrigin}/#organization`, name: 'ZOL Solutions', url: `${siteOrigin}/`, logo: `${siteOrigin}/favicon-512.png`, email: 'info@zolsolutions.nl' },
            { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${siteOrigin}/#website`, url: `${siteOrigin}/`, name: 'ZOL Solutions', inLanguage: 'nl-NL', publisher: { '@id': `${siteOrigin}/#organization` } },
          ]
          else if (route === '/product/') structuredData = { '@context': 'https://schema.org', '@type': 'Product', name: "ZOL 3/4 inlegzolen", description, image: [`${siteOrigin}/images/zol-familie.jpg`], brand: { '@type': 'Brand', name: 'ZOL Solutions' }, sku: 'ZOL-3-4', audience: { '@type': 'PeopleAudience', suggestedMinAge: 6, suggestedMaxAge: 18 }, offers: { '@type': 'Offer', url: canonical, priceCurrency: 'EUR', price: '99.95', availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition', seller: { '@id': `${siteOrigin}/#organization` } } }
          else if (isArticle) structuredData = { '@context': 'https://schema.org', '@type': 'Article', headline: title.replace(/\s+[—|-]\s+ZOL Solutions$/, ''), description, mainEntityOfPage: canonical, inLanguage: 'nl-NL', dateModified: '2026-08-24', author: { '@id': `${siteOrigin}/#organization` }, publisher: { '@id': `${siteOrigin}/#organization` } }
          else structuredData = { '@context': 'https://schema.org', '@type': isKnowledgeIndex ? 'CollectionPage' : route === '/contact/' ? 'ContactPage' : 'WebPage', name: title, description, url: canonical, inLanguage: 'nl-NL', isPartOf: { '@id': `${siteOrigin}/#website` } }
          additions.push(`<script type="application/ld+json">${JSON.stringify(structuredData).replaceAll('<', '\\u003c')}</script>`)
        }
        return html.replace(/<\/head>/i, `  ${additions.join('\n    ')}\n  </head>`)
      },
    },
  }
}

export default defineConfig({
  plugins: [seoPlugin()],
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        product: resolve(import.meta.dirname, 'product/index.html'),
        contact: resolve(import.meta.dirname, 'contact/index.html'),
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
        checkout: resolve(import.meta.dirname, 'checkout/index.html'),
        privacy: resolve(import.meta.dirname, 'privacy/index.html'),
        terms: resolve(import.meta.dirname, 'algemene-voorwaarden/index.html'),
        unsubscribe: resolve(import.meta.dirname, 'uitschrijven/index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
        adminAlias: resolve(import.meta.dirname, 'zolsolutions/admin/index.html'),
      },
    },
  },
})
