-- Consent-based contact marketing with a 21-day product update cadence.

alter table public.customers
  add column if not exists marketing_opt_in_at timestamptz,
  add column if not exists marketing_opt_in_source text not null default '',
  add column if not exists marketing_unsubscribed_at timestamptz,
  add column if not exists marketing_last_sent_at timestamptz,
  add column if not exists marketing_next_send_at timestamptz,
  add column if not exists marketing_unsubscribe_token uuid not null default gen_random_uuid();

update public.customers
set
  marketing_opt_in_at = coalesce(marketing_opt_in_at, created_at),
  marketing_opt_in_source = coalesce(nullif(marketing_opt_in_source, ''), 'bestaande klant'),
  marketing_next_send_at = coalesce(marketing_next_send_at, created_at + interval '21 days')
where marketing_opt_in;

create unique index if not exists customers_marketing_unsubscribe_token_idx
on public.customers (marketing_unsubscribe_token);

create index if not exists customers_marketing_due_idx
on public.customers (marketing_next_send_at)
where marketing_opt_in;

alter table public.contact_messages
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists contact_messages_customer_id_idx
on public.contact_messages (customer_id)
where customer_id is not null;

alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check check (kind in (
  'contact_notification', 'admin_customer',
  'order_customer', 'order_admin', 'shipping_customer',
  'order_received', 'payment_confirmed', 'order_shipped', 'order_delivered',
  'order_returned', 'order_cancelled', 'refund_confirmed', 'new_order_admin',
  'marketing_product_update'
));

insert into public.email_templates (
  template_key, name, description, audience, subject_template, eyebrow_template,
  title_template, intro_template, body_template, button_label_template,
  button_url_template, enabled, variables, sort_order
) values (
  'marketing_product_update',
  'Driewekelijkse productmail',
  'Elke 21 dagen voor contacten die hier expliciet toestemming voor hebben gegeven.',
  'customer',
  'Stevige ondersteuning voor jonge sporters',
  'Kleine ZOL-update',
  'Zachter landen. Lekker blijven sporten.',
  'Hoi {{customer_first_name}}, een korte tip voor comfortabel bewegen.',
  $copy$Een stevige hielkuip helpt de hiel stabiel in de schoen te houden en verdeelt de belasting rond de achtervoet. De ZOL'tjes zijn ontwikkeld voor sportende kinderen met hielpijn en passen in veel sport- en vrijetijdsschoenen.

Controleer regelmatig of de ZOL'tjes vlak in de schoen liggen en bouw het gebruik rustig op. Heb je een vraag over maat of pasvorm? Antwoord gerust op deze e-mail.$copy$,
  'Bekijk de ZOL''tjes',
  '{{product_url}}',
  true,
  array['customer_first_name','customer_name','product_url','website_url','unsubscribe_url'],
  90
)
on conflict (template_key) do nothing;

update public.settings
set value = value || jsonb_build_object(
  'marketing_enabled', coalesce((value->>'marketing_enabled')::boolean, true),
  'marketing_interval_days', coalesce((value->>'marketing_interval_days')::integer, 21)
)
where key = 'email_config';

create table if not exists private.marketing_cron_config (
  singleton boolean primary key default true check (singleton),
  secret_hash text not null,
  created_at timestamptz not null default now()
);

revoke all on private.marketing_cron_config from public, anon, authenticated;

do $$
declare
  v_secret text;
begin
  if not exists (select 1 from private.marketing_cron_config where singleton) then
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(v_secret, 'zol_marketing_cron_secret', 'Internal ZOL marketing cron secret');
    insert into private.marketing_cron_config (singleton, secret_hash)
    values (true, encode(extensions.digest(v_secret, 'sha256'), 'hex'));
  end if;
end;
$$;

create or replace function public.verify_marketing_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.marketing_cron_config
    where singleton
      and secret_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex')
  );
$$;

revoke all on function public.verify_marketing_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_marketing_cron_secret(text) to service_role;

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'zol-marketing-every-day',
  '15 8 * * *',
  $job$
    select net.http_post(
      url := 'https://hghlthmkpskxiuohrutw.supabase.co/functions/v1/marketing-email',
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
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 10000
    ) as request_id;
  $job$
);
