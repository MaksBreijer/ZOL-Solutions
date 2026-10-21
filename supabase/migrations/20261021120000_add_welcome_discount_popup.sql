-- Welkomstpopup: e-mailadres achterlaten geeft 10% korting (code WELKOM10).
-- Het adres komt als marketing-opt-in bij de klanten te staan (bron 'popup'), zonder automatische mailplanning.

insert into public.discounts (title, code, method, discount_type, value, minimum_subtotal_cents, starts_at, active)
values ('10% welkomstkorting', 'WELKOM10', 'code', 'percentage', 10, 0, now(), true)
on conflict (upper(code)) where code is not null do nothing;

create or replace function public.claim_welcome_discount(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_code text;
begin
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Vul een geldig e-mailadres in.' using errcode = '22023';
  end if;

  select code into v_code
  from public.discounts
  where upper(code) = 'WELKOM10' and active
    and starts_at <= now() and (ends_at is null or ends_at > now())
  limit 1;
  if v_code is null then
    raise exception 'De welkomstkorting is op dit moment niet beschikbaar.' using errcode = '22023';
  end if;

  insert into public.customers (email, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source)
  values (v_email, true, now(), 'popup')
  on conflict (email) do update set
    marketing_opt_in = true,
    marketing_opt_in_at = coalesce(public.customers.marketing_opt_in_at, now()),
    marketing_opt_in_source = case when public.customers.marketing_opt_in then public.customers.marketing_opt_in_source else 'popup' end,
    marketing_unsubscribed_at = null,
    updated_at = now();

  return jsonb_build_object('code', v_code, 'percent', 10);
end;
$$;

revoke all on function public.claim_welcome_discount(text) from public;
grant execute on function public.claim_welcome_discount(text) to anon, authenticated, service_role;
