import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const migration = readFileSync(new URL('../supabase/migrations/20260903154735_enable_physio_order_confirmation_emails.sql', import.meta.url), 'utf8')
const priceMigration = readFileSync(new URL('../supabase/migrations/20260903151717_allow_manual_order_prices.sql', import.meta.url), 'utf8')
const trackingMigration = readFileSync(new URL('../supabase/migrations/20260903154745_enable_physio_tracking_emails.sql', import.meta.url), 'utf8')
const customer = '00000000-0000-0000-0000-000000000001'
const variant = '00000000-0000-0000-0000-000000000003'

test('manual order RPC queues one created email event for customers and physios regardless of payment', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema auth; create schema private;
      create role anon; create role authenticated;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create function private.is_admin(text[]) returns boolean language sql as $$ select coalesce(current_setting('test.admin',true),'false')::boolean $$;
      create table customers(id uuid primary key, email text, first_name text, last_name text, address jsonb, total_orders integer default 0);
      create table products(id uuid primary key, name text, price_cents integer, tax_rate numeric, active boolean);
      create table product_variants(id uuid primary key, product_id uuid, title text, sku text, stock integer, active boolean, price_cents integer);
      create table orders(id uuid primary key default gen_random_uuid(), order_number bigint generated always as identity, customer_id uuid, customer_email text, customer_name text, order_type text, status text, payment_status text, fulfillment_status text, subtotal_cents integer, shipping_cents integer, tax_cents integer, total_cents integer, currency text, shipping_address jsonb, note text, source text, tracking_destination jsonb);
      create table order_items(order_id uuid, product_id uuid, variant_id uuid, product_name text, variant_name text, sku text, quantity integer, unit_price_cents integer, total_cents integer);
      create table payments(order_id uuid, provider text, status text, method text, amount_cents integer, currency text, metadata jsonb);
      create table test_email_queue(order_id uuid, action text);
      create function private.enqueue_order_email(p_order_id uuid,p_action text) returns void language sql as $$ insert into public.test_email_queue values(p_order_id,p_action) $$;
      create function private.notify_created_order_emails() returns trigger language plpgsql security definer set search_path='' as $$ begin perform private.enqueue_order_email(new.id,'created'); return new; end $$;
      create trigger notify_created_order_emails after insert on orders for each row when(new.order_type='customer') execute function private.notify_created_order_emails();
      insert into customers values('${customer}','customer@example.invalid','Test','Klant','{}',0);
      insert into products values('00000000-0000-0000-0000-000000000002','Test product',9995,21,true);
      insert into product_variants values('${variant}','00000000-0000-0000-0000-000000000002','M','TEST',100,true,null);
      select set_config('test.uid','00000000-0000-0000-0000-000000000004',false),set_config('test.admin','true',false);
    `)
    await db.exec(priceMigration)
    await db.exec("alter table orders add column tracking_code text default '', add column postnl jsonb default '{}'::jsonb")
    await db.exec(migration)
    await db.exec(trackingMigration)
    await db.exec(migration) // Redeployment replaces the trigger, never doubles it.
    const physio = { practice_name:'Test Praktijk',email:'physio@example.invalid',street:'Teststraat 1',postal_code:'1234AB',city:'Teststad' }
    const create = (type, status, price = 9995) => db.query(
      `select create_admin_order($1,$2::jsonb,'open',$3,'unfulfilled',0,'',$4,$5::jsonb) as result`,
      [type === 'customer' ? customer : null, JSON.stringify([{ variant_id:variant,quantity:1,unit_price_cents:price }]), status, type, JSON.stringify(physio)],
    )
    for (const type of ['customer','physio']) {
      for (const status of ['pending','paid','failed']) {
        for (const price of [9995,0]) {
          await db.exec('begin')
          const { rows:[{ result }] } = await create(type,status,price)
          const { rows } = await db.query(`select q.action,o.customer_email,o.payment_status,(select count(*)::integer from order_items where order_id=o.id) as item_count,(select count(*)::integer from payments where order_id=o.id) as payment_count from test_email_queue q join orders o on o.id=q.order_id where o.id=$1`,[result.order_id])
          assert.deepEqual(rows,[{action:'created',customer_email:`${type === 'customer' ? 'customer' : 'physio'}@example.invalid`,payment_status:status,item_count:1,payment_count:1}])
          await db.query(`update orders set note='Updated internal note' where id=$1`,[result.order_id])
          assert.equal((await db.query('select count(*)::integer as n from test_email_queue')).rows[0].n,1)
          await db.exec('rollback')
          assert.equal((await db.query('select count(*)::integer as n from test_email_queue')).rows[0].n,0)
        }
      }
    }
    // The webshop's existing unpaid confirmation route is unchanged.
    await db.exec(`insert into orders(order_type,source,payment_status,customer_email) values('customer','zol-webshop','pending','web@example.invalid')`)
    assert.deepEqual((await db.query('select action from test_email_queue')).rows,[{action:'created'}])
    await db.exec("select set_config('test.admin','false',false)")
    await assert.rejects(() => create('physio','pending'),/Geen toestemming/)
    assert.equal((await db.query('select count(*)::integer as n from test_email_queue')).rows[0].n,1)
    await db.exec("select set_config('test.admin','true',false)")
    for (const type of ['customer','physio']) {
      await db.exec('begin')
      const { rows:[{ result }] } = await create(type,'pending',0)
      const events = async () => (await db.query('select action from test_email_queue where order_id=$1',[result.order_id])).rows.map(row => row.action)
      // No notification until a real tracked shipment is marked as shipped.
      await db.query("update orders set fulfillment_status='shipped' where id=$1",[result.order_id])
      assert.deepEqual(await events(),['created'])
      await db.query(`update orders set tracking_code='SANDBOX',postnl='{"environment":"sandbox","barcode":"SANDBOX"}' where id=$1`,[result.order_id])
      assert.deepEqual(await events(),['created'])
      await db.query(`update orders set tracking_code='REAL123',postnl='{"environment":"production","barcode":"REAL123"}' where id=$1`,[result.order_id])
      assert.deepEqual(await events(),['created','shipping'])
      await db.query("update orders set note='Internal edit' where id=$1",[result.order_id])
      assert.deepEqual(await events(),['created','shipping'])
      await db.query("update orders set tracking_code='REAL456' where id=$1",[result.order_id])
      assert.deepEqual(await events(),['created','shipping','shipping'])
      assert.equal((await db.query('select payment_status from orders where id=$1',[result.order_id])).rows[0].payment_status,'pending')
      await db.exec('rollback')
    }
  } finally {
    await db.close()
  }
})

test('created email handler sends to the customer or physio without requiring payment and deduplicates retries', async () => {
  const source = readFileSync(new URL('../supabase/functions/order-email/index.ts', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from "\.\.\/_shared\/email\.ts"\n/, '')
  for (const type of ['customer','physio']) {
    for (const [status, orderSource] of [['pending','admin'],['paid','admin'],['pending','zol-webshop'],['paid','zol-webshop']]) {
      const order = {id:customer,order_number:123,source:orderSource,order_type:type,customer_id:type === 'customer' ? customer : null,customer_email:`${type}@example.invalid`,customer_name:'Test Recipient',payment_status:status,total_cents:0,subtotal_cents:0,shipping_cents:0,currency:'EUR',order_items:[],shipping_address:{}}
      const logs = new Map(), sent = []
      let handler
      const db = {
        from(table) {
          let filter
          const query = {
            select() { return query }, eq(key,value) { filter = value; return query }, order() { return query }, limit() { return query },
            async maybeSingle() { return {data:table === 'orders' ? order : table === 'payments' ? {} : logs.get(filter)} },
          }
          return query
        },
      }
      runInNewContext(stripTypeScriptTypes(source), {
        Deno:{serve(fn) { handler = fn }}, Response,
        adminClient:() => db, corsHeaders:() => ({}), requireAdmin:async () => ({}),
        getEmailConfig:async () => ({enabled:true,admin_email:'admin@example.invalid'}),
        getEmailTemplate:async key => ({enabled:true,audience:key === 'new_order_admin' ? 'admin' : 'customer',subject_template:key}),
        renderTemplate:value => value || '', templateParagraphs:() => '', emailShell:html => html,
        escapeHtml:value => String(value || ''), money:value => String(value), safeEmailUrl:value => value,
        logEmail:async (_db,payload) => { const log = {...payload,id:logs.size + 1,status:'queued'}; logs.set(payload.dedupe_key,log); return log },
        markEmail:async (_db,id,result) => { Object.assign([...logs.values()].find(log => log.id === id),result) },
        sendEmail:async email => { sent.push(email); return {id:`mock-${sent.length}`} },
      })
      const request = action => new Request('https://example.invalid/order-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:customer,action})})
      assert.equal((await handler(request('created'))).status,200)
      const expected = [[`${type}@example.invalid`,'order_received']]
      if (orderSource !== 'admin') expected.push(['admin@example.invalid','new_order_admin'])
      assert.deepEqual(sent.map(email => [email.to,email.subject]),expected)
      assert.equal((await handler(request('created'))).status,200)
      assert.equal(sent.length,expected.length,'a retry must not send another confirmation')
      if (status === 'pending') {
        assert.equal((await handler(request('paid'))).status,409)
        assert.equal(sent.length,expected.length,'an unpaid order must never get payment_confirmed')
      }
      order.tracking_code = 'SANDBOX'
      order.postnl = {environment:'sandbox',barcode:'SANDBOX'}
      assert.equal((await (await handler(request('shipping'))).json()).skipped,'sandbox_tracking')
      assert.equal(sent.length,expected.length)
      order.tracking_code = 'REAL123'
      order.tracking_url = 'https://jouw.postnl.nl/track-and-trace/REAL123-NL-1234AB'
      order.postnl = {environment:'production',barcode:'REAL123'}
      assert.equal((await handler(request('shipping'))).status,200)
      assert.equal(sent.at(-1).to,`${type}@example.invalid`)
      assert.equal(sent.at(-1).subject,'order_shipped')
      assert.match(sent.at(-1).text,/REAL123/)
      assert.match(sent.at(-1).text,/https:\/\/jouw\.postnl\.nl\/track-and-trace\//)
      await handler(request('shipping'))
      assert.equal(sent.length,expected.length + 1,'the database hook and browser call share one shipment dedupe key')
      order.payment_status = 'paid'
      assert.equal((await handler(request('paid'))).status,200)
      assert.equal(sent.at(-1).subject,'payment_confirmed')
      assert.equal(sent.length,expected.length + 2,'marking paid must not introduce an internal manual-order mail')
      const direct = await (await handler(request('new_order_admin'))).json()
      assert.equal(direct.results[0].status,orderSource === 'admin' ? 'skipped' : 'already_sent')
      assert.equal(sent.filter(email => email.to === 'admin@example.invalid').length,orderSource === 'admin' ? 0 : 1)
      assert.equal([...logs.values()].filter(log => log.kind === 'new_order_admin').length,orderSource === 'admin' ? 0 : 1)
    }
  }
})
