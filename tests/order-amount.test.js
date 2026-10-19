import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
test('order amount transaction validates authorization, payment state, totals and audit trail', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema auth; create schema private; create role anon; create role authenticated;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      create function private.is_admin(text[]) returns boolean language sql as $$ select coalesce(current_setting('test.admin', true), 'false')::boolean $$;
      create table orders(id uuid primary key, order_number bigint, source text, payment_status text, status text, fulfillment_status text, updated_at timestamptz, subtotal_cents integer, shipping_cents integer, discount_cents integer, tax_cents integer, total_cents integer, discount_code text, discount_id uuid);
      create table payments(id uuid primary key, order_id uuid, provider text, provider_payment_id text, status text, refunded_cents integer, amount_cents integer);
      create table products(id uuid primary key, tax_rate numeric, stock integer);
      create table order_items(id uuid primary key, order_id uuid, product_id uuid, quantity integer, unit_price_cents integer, total_cents integer);
      create table admin_profiles(id uuid primary key, email text);
      create table activity_log(actor_id uuid, actor_email text, action text, entity_type text, entity_id uuid, details jsonb);
      create function touch_order() returns trigger language plpgsql as $$ begin new.updated_at = clock_timestamp(); return new; end; $$;
      create trigger touch_order before update on orders for each row execute function touch_order();
      grant usage on schema public, auth, private to authenticated;
      grant select, update on orders, payments, order_items to authenticated;
      grant select on products, admin_profiles to authenticated;
      grant insert, select on activity_log to authenticated;
      insert into orders values ('${id(1)}', 1040, 'admin', 'pending', 'open', 'shipped', '2026-09-14T10:00:00Z', 9995, 0, 0, 1735, 9995, null, null);
      insert into payments values ('${id(2)}', '${id(1)}', 'manual', null, 'pending', 0, 9995);
      insert into products values ('${id(3)}', 21, 9);
      insert into order_items values ('${id(4)}', '${id(1)}', '${id(3)}', 1, 9995, 9995);
      insert into admin_profiles values ('${id(5)}', 'admin@example.invalid');
      select set_config('test.uid', '${id(5)}', false), set_config('test.admin', 'true', false);
    `)
    await db.exec(readFileSync(new URL('../supabase/migrations/20260914114005_edit_order_amount.sql', import.meta.url), 'utf8'))
    await db.exec(readFileSync(new URL('../supabase/migrations/20261019150000_edit_paid_manual_order_amount.sql', import.meta.url), 'utf8'))
    const edit = async (price = 5000, opts = {}) => (await db.query('select public.update_admin_order_amount($1,$2,$3::jsonb,$4,$5,$6) result', [id(1), opts.timestamp ?? '2026-09-14T10:00:00Z', JSON.stringify(opts.items ?? [{ id: id(4), unit_price_cents: price }]), opts.shipping ?? 0, opts.discount ?? 0, opts.reason ?? 'Prijsafspraak'])).rows[0].result
    const snapshot = async () => (await db.query('select row_to_json(o) as row from orders o')).rows[0].row
    const isolated = async fn => { await db.exec('begin'); try { await fn() } finally { await db.exec('rollback') } }
    await isolated(async () => {
      await db.exec('set local role authenticated')
      const result = await edit(5000, {shipping:455,discount:1000})
      assert.equal(result.total_cents,4455)
      const order=await snapshot(); assert.equal(order.subtotal_cents,5000); assert.equal(order.tax_cents,694); assert.equal(order.fulfillment_status,'shipped')
      assert.equal((await db.query('select amount_cents from payments')).rows[0].amount_cents,4455)
      assert.equal((await db.query('select total_cents from order_items')).rows[0].total_cents,5000)
      assert.equal((await db.query('select stock from products')).rows[0].stock,9)
      const log=(await db.query('select * from activity_log')).rows[0]
      assert.equal(log.details.before.total_cents,9995); assert.equal(log.details.after.total_cents,4455); assert.match(log.action,/Prijsafspraak/)
      await assert.rejects(edit(1000),/intussen gewijzigd/)
    })
    await isolated(async () => { await edit(0); const o=await snapshot(); assert.equal(o.total_cents,0); assert.equal(o.tax_cents,0) })
    await isolated(async () => { await edit(12345); assert.equal((await snapshot()).total_cents,12345) })
    await isolated(async () => { await edit(9995); assert.equal((await db.query('select * from activity_log')).rows.length,0) })
    for (const [price, opts] of [[-1,{}],[1.5,{}],[1000001,{}],['10',{}],[null,{}],[100,{discount:101}],[100,{shipping:-1}],[100,{reason:'   '}],[100,{items:[]}],[100,{items:[{id:id(6),unit_price_cents:100}]}],[100,{items:[{id:id(4),unit_price_cents:100},{id:id(4),unit_price_cents:100}]}]]) {
      await isolated(async()=>{ await assert.rejects(edit(price,opts)); })
      assert.equal((await snapshot()).total_cents,9995)
    }
    for (const sql of ["update orders set source='zol-webshop'", "update orders set status='cancelled'", "update orders set fulfillment_status='returned'", "update payments set status='paid'", "update payments set status='authorized'", "update payments set provider='mollie'", "update payments set provider_payment_id='tr_test'", "update payments set refunded_cents=100", "delete from payments"]) {
      await isolated(async()=>{ await db.exec(sql); const o=await snapshot(); await assert.rejects(edit(0,{timestamp:o.updated_at})); })
    }
    await isolated(async()=>{await db.exec("select set_config('test.admin','false',true)"); await assert.rejects(edit(),/Geen toestemming/)})
    await isolated(async()=>{await db.exec("select set_config('test.uid','',true)"); await assert.rejects(edit(),/Geen toestemming/)})
    await isolated(async()=>{await db.exec('set local role anon'); await assert.rejects(edit(),/permission denied/)})
    // Even a failure after changing all totals rolls back everything.
    await isolated(async()=>{
      await db.exec("alter table activity_log add constraint reject_audit check (false)")
      await assert.rejects(edit(),/reject_audit/)
    })
    assert.equal((await snapshot()).total_cents,9995)
    assert.equal((await db.query('select amount_cents from payments')).rows[0].amount_cents,9995)
    assert.equal((await db.query('select total_cents from order_items')).rows[0].total_cents,9995)
  } finally { await db.close() }
})

test('paid manual orders can change amount and post an accounting correction; provider payments stay locked', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema auth; create schema private; create role anon; create role authenticated;
      create function auth.uid() returns uuid language sql as $$ select '${id(5)}'::uuid $$;
      create function private.is_admin(text[]) returns boolean language sql as $$ select true $$;
      create table orders(id uuid primary key, order_number bigint, source text, payment_status text, status text, fulfillment_status text, updated_at timestamptz, subtotal_cents integer, shipping_cents integer, discount_cents integer, tax_cents integer, total_cents integer, discount_code text, discount_id uuid);
      create table payments(id uuid primary key, order_id uuid, provider text, provider_payment_id text, status text, refunded_cents integer, amount_cents integer);
      create table products(id uuid primary key, tax_rate numeric, stock integer);
      create table order_items(id uuid primary key, order_id uuid, product_id uuid, quantity integer, unit_price_cents integer, total_cents integer);
      create table admin_profiles(id uuid primary key, email text);
      create table activity_log(actor_id uuid, actor_email text, action text, entity_type text, entity_id uuid, details jsonb);
      create table accounting_entries(source_type text, source_id uuid, source_revision text);
      create table posted(reference text, lines jsonb);
      create function private.create_accounting_entry(date, text, text, text, text, uuid, text, jsonb, jsonb) returns uuid language plpgsql as $$ begin insert into public.posted values ($3, $9); return null; end; $$;
      grant usage on schema public, auth, private to authenticated;
      grant select, update on orders, payments, order_items to authenticated;
      grant select on products, admin_profiles, accounting_entries to authenticated;
      grant insert, select on activity_log to authenticated;
      grant insert, select on posted to authenticated;
      grant execute on function private.create_accounting_entry(date, text, text, text, text, uuid, text, jsonb, jsonb) to authenticated;
      insert into orders values ('${id(1)}', 1040, 'admin', 'paid', 'open', 'shipped', '2026-09-14T10:00:00Z', 9995, 0, 0, 1735, 9995, null, null);
      insert into payments values ('${id(2)}', '${id(1)}', 'manual', null, 'paid', 0, 9995);
      insert into products values ('${id(3)}', 21, 9);
      insert into order_items values ('${id(4)}', '${id(1)}', '${id(3)}', 1, 9995, 9995);
      insert into admin_profiles values ('${id(5)}', 'admin@example.invalid');
      insert into accounting_entries values ('order_sale', '${id(1)}', 'sale');
    `)
    await db.exec(readFileSync(new URL('../supabase/migrations/20260914114005_edit_order_amount.sql', import.meta.url), 'utf8'))
    await db.exec(readFileSync(new URL('../supabase/migrations/20261019150000_edit_paid_manual_order_amount.sql', import.meta.url), 'utf8'))
    const edit = (price) => db.query('select public.update_admin_order_amount($1,$2,$3::jsonb,0,0,$4) result', [id(1), '2026-09-14T10:00:00Z', JSON.stringify([{ id: id(4), unit_price_cents: price }]), 'Prijsafspraak'])
    await db.exec('begin'); await db.exec('set local role authenticated')
    await edit(5000)
    assert.equal((await db.query('select total_cents from orders')).rows[0].total_cents, 5000)
    assert.equal((await db.query('select amount_cents, status from payments')).rows[0].amount_cents, 5000)
    const lines = (await db.query('select lines from posted')).rows[0].lines
    const sum = key => lines.reduce((total, line) => total + line[key], 0)
    assert.equal(sum('debit_cents'), sum('credit_cents')); assert.equal(sum('debit_cents'), 4995)
    await db.exec('rollback')
    for (const sql of ["update payments set provider='mollie'", "update payments set provider_payment_id='tr_x'", "update payments set refunded_cents=100", "update orders set status='cancelled'"]) {
      await db.exec('begin'); await db.exec(sql)
      const { rows } = await db.query('select updated_at from orders')
      await db.exec('set local role authenticated')
      await assert.rejects(db.query('select public.update_admin_order_amount($1,$2,$3::jsonb,0,0,$4)', [id(1), rows[0].updated_at, JSON.stringify([{ id: id(4), unit_price_cents: 1 }]), 'x']))
      await db.exec('rollback')
    }
  } finally { await db.close() }
})
