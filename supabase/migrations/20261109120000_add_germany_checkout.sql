-- Add Germany as a checkout destination at €6.95. It stays closed until
-- settings.commerce.germany_enabled is set to true.

update public.settings
set value = jsonb_build_object(
  'germany_shipping_cents', 695,
  'germany_delivery_min_days', 3,
  'germany_delivery_max_days', 5,
  'germany_enabled', false
) || value,
updated_at = now()
where key = 'commerce';

-- Patch the live definitions so stock, discount and order logic stay untouched.
do $migration$
declare
  v_function record;
  v_definition text;
  v_updated text;
  v_shipping_old constant text := E'  v_shipping := case v_country\n    when ''BE'' then coalesce((v_commerce ->> ''belgium_shipping_cents'')::integer, 495)\n';
  v_shipping_new constant text :=
    E'  if v_country = ''DE'' and not coalesce((select (value ->> ''germany_enabled'')::boolean from public.settings where key = ''commerce''), false) then\n' ||
    E'    raise exception ''Bezorgen in Duitsland is nog niet geopend.'';\n' ||
    E'  end if;\n' ||
    E'  v_shipping := case v_country\n' ||
    E'    when ''DE'' then coalesce((v_commerce ->> ''germany_shipping_cents'')::integer, 695)\n' ||
    E'    when ''BE'' then coalesce((v_commerce ->> ''belgium_shipping_cents'')::integer, 495)\n';
begin
  for v_function in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        (p.proname = 'quote_checkout_order' and pg_get_function_identity_arguments(p.oid) = 'p_items jsonb, p_discount_code text, p_country text')
        or (p.proname = 'create_checkout_order' and pg_get_function_identity_arguments(p.oid) = 'p_customer jsonb, p_items jsonb, p_note text, p_session_id text, p_discount_code text')
      )
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    if position(v_shipping_old in v_definition) = 0 then
      raise exception '% could not be patched safely for Germany', v_function.proname;
    end if;
    v_updated := replace(v_definition, v_shipping_old, v_shipping_new);
    v_updated := replace(v_updated, 'if v_country not in (''NL'', ''BE'') then', 'if v_country not in (''NL'', ''BE'', ''DE'') then');
    execute v_updated;
  end loop;
end;
$migration$;
