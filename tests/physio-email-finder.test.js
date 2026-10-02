import test from 'node:test'
import assert from 'node:assert/strict'
import { contactPageUrls, extractEmails, leadsToScan, normalizeWebsite, pickPracticeEmail } from '../supabase/functions/physio-campaign/email-finder.js'
import { normalizePartnerScoutState } from '../src/partner-scout.js'

test('extracts emails from mailto links, text and obfuscated notation', () => {
  const html = '<a href="mailto:Info@FysioDeLinde.nl?subject=Vraag">Mail</a> <p>praktijk [at] fysiodelinde [dot] nl</p> <span>balie&#64;fysiodelinde.nl</span> <img src="logo@2x.png"> noreply@fysiodelinde.nl'
  assert.deepEqual(extractEmails(html).sort(), ['balie@fysiodelinde.nl', 'info@fysiodelinde.nl', 'praktijk@fysiodelinde.nl'])
})

test('prefers an info address on the practice domain', () => {
  const candidates = ['jan@fysiodelinde.nl', 'info@fysiodelinde.nl', 'hallo@webbureau.nl', 'fysio@gmail.com']
  assert.equal(pickPracticeEmail(candidates, 'https://www.fysiodelinde.nl/'), 'info@fysiodelinde.nl')
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
