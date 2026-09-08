-- Store only explicit, optional checkout consent for the ZOL product update.

do $migration$
declare
  v_body text;
  v_updated text;
begin
  select p.prosrc
  into v_body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_checkout_order'
    and pg_get_function_identity_arguments(p.oid) =
      'p_customer jsonb, p_items jsonb, p_note text, p_session_id text, p_discount_code text';

  if v_body is null then
    raise exception 'create_checkout_order(jsonb, jsonb, text, text, text) was not found';
  end if;

  v_updated := replace(
    v_body,
    '  v_postal_code text := upper(trim(coalesce(p_customer ->> ''postal_code'', '''')));',
    '  v_postal_code text := upper(trim(coalesce(p_customer ->> ''postal_code'', '''')));' || E'\n' ||
    '  v_marketing_opt_in boolean := coalesce((p_customer ->> ''marketing_opt_in'')::boolean, false);'
  );

  v_updated := replace(
    v_updated,
$old$
  insert into public.customers (email, first_name, last_name, phone, address, total_orders)
  values (v_email, left(coalesce(p_customer ->> 'first_name', ''), 120), left(coalesce(p_customer ->> 'last_name', ''), 120), left(coalesce(p_customer ->> 'phone', ''), 80),
    jsonb_build_object('street', left(coalesce(p_customer ->> 'street', ''), 180), 'postal_code', left(coalesce(p_customer ->> 'postal_code', ''), 30), 'city', left(coalesce(p_customer ->> 'city', ''), 120), 'country', v_country), 1)
  on conflict (email) do update set first_name = excluded.first_name, last_name = excluded.last_name,
    phone = excluded.phone, address = excluded.address, total_orders = public.customers.total_orders + 1, updated_at = now()
  returning id into v_customer_id;
$old$,
$new$
  insert into public.customers (
    email, first_name, last_name, phone, address, total_orders,
    marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source,
    marketing_unsubscribed_at, marketing_next_send_at
  )
  values (
    v_email, left(coalesce(p_customer ->> 'first_name', ''), 120), left(coalesce(p_customer ->> 'last_name', ''), 120), left(coalesce(p_customer ->> 'phone', ''), 80),
    jsonb_build_object('street', left(coalesce(p_customer ->> 'street', ''), 180), 'postal_code', left(coalesce(p_customer ->> 'postal_code', ''), 30), 'city', left(coalesce(p_customer ->> 'city', ''), 120), 'country', v_country), 1,
    v_marketing_opt_in, case when v_marketing_opt_in then now() end,
    case when v_marketing_opt_in then 'checkout' else '' end,
    null, case when v_marketing_opt_in then now() + interval '21 days' end
  )
  on conflict (email) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    phone = excluded.phone,
    address = excluded.address,
    total_orders = public.customers.total_orders + 1,
    marketing_opt_in = public.customers.marketing_opt_in or excluded.marketing_opt_in,
    marketing_opt_in_at = coalesce(public.customers.marketing_opt_in_at, excluded.marketing_opt_in_at),
    marketing_opt_in_source = case
      when excluded.marketing_opt_in then excluded.marketing_opt_in_source
      else public.customers.marketing_opt_in_source
    end,
    marketing_unsubscribed_at = case
      when excluded.marketing_opt_in then null
      else public.customers.marketing_unsubscribed_at
    end,
    marketing_next_send_at = case
      when excluded.marketing_opt_in then coalesce(public.customers.marketing_next_send_at, excluded.marketing_next_send_at)
      else public.customers.marketing_next_send_at
    end,
    updated_at = now()
  returning id into v_customer_id;
$new$
  );

  if v_updated = v_body
    or position('v_marketing_opt_in boolean' in v_updated) = 0
    or position('marketing_opt_in_source' in v_updated) = 0
    or position('marketing_next_send_at' in v_updated) = 0 then
    raise exception 'create_checkout_order could not be patched safely for checkout marketing consent';
  end if;

  execute format($ddl$
    create or replace function public.create_checkout_order(
      p_customer jsonb,
      p_items jsonb,
      p_note text default '',
      p_session_id text default '',
      p_discount_code text default ''
    )
    returns jsonb
    language plpgsql
    security invoker
    set search_path = ''
    as %L
  $ddl$, v_updated);
end;
$migration$;

revoke all on function public.create_checkout_order(jsonb, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.create_checkout_order(jsonb, jsonb, text, text, text) to service_role;
