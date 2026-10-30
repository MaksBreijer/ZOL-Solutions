import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../supabase/functions/marketing-email/customer-followup.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20261030120000_review_request_followup.sql', import.meta.url), 'utf8')

function load() {
  const code = source.replace(/^import .*\n/, '').replaceAll('export ', '')
  const context = { Intl, URL, escapeEmailHtml: (text) => String(text), helpers: null }
  runInNewContext(stripTypeScriptTypes(`${code}\nhelpers = { followups, renderFollowup }`), context)
  return context.helpers
}

test('de lijst staat op volgorde van dagen, zodat altijd de laatste verschuldigde mail uitgaat', () => {
  const { followups } = load()
  const days = Array.from(followups, (followup) => followup.days)
  assert.deepEqual(days, [...days].sort((a, b) => a - b))
  assert.deepEqual(Array.from(followups, (followup) => followup.step), [1, 3, 2])
})

test('de reviewvraag gaat 10 dagen na bezorging uit, als los bericht met Google- en websitelink', () => {
  const { followups, renderFollowup } = load()
  const review = followups.find((followup) => followup.step === 3)
  assert.equal(review.days, 10)
  assert.equal(review.standalone, true)
  const mail = renderFollowup(review, 'Anna', 'order-1')
  assert.doesNotMatch(mail.subject, /^Re:/)
  assert.match(mail.text, /Hoi Anna,/)
  assert.match(mail.text, /g\.page\/r\/CetD-TH5WBYJEBM\/review/)
  assert.match(mail.text, /zolsolutions\.nl\/product\/#reviews/)
  assert.match(mail.text, /foto of korte video/)
  assert.match(mail.headers['Message-ID'], /customer-followup-order-1-3@/)
  assert.equal(mail.headers['In-Reply-To'], undefined)
})

test('de reviewvraag selecteert geen tevreden klanten: iedereen krijgt dezelfde links', () => {
  const { followups } = load()
  const review = followups.find((followup) => followup.step === 3)
  assert.doesNotMatch(review.body, /als je tevreden|alleen als het goed gaat|5 sterren|vijf sterren|korting/i)
})

test('de migratie staat het nieuwe mailtype toe en maakt een bewerkbare template', () => {
  assert.match(migration, /'customer_followup_3'/)
  assert.match(migration, /insert into public\.email_templates[\s\S]*'customer_followup_3'/)
  assert.match(migration, /'welcome_reminder'/)
  assert.match(source, /customer_followup_\$\{followup\.step\}/)
})
