import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Execute the actual production RPC definitions in an isolated Postgres engine.
test('return and delete RPCs restore stock once and preserve imported inventory', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema auth; create schema private; create role anon; create role authenticated;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function private.is_admin(text[]) returns boolean language sql as $$select current_setting('test.admin',true) = 'true'$$;
      create table customers(id uuid primary key, total_orders integer, total_spent_cents integer);
      create table admin_profiles(id uuid primary key, email text);
      create table orders(id uuid primary key, order_number bigint, customer_id uuid, source text, status text, fulfillment_status text, returned_at timestamptz);
      create table product_variants(id uuid primary key, stock integer);
      create table order_items(order_id uuid references orders(id) on delete cascade, variant_id uuid, quantity integer);
      create table payments(order_id uuid references orders(id) on delete cascade, status text, amount_cents integer, refunded_cents integer);
      create table activity_log(actor_id uuid, actor_email text, action text, entity_type text, entity_id text, details jsonb, created_at timestamptz default now());
      select set_config('test.uid','10000000-0000-4000-8000-000000000001',false),set_config('test.admin','true',false);
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20260903152736_prevent_duplicate_order_stock_restoration.sql', import.meta.url), 'utf8'))
    const oid = '10000000-0000-4000-8000-000000000006'
    const vid = '10000000-0000-4000-8000-000000000004'
    async function reset(source='admin') {
      await db.exec('truncate orders cascade; truncate product_variants,activity_log;')
      await db.query(`insert into orders(id,order_number,source,status,fulfillment_status) values($1,9001,$2,'open','shipped')`,[oid,source])
      await db.query('insert into product_variants values($1,9)',[vid])
      await db.query('insert into order_items values($1,$2,1)',[oid,vid])
    }
    const stock = async () => (await db.query('select stock from product_variants')).rows[0].stock
    const rpc = async (name, restore=true) => (await db.query(`select public.${name}($1,$2) as result`,[oid,restore])).rows[0].result
    await reset(); await rpc('return_admin_order'); assert.equal(await stock(),10)
    assert.equal((await rpc('return_admin_order')).already_returned,true); assert.equal(await stock(),10)
    assert.equal((await rpc('delete_admin_order')).stock_restored,false); assert.equal(await stock(),10)
    await reset(); await rpc('return_admin_order'); await db.exec("update orders set fulfillment_status='shipped'"); await rpc('return_admin_order'); assert.equal(await stock(),10)
    await reset(); assert.equal((await rpc('delete_admin_order')).stock_restored,true); assert.equal(await stock(),10)
    await reset('csv-import'); assert.equal((await rpc('delete_admin_order')).stock_restored,false); assert.equal(await stock(),9)
    await reset(); await rpc('return_admin_order',false); assert.equal(await stock(),9); await rpc('delete_admin_order'); assert.equal(await stock(),10)
    await reset(); await db.exec("select set_config('test.admin','false',false)"); await assert.rejects(()=>rpc('return_admin_order'),/Geen toestemming/); await assert.rejects(()=>rpc('delete_admin_order'),/Geen toestemming/)
  } finally { await db.close() }
})
