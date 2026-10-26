import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { crmDatabase, syntheticExport } from './helpers/crm-fixture.js'
import { planImport } from '../src/crm/import.js'

// Het echte CRM-scherm in jsdom, tegen de echte migratie in PGlite.
async function setup(role = 'owner') {
  const env = await crmDatabase()
  await env.as('owner')
  const plan = planImport(syntheticExport(), { files: { 'files/synthetic-file-1': { sha256: 'a'.repeat(64), size: 8 } } })
  const imported = await env.client.rpc('crm_import_apply', { p_batch: crypto.randomUUID(), p_namespace: plan.namespace, p_rows: plan.rows, p_erased: plan.erased, p_audit: plan.audit, p_files: plan.files, p_report: plan.report })
  assert.equal(imported.error, null)
  await env.as(role)

  const dom = new JSDOM('<!doctype html><body><main id="content"></main><dialog id="d"><div id="b"></div></dialog></body>', { url: 'https://test.invalid/admin/#crm', pretendToBeVisual: true })
  const { window } = dom
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  window.HTMLDialogElement.prototype.close = function () { this.open = false }
  window.confirm = () => true
  globalThis.window = window; globalThis.document = window.document; globalThis.FormData = window.FormData
  const { createCrmView } = await import('../src/crm/ui.js')
  const toasts = []
  const dialog = window.document.querySelector('#d'), body = window.document.querySelector('#b')
  const view = createCrmView({
    content: window.document.querySelector('#content'), supabase: env.client, dialog, dialogBody: () => body,
    toast: (title, message = '', error = false) => toasts.push({ title, message, error }),
    openDialog: (title, eyebrow, html) => { body.innerHTML = `<h2>${title}</h2><p>${eyebrow}</p>${html}`; dialog.showModal() },
    closeDialog: () => { dialog.close(); body.innerHTML = '' }, setWide: () => {}, refreshIcons: () => {}, isActive: () => true,
  })
  const flush = async () => { for (let i = 0; i < 25; i++) await new Promise((resolve) => setImmediate(resolve)) }
  const q = (selector) => window.document.querySelector(selector)
  const click = async (selector) => { const el = typeof selector === 'string' ? q(selector) : selector; assert.ok(el, `mist ${selector}`); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await flush() }
  const submit = async () => { q('#crm-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await flush() }
  view.show(); await flush()
  return { ...env, window, view, q, click, submit, flush, toasts, content: q('#content'), body }
}

test('overview, tabs and search show the migrated data', async () => {
  const t = await setup()
  assert.match(t.content.textContent, /Organisaties.*2/s, 'samengevoegde organisatie telt niet mee')
  assert.match(t.content.textContent, /Opvolgen voorstel/)
  await t.click('[data-tab="organizations"]')
  assert.match(t.q('#crm-results').textContent, /Testclub Alpha/)
  assert.doesNotMatch(t.q('#crm-results').textContent, /Gamma dubbel/, 'verborgen samengevoegde organisatie')
  t.q('#crm-search').value = 'praktijk'
  t.q('#crm-search').dispatchEvent(new t.window.Event('input', { bubbles: true }))
  assert.match(t.q('#crm-results').textContent, /Testpraktijk Beta/)
  assert.doesNotMatch(t.q('#crm-results').textContent, /Testclub Alpha/)
  await t.click('[data-tab="tasks"]')
  assert.match(t.q('#crm-results').textContent, /Opvolgen voorstel/)
  assert.doesNotMatch(t.q('#crm-results').textContent, /Oude taak/, 'afgeronde taken standaard verborgen')
  await t.click('[data-mode="all"]')
  assert.match(t.q('#crm-results').textContent, /Oude taak/)
  assert.match(t.q('#crm-results').textContent, /Vervallen taak/)
})

test('organisation dossier opens, records are audited and edits are saved with concurrency control', async () => {
  const t = await setup()
  await t.click('[data-tab="organizations"]')
  await t.click('tr[data-id="org-alpha"]')
  assert.match(t.body.textContent, /Contactpersonen/)
  assert.match(t.body.textContent, /Pat Voorbeeld/)
  assert.match(t.body.textContent, /Mail gestuurd naar Pat Voorbeeld/, 'geschiedenis via gekoppelde contacten en kansen')
  assert.ok((await t.db.query("select 1 from public.crm_audit where action = 'record.read' and 'org-alpha' = any(record_ids)")).rows.length)
  await t.click('[data-crm-action="edit"][data-collection="organizations"]')
  t.q('input[name=city]').value = 'Teststad'
  await t.submit()
  assert.equal(t.toasts.at(-1).title, 'Opgeslagen in het CRM.')
  assert.equal((await t.db.query("select data->>'city' as city from public.crm_records where id = 'org-alpha'")).rows[0].city, 'Teststad')
  assert.match(t.content.textContent, /Teststad/)
})

test('a stale edit shows the conflict message instead of overwriting', async () => {
  const t = await setup()
  await t.click('[data-tab="contacts"]')
  await t.click('tr[data-id="con-2"]')
  await t.db.query("update public.crm_records set revision = 'ander', data = jsonb_set(data, '{revision}', '\"ander\"') where id = 'con-2'")
  t.q('input[name=role]').value = 'Nieuwe functie'
  await t.submit()
  assert.match(t.q('.crm-form-error').textContent, /intussen gewijzigd/)
  assert.equal((await t.db.query("select data->>'role' as role from public.crm_records where id = 'con-2'")).rows[0].role, null)
})

test('tasks can be completed with one click and the change is logged', async () => {
  const t = await setup()
  await t.click('[data-tab="tasks"]')
  await t.click('[data-crm-action="toggle-task"][data-id="task-1"]')
  assert.equal((await t.db.query("select data->>'status' as status from public.crm_records where id = 'task-1'")).rows[0].status, 'afgerond')
  await t.click('[data-tab="activities"]')
  assert.match(t.q('#crm-results').textContent, /status: wacht-op-reactie → afgerond/)
})

test('privacy tab is available to admins with requests, register and audit log', async () => {
  const t = await setup()
  await t.click('[data-tab="privacy"]')
  assert.match(t.content.textContent, /Privacyverzoeken/)
  assert.match(t.content.textContent, /Robin Testpersoon/)
  assert.match(t.content.textContent, /Door beheerder beoordeeld/)
  await t.click('[data-crm-action="load-audit"]')
  assert.match(t.content.textContent, /workspace\.read/)
  await t.click('[data-crm-action="request-form"]:not([data-id])')
  t.q('select[name=type]').value = 'bezwaar'
  t.q('select[name=contactId]').value = 'con-1'
  await t.submit()
  assert.equal((await t.db.query("select count(*)::int as n from public.crm_records where collection = 'privacy_requests'")).rows[0].n, 2)
})

test('members and viewers never see privacy management, and viewers get no write buttons', async () => {
  const member = await setup('editor')
  assert.equal(member.q('[data-tab="privacy"]'), null)
  assert.ok(member.q('[data-crm-action="new"][data-collection="organizations"]'))
  const viewer = await setup('viewer')
  assert.equal(viewer.q('[data-tab="privacy"]'), null)
  assert.equal(viewer.q('[data-crm-action="new"]'), null)
  assert.match(viewer.content.textContent, /alleen leesrechten/)
})

test('without a login the CRM shows an error and no data', async () => {
  const t = await setup('')
  assert.match(t.content.textContent, /CRM nog niet bereikbaar/)
  assert.match(t.content.textContent, /geen toestemming/)
  assert.doesNotMatch(t.content.textContent, /Testclub Alpha/)
})
