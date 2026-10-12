-- Fysiomail per groep: Gold Circle, Silver Circle (Amsterdam) en Landelijk worden apart gestart en apart aangezet.
-- Een praktijk kan maar in één groep zitten (uniek e-mailadres), zodat niemand dezelfde mail twee keer krijgt.
alter table public.physio_sequence_enrollments drop constraint if exists physio_sequence_enrollments_circle_check;
update public.physio_sequence_enrollments set circle = 'national' where circle = '';
alter table public.physio_sequence_enrollments alter column circle set default 'national';
alter table public.physio_sequence_enrollments add constraint physio_sequence_enrollments_circle_check check (circle in ('gold', 'silver', 'national'));

update public.settings
set value = (value - 'enabled') || jsonb_build_object('enabled_groups', jsonb_build_object(
  'gold', coalesce((value->>'enabled')::boolean, false),
  'silver', coalesce((value->>'enabled')::boolean, false),
  'national', coalesce((value->>'enabled')::boolean, false)))
where key = 'physio_sequence' and not value ? 'enabled_groups';

drop function if exists public.claim_physio_sequence_due(integer);
create or replace function public.claim_physio_sequence_due(p_groups text[], p_limit integer default 40)
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
    where e.status = 'active' and e.steps_sent < 4 and e.next_send_at <= now() and e.circle = any(p_groups)
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

revoke all on function public.claim_physio_sequence_due(text[], integer) from public, anon, authenticated;
grant execute on function public.claim_physio_sequence_due(text[], integer) to service_role;
