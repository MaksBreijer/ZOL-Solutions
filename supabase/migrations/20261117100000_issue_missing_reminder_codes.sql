-- Aanmelders zonder kortingscode (bv. aangemeld bij het afrekenen) krijgen na de eerste drie herinneringen
-- alsnog een persoonlijke 10%-code, zodat ze ook de wekelijkse herinnering krijgen.
create or replace function public.issue_missing_reminder_codes(p_limit integer default 50)
returns integer
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_customer record;
  v_prefix text;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_try integer;
  v_issued integer := 0;
begin
  for v_customer in
    select c.id, c.email, c.first_name from public.customers c
    where c.marketing_opt_in and c.marketing_unsubscribed_at is null
      and c.purchase_reminder_count >= 3
      and not exists (select 1 from public.discounts d where d.issued_to_email = c.email)
      and not exists (select 1 from public.orders o
        where (o.customer_id = c.id or lower(btrim(o.customer_email)) = c.email)
          and o.payment_status in ('paid', 'partially_refunded', 'refunded'))
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  loop
    v_prefix := left(upper(regexp_replace(coalesce(nullif(v_customer.first_name, ''), split_part(v_customer.email, '@', 1)), '[^A-Za-z]', '', 'g')), 10);
    if char_length(v_prefix) < 2 then v_prefix := 'ZOL'; end if;
    v_try := 0;
    loop
      v_code := v_prefix || '-' || (select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 4));
      begin
        insert into public.discounts (title, code, method, discount_type, value, minimum_subtotal_cents, usage_limit, starts_at, ends_at, active, issued_to_email)
        values ('10% korting (herinnering, persoonlijk)', v_code, 'code', 'percentage', 10, 0, 1, now(), now() + interval '30 days', true, v_customer.email);
        exit;
      exception when unique_violation then
        v_try := v_try + 1;
        if v_try > 8 then raise; end if;
      end;
    end loop;
    v_issued := v_issued + 1;
  end loop;
  return v_issued;
end;
$function$;

revoke all on function public.issue_missing_reminder_codes(integer) from public, anon, authenticated;
