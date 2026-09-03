import { JSDOM } from 'jsdom'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { createOrderFixture } from './order-fixture.js'

export async function adminHarness() {
  const fixture = createOrderFixture()
  const html = await readFile(new URL('../../admin/index.html', import.meta.url), 'utf8')
  let source = await readFile(new URL('../../src/admin.js', import.meta.url), 'utf8')
  const dom = new JSDOM(html, { url: 'https://test.invalid/admin/#orders', runScripts: 'outside-only', pretendToBeVisual: true })
  const { window } = dom
  const context = dom.getInternalVMContext()
  window.structuredClone = structuredClone
  window.scrollTo = () => {}
  window.CSS = { escape: value => value }
  window.matchMedia = () => ({ matches: false, addEventListener() {} })
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  window.HTMLDialogElement.prototype.close = function () { this.open = false }
  window.confirm = () => true
  const popups = [], downloads = []
  window.open = (...args) => {
    const popupDom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://test.invalid/' })
    const popup = { document: popupDom.window.document, closed: false, location: { replace(url) { popup.url = url } }, close() { popup.closed = true; popupDom.window.close() } }
    popup.print = () => { popup.printed = true }; popup.opener = window
    popups.push({ args, popup }); return popup
  }
  window.URL.createObjectURL = blob => { downloads.push(blob); return `blob:test-${downloads.length}` }
  window.URL.revokeObjectURL = () => {}
  window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download) }
  for (const match of source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const [, names, path] = match
    if (path === 'lucide') { for (const name of names.split(',').map(s => s.trim()).filter(Boolean)) context[name] = name === 'createIcons' ? () => {} : {}; continue }
    if (path === './supabase-client.js') {
      context.supabase = fixture.supabase
      context.formatMoney = (value = 0) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(value || 0) / 100)
      context.formatDate = (value, options = {}) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', ...options }).format(new Date(value))
    } else Object.assign(context, await import(new URL(`../../src/${path.slice(2)}`, import.meta.url)))
  }
  source = source.replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]\s*;?\n/gm, '').replace(/^import\s+['"][^'"]+['"]\s*;?\n/gm, '').replace(/^boot\(\)$/m, '')
  context.fixtureProfile = fixture.profile
  vm.runInContext(source, context)
  vm.runInContext('state.profile = fixtureProfile', context)
  const run = code => vm.runInContext(code, context)
  const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)) }
  const q = selector => window.document.querySelector(selector)
  const fill = (selector, value) => { const element = q(selector); if (!element) throw new Error(`Missing ${selector}`); element.value = value; element.dispatchEvent(new window.Event('input', { bubbles: true })); element.dispatchEvent(new window.Event('change', { bubbles: true })) }
  const click = async selector => { const element = q(selector); if (!element) throw new Error(`Missing ${selector}`); element.click(); await flush() }
  const submit = async selector => { const form = q(selector); form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await flush() }
  await run('fetchAllData()'); run('renderOrders()')
  return { ...fixture, dom, window, run, q, fill, click, submit, flush, popups, downloads, async refresh() { await run('fetchAllData()'); run('renderOrders()') }, async detail() { await run('fetchAllData()'); run('openOrder(state.orders[0])') }, close() { popups.forEach(({ popup }) => popup.close()); window.close() } }
}
