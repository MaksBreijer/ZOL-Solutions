-- Na de drie eerste herinneringen: wekelijks een korte mail zolang de 10%-code ongebruikt is.
alter table public.customers add column if not exists purchase_reminder_last_sent_at timestamptz;

update public.customers c
set purchase_reminder_last_sent_at = m.last_sent
from (select customer_id, max(created_at) last_sent from public.email_messages
      where kind = 'welcome_reminder' and status = 'sent' and customer_id is not null group by customer_id) m
where m.customer_id = c.id and c.purchase_reminder_last_sent_at is null;

create or replace function public.due_purchase_reminders(p_limit integer default 50)
returns table(customer_id uuid, email text, first_name text, unsubscribe_token uuid, reminder_number integer, code text, code_ends_at timestamptz)
language sql security definer set search_path to 'public', 'pg_temp'
as $function$
  select c.id, c.email, c.first_name, c.marketing_unsubscribe_token, c.purchase_reminder_count + 1, d.code, d.ends_at
  from public.customers c
  left join lateral (
    select code, ends_at from public.discounts
    where issued_to_email = c.email and active and usage_count = 0
      and (ends_at > now() or c.purchase_reminder_count >= 3)
    order by ends_at desc nulls first limit 1
  ) d on true
  where c.marketing_opt_in
    and c.marketing_unsubscribed_at is null
    and (
      (c.purchase_reminder_count < 3
        and coalesce(c.purchase_reminder_started_at, c.marketing_opt_in_at, c.created_at) <= now() - (
          case c.purchase_reminder_count when 0 then interval '30 minutes' when 1 then interval '1 day' else interval '3 days' end))
      or
      (c.purchase_reminder_count >= 3 and d.code is not null
        and coalesce(c.purchase_reminder_last_sent_at, c.purchase_reminder_started_at, c.marketing_opt_in_at, c.created_at) <= now() - interval '7 days')
    )
    and (c.purchase_reminder_attempt_at is null or c.purchase_reminder_attempt_at <= now() - interval '6 hours')
    and not exists (
      select 1 from public.orders o
      where (o.customer_id = c.id or lower(btrim(o.customer_email)) = c.email)
        and (
          o.payment_status in ('paid', 'partially_refunded', 'refunded')
          or (o.payment_status = 'pending' and o.created_at > now() - interval '2 hours')
        )
    )
  order by coalesce(c.purchase_reminder_last_sent_at, c.purchase_reminder_started_at, c.marketing_opt_in_at, c.created_at)
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$function$;
