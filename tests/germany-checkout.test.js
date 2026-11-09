import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { localizeOrderTemplate, localizeProductName, orderEmailLabels } from '../supabase/functions/_shared/german-order-email.js'

// Stand-in with the same shipping lines as the live checkout functions.
const body = country => `
declare v_country text := upper(${country}); v_commerce jsonb; v_shipping integer;
begin
  if v_country not in ('NL', 'BE') then raise exception 'land'; end if;
  select value into v_commerce from public.settings where key = 'commerce';
  v_shipping := case v_country
    when 'BE' then coalesce((v_commerce ->> 'belgium_shipping_cents')::integer, 495)
    else coalesce((v_commerce ->> 'shipping_cents')::integer, 0)
  end;
  return v_shipping;
end`

test('Germany costs €6.95 and stays closed until switched on', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create table public.settings(key text primary key, value jsonb, updated_at timestamptz);
      insert into public.settings values('commerce','{"shipping_cents":0}',now());
      create function public.quote_checkout_order(p_items jsonb, p_discount_code text, p_country text) returns integer language plpgsql security invoker set search_path = '' as $f$${body('p_country')};$f$;
      create function public.create_checkout_order(p_customer jsonb, p_items jsonb, p_note text, p_session_id text, p_discount_code text) returns integer language plpgsql security invoker set search_path = '' as $f$${body(`p_customer ->> 'country'`)};$f$;
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20261109120000_add_germany_checkout.sql', import.meta.url), 'utf8'))
    const quote = async country => (await db.query(`select public.quote_checkout_order('[]','',$1) as cents`, [country])).rows[0].cents
    const create = async country => (await db.query(`select public.create_checkout_order($1::jsonb,'[]','','','') as cents`, [JSON.stringify({ country })])).rows[0].cents
    await assert.rejects(quote('DE'), /nog niet geopend/)
    await assert.rejects(create('DE'), /nog niet geopend/)
    assert.equal(await quote('NL'), 0)
    assert.equal(await quote('BE'), 495)
    await assert.rejects(quote('FR'), /land/)
    await db.exec(`update public.settings set value = value || '{"germany_enabled":true}' where key='commerce'`)
    assert.equal(await quote('DE'), 695)
    assert.equal(await create('DE'), 695)
  } finally { await db.close() }
})

test('German deliveries get German customer mail, others are unchanged', () => {
  const base = { audience: 'customer', subject_template: 'NL' }
  const de = { shipping_address: { country: 'DE' } }
  const nl = { shipping_address: { country: 'NL' } }
  assert.match(localizeOrderTemplate(base, 'payment_confirmed', de).subject_template, /Zahlung/)
  assert.equal(localizeOrderTemplate(base, 'payment_confirmed', nl), base)
  const admin = { audience: 'admin', subject_template: 'NL' }
  assert.equal(localizeOrderTemplate(admin, 'new_order_admin', de), admin)
  assert.equal(orderEmailLabels(de).shipping, 'Versand')
  assert.equal(orderEmailLabels(nl).shipping, 'Verzending')
  assert.equal(localizeProductName('ZOL 3/4 inlegzolen', de), 'ZOL 3/4 Einlagen')
})
