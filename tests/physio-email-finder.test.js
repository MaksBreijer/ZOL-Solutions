import test from 'node:test'
import assert from 'node:assert/strict'
import { cityFromHtml, contactPageUrls, extractEmails, firstNameFromEmail, leadsToScan, normalizeWebsite, physioSalutationName, pickPracticeEmail } from '../supabase/functions/physio-campaign/email-finder.js'
import { normalizePartnerScoutState } from '../src/partner-scout.js'

test('extracts emails from mailto links, text and obfuscated notation', () => {
  const html = '<a href="mailto:Info@FysioDeLinde.nl?subject=Vraag">Mail</a> <p>praktijk [at] fysiodelinde [dot] nl</p> <span>balie&#64;fysiodelinde.nl</span> <img src="logo@2x.png"> noreply@fysiodelinde.nl'
  assert.deepEqual(extractEmails(html).sort(), ['balie@fysiodelinde.nl', 'info@fysiodelinde.nl', 'praktijk@fysiodelinde.nl'])
})

test('prefers a personal address on the practice domain over a general inbox', () => {
  const candidates = ['jan@fysiodelinde.nl', 'info@fysiodelinde.nl', 'hallo@webbureau.nl', 'fysio@gmail.com']
  assert.equal(pickPracticeEmail(candidates, 'https://www.fysiodelinde.nl/'), 'jan@fysiodelinde.nl')
  assert.equal(pickPracticeEmail(['balie@fysiodelinde.nl', 'info@fysiodelinde.nl'], 'https://fysiodelinde.nl'), 'info@fysiodelinde.nl')
})

test('personal scan also revisits practices that only have a general inbox', () => {
  const leads = [
    { id: 'a', type: 'physio', website: 'fysio-a.nl', email: 'info@fysio-a.nl' },
    { id: 'b', type: 'physio', website: 'fysio-b.nl', email: 'jan@fysio-b.nl' },
    { id: 'c', type: 'physio', website: 'fysio-c.nl', email: 'info@fysio-c.nl', email_scan_result: 'personal_checked' },
  ]
  assert.deepEqual(leadsToScan(leads, { personal: true }).map((lead) => lead.id), ['a'])
  assert.deepEqual(leadsToScan(leads).map((lead) => lead.id), [])
})

test('falls back to a free mail address but never to a third-party domain', () => {
  assert.equal(pickPracticeEmail(['hallo@webbureau.nl', 'fysiodelinde@gmail.com'], 'https://fysiodelinde.nl'), 'fysiodelinde@gmail.com')
  assert.equal(pickPracticeEmail(['hallo@webbureau.nl'], 'https://fysiodelinde.nl'), '')
})

test('finds contact pages on the same site with a fallback', () => {
  const html = '<a href="/over-ons">Over ons</a><a href="https://other.nl/contact">Contact</a><a href="/contact/">Neem contact op</a>'
  assert.deepEqual(contactPageUrls(html, 'https://fysiodelinde.nl/'), ['https://fysiodelinde.nl/over-ons', 'https://fysiodelinde.nl/contact/'])
  assert.deepEqual(contactPageUrls('<p>Welkom</p>', 'https://fysiodelinde.nl/'), ['https://fysiodelinde.nl/contact'])
})

test('normalizes websites and skips social media pages', () => {
  assert.equal(normalizeWebsite('fysiodelinde.nl'), 'https://fysiodelinde.nl/')
  assert.equal(normalizeWebsite('https://www.facebook.com/fysio'), '')
  assert.equal(normalizeWebsite(''), '')
})

test('only scans physio leads with a website, no email and no earlier scan', () => {
  const leads = [
    { id: 'a', type: 'physio', website: 'fysio-a.nl', email: '' },
    { id: 'b', type: 'physio', website: 'fysio-b.nl', email: 'info@fysio-b.nl' },
    { id: 'c', type: 'physio', website: 'fysio-c.nl', email: '', email_scan_at: '2026-10-02T10:00:00Z' },
    { id: 'd', type: 'physio', website: 'fysio-d.nl', email: '', outreach_opt_out: true },
    { id: 'e', type: 'school', website: 'school.nl', email: '' },
    { id: 'f', type: 'physio', website: '', email: '' },
  ]
  assert.deepEqual(leadsToScan(leads).map((lead) => lead.id), ['a'])
})

test('keeps email scan fields when Partner Scout state is normalized', () => {
  const state = normalizePartnerScoutState({ leads: [{ id: 'a', type: 'physio', name: 'Fysio A', email: 'info@fysio-a.nl', email_scan_at: '2026-10-02T10:00:00Z', email_scan_result: 'found', email_source_url: 'https://fysio-a.nl/contact' }] })
  assert.equal(state.leads[0].email_scan_result, 'found')
  assert.equal(state.leads[0].email_source_url, 'https://fysio-a.nl/contact')
  assert.equal(state.leads[0].email_scan_at, '2026-10-02T10:00:00Z')
})

test('stays fast on large pages with long unbroken strings', () => {
  const blob = 'A'.repeat(300_000)
  const html = `<img src="data:image/png;base64,${blob}"><script>var x="${'b'.repeat(80_000)}"</script><a href="/contact">Contact</a><a href="mailto:info@fysiodelinde.nl">Mail</a>`
  const started = performance.now()
  const emails = extractEmails(html)
  const pages = contactPageUrls(html, 'https://fysiodelinde.nl/')
  assert.ok(performance.now() - started < 200, 'email extraction should not scale quadratically')
  assert.deepEqual(emails, ['info@fysiodelinde.nl'])
  assert.deepEqual(pages, ['https://fysiodelinde.nl/contact'])
})

test('takes a first name from a personal address and falls back to the practice team', () => {
  assert.equal(firstNameFromEmail('jan@fysio.nl'), 'Jan')
  assert.equal(firstNameFromEmail('marieke.de-vries@fysio.nl'), 'Marieke')
  assert.equal(firstNameFromEmail('j.devries@fysio.nl'), '')
  assert.equal(firstNameFromEmail('jandevries@fysio.nl'), '')
  assert.equal(firstNameFromEmail('info@fysio.nl'), '')
  assert.equal(physioSalutationName({ email: 'info@fysio.nl', practiceName: 'Fysio Oost' }), 'team van Fysio Oost')
  assert.equal(physioSalutationName({ contactPerson: 'Mevrouw Bakker', email: 'jan@fysio.nl' }), 'Mevrouw Bakker')
})

test('de plaats komt uit de postcode in het adres op de website', () => {
  assert.equal(cityFromHtml('<p>Kerkstraat 1<br>1071 AB Amsterdam</p>'), 'Amsterdam')
  assert.equal(cityFromHtml('Laan 3, 1181AB, Amstelveen. Tel'), 'Amstelveen')
  assert.equal(cityFromHtml('2908 KL Capelle aan den IJssel'), 'Capelle aan den IJssel')
  assert.equal(cityFromHtml('Bel 020 1234 Amsterdam'), '')
})
