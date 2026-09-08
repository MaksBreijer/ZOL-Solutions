import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import config from '../vite.config.js'

test('product structured data omits unsupported audience age values', async () => {
  const filename = new URL('../product/index.html', import.meta.url).pathname
  const html = await readFile(filename, 'utf8')
  const seoPlugin = config.plugins.find((plugin) => plugin.name === 'zol-seo')
  const transformed = seoPlugin.transformIndexHtml.handler(html, { filename })
  const jsonLd = transformed.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1]

  assert.ok(jsonLd, 'expected the SEO plugin to emit JSON-LD')
  const productGroup = JSON.parse(jsonLd)['@graph'].find((item) => item['@type'] === 'ProductGroup')

  assert.ok(productGroup, 'expected ProductGroup structured data')
  assert.equal('audience' in productGroup, false)
  assert.equal(productGroup.hasVariant.length, 5)
  assert.equal(productGroup.hasVariant[0].offers.price, '99.95')
})

test('legacy high-intent Shopify URLs redirect to the current knowledge pages', async () => {
  const redirects = await readFile(new URL('../public/_redirects', import.meta.url), 'utf8')

  assert.match(redirects, /^\/pages\/mijn-kind-heeft-hielpijn \/kennisbank\/hielpijn-bij-kinderen\/ 301$/m)
  assert.match(redirects, /^\/en\/pages\/mijn-kind-heeft-hielpijn \/kennisbank\/hielpijn-bij-kinderen\/ 301$/m)
  assert.match(redirects, /^\/en\/blogs\/news \/kennisbank\/ 301$/m)
})
