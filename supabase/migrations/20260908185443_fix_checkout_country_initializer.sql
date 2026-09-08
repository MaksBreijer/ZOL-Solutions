-- The Belgium migration replaced every occurrence of the JSON pair
-- 'country', 'NL'. That also changed the new variable's own fallback to
-- v_country, making it self-referential during PL/pgSQL initialization.

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
    '  v_country text := upper(trim(coalesce(p_customer ->> ''country'', v_country)));',
    '  v_country text := upper(trim(coalesce(p_customer ->> ''country'', ''NL'')));'
  );

  if v_updated = v_body
    or position('p_customer ->> ''country'', ''NL''' in v_updated) = 0 then
    raise exception 'create_checkout_order country initialization could not be repaired safely';
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
