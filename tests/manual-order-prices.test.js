import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
test('manual order RPC preserves zero/custom prices and rejects invalid prices', async () => {
const db = new PGlite()
try {
await db.exec(`
create schema auth; create schema private;
create role anon; create role authenticated;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function private.is_admin(text[]) returns boolean language sql as $$ select coalesce(current_setting('test.admin',true),'false')::boolean $$;
create table public.customers(id uuid primary key, email text, first_name text, last_name text, address jsonb, total_orders integer default 0);
create table public.products(id uuid primary key, name text, price_cents integer, tax_rate numeric, active boolean);
create table public.product_variants(id uuid primary key, product_id uuid, title text, sku text, stock integer, active boolean, price_cents integer);
create table public.orders(id uuid primary key default gen_random_uuid(), order_number bigint generated always as identity, customer_id uuid, customer_email text, customer_name text, order_type text, status text, payment_status text, fulfillment_status text, subtotal_cents integer, shipping_cents integer, tax_cents integer, total_cents integer, currency text, shipping_address jsonb, note text, source text, tracking_destination jsonb);
create table public.order_items(order_id uuid, product_id uuid, variant_id uuid, product_name text, variant_name text, sku text, quantity integer, unit_price_cents integer, total_cents integer);
create table public.payments(order_id uuid, provider text, status text, method text, amount_cents integer, currency text, metadata jsonb);
insert into customers values ('00000000-0000-0000-0000-000000000001','test@example.invalid','Test','Klant','{}',0);
insert into products values ('00000000-0000-0000-0000-000000000002','Test product',9995,21,true);
insert into product_variants values ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','M','TEST',100,true,null);
select set_config('test.uid','00000000-0000-0000-0000-000000000004',false),set_config('test.admin','true',false);
`)
await db.exec(readFileSync(new URL('../supabase/migrations/20260903151717_allow_manual_order_prices.sql',import.meta.url),'utf8'))
const customer = '00000000-0000-0000-0000-000000000001'
const variant = '00000000-0000-0000-0000-000000000003'
const physio={practice_name:'Test praktijk',email:'test@example.invalid',street:'Teststraat 1',postal_code:'1234AB',city:'Teststad'}
async function create(price, {type='customer',quantity=1,shipping=0}={}) {
 const item={variant_id:variant,quantity}; if(price!==undefined)item.unit_price_cents=price
 const {rows}=await db.query(`select public.create_admin_order($1,$2::jsonb,'open','pending','unfulfilled',$3,'',$4,$5::jsonb) as result`,[type==='customer'?customer:null,JSON.stringify([item]),shipping,type,JSON.stringify(physio)])
 return rows[0].result
}
async function verify(price,opts,unit) {
 await db.exec('begin')
 try {
  const result=await create(price,opts)
  assert.equal(result.subtotal_cents,unit*(opts.quantity||1))
  assert.equal(result.total_cents,result.subtotal_cents+(opts.shipping||0))
  const {rows:[line]}=await db.query('select unit_price_cents,total_cents from order_items where order_id=$1',[result.order_id])
  assert.equal(line.unit_price_cents,unit); assert.equal(line.total_cents,result.subtotal_cents)
  const {rows:[payment]}=await db.query('select amount_cents from payments where order_id=$1',[result.order_id]); assert.equal(payment.amount_cents,result.total_cents)
  const {rows:[stock]}=await db.query('select stock from product_variants where id=$1',[variant]); assert.equal(stock.stock,100-(opts.quantity||1))
  if(unit===0) assert.equal(result.tax_cents,0)

 }finally{await db.exec('rollback')}
}
await verify(0,{type:'customer',quantity:2},0)
await verify(0,{type:'physio',quantity:2},0)
await verify(0,{shipping:455},0)
await verify(1234,{quantity:3,shipping:455},1234)
await verify(undefined,{},9995)
await verify(null,{},9995)
await db.exec('update product_variants set price_cents=7995')
await verify(undefined,{},7995)
await verify(0,{},0)
for(const price of [-1,0.5,1000001,'0','invalid',true,{}]) {
 await assert.rejects(()=>create(price))
}
await db.exec("select set_config('test.admin','false',false)")
await assert.rejects(()=>create(0),/Geen toestemming/)
await db.exec("select set_config('test.admin','true',false); select set_config('test.uid','',false)")
await assert.rejects(()=>create(0),/Geen toestemming/)

} finally { await db.close() }
})
