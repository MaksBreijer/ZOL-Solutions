-- One-time back-in-stock alerts. Public visitors can only subscribe through the
-- stock-alert Edge Function; addresses are never exposed through the Data API.

create table public.stock_alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (
    email = lower(btrim(email))
    and char_length(email) between 5 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  variant_id uuid references public.product_variants(id) on delete set null,
  variant_sku text not null check (char_length(btrim(variant_sku)) between 1 and 120),
  product_name text not null default '' check (char_length(product_name) <= 200),
  variant_name text not null default '' check (char_length(variant_name) <= 160),
  shoe_size text not null default '' check (char_length(shoe_size) <= 80),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'expired')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  source text not null default 'product_page' check (char_length(source) <= 80),
  error_message text not null default '' check (char_length(error_message) <= 1000),
  consent_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index stock_alert_subscriptions_pending_email_variant_idx
on public.stock_alert_subscriptions (email, variant_sku)
where status in ('pending', 'processing');

create index stock_alert_subscriptions_dispatch_idx
on public.stock_alert_subscriptions (status, created_at)
where status in ('pending', 'processing');

create trigger stock_alert_subscriptions_updated_at
before update on public.stock_alert_subscriptions
for each row execute function private.set_updated_at();

alter table public.stock_alert_subscriptions enable row level security;
revoke all on table public.stock_alert_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.stock_alert_subscriptions to service_role;
grant select on table public.stock_alert_subscriptions to authenticated;

drop policy if exists "admins read stock alert subscriptions" on public.stock_alert_subscriptions;
create policy "admins read stock alert subscriptions"
on public.stock_alert_subscriptions for select
to authenticated
using ((select private.is_admin()));

create table public.stock_alert_rate_limits (
  fingerprint text primary key check (char_length(fingerprint) = 64),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0)
);

alter table public.stock_alert_rate_limits enable row level security;
revoke all on table public.stock_alert_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.stock_alert_rate_limits to service_role;

create policy "service role manages stock alert rate limits"
on public.stock_alert_rate_limits for all
to service_role
using (true)
with check (true);

create or replace function public.enforce_stock_alert_rate_limit(p_fingerprint text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  insert into public.stock_alert_rate_limits (fingerprint, window_started_at, attempts)
  values (p_fingerprint, now(), 1)
  on conflict (fingerprint) do update
  set window_started_at = case
        when public.stock_alert_rate_limits.window_started_at < now() - interval '15 minutes' then now()
        else public.stock_alert_rate_limits.window_started_at
      end,
      attempts = case
        when public.stock_alert_rate_limits.window_started_at < now() - interval '15 minutes' then 1
        else public.stock_alert_rate_limits.attempts + 1
      end
  returning attempts into v_attempts;

  delete from public.stock_alert_rate_limits
  where window_started_at < now() - interval '24 hours';

  return v_attempts <= 8;
end;
$$;

revoke all on function public.enforce_stock_alert_rate_limit(text) from public, anon, authenticated;
grant execute on function public.enforce_stock_alert_rate_limit(text) to service_role;

-- Claim ready alerts transactionally so overlapping cron runs cannot send a
-- duplicate email. A crashed claim becomes eligible again after 30 minutes.
create or replace function public.claim_ready_stock_alerts(p_limit integer default 50)
returns setof public.stock_alert_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.stock_alert_subscriptions
  set status = 'expired', error_message = 'Inschrijving verlopen.'
  where status in ('pending', 'processing')
    and created_at < now() - interval '180 days';

  return query
  with candidates as (
    select subscription.id
    from public.stock_alert_subscriptions as subscription
    where (
        subscription.status = 'pending'
        or (
          subscription.status = 'processing'
          and subscription.last_attempt_at < now() - interval '30 minutes'
        )
      )
      and subscription.attempts < 5
      and exists (
        select 1
        from public.product_variants as variant
        join public.products as product on product.id = variant.product_id
        where variant.sku = subscription.variant_sku
          and variant.active = true
          and variant.stock > 0
          and product.active = true
      )
    order by subscription.created_at
    for update of subscription skip locked
    limit least(100, greatest(1, coalesce(p_limit, 50)))
  )
  update public.stock_alert_subscriptions as subscription
  set status = 'processing',
      attempts = subscription.attempts + 1,
      last_attempt_at = now(),
      error_message = ''
  from candidates
  where subscription.id = candidates.id
  returning subscription.*;
end;
$$;

revoke all on function public.claim_ready_stock_alerts(integer) from public, anon, authenticated;
grant execute on function public.claim_ready_stock_alerts(integer) to service_role;

alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check check (kind in (
  'contact_notification', 'admin_customer',
  'order_customer', 'order_admin', 'shipping_customer',
  'order_received', 'payment_confirmed', 'order_delayed', 'order_shipped',
  'order_delivered', 'order_returned', 'order_cancelled', 'refund_confirmed',
  'new_order_admin', 'marketing_product_update', 'pilot_measurement',
  'pain_checkin_invitation', 'stock_back_in_stock'
));

insert into public.email_templates (
  template_key, name, description, audience, subject_template, eyebrow_template,
  title_template, intro_template, body_template, button_label_template,
  button_url_template, enabled, variables, sort_order
) values (
  'stock_back_in_stock',
  'Weer op voorraad',
  'Eenmalige melding zodra de gekozen maat weer beschikbaar is.',
  'customer',
  'Maat {{shoe_size}} van de ZOL''tjes is weer op voorraad',
  'Weer op voorraad',
  'Goed nieuws: maat {{shoe_size}} is er weer.',
  'Je vroeg ons om een seintje zodra deze maat weer beschikbaar was.',
  'De ZOL''tjes in maat {{shoe_size}} zijn opnieuw op voorraad. Voorraad kan snel veranderen; via de knop hieronder kom je direct bij de juiste maat.',
  'Bekijk maat {{shoe_size}}',
  '{{product_url}}',
  true,
  array['product_name','variant_name','shoe_size','product_url','website_url'],
  96
)
on conflict (template_key) do nothing;

create table if not exists private.stock_alert_cron_config (
  singleton boolean primary key default true check (singleton),
  secret_hash text not null,
  created_at timestamptz not null default now()
);

alter table private.stock_alert_cron_config enable row level security;
revoke all on private.stock_alert_cron_config from public, anon, authenticated;

do $$
declare
  v_secret text;
begin
  if not exists (select 1 from private.stock_alert_cron_config where singleton) then
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(v_secret, 'zol_stock_alert_cron_secret', 'Internal ZOL stock alert cron secret');
    insert into private.stock_alert_cron_config (singleton, secret_hash)
    values (true, encode(extensions.digest(v_secret, 'sha256'), 'hex'));
  end if;
end;
$$;

create or replace function public.verify_stock_alert_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.stock_alert_cron_config
    where singleton
      and secret_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex')
  );
$$;

revoke all on function public.verify_stock_alert_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_stock_alert_cron_secret(text) to service_role;

do $$
declare
  v_job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
    or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'Enable the Supabase Cron and pg_net integrations before applying this migration.';
  end if;

  for v_job_id in
    select jobid from cron.job where jobname = 'zol-stock-alerts-every-ten-minutes'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'zol-stock-alerts-every-ten-minutes',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := 'https://hghlthmkpskxiuohrutw.supabase.co/functions/v1/stock-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-zol-stock-alert-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'zol_stock_alert_cron_secret'
          order by created_at desc
          limit 1
        )
      ),
      body := jsonb_build_object('action', 'dispatch', 'scheduled_at', now()),
      timeout_milliseconds := 30000
    ) as request_id;
  $job$
);
