-- Herinneringsreeks voor iedereen in het klantbestand die zich heeft aangemeld maar nog niets heeft gekocht:
-- een half uur, een dag en drie dagen na aanmelding. Vervangt de oude codeherinneringen (na 5, 15 en 25 dagen).
-- Alleen klanten met toestemming voor productmail die zich niet hebben afgemeld. De reeks stopt zodra er is betaald.

alter table public.customers
  add column if not exists purchase_reminder_count integer not null default 0 check (purchase_reminder_count between 0 and 3),
  add column if not exists purchase_reminder_started_at timestamptz,
  add column if not exists purchase_reminder_attempt_at timestamptz;

-- Bestaande aanmelders starten de reeks op het moment van live-zetten, zodat ze de drie mails
-- netjes gespreid krijgen in plaats van alle drie tegelijk.
update public.customers
set purchase_reminder_started_at = now()
where marketing_opt_in and purchase_reminder_started_at is null and purchase_reminder_count = 0;

create index if not exists customers_purchase_reminder_idx
  on public.customers (purchase_reminder_count)
  where marketing_opt_in and purchase_reminder_count < 3;

drop function if exists public.due_welcome_reminders(integer);

create or replace function public.due_purchase_reminders(p_limit integer default 50)
returns table (customer_id uuid, email text, first_name text, unsubscribe_token uuid, reminder_number integer, code text, code_ends_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.email, c.first_name, c.marketing_unsubscribe_token, c.purchase_reminder_count + 1, d.code, d.ends_at
  from public.customers c
  left join public.discounts d
    on d.issued_to_email = c.email and d.active and d.usage_count = 0 and d.ends_at > now()
  where c.marketing_opt_in
    and c.marketing_unsubscribed_at is null
    and c.purchase_reminder_count < 3
    and coalesce(c.purchase_reminder_started_at, c.marketing_opt_in_at, c.created_at) <= now() - (
      case c.purchase_reminder_count when 0 then interval '30 minutes' when 1 then interval '1 day' else interval '3 days' end
    )
    -- Na een mislukte poging pas na zes uur opnieuw proberen.
    and (c.purchase_reminder_attempt_at is null or c.purchase_reminder_attempt_at <= now() - interval '6 hours')
    -- Geen herinnering voor wie al heeft betaald, of nu midden in het afrekenen zit.
    and not exists (
      select 1 from public.orders o
      where (o.customer_id = c.id or lower(btrim(o.customer_email)) = c.email)
        and (
          o.payment_status in ('paid', 'partially_refunded', 'refunded')
          or (o.payment_status = 'pending' and o.created_at > now() - interval '2 hours')
        )
    )
  order by coalesce(c.purchase_reminder_started_at, c.marketing_opt_in_at, c.created_at)
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.due_purchase_reminders(integer) from public, anon, authenticated;
grant execute on function public.due_purchase_reminders(integer) to service_role;

-- Elke tien minuten in plaats van één keer per dag, zodat de eerste mail echt na een half uur gaat.
select cron.unschedule('zol-welcome-reminder-daily') where exists (select 1 from cron.job where jobname = 'zol-welcome-reminder-daily');

select cron.schedule(
  'zol-purchase-reminder-every-ten-minutes',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := 'https://hghlthmkpskxiuohrutw.supabase.co/functions/v1/welcome-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-zol-marketing-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'zol_marketing_cron_secret'
          order by created_at desc
          limit 1
        )
      ),
      body := '{}'::jsonb
    );
  $job$
);
