-- ZOL Solutions transactional email, contact inbox and delivery audit.
-- Email delivery remains disabled until a verified sender domain and RESEND_API_KEY are configured.

create extension if not exists pg_net;

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null default '',
  topic text not null default 'Contact via de website',
  message text not null,
  status text not null default 'new' check (status in ('new', 'read', 'replied', 'email_failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_messages_created_at_idx
on public.contact_messages (created_at desc);

drop trigger if exists contact_messages_updated_at on public.contact_messages;
create trigger contact_messages_updated_at before update on public.contact_messages
for each row execute function private.set_updated_at();

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('contact_notification', 'order_customer', 'order_admin', 'admin_customer')),
  recipient_email text not null,
  subject text not null,
  body_preview text not null default '',
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider_id text,
  error_message text not null default '',
  dedupe_key text unique,
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  contact_message_id uuid references public.contact_messages(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists email_messages_created_at_idx
on public.email_messages (created_at desc);
create index if not exists email_messages_order_idx
on public.email_messages (order_id, created_at desc);
create index if not exists email_messages_customer_idx
on public.email_messages (customer_id, created_at desc);
create index if not exists email_messages_contact_idx
on public.email_messages (contact_message_id);
create index if not exists email_messages_created_by_idx
on public.email_messages (created_by);

create table if not exists public.contact_rate_limits (
  fingerprint text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0)
);

revoke all on public.contact_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.contact_rate_limits to service_role;

grant select, update on public.contact_messages to authenticated;
grant select on public.email_messages to authenticated;
grant select, insert, update, delete on public.contact_messages, public.email_messages to service_role;

alter table public.contact_messages enable row level security;
alter table public.email_messages enable row level security;
alter table public.contact_rate_limits enable row level security;

drop policy if exists "admins manage contact messages" on public.contact_messages;
create policy "admins manage contact messages" on public.contact_messages
for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists "admins read email messages" on public.email_messages;
create policy "admins read email messages" on public.email_messages
for select to authenticated using (private.is_admin());

drop policy if exists "service role manages contact limits" on public.contact_rate_limits;
create policy "service role manages contact limits" on public.contact_rate_limits
for all to service_role using (true) with check (true);

create or replace function public.enforce_contact_rate_limit(p_fingerprint text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  insert into public.contact_rate_limits (fingerprint, window_started_at, attempts)
  values (p_fingerprint, now(), 1)
  on conflict (fingerprint) do update
  set window_started_at = case
        when public.contact_rate_limits.window_started_at < now() - interval '15 minutes' then now()
        else public.contact_rate_limits.window_started_at
      end,
      attempts = case
        when public.contact_rate_limits.window_started_at < now() - interval '15 minutes' then 1
        else public.contact_rate_limits.attempts + 1
      end
  returning attempts into v_attempts;

  delete from public.contact_rate_limits
  where window_started_at < now() - interval '24 hours';
  return v_attempts <= 5;
end;
$$;

revoke all on function public.enforce_contact_rate_limit(text) from public, anon, authenticated;
grant execute on function public.enforce_contact_rate_limit(text) to service_role;

create table if not exists private.email_webhook_config (
  singleton boolean primary key default true check (singleton),
  secret_hash text not null,
  created_at timestamptz not null default now()
);
revoke all on private.email_webhook_config from public;

do $$
declare
  v_secret text;
begin
  if not exists (select 1 from private.email_webhook_config where singleton) then
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(v_secret, 'zol_email_webhook_secret', 'Internal ZOL paid-order email webhook secret');
    insert into private.email_webhook_config (singleton, secret_hash)
    values (true, encode(extensions.digest(v_secret, 'sha256'), 'hex'));
  end if;
end;
$$;

create or replace function public.verify_email_webhook_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.email_webhook_config
    where singleton and secret_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex')
  );
$$;

revoke all on function public.verify_email_webhook_secret(text) from public, anon, authenticated;
grant execute on function public.verify_email_webhook_secret(text) to service_role;

create or replace function private.notify_paid_order_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'zol_email_webhook_secret'
    order by created_at desc
    limit 1;

    if v_secret is not null then
      perform net.http_post(
        url := 'https://hghlthmkpskxiuohrutw.supabase.co/functions/v1/order-email',
        body := jsonb_build_object('order_id', new.id),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-zol-email-secret', v_secret
        ),
        timeout_milliseconds := 8000
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.notify_paid_order_email() from public;
drop trigger if exists notify_paid_order_email on public.orders;
create trigger notify_paid_order_email
after update of payment_status on public.orders
for each row execute function private.notify_paid_order_email();

insert into public.settings (key, category, label, value, is_public) values
  ('email_config', 'email', 'E-mailinstellingen', jsonb_build_object(
    'enabled', false,
    'provider', 'resend',
    'from_name', 'ZOL Solutions',
    'from_email', 'info@zolsolutions.nl',
    'reply_to', 'info@zolsolutions.nl',
    'admin_email', 'info@zolsolutions.nl',
    'website_url', 'https://zolsolutions.nl'
  ), false)
on conflict (key) do nothing;
