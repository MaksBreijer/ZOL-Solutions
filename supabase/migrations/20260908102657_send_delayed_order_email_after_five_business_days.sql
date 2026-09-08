-- Keep the immediate receipt neutral. A separate notice is sent only when a
-- webshop order is still unfulfilled after five Monday-through-Friday days.
update public.email_templates
set body_template = 'We zijn benieuwd: hoe ben je bij ZOL Solutions terechtgekomen? Laat het ons gerust weten door op deze e-mail te reageren.',
    updated_at = now()
where template_key = 'order_received';

alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check check (kind in (
  'contact_notification', 'admin_customer',
  'order_customer', 'order_admin', 'shipping_customer',
  'order_received', 'payment_confirmed', 'order_delayed', 'order_shipped',
  'order_delivered', 'order_returned', 'order_cancelled', 'refund_confirmed',
  'new_order_admin', 'marketing_product_update', 'pilot_measurement',
  'pain_checkin_invitation'
));

insert into public.email_templates (
  template_key, name, description, audience, subject_template, eyebrow_template,
  title_template, intro_template, body_template, button_label_template,
  button_url_template, enabled, variables, sort_order
) values (
  'order_delayed',
  'Bestelling vertraagd',
  'Na vijf werkdagen als een webshopbestelling nog niet is verzonden.',
  'customer',
  'Update over bestelling #{{order_number}}',
  'Bestelling #{{order_number}}',
  'Je bestelling duurt iets langer, {{customer_first_name}}.',
  'Onze excuses voor de vertraging.',
  'Je bestelling is na vijf werkdagen nog niet verzonden. We werken eraan en zorgen dat je bestelling zo snel mogelijk jouw kant op komt. Zodra het pakket aan de bezorgdienst is overgedragen, ontvang je automatisch de trackinggegevens.',
  'Naar ZOL Solutions',
  '{{website_url}}',
  true,
  array['customer_first_name','order_number','order_total','website_url'],
  25
)
on conflict (template_key) do update set
  name = excluded.name,
  description = excluded.description,
  audience = excluded.audience,
  subject_template = excluded.subject_template,
  eyebrow_template = excluded.eyebrow_template,
  title_template = excluded.title_template,
  intro_template = excluded.intro_template,
  body_template = excluded.body_template,
  button_label_template = excluded.button_label_template,
  button_url_template = excluded.button_url_template,
  enabled = excluded.enabled,
  variables = excluded.variables,
  sort_order = excluded.sort_order,
  updated_at = now();

create or replace function private.add_business_days_amsterdam(
  p_started_at timestamptz,
  p_business_days integer
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local_started_at timestamp without time zone := p_started_at at time zone 'Europe/Amsterdam';
  v_due_date date := v_local_started_at::date;
  v_due_time time without time zone := v_local_started_at::time;
  v_count integer := 0;
begin
  if p_started_at is null or p_business_days is null or p_business_days < 0 then
    raise exception 'A start time and a non-negative business-day count are required.';
  end if;

  while v_count < p_business_days loop
    v_due_date := v_due_date + 1;
    if extract(isodow from v_due_date) between 1 and 5 then
      v_count := v_count + 1;
    end if;
  end loop;

  return (v_due_date + v_due_time) at time zone 'Europe/Amsterdam';
end;
$$;

revoke all on function private.add_business_days_amsterdam(timestamptz, integer)
from public, anon, authenticated;

create or replace function private.enqueue_delayed_order_emails()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_enqueued integer := 0;
begin
  for v_order in
    select o.id
    from public.orders o
    where o.order_type = 'customer'
      and o.source = 'zol-webshop'
      and o.status = 'open'
      and o.payment_status = 'paid'
      and o.fulfillment_status in ('unfulfilled', 'processing')
      and coalesce(o.archived, false) = false
      and btrim(coalesce(o.customer_email, '')) <> ''
      and private.add_business_days_amsterdam(o.created_at, 5) <= now()
      and not exists (
        select 1
        from public.email_messages m
        where m.dedupe_key = 'order_delayed-' || o.id::text
          and m.status in ('queued', 'sent')
      )
    order by o.created_at
    limit 100
  loop
    perform private.enqueue_order_email(v_order.id, 'delayed');
    v_enqueued := v_enqueued + 1;
  end loop;

  return v_enqueued;
end;
$$;

revoke all on function private.enqueue_delayed_order_emails()
from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
    or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'Enable the Supabase Cron and pg_net integrations before applying this migration.';
  end if;

  for v_job_id in
    select jobid from cron.job where jobname = 'zol-delayed-orders-every-30-minutes'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'zol-delayed-orders-every-30-minutes',
  '*/30 * * * *',
  $job$select private.enqueue_delayed_order_emails();$job$
);
