-- Persoonlijke welkomstcode per e-mailadres: eenmalig te gebruiken en 30 dagen geldig.
-- De code wordt uitgegeven door de edge function welcome-discount (service role), die ook de welkomstmail verstuurt.

alter table public.discounts add column if not exists issued_to_email text;
create unique index if not exists discounts_issued_to_email_idx on public.discounts (issued_to_email) where issued_to_email is not null;

alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check check (kind = any (array[
  'contact_notification','admin_customer','order_customer','order_admin','shipping_customer','order_received','payment_confirmed',
  'order_delayed','order_shipped','order_delivered','order_returned','order_cancelled','refund_confirmed','new_order_admin',
  'marketing_product_update','pilot_measurement','pain_checkin_invitation','stock_back_in_stock','physio_campaign',
  'physio_booking_admin','physio_booking_guest','customer_followup_1','customer_followup_2','welcome_discount'
]));

drop function if exists public.claim_welcome_discount(text);

create or replace function public.issue_welcome_discount(p_email text, p_first_name text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := left(btrim(coalesce(p_first_name, '')), 60);
  v_prefix text;
  v_code text;
  v_ends timestamptz;
  v_existing public.discounts;
  v_customer public.customers;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_try integer := 0;
begin
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Vul een geldig e-mailadres in.' using errcode = '22023';
  end if;

  insert into public.customers (email, first_name, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source, marketing_next_send_at)
  values (v_email, v_name, true, now(), 'popup', now() + interval '21 days')
  on conflict (email) do update set
    first_name = case when public.customers.first_name = '' then excluded.first_name else public.customers.first_name end,
    marketing_opt_in = true,
    marketing_opt_in_at = coalesce(public.customers.marketing_opt_in_at, now()),
    marketing_opt_in_source = case when public.customers.marketing_opt_in then public.customers.marketing_opt_in_source else 'popup' end,
    marketing_unsubscribed_at = null,
    marketing_next_send_at = coalesce(public.customers.marketing_next_send_at, excluded.marketing_next_send_at),
    updated_at = now()
  returning * into v_customer;

  select * into v_existing from public.discounts where issued_to_email = v_email;
  if found then
    if v_existing.usage_count >= 1 or (v_existing.ends_at is not null and v_existing.ends_at <= now()) then
      raise exception 'Je hebt je welkomstkorting al ontvangen.' using errcode = '22023';
    end if;
    return jsonb_build_object('code', v_existing.code, 'ends_at', v_existing.ends_at, 'first_name', v_customer.first_name,
      'unsubscribe_token', v_customer.marketing_unsubscribe_token, 'already_issued', true);
  end if;

  v_prefix := upper(regexp_replace(coalesce(nullif(v_customer.first_name, ''), split_part(v_email, '@', 1)), '[^A-Za-z]', '', 'g'));
  v_prefix := left(v_prefix, 10);
  if char_length(v_prefix) < 2 then v_prefix := 'ZOL'; end if;
  v_ends := now() + interval '30 days';

  loop
    v_code := v_prefix || '-' || (
      select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 4)
    );
    begin
      insert into public.discounts (title, code, method, discount_type, value, minimum_subtotal_cents, usage_limit, starts_at, ends_at, active, issued_to_email)
      values ('10% welkomstkorting (persoonlijk)', v_code, 'code', 'percentage', 10, 0, 1, now(), v_ends, true, v_email);
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 8 then raise; end if;
    end;
  end loop;

  return jsonb_build_object('code', v_code, 'ends_at', v_ends, 'first_name', v_customer.first_name,
    'unsubscribe_token', v_customer.marketing_unsubscribe_token, 'already_issued', false);
end;
$$;

revoke all on function public.issue_welcome_discount(text, text) from public, anon, authenticated;
grant execute on function public.issue_welcome_discount(text, text) to service_role;

-- De gedeelde code is vervangen door persoonlijke codes.
update public.discounts set active = false, updated_at = now() where upper(code) = 'WELKOM10';
