-- De mailreeks werkt nu voor drie doelgroepen: fysiopraktijken, sportclubs en sportspeciaalzaken.
-- Elke doelgroep heeft eigen teksten (settings.physio_sequence, club_sequence, retail_sequence) en eigen groepen.
-- De daglimiet van 40 mails blijft gedeeld, en een e-mailadres zit maar in één reeks.
alter table public.physio_sequence_enrollments
  add column if not exists segment text not null default 'physio';
alter table public.physio_sequence_enrollments drop constraint if exists physio_sequence_enrollments_segment_check;
alter table public.physio_sequence_enrollments add constraint physio_sequence_enrollments_segment_check check (segment in ('physio', 'club', 'retail'));
create index if not exists physio_sequence_segment_idx on public.physio_sequence_enrollments (segment, status, next_send_at);

drop function if exists public.claim_physio_sequence_due(text[], integer);
create or replace function public.claim_physio_sequence_due(p_segment text, p_groups text[], p_limit integer default 40)
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
      and e.segment = p_segment and e.circle = any(p_groups)
    order by (e.circle = 'gold') desc, (e.circle = 'silver') desc, e.next_send_at, e.id
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

revoke all on function public.claim_physio_sequence_due(text, text[], integer) from public, anon, authenticated;
grant execute on function public.claim_physio_sequence_due(text, text[], integer) to service_role;

insert into public.settings (key, category, label, value, is_public)
select key, 'sales', label, jsonb_build_object(
  'enabled_groups', jsonb_build_object('gold', false, 'silver', false, 'national', false),
  'gold_lead_ids', '[]'::jsonb,
  'steps', jsonb_build_array(
    jsonb_build_object('title', 'Eerste contact', 'subject', '', 'body', '', 'wait_days', 0),
    jsonb_build_object('title', 'Geen reactie', 'subject', '', 'body', '', 'wait_days', 7),
    jsonb_build_object('title', 'Herhaling', 'subject', '', 'body', '', 'wait_days', 7),
    jsonb_build_object('title', 'Herhaling 2.0', 'subject', '', 'body', '', 'wait_days', 14)
  )), false
from (values ('club_sequence', 'Clubmail-reeks'), ('retail_sequence', 'Winkelmail-reeks')) as s(key, label)
on conflict (key) do nothing;
