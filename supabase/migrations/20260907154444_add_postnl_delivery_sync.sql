-- Poll PostNL at a respectful interval and let the existing order trigger send
-- the idempotent "Bezorgd & bedankt" email when delivery is confirmed.
create table if not exists private.postnl_delivery_cron_config (
  singleton boolean primary key default true check (singleton),
  secret_hash text not null,
  created_at timestamptz not null default now()
);

revoke all on private.postnl_delivery_cron_config from public, anon, authenticated;

do $$
declare
  v_secret text;
begin
  if not exists (select 1 from private.postnl_delivery_cron_config where singleton) then
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(v_secret, 'zol_postnl_delivery_cron_secret', 'Internal ZOL PostNL delivery cron secret');
    insert into private.postnl_delivery_cron_config (singleton, secret_hash)
    values (true, encode(extensions.digest(v_secret, 'sha256'), 'hex'));
  end if;
end;
$$;

create or replace function public.verify_postnl_delivery_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.postnl_delivery_cron_config
    where singleton
      and secret_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex')
  );
$$;

revoke all on function public.verify_postnl_delivery_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_postnl_delivery_cron_secret(text) to service_role;

-- Delivery notifications also belong to physio shipments. Shipping remains an
-- explicit admin-confirmed action and all customer-only lifecycle rules stay intact.
create or replace function private.notify_order_status_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_type = 'customer' then
    if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
      perform private.enqueue_order_email(new.id, 'paid');
    elsif new.payment_status in ('partially_refunded', 'refunded') and old.payment_status is distinct from new.payment_status then
      perform private.enqueue_order_email(new.id, 'refunded');
    end if;

    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      perform private.enqueue_order_email(new.id, 'cancelled');
    end if;
  end if;

  if new.fulfillment_status = 'shipped'
    and btrim(coalesce(new.tracking_code, '')) <> ''
    and (old.fulfillment_status is distinct from 'shipped' or old.tracking_code is distinct from new.tracking_code)
    and not (
      coalesce(new.postnl->>'environment', '') = 'sandbox'
      and coalesce(new.postnl->>'barcode', '') = new.tracking_code
    ) then
    perform private.enqueue_order_email(new.id, 'shipping');
  elsif new.fulfillment_status = 'delivered' and old.fulfillment_status is distinct from 'delivered' then
    perform private.enqueue_order_email(new.id, 'delivered');
  elsif new.order_type = 'customer'
    and new.fulfillment_status = 'returned'
    and old.fulfillment_status is distinct from 'returned' then
    perform private.enqueue_order_email(new.id, 'returned');
  end if;
  return new;
end;
$$;

revoke all on function private.notify_order_status_emails() from public;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
    or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'Enable the Supabase Cron and pg_net integrations before applying this migration.';
  end if;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'zol-postnl-delivery-every-30-minutes'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'zol-postnl-delivery-every-30-minutes',
  '*/30 * * * *',
  $job$
    select net.http_post(
      url := 'https://hghlthmkpskxiuohrutw.supabase.co/functions/v1/postnl-delivery-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-zol-postnl-delivery-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'zol_postnl_delivery_cron_secret'
          order by created_at desc
          limit 1
        )
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 60000
    ) as request_id;
  $job$
);
