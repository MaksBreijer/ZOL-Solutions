import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/postnl-shipment/index.ts', import.meta.url),'utf8')
  .replace(/^import .*\n/gm,''))

function harness(overrides = {}, configOverrides = {}) {
  const order = {id:'00000000-0000-0000-0000-000000000001',order_number:123,source:'admin',order_type:'physio',payment_status:'pending',fulfillment_status:'unfulfilled',total_cents:0,customer_name:'Test Praktijk',customer_email:'physio@example.invalid',shipping_address:{street:'Teststraat 1',postal_code:'1234AB',city:'Teststad',country:'NL'},postnl:{},...overrides}
  const config = {environment:'production',enabled:true,production_enabled:true,customer_number:'TEST',customer_code:'TEST',sender_street:'Teststraat',sender_house_number:'1',sender_postal_code:'1234AB',sender_city:'Teststad',...configOverrides}
  const requests = [], updates = []
  let handler
  const db = {
    auth:{
      getUser:async () => ({data:{user:{id:'00000000-0000-0000-0000-000000000002'}}}),
      mfa:{getAuthenticatorAssuranceLevel:async () => ({data:{currentLevel:'aal2'}})},
      getClaims:async () => ({data:{claims:{session_id:'test-session'}}}),
    },
    rpc:async () => ({data:true}),
    from(table) {
      const query = {
        select() { return query },
        eq() { return query },
        async maybeSingle() { return {data:table === 'settings' ? {value:config} : table === 'orders' ? order : {active:true,role:'owner',id:'test-admin',email:'admin@example.invalid'}} },
        update(value) { updates.push(value); Object.assign(order,value); return query },
        async insert() { return {} },
      }
      return query
    },
    storage:{from:() => ({upload:async () => ({}),createSignedUrl:async () => ({data:{signedUrl:'https://example.invalid/mock-label.pdf'}})})},
  }
  runInNewContext(source, {
    Deno:{serve:fn => { handler = fn },env:{get:name => name.endsWith('API_KEY') ? 'mock-key' : 'mock-config'}},
    createClient:() => db, Response, URLSearchParams, atob,
    fetch:async (url,options) => {
      requests.push({url,options})
      return Response.json(url.includes('/barcode?') ? {Barcode:'MOCK123'} : {ResponseShipments:[{Barcode:'MOCK123',Labels:[{OutputType:'PDF',Content:'JVBERi1NT0NL'}]}]})
    },
  })
  return {order,requests,updates,create:(confirmation = true) => handler(new Request('https://example.invalid/postnl-shipment',{method:'POST',headers:{Authorization:'Bearer mock-token','Content-Type':'application/json'},body:JSON.stringify({action:'create',order_id:order.id,confirm_production:confirmation})}))}
}

test('unpaid physio samples/replacements and free manual customer orders can get a real label without changing payment',async () => {
  for (const overrides of [
    {order_type:'physio',total_cents:0},
    {order_type:'physio',total_cents:9995},
    {order_type:'customer',source:'admin',total_cents:0},
    {order_type:'customer',payment_status:'paid',total_cents:9995},
  ]) {
    const h = harness(overrides)
    const before = h.order.payment_status
    const response = await h.create()
    assert.equal(response.status,200,JSON.stringify(await response.clone().json()))
    assert.equal(h.requests.length,2)
    assert.match(h.requests[1].url,/api\.postnl\.nl\/shipment\/v2_2\/label\?confirm=true/)
    assert.equal(h.order.payment_status,before)
    assert.equal(h.updates.some(update => 'payment_status' in update),false)
    assert.equal(h.order.tracking_code,'MOCK123')
  }
})

test('ordinary unpaid purchases, failed/refunded physio payments and missing production consent stay blocked',async () => {
  for (const overrides of [
    {order_type:'customer',total_cents:9995},
    {order_type:'customer',source:'zol-webshop',total_cents:0},
    {payment_status:'failed'},
    {payment_status:'refunded'},
    {payment_status:'partially_refunded'},
  ]) {
    const h = harness(overrides)
    assert.equal((await h.create()).status,409)
    assert.equal(h.requests.length,0)
    assert.equal(h.updates.length,0)
  }
  const h = harness()
  assert.equal((await h.create(false)).status,409)
  assert.equal(h.requests.length,0)
  const disabled = harness({}, {production_enabled:false})
  assert.equal((await disabled.create()).status,409)
  assert.equal(disabled.requests.length,0)
})

test('Dutch country display names and ISO codes produce NL labels without modifying the stored address',async () => {
  for (const country of ['NL','nl','NLD','Nederland',' Nederland ','Netherlands','The Netherlands','the   netherlands',null,undefined,'']) {
    const address = {street:'Teststraat 1',postal_code:'1234AB',city:'Teststad',country}
    const h = harness({order_type:'customer',payment_status:'paid',shipping_address:address},{sender_country:'Nederland'})
    const response = await h.create()
    assert.equal(response.status,200,`${country}: ${JSON.stringify(await response.clone().json())}`)
    const payload = JSON.parse(h.requests[1].options.body)
    assert.equal(payload.Shipments[0].Addresses[0].Countrycode,'NL')
    assert.equal(payload.Customer.Address.Countrycode,'NL')
    assert.equal(h.order.shipping_address.country,country)
  }
})

test('foreign and malformed country values never become Dutch by truncation',async () => {
  for (const country of ['BE','België','Belgium','DE','Germany','NE','Niger','NZ','NL-invalid','Nederlandse Antillen','Netherlands Antilles']) {
    const h = harness({shipping_address:{street:'Teststraat 1',postal_code:'1234AB',city:'Teststad',country}})
    const response = await h.create()
    assert.equal(response.status,409,country)
    assert.match((await response.json()).error,/Nederlandse zendingen/)
    assert.equal(h.requests.length,0,'no barcode or paid shipment may be requested')
    assert.equal(h.updates.length,0)
  }
})
