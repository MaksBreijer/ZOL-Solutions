create table if not exists public.physio_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject_template text not null,
  body_template text not null,
  status text not null default 'running' check (status in ('running', 'paused', 'completed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.physio_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.physio_campaigns(id) on delete cascade,
  lead_id text not null,
  practice_name text not null,
  location text not null default '',
  specialization text not null default '',
  email text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_id text,
  error_message text,
  unique (campaign_id, lead_id),
  unique (campaign_id, email)
);

create index if not exists physio_campaign_recipients_queue_idx
  on public.physio_campaign_recipients (status, campaign_id, id);
create unique index if not exists physio_campaign_one_running_idx
  on public.physio_campaigns ((true)) where status = 'running';

alter table public.physio_campaigns enable row level security;
alter table public.physio_campaign_recipients enable row level security;
revoke all on public.physio_campaigns, public.physio_campaign_recipients from anon, authenticated;
grant all on public.physio_campaigns, public.physio_campaign_recipients to service_role;

create or replace function public.claim_physio_campaign_recipients(p_limit integer default 40)
returns setof public.physio_campaign_recipients
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining integer;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(30131500) then return; end if;

  update public.physio_campaign_recipients r
  set status = 'queued', claimed_at = null
  from public.physio_campaigns c
  where c.id = r.campaign_id and c.status = 'running'
    and r.status = 'sending' and r.claimed_at < now() - interval '1 hour';

  select greatest(0, 40 - (
    (select count(*) from public.email_messages
      where status = 'sent'
        and sent_at >= (date_trunc('day', now() at time zone 'Europe/Amsterdam') at time zone 'Europe/Amsterdam')
        and sent_at < ((date_trunc('day', now() at time zone 'Europe/Amsterdam') + interval '1 day') at time zone 'Europe/Amsterdam'))
    + (select count(*) from public.physio_campaign_recipients
      where status = 'sending'
        and claimed_at >= (date_trunc('day', now() at time zone 'Europe/Amsterdam') at time zone 'Europe/Amsterdam'))
  ))::integer into remaining;

  return query
  with next_rows as (
    select r.id from public.physio_campaign_recipients r
    join public.physio_campaigns c on c.id = r.campaign_id
    where c.status = 'running' and r.status = 'queued'
    order by c.created_at, r.id
    limit least(greatest(p_limit, 0), remaining)
    for update of r skip locked
  )
  update public.physio_campaign_recipients r
  set status = 'sending', claimed_at = now()
  from next_rows
  where r.id = next_rows.id
  returning r.*;
end;
$$;

revoke all on function public.claim_physio_campaign_recipients(integer) from public, anon, authenticated;
grant execute on function public.claim_physio_campaign_recipients(integer) to service_role;

select cron.schedule(
  'zol-physio-campaign-hourly',
  '10 * * * *',
  $job$
    select net.http_post(
      url := 'https://hghlthmkpskxiuohrutw.supabase.co/functions/v1/physio-campaign',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-zol-marketing-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'zol_marketing_cron_secret'
          order by created_at desc limit 1
        )
      ),
      body := '{"action":"run"}'::jsonb,
      timeout_milliseconds := 10000
    );
  $job$
);
