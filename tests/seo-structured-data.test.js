import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import config from '../vite.config.js'

test('product structured data includes complete variant and audience details', async () => {
  const filename = new URL('../product/index.html', import.meta.url).pathname
  const html = await readFile(filename, 'utf8')
  const seoPlugin = config.plugins.find((plugin) => plugin.name === 'zol-seo')
  const transformed = seoPlugin.transformIndexHtml.handler(html, { filename })
  const jsonLd = transformed.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1]

  assert.ok(jsonLd, 'expected the SEO plugin to emit JSON-LD')
  const productGroup = JSON.parse(jsonLd)['@graph'].find((item) => item['@type'] === 'ProductGroup')

  assert.ok(productGroup, 'expected ProductGroup structured data')
  assert.equal(productGroup.audience['@type'], 'PeopleAudience')
  assert.equal(productGroup.category.codeValue, '2801')
  assert.equal(productGroup.hasVariant.length, 5)
  assert.equal(productGroup.hasVariant[0].offers.price, '99.95')
  assert.equal(productGroup.hasVariant[0].offers.availability, 'https://schema.org/OutOfStock')
})

test('shopping feed includes Google category and variant attributes', async () => {
  const feed = await readFile(new URL('../public/google-product-feed.xml', import.meta.url), 'utf8')

  assert.equal((feed.match(/<item>/g) || []).length, 5)
  assert.equal((feed.match(/<g:google_product_category>2801<\/g:google_product_category>/g) || []).length, 5)
  assert.equal((feed.match(/<g:age_group>kids<\/g:age_group>/g) || []).length, 5)
  assert.match(feed, /ZOL-XS-3435[\s\S]*?<g:availability>out_of_stock<\/g:availability>/)
})

test('growth and new knowledge routes are listed in the sitemap', async () => {
  const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8')

  for (const route of [
    '/hielpijn-kind-sport/',
    '/kennisbank/sportschoenen-bij-ziekte-van-sever/',
    '/kennisbank/wanneer-naar-fysio-hielpijn-kind/',
  ]) assert.match(sitemap, new RegExp(`<loc>https://zolsolutions\\.nl${route.replaceAll('/', '\\/')}</loc>`))
})

test('legacy high-intent Shopify URLs redirect to the current knowledge pages', async () => {
  const redirects = await readFile(new URL('../public/_redirects', import.meta.url), 'utf8')

  assert.match(redirects, /^\/pages\/mijn-kind-heeft-hielpijn \/kennisbank\/hielpijn-bij-kinderen\/ 301$/m)
  assert.match(redirects, /^\/en\/pages\/mijn-kind-heeft-hielpijn \/kennisbank\/hielpijn-bij-kinderen\/ 301$/m)
  assert.match(redirects, /^\/en\/blogs\/news \/kennisbank\/ 301$/m)
})
