import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const sharedEmail = readFileSync(new URL('../supabase/functions/_shared/email.ts', import.meta.url), 'utf8')
const orderEmail = readFileSync(new URL('../supabase/functions/order-email/index.ts', import.meta.url), 'utf8')

function sharedEmailHelpers() {
  const source = sharedEmail
    .replace(/^import .*\n/, '')
    .replaceAll('export ', '')
  const context = { Intl, URL, helpers: null }
  runInNewContext(stripTypeScriptTypes(`${source}\nhelpers = { escapeEmailHtml, emailShell, templateParagraphs }`), context)
  return context.helpers
}

test('transactional email HTML declares UTF-8 using both supported meta forms', () => {
  assert.match(sharedEmail, /http-equiv="Content-Type" content="text\/html; charset=UTF-8"/)
  assert.match(sharedEmail, /<meta charset="UTF-8">/)
})

test('order HTML uses ASCII-safe entities for characters corrupted by legacy mail clients', () => {
  const { escapeEmailHtml, emailShell, templateParagraphs } = sharedEmailHelpers()
  assert.equal(escapeEmailHtml('ZOL’tjes € 99,95 × 1 — →'), 'ZOL&#8217;tjes &#8364; 99,95 &#215; 1 &#8212; &#8594;')
  const html = emailShell(templateParagraphs('ZOL’tjes kost € 99,95', {}), {
    eyebrow: 'Bestelling #1033',
    title: 'Bedankt, Johan.',
    intro: 'In goede orde ontvangen.',
    buttonLabel: 'Naar ZOL Solutions',
    buttonUrl: 'https://zolsolutions.nl',
  })
  assert.doesNotMatch(html, /[^\x00-\x7F]/)
  assert.match(html, /ZOL&#8217;tjes kost &#8364; 99,95/)
  assert.match(html, /&rarr;/)
  assert.match(html, /&middot;/)
  assert.match(orderEmail, /&times;/)
  assert.match(orderEmail, /&minus;/)
  assert.match(orderEmail, /escapeEmailHtml\(money\(/)
})
