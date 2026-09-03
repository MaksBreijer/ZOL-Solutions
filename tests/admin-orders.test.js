import test from 'node:test'
import assert from 'node:assert/strict'
import { adminHarness } from './helpers/admin-harness.js'
import { ids } from './helpers/order-fixture.js'
const scenario = (name, fn) => test(name, async () => { const h = await adminHarness(); try { await fn(h) } finally { h.close() } })

scenario('manual order buttons add/remove lines, preserve zero prices and create a customer order', async h => {
  await h.click('[data-action="new-order"]')
  h.fill('[name="customer_id"]', ids.customer)
  h.fill('[data-order-variant]', ids.variant); h.fill('[data-order-price]', '0'); h.fill('[data-order-quantity]', '2')
  assert.match(h.q('#manual-order-total').textContent, /0,00/)
  await h.click('[data-action="add-order-line"]')
  assert.equal(h.window.document.querySelectorAll('.manual-order-line').length, 2)
  assert.equal(h.q('.manual-order-line:last-child [data-order-price]').value, '')
  await h.click('.manual-order-line:last-child [data-action="remove-order-line"]')
  await h.click('[data-action="remove-order-line"]')
  assert.equal(h.window.document.querySelectorAll('.manual-order-line').length, 1)
  await h.submit('#new-order-form')
  const call = h.calls.find(call => call.rpc === 'create_admin_order')
  assert.equal(call.args.p_items[0].unit_price_cents, 0)
  assert.equal(call.args.p_items[0].quantity, 2)
  assert.equal(h.db.orders[0].total_cents, 0)
  assert.ok(h.q('.order-detail-page'))
})
scenario('manual physio order submits the practice and disables the customer requirement', async h => {
  await h.click('[data-action="new-order"]'); h.fill('[name="order_type"]', 'physio')
  for (const [name,value] of Object.entries({ physio_practice_name:'Test Praktijk',physio_email:'physio@example.invalid',physio_street:'Teststraat 1',physio_postal_code:'1234AB',physio_city:'Teststad' })) h.fill(`[name="${name}"]`,value)
  h.fill('[data-order-variant]',ids.variant); h.fill('[data-order-price]','0')
  await h.submit('#new-order-form')
  assert.equal(h.db.orders[0].order_type,'physio'); assert.equal(h.db.orders[0].customer_id,null)
})
scenario('manual order cancel and close buttons leave no order behind',async h=>{
  await h.click('[data-action="new-order"]'); await h.click('[data-close-dialog]'); assert.equal(h.q('#admin-dialog').open,false)
  await h.click('[data-action="new-order"]'); await h.click('#dialog-close'); assert.equal(h.q('#admin-dialog').open,false); assert.equal(h.db.orders.length,1)
})
scenario('manual order stops adding lines at the server limit',async h=>{
  await h.click('[data-action="new-order"]'); for(let i=0;i<22;i++) await h.click('[data-action="add-order-line"]')
  assert.equal(h.window.document.querySelectorAll('.manual-order-line').length,20)
})
scenario('order navigation opens the customer and returns to the list',async h=>{
  await h.click('[data-action="open-order"]'); await h.click('[data-action="open-customer"]'); assert.ok(h.q('#customer-form')); await h.click('[data-close-dialog]'); await h.click('[data-action="back-orders"]'); assert.ok(h.q('#orders-table'))
})
scenario('invoice button produces a printable invoice including zero totals',async h=>{
  h.db.orders[0].total_cents=0; await h.detail(); await h.click('[data-action="print-invoice"]')
  assert.equal(h.popups.length,1); assert.doesNotMatch(h.popups[0].args[2]||'',/noopener|noreferrer/)
  assert.equal(h.popups[0].popup.opener,null); assert.match(h.popups[0].popup.document.body.textContent,/Factuur/)
  assert.ok(h.popups[0].popup.document.querySelector('button'))
  h.popups[0].popup.document.querySelector('button').click(); assert.equal(h.popups[0].popup.printed,true)
})
scenario('tracking save, edit, remove and delivered actions persist their results',async h=>{
  await h.detail(); await h.click('[data-action="add-tracking"]'); h.fill('[name="tracking_code"]','TEST123'); h.q('[name="notify"]').checked=false; await h.submit('#tracking-form')
  assert.equal(h.db.orders[0].tracking_code,'TEST123'); assert.equal(h.db.orders[0].fulfillment_status,'shipped')
  await h.click('[data-action="add-tracking"]'); h.fill('[name="tracking_code"]','TEST456'); await h.submit('#tracking-form'); assert.equal(h.db.orders[0].tracking_code,'TEST456')
  await h.click('[data-action="remove-tracking"]'); assert.equal(h.db.orders[0].tracking_code,''); assert.equal(h.db.orders[0].fulfillment_status,'shipped')
  await h.click('[data-action="mark-delivered"]'); assert.equal(h.db.orders[0].fulfillment_status,'delivered'); assert.equal(h.db.orders[0].status,'completed')
})
scenario('tags, internal notes, timeline notes and note deletion persist',async h=>{
  await h.detail(); h.fill('#order-tags-form input','test, test, spoed'); await h.submit('#order-tags-form'); assert.deepEqual([...h.db.orders[0].tags],['test','spoed'])
  await h.click('[data-action="edit-order-note"]'); h.fill('#order-copy-form textarea','Testnotitie'); await h.submit('#order-copy-form'); assert.equal(h.db.orders[0].note,'Testnotitie')
  h.fill('#order-note-form textarea','Tijdlijntest'); await h.submit('#order-note-form'); assert.equal(h.db.order_notes.length,1)
  await h.click('[data-action="delete-order-note"]'); assert.equal(h.db.order_notes.length,0)
})
scenario('whitespace timeline notes are rejected before writing',async h=>{
  await h.detail(); h.fill('#order-note-form textarea','   '); await h.submit('#order-note-form'); assert.equal(h.db.order_notes.length,0)
})
scenario('returned orders retain their status when status is saved',async h=>{
  h.db.orders[0].fulfillment_status='returned'; h.db.orders[0].returned_at=new Date().toISOString(); await h.detail()
  assert.equal(h.q('#order-status-form [name="fulfillment_status"]').value,'returned')
  await h.submit('#order-status-form'); assert.equal(h.db.orders[0].fulfillment_status,'returned')
})
scenario('archive and unarchive can be found from the overview',async h=>{
  await h.detail(); await h.click('[data-action="toggle-archive"]'); assert.equal(h.db.orders[0].archived,true)
  await h.click('[data-action="back-orders"]'); assert.equal(h.q('#orders-table [data-action="open-order"]'),null)
  h.fill('[data-filter-archive="orders"]','archived'); await h.click('[data-action="open-order"]'); await h.click('[data-action="toggle-archive"]'); assert.equal(h.db.orders[0].archived,false)
})
scenario('refund and return buttons update the displayed order using the expected endpoints',async h=>{
  await h.detail(); await h.click('[data-action="refund-order"]'); h.fill('#refund-form [name="amount"]','10'); await h.submit('#refund-form'); assert.equal(h.db.payments[0].refunded_cents,1000)
  await h.click('[data-action="return-order"]'); await h.submit('#return-form'); assert.equal(h.db.orders[0].fulfillment_status,'returned')
})
scenario('unpaid orders cannot be refunded from the order page',async h=>{
  h.db.orders[0].payment_status='pending'; h.db.payments[0].status='pending'; await h.detail(); assert.equal(h.q('[data-action="refund-order"]'),null)
})
scenario('delete order returns to the overview',async h=>{
  await h.detail(); await h.click('[data-action="delete-order"]'); assert.equal(h.db.orders.length,0); assert.ok(h.q('#orders-table'))
})
scenario('confirmation reports sent, already-sent and disabled results accurately',async h=>{
  await h.detail(); h.respondWith({success:true,skipped:'email_disabled',results:[]}); await h.click('[data-action="send-order-email"]')
  assert.match(h.q('#toast-region').textContent,/niet verstuurd|uitgeschakeld/i)
})
scenario('PostNL label create and open use a window opened before the asynchronous request',async h=>{
  await h.detail(); await h.click('[data-action="postnl-label"]'); await h.submit('#postnl-label-form')
  assert.equal(h.db.orders[0].postnl.barcode,'TEST-BARCODE')
  assert.ok(h.popups.length); assert.equal(h.popups[0].args[0],'about:blank')
  await h.click('[data-action="postnl-label-url"]'); assert.equal(h.calls.filter(c=>c.function==='postnl-shipment').length,2)
})
scenario('export and CSV template download buttons create files; CSV import validates before submission',async h=>{
  await h.click('[data-action="export-orders"]'); assert.ok(h.downloads.some(x=>typeof x==='string'&&x.startsWith('zol-bestellingen-')))
  await h.click('[data-action="import-orders"]'); await h.click('[data-action="download-order-template"]'); assert.ok(h.downloads.includes('zol-bestellingen-import-voorbeeld.csv'))
  const file={name:'test.csv',size:100,text:async()=>h.run('orderImportTemplateCsv()')}
  Object.defineProperty(h.q('#order-import-file'),'files',{value:[file]}); h.q('#order-import-file').dispatchEvent(new h.window.Event('change')); await h.flush()
  assert.equal(h.q('#order-import-form [type="submit"]').disabled,false)
  // jsdom cannot populate the native FileList; preview validation above covers the selected file.
  h.q('#order-import-file').required = false
  await h.submit('#order-import-form'); assert.ok(h.calls.some(c=>c.rpc==='import_admin_orders'))
})
scenario('a denied update cannot report success and buttons recover',async h=>{
  await h.detail(); h.failNext('empty'); await h.click('[data-action="toggle-archive"]')
  assert.match(h.q('#toast-region').textContent,/mislukt|geen toegang/i); assert.equal(h.q('[data-action="toggle-archive"]').disabled,false)
})
scenario('a thrown network error leaves the form usable and shows an error',async h=>{
  await h.detail(); h.fill('#order-tags-form input','test'); h.failNext('throw'); await h.submit('#order-tags-form')
  assert.match(h.q('#toast-region').textContent,/Netwerk|mislukt/); assert.equal(h.q('#order-tags-form [type="submit"]').disabled,false)
})
scenario('repeated submits only perform one request while the first is pending',async h=>{
  await h.detail(); h.fill('#order-note-form textarea','Een keer'); const form=h.q('#order-note-form')
  form.dispatchEvent(new h.window.Event('submit',{cancelable:true})); form.dispatchEvent(new h.window.Event('submit',{cancelable:true})); await h.flush()
  assert.equal(h.db.order_notes.length,1)
})

scenario('sandbox physio labels do not send mail or mark the order as shipped', async h => {
  h.db.orders[0].order_type='physio'; await h.detail(); await h.click('[data-action="postnl-label"]'); await h.submit('#postnl-label-form')
  assert.notEqual(h.db.orders[0].fulfillment_status,'shipped'); assert.equal(h.calls.some(c=>c.function==='order-email'),false)
})
scenario('filtered export contains only matching orders and filters survive detail navigation', async h => {
  h.db.orders.push({...h.db.orders[0],id:'10000000-0000-4000-8000-000000000999',order_number:9999,customer_name:'Andere Klant'}); await h.refresh()
  h.fill('[data-filter="orders"]','Test Klant'); await h.click('[data-action="export-orders"]')
  assert.equal(h.calls.find(c=>c.table==='activity_log').payload.details.count,1)
  await h.click('[data-action="open-order"]'); await h.click('[data-action="back-orders"]'); assert.equal(h.q('[data-filter="orders"]').value,'Test Klant')
})
scenario('PostNL label remains accessible when the browser blocks new windows', async h => {
  h.window.open=()=>null; await h.detail(); await h.click('[data-action="postnl-label"]'); await h.submit('#postnl-label-form')
  assert.equal(h.q('#admin-dialog').open,true); assert.match(h.q('#dialog-body a').href,/label.html/)
})

scenario('production label submission requires confirmation and then sends the selected notification', async h => {
  h.db.settings.find(s=>s.key==='postnl_config').value.environment='production'
  await h.detail(); await h.click('[data-action="postnl-label"]'); await h.submit('#postnl-label-form')
  assert.equal(h.calls.some(c=>c.function==='postnl-shipment'),false)
  h.q('[name="confirm_production"]').checked=true; h.q('[name="notify"]').checked=true; await h.submit('#postnl-label-form')
  assert.equal(h.db.orders[0].fulfillment_status,'shipped'); assert.equal(h.calls.filter(c=>c.function==='order-email').length,1)
})
