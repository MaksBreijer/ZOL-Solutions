import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {runInNewContext} from 'node:vm'

const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/postnl-delivery-sync/index.ts',import.meta.url),'utf8')
  .replace(/^import .*\n/gm,''))

function harness({statusCode = '7',environment = 'production',enabled = true,verified = true} = {}) {
  const updates = [],activity = [],requests = []
  const order = {
    id:'00000000-0000-0000-0000-000000000001',order_number:1031,order_type:'physio',status:'open',
    fulfillment_status:'shipped',tracking_code:'3STEST123',tracking_carrier:'PostNL',created_at:'2026-09-03T12:00:00Z',
    postnl:{environment,barcode:'3STEST123',label_path:'saved.pdf',created_at:new Date(Date.now()-24*60*60*1000).toISOString()},
  }
  let handler
  const db = {
    rpc:async () => ({data:verified,error:null}),
    from(table) {
      const query = {
        select() { return query },eq() { return query },in() { return query },order() { return query },limit() { return query },
        update(value) { updates.push(value); Object.assign(order,value); return query },
        async maybeSingle() {
          if (table === 'settings') return {data:{value:{enabled}},error:null}
          return {data:{id:order.id},error:null}
        },
        async insert(value) { activity.push(value); return {error:null} },
        then(resolve,reject) { return Promise.resolve({data:table === 'orders' ? [order] : [],error:null}).then(resolve,reject) },
      }
      return query
    },
  }
  runInNewContext(source,{
    Deno:{serve:fn => {handler=fn},env:{get:name => name === 'POSTNL_PRODUCTION_API_KEY' ? 'mock-postnl-key' : 'mock-supabase'}},
    createClient:() => db,Response,URLSearchParams,
    fetch:async (url,options) => {
      requests.push({url,options})
      return Response.json({CurrentStatus:{Shipment:{Status:{StatusCode:statusCode,StatusDescription:statusCode === '11' ? 'Zending afgeleverd' : 'Bezorger is onderweg',PhaseCode:statusCode === '11' ? '4' : '3',TimeStamp:'07-09-2026 15:30:00'}}}})
    },
  })
  return {
    order,updates,activity,requests,
    run:() => handler(new Request('https://example.invalid/postnl-delivery-sync',{method:'POST',headers:{'x-zol-postnl-delivery-secret':'mock-secret'}})),
  }
}

test('PostNL status 11 completes the order and records one automatic delivery event',async () => {
  const h = harness({statusCode:'11'})
  const response = await h.run()
  assert.equal(response.status,200)
  const body = await response.json()
  assert.equal(body.checked,1)
  assert.equal(body.delivered,1)
  assert.equal(h.requests.length,1)
  assert.match(h.requests[0].url,/shipment\/v2\/status\/barcode\/3STEST123\?/) 
  assert.equal(h.requests[0].options.headers.apikey,'mock-postnl-key')
  assert.equal(h.updates.length,1)
  assert.equal(h.order.fulfillment_status,'delivered')
  assert.equal(h.order.status,'completed')
  assert.ok(h.order.delivered_at)
  assert.equal(h.order.postnl.last_status_code,'11')
  assert.equal(h.activity.length,1)
  assert.equal(h.activity[0].action,'Bestelling automatisch als bezorgd gemarkeerd')
})

test('an in-transit PostNL status leaves the order open and does not create activity',async () => {
  const h = harness({statusCode:'7'})
  const response = await h.run()
  const body = await response.json()
  assert.equal(body.checked,1)
  assert.equal(body.delivered,0)
  assert.equal(body.pending,1)
  assert.equal(h.updates.length,0)
  assert.equal(h.activity.length,0)
  assert.equal(h.order.fulfillment_status,'shipped')
})

test('sandbox labels are never polled against the production status API',async () => {
  const h = harness({statusCode:'11',environment:'sandbox'})
  const response = await h.run()
  const body = await response.json()
  assert.equal(body.checked,0)
  assert.equal(h.requests.length,0)
  assert.equal(h.updates.length,0)
})

test('new labels wait for PostNL scans and stale labels stop consuming status requests',async () => {
  for (const ageMs of [60*60*1000,36*24*60*60*1000]) {
    const h = harness()
    h.order.postnl.created_at = new Date(Date.now()-ageMs).toISOString()
    const response = await h.run()
    assert.equal((await response.json()).checked,0)
    assert.equal(h.requests.length,0)
    assert.equal(h.updates.length,0)
  }
})

test('the scheduled endpoint rejects an invalid cron secret before contacting PostNL',async () => {
  const h = harness({verified:false})
  const response = await h.run()
  assert.equal(response.status,401)
  assert.equal(h.requests.length,0)
  assert.equal(h.updates.length,0)
})
