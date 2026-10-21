-- Drie herinneringen binnen de 30 dagen geldigheid: na 5, 15 en 25 dagen.

alter table public.discounts add column if not exists reminder_count integer not null default 0 check (reminder_count between 0 and 3);
update public.discounts set reminder_count = 1 where reminder_sent_at is not null and reminder_count = 0;

drop function if exists public.due_welcome_reminders(integer);

create or replace function public.due_welcome_reminders(p_limit integer default 50)
returns table (discount_id uuid, code text, ends_at timestamptz, email text, first_name text, unsubscribe_token uuid, reminder_number integer)
language sql
security definer
set search_path = public, pg_temp
as $$
  select d.id, d.code, d.ends_at, c.email, c.first_name, c.marketing_unsubscribe_token, d.reminder_count + 1
  from public.discounts d
  join public.customers c on c.email = d.issued_to_email
  where d.issued_to_email is not null
    and d.active
    and d.usage_count = 0
    and d.reminder_count < 3
    and d.ends_at > now()
    and d.created_at <= now() - (case d.reminder_count when 0 then interval '5 days' when 1 then interval '15 days' else interval '25 days' end)
    and c.marketing_opt_in
    and c.marketing_unsubscribed_at is null
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.due_welcome_reminders(integer) from public, anon, authenticated;
grant execute on function public.due_welcome_reminders(integer) to service_role;
