-- Herinneringsmail 5 dagen nadat een persoonlijke welkomstcode is uitgegeven en nog niet is gebruikt.

alter table public.discounts add column if not exists reminder_sent_at timestamptz;

alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check check (kind = any (array[
  'contact_notification','admin_customer','order_customer','order_admin','shipping_customer','order_received','payment_confirmed',
  'order_delayed','order_shipped','order_delivered','order_returned','order_cancelled','refund_confirmed','new_order_admin',
  'marketing_product_update','pilot_measurement','pain_checkin_invitation','stock_back_in_stock','physio_campaign',
  'physio_booking_admin','physio_booking_guest','customer_followup_1','customer_followup_2','welcome_discount','welcome_reminder'
]));

create or replace function public.due_welcome_reminders(p_limit integer default 50)
returns table (discount_id uuid, code text, ends_at timestamptz, email text, first_name text, unsubscribe_token uuid)
language sql
security definer
set search_path = public, pg_temp
as $$
  select d.id, d.code, d.ends_at, c.email, c.first_name, c.marketing_unsubscribe_token
  from public.discounts d
  join public.customers c on c.email = d.issued_to_email
  where d.issued_to_email is not null
    and d.active
    and d.usage_count = 0
    and d.reminder_sent_at is null
    and d.created_at <= now() - interval '5 days'
    and d.ends_at > now()
    and c.marketing_opt_in
    and c.marketing_unsubscribed_at is null
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.due_welcome_reminders(integer) from public, anon, authenticated;
grant execute on function public.due_welcome_reminders(integer) to service_role;

select cron.schedule(
  'zol-welcome-reminder-daily',
  '30 8 * * *',
  $job$
    select net.http_post(
      url := 'https://hghlthmkpskxiuohrutw.supabase.co/functions/v1/welcome-reminder',
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
      body := '{}'::jsonb
    );
  $job$
);
