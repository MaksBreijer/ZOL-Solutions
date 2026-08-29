-- Include VAT embedded in charged shipping and repair known ZOL order VAT totals.

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
    and p.proname = 'quote_checkout_order'
    and pg_get_function_identity_arguments(p.oid) = 'p_items jsonb, p_discount_code text';

  if v_body is null then
    raise exception 'quote_checkout_order(jsonb, text) was not found';
  end if;

  v_updated := replace(
    v_body,
    '  v_threshold integer := 0;',
    '  v_threshold integer := 0;' || E'\n' || '  v_shipping_tax_rate numeric := 21.00;'
  );
  v_updated := replace(
    v_updated,
    '  select value into v_commerce from public.settings where key = ''commerce'';',
    '  select value into v_commerce from public.settings where key = ''commerce'';' || E'\n' ||
    '  v_shipping_tax_rate := greatest(' || E'\n' ||
    '    0,' || E'\n' ||
    '    coalesce(nullif(v_commerce ->> ''tax_rate'', '''')::numeric, 21.00)' || E'\n' ||
    '  );'
  );
  v_updated := replace(
    v_updated,
    E'\n  v_total := greatest(0, v_subtotal + v_shipping - v_discount_cents);',
    E'\n  if v_shipping > 0 and not (v_has_discount and v_discount.discount_type = ''free_shipping'') then' || E'\n' ||
    '    v_tax := v_tax + round(v_shipping - (v_shipping / (1 + v_shipping_tax_rate / 100.0)));' || E'\n' ||
    '  end if;' || E'\n\n' ||
    '  v_total := greatest(0, v_subtotal + v_shipping - v_discount_cents);'
  );

  if v_updated = v_body
    or position('v_shipping_tax_rate numeric' in v_updated) = 0
    or position('v_tax := v_tax + round(v_shipping' in v_updated) = 0 then
    raise exception 'quote_checkout_order could not be patched safely';
  end if;

  execute format($ddl$
    create or replace function public.quote_checkout_order(
      p_items jsonb,
      p_discount_code text default ''
    )
    returns jsonb
    language plpgsql
    security invoker
    set search_path = ''
    as %L
  $ddl$, v_updated);

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
    '  v_threshold integer := 0;',
    '  v_threshold integer := 0;' || E'\n' || '  v_shipping_tax_rate numeric := 21.00;'
  );
  v_updated := replace(
    v_updated,
    '  select value into v_commerce from public.settings where key = ''commerce'';',
    '  select value into v_commerce from public.settings where key = ''commerce'';' || E'\n' ||
    '  v_shipping_tax_rate := greatest(' || E'\n' ||
    '    0,' || E'\n' ||
    '    coalesce(nullif(v_commerce ->> ''tax_rate'', '''')::numeric, 21.00)' || E'\n' ||
    '  );'
  );
  v_updated := replace(
    v_updated,
    E'\n  v_total := greatest(0, v_subtotal + v_shipping - v_discount_cents);',
    E'\n  if v_shipping > 0 and not (v_has_discount and v_discount.discount_type = ''free_shipping'') then' || E'\n' ||
    '    v_tax := v_tax + round(v_shipping - (v_shipping / (1 + v_shipping_tax_rate / 100.0)));' || E'\n' ||
    '  end if;' || E'\n' ||
    '  v_total := greatest(0, v_subtotal + v_shipping - v_discount_cents);'
  );

  if v_updated = v_body
    or position('v_shipping_tax_rate numeric' in v_updated) = 0
    or position('v_tax := v_tax + round(v_shipping' in v_updated) = 0 then
    raise exception 'create_checkout_order could not be patched safely';
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

revoke all on function public.quote_checkout_order(jsonb, text) from public, anon, authenticated;
grant execute on function public.quote_checkout_order(jsonb, text) to service_role;
revoke all on function public.create_checkout_order(jsonb, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.create_checkout_order(jsonb, jsonb, text, text, text) to service_role;

-- These sources only contain ZOL insoles, which use the standard 21% Dutch VAT rate.
-- Restrict the repair so no unrelated or future order type can be changed by replay.
update public.orders as o
set tax_cents = round(o.total_cents - (o.total_cents / 1.21))::integer,
    updated_at = now()
where o.currency = 'EUR'
  and o.source in ('zol-webshop', 'csv-import')
  and exists (
    select 1
    from public.order_items oi
    where oi.order_id = o.id
  )
  and not exists (
    select 1
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
    where oi.order_id = o.id
      and not (
        coalesce(p.tax_rate, 21.00) = 21.00
        and (p.id is not null or oi.product_name ilike '%ZOL%')
      )
  )
  and o.tax_cents is distinct from round(o.total_cents - (o.total_cents / 1.21))::integer;
