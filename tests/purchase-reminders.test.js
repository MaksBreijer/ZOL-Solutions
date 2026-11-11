import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { purchaseReminderCopy } from '../supabase/functions/_shared/purchase-reminder.js'

const migration = readFileSync(new URL('../supabase/migrations/20261111120000_purchase_reminders.sql', import.meta.url), 'utf8')
const reminderFunction = readFileSync(new URL('../supabase/functions/welcome-reminder/index.ts', import.meta.url), 'utf8')

async function createDatabase() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema cron;
    create table cron.job(jobname text primary key, schedule text, command text);
    create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language sql as $$
      insert into cron.job values (p_name, p_schedule, p_command)
      on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;
    create function cron.unschedule(p_name text) returns boolean language sql as $$ delete from cron.job where jobname = p_name returning true $$;
    select cron.schedule('zol-welcome-reminder-daily', '30 8 * * *', 'select 1');
    create table customers(
      id uuid primary key default gen_random_uuid(), email text unique not null, first_name text not null default '',
      marketing_opt_in boolean not null default false, marketing_opt_in_at timestamptz, marketing_unsubscribed_at timestamptz,
      marketing_unsubscribe_token uuid not null default gen_random_uuid(), created_at timestamptz not null default now());
    create table discounts(id uuid primary key default gen_random_uuid(), code text, issued_to_email text, active boolean default true,
      usage_count integer default 0, ends_at timestamptz, created_at timestamptz default now());
    create table orders(id uuid primary key default gen_random_uuid(), customer_id uuid, customer_email text, payment_status text, created_at timestamptz default now());
    insert into customers(email, first_name, marketing_opt_in, marketing_opt_in_at, created_at) values
      ('bestaand@example.invalid', 'Oud', true, now() - interval '90 days', now() - interval '90 days');
  `)
  await db.exec(migration)
  return db
}

const due = async (db) => (await db.query('select email, reminder_number, code from due_purchase_reminders(50) order by email')).rows
const addCustomer = (db, email, age, extra = '') => db.exec(
  `insert into customers(email, marketing_opt_in, marketing_opt_in_at, created_at${extra ? ', ' + extra.split('=')[0] : ''})
   values ('${email}', true, now() - interval '${age}', now() - interval '${age}'${extra ? ', ' + extra.split('=')[1] : ''})`,
)

test('herinneringen gaan na een half uur, een dag en drie dagen', async () => {
  const db = await createDatabase()
  try {
    await addCustomer(db, 'vers@example.invalid', '10 minutes')
    await addCustomer(db, 'halfuur@example.invalid', '31 minutes')
    assert.deepEqual(await due(db), [{ email: 'halfuur@example.invalid', reminder_number: 1, code: null }])

    await db.exec(`update customers set purchase_reminder_count = 1 where email = 'halfuur@example.invalid'`)
    assert.deepEqual(await due(db), [])
    await db.exec(`update customers set marketing_opt_in_at = now() - interval '25 hours' where email = 'halfuur@example.invalid'`)
    assert.deepEqual(await due(db), [{ email: 'halfuur@example.invalid', reminder_number: 2, code: null }])

    await db.exec(`update customers set purchase_reminder_count = 2 where email = 'halfuur@example.invalid'`)
    assert.deepEqual(await due(db), [])
    await db.exec(`update customers set marketing_opt_in_at = now() - interval '73 hours' where email = 'halfuur@example.invalid'`)
    assert.deepEqual(await due(db), [{ email: 'halfuur@example.invalid', reminder_number: 3, code: null }])

    await db.exec(`update customers set purchase_reminder_count = 3 where email = 'halfuur@example.invalid'`)
    assert.deepEqual(await due(db), [])
  } finally { await db.close() }
})

test('bestaande aanmelders starten bij het live-zetten en krijgen niet alles tegelijk', async () => {
  const db = await createDatabase()
  try {
    assert.deepEqual(await due(db), [])
    await db.exec(`update customers set purchase_reminder_started_at = now() - interval '4 days' where email = 'bestaand@example.invalid'`)
    assert.deepEqual(await due(db), [{ email: 'bestaand@example.invalid', reminder_number: 1, code: null }])
  } finally { await db.close() }
})

test('geen herinnering zonder toestemming, na afmelden, na betaling of tijdens het afrekenen', async () => {
  const db = await createDatabase()
  try {
    await db.exec(`
      insert into customers(email, marketing_opt_in, created_at) values ('geen-toestemming@example.invalid', false, now() - interval '5 days');
      insert into customers(email, marketing_opt_in, marketing_opt_in_at, marketing_unsubscribed_at) values ('afgemeld@example.invalid', true, now() - interval '5 days', now());
    `)
    for (const name of ['betaald', 'terugbetaald', 'afrekenen', 'verlaten', 'mislukt', 'poging']) await addCustomer(db, `${name}@example.invalid`, '2 hours')
    await db.exec(`
      insert into orders(customer_email, payment_status) values ('Betaald@Example.invalid ', 'paid');
      insert into orders(customer_id, customer_email, payment_status) select id, 'ander@example.invalid', 'refunded' from customers where email = 'terugbetaald@example.invalid';
      insert into orders(customer_email, payment_status, created_at) values ('afrekenen@example.invalid', 'pending', now() - interval '20 minutes');
      insert into orders(customer_email, payment_status, created_at) values ('verlaten@example.invalid', 'pending', now() - interval '3 hours');
      insert into orders(customer_email, payment_status) values ('mislukt@example.invalid', 'failed');
      update customers set purchase_reminder_attempt_at = now() - interval '1 hour' where email = 'poging@example.invalid';
    `)
    assert.deepEqual((await due(db)).map((row) => row.email), ['mislukt@example.invalid', 'verlaten@example.invalid'])
    await db.exec(`update customers set purchase_reminder_attempt_at = now() - interval '7 hours' where email = 'poging@example.invalid'`)
    assert.ok((await due(db)).some((row) => row.email === 'poging@example.invalid'))
  } finally { await db.close() }
})

test('alleen een geldige, ongebruikte persoonlijke code gaat mee in de mail', async () => {
  const db = await createDatabase()
  try {
    for (const name of ['geldig', 'verlopen', 'gebruikt']) await addCustomer(db, `${name}@example.invalid`, '1 hour')
    await db.exec(`
      insert into discounts(code, issued_to_email, ends_at) values ('GELDIG-AB12', 'geldig@example.invalid', now() + interval '20 days');
      insert into discounts(code, issued_to_email, ends_at) values ('VERLOPEN-AB12', 'verlopen@example.invalid', now() - interval '1 day');
      insert into discounts(code, issued_to_email, ends_at, usage_count) values ('GEBRUIKT-AB12', 'gebruikt@example.invalid', now() + interval '20 days', 1);
    `)
    assert.deepEqual(await due(db), [
      { email: 'gebruikt@example.invalid', reminder_number: 1, code: null },
      { email: 'geldig@example.invalid', reminder_number: 1, code: 'GELDIG-AB12' },
      { email: 'verlopen@example.invalid', reminder_number: 1, code: null },
    ])
  } finally { await db.close() }
})

test('migratie vervangt de dagelijkse taak door een taak per tien minuten en is herhaalbaar', async () => {
  const db = await createDatabase()
  try {
    await db.exec(migration)
    const { rows } = await db.query('select jobname, schedule from cron.job')
    assert.deepEqual(rows, [{ jobname: 'zol-purchase-reminder-every-ten-minutes', schedule: '*/10 * * * *' }])
  } finally { await db.close() }
})

test('mailteksten: met en zonder code, altijd zonder inleg-woorden, en de functie heeft een afmeldlink', () => {
  const withCode = [1, 2, 3].map((step) => purchaseReminderCopy({ step, firstName: 'Sanne', code: 'SANNE-AB12', validUntil: '1 december 2026' }))
  const withoutCode = [1, 2, 3].map((step) => purchaseReminderCopy({ step, firstName: '', code: null, validUntil: '' }))
  assert.equal(new Set(withCode.map((copy) => copy.subject)).size, 3)
  assert.match(withCode[0].subject, /voor je kind wachten nog/)
  assert.match(reminderFunction, /media\/product-blue\.jpg/)
  assert.match(withCode[2].intro, /1 december 2026/)
  assert.equal(withCode[0].greeting, 'Hoi Sanne,')
  assert.equal(withoutCode[0].greeting, 'Hoi,')
  for (const copy of withoutCode) assert.doesNotMatch(`${copy.subject} ${copy.intro} ${copy.closing}`, /code|korting|undefined|null/i)
  for (const copy of [...withCode, ...withoutCode]) assert.doesNotMatch(`${copy.subject} ${copy.title} ${copy.intro} ${copy.closing}`, /inleg/i)
  assert.match(reminderFunction, /List-Unsubscribe/)
  assert.match(reminderFunction, /due_purchase_reminders/)
})
