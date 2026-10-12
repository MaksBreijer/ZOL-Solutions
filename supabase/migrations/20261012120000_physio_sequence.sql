-- Nieuwe Fysiomail: een reeks van vier mails per praktijk (eerste contact, geen reactie, herhaling, herhaling 2.0).
-- De teksten en wachttijden staan in settings.physio_sequence en worden in de admin ingevuld.
-- Een inschrijving stopt zodra een praktijk reageert, zich afmeldt of de laatste stap heeft gehad.
create table if not exists public.physio_sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null unique,
  email text not null,
  practice_name text not null,
  location text not null default '',
  region text not null default '',
  specialization text not null default '',
  contact_person text not null default '',
  personal_opening text not null default '',
  circle text not null default '' check (circle in ('gold', 'silver', '')),
  steps_sent integer not null default 0 check (steps_sent between 0 and 4),
  next_send_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'sending', 'paused', 'replied', 'stopped', 'completed', 'failed')),
  claimed_at timestamptz,
  last_sent_at timestamptz,
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists physio_sequence_one_per_email_idx
  on public.physio_sequence_enrollments (lower(email));
create index if not exists physio_sequence_due_idx
  on public.physio_sequence_enrollments (status, next_send_at);

create table if not exists public.physio_sequence_messages (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.physio_sequence_enrollments(id) on delete cascade,
  step integer not null check (step between 1 and 4),
  subject text not null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  provider_id text,
  error_message text,
  sent_at timestamptz not null default now(),
  unique (enrollment_id, step)
);
create index if not exists physio_sequence_messages_enrollment_idx
  on public.physio_sequence_messages (enrollment_id);

alter table public.physio_sequence_enrollments enable row level security;
alter table public.physio_sequence_messages enable row level security;
revoke all on public.physio_sequence_enrollments, public.physio_sequence_messages from anon, authenticated;
grant all on public.physio_sequence_enrollments, public.physio_sequence_messages to service_role;

-- Pakt de inschrijvingen waarvan de volgende mail klaarstaat, binnen de daglimiet van 40 e-mails.
create or replace function public.claim_physio_sequence_due(p_limit integer default 40)
returns setof public.physio_sequence_enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining integer;
  day_start timestamptz := (date_trunc('day', now() at time zone 'Europe/Amsterdam') at time zone 'Europe/Amsterdam');
begin
  if not pg_catalog.pg_try_advisory_xact_lock(20261012) then return; end if;

  update public.physio_sequence_enrollments
  set status = 'active', claimed_at = null
  where status = 'sending' and claimed_at < now() - interval '1 hour';

  select greatest(0, 40 - (
    (select count(*) from public.email_messages where status = 'sent' and sent_at >= day_start)
    + (select count(*) from public.physio_sequence_enrollments where status = 'sending' and claimed_at >= day_start)
  ))::integer into remaining;

  return query
  with next_rows as (
    select e.id from public.physio_sequence_enrollments e
    where e.status = 'active' and e.steps_sent < 4 and e.next_send_at <= now()
    order by (e.circle = 'gold') desc, e.next_send_at, e.id
    limit least(greatest(p_limit, 0), remaining)
    for update skip locked
  )
  update public.physio_sequence_enrollments e
  set status = 'sending', claimed_at = now(), updated_at = now()
  from next_rows
  where e.id = next_rows.id
  returning e.*;
end;
$$;

revoke all on function public.claim_physio_sequence_due(integer) from public, anon, authenticated;
grant execute on function public.claim_physio_sequence_due(integer) to service_role;

insert into public.settings (key, category, label, value, is_public)
values ('physio_sequence', 'sales', 'Fysiomail-reeks', jsonb_build_object(
  'enabled', false,
  'gold_lead_ids', '[]'::jsonb,
  'steps', jsonb_build_array(
    jsonb_build_object('title', 'Eerste contact', 'subject', '', 'body', '', 'wait_days', 0),
    jsonb_build_object('title', 'Geen reactie', 'subject', '', 'body', '', 'wait_days', 7),
    jsonb_build_object('title', 'Herhaling', 'subject', '', 'body', '', 'wait_days', 7),
    jsonb_build_object('title', 'Herhaling 2.0', 'subject', '', 'body', '', 'wait_days', 14)
  )
), false)
on conflict (key) do nothing;

-- Het uurlijkse cronjob roept voortaan de nieuwe reeks aan. Het blijft uit tot het in de admin wordt aangezet
-- (settings.physio_sequence.enabled); de functie controleert dat zelf.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'zol-physio-campaign-hourly'),
  command := $job$
    select net.http_post(
      url := 'https://hghlthmkpskxiuohrutw.supabase.co/functions/v1/physio-sequence',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnaGx0aG1rcHNreGl1b2hydXR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1Mzg4NjIsImV4cCI6MjEwMjExNDg2Mn0.6k_96OIaQwsu438ToSbtLwQvKKaXGRcMJlkVb5E4EG0',
        'x-zol-marketing-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'zol_marketing_cron_secret'
          order by created_at desc limit 1
        )
      ),
      body := '{"action":"run"}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);
