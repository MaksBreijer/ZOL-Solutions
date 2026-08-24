-- Atomic live inventory updates and idempotent CSV order imports for ZOL Admin.

alter table public.orders
  add column if not exists external_reference text,
  add column if not exists imported_at timestamptz;

create unique index if not exists orders_csv_external_reference_idx
on public.orders (lower(btrim(external_reference)))
where source = 'csv-import' and external_reference is not null;

create or replace function public.update_product_inventory(
  p_product_id uuid,
  p_stock jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_variant record;
  v_stock integer;
  v_updated integer := 0;
begin
  if (select auth.uid()) is null or not private.is_admin(array['owner', 'admin']) then
    raise exception 'Geen toestemming om voorraad te wijzigen.';
  end if;
  if jsonb_typeof(p_stock) <> 'object' or p_stock = '{}'::jsonb then
    raise exception 'Geef minimaal één voorraadwaarde op.';
  end if;

  for v_variant in select key as variant_id, value as stock_value from jsonb_each_text(p_stock)
  loop
    if v_variant.variant_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or v_variant.stock_value !~ '^\d+$' then
      raise exception 'Ongeldige voorraadwaarde.';
    end if;
    v_stock := v_variant.stock_value::integer;
    if v_stock > 100000 then raise exception 'De voorraadwaarde is te hoog.'; end if;

    update public.product_variants
    set stock = v_stock
    where id = v_variant.variant_id::uuid and product_id = p_product_id;
    if not found then raise exception 'Een productmaat kon niet worden gevonden.'; end if;
    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object('success', true, 'updated', v_updated, 'product_id', p_product_id);
end;
$$;

revoke all on function public.update_product_inventory(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.update_product_inventory(uuid, jsonb) to authenticated;

create or replace function private.sync_payment_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_customer_id uuid;
  v_payment_status text;
begin
  v_order_id := coalesce(new.order_id, old.order_id);
  select customer_id into v_customer_id from public.orders where id = v_order_id;

  select case
    when bool_or(status = 'paid') then 'paid'
    when bool_or(status = 'partially_refunded') then 'partially_refunded'
    when bool_or(status = 'refunded') then 'refunded'
    when bool_or(status = 'failed') then 'failed'
    else 'pending'
  end
  into v_payment_status
  from public.payments
  where order_id = v_order_id;

  update public.orders
  set payment_status = coalesce(v_payment_status, 'pending')
  where id = v_order_id;

  if v_customer_id is not null then
    update public.customers as customer
    set total_spent_cents = customer.legacy_spent_cents + coalesce((
      select sum(case
        when payment.status in ('paid', 'partially_refunded', 'refunded')
          then greatest(0, payment.amount_cents - payment.refunded_cents)
        else 0
      end)
      from public.orders as customer_order
      join public.payments as payment on payment.order_id = customer_order.id
      where customer_order.customer_id = v_customer_id
    ), 0)::integer
    where customer.id = v_customer_id;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.sync_payment_status() from public;
drop trigger if exists sync_payment_status_to_order on public.payments;
create trigger sync_payment_status_to_order
after insert or delete or update of status, refunded_cents, amount_cents, order_id on public.payments
for each row execute function private.sync_payment_status();

create or replace function public.import_admin_orders(p_orders jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch_id uuid := gen_random_uuid();
  v_order jsonb;
  v_item jsonb;
  v_customer_id uuid;
  v_order_id uuid;
  v_external_reference text;
  v_email text;
  v_first_name text;
  v_last_name text;
  v_customer_name text;
  v_phone text;
  v_marketing_opt_in boolean;
  v_address jsonb;
  v_created_at timestamptz;
  v_status text;
  v_payment_status text;
  v_fulfillment_status text;
  v_currency text;
  v_subtotal integer;
  v_shipping integer;
  v_discount integer;
  v_total integer;
  v_tax integer;
  v_quantity integer;
  v_unit_price integer;
  v_line_total integer;
  v_refunded integer;
  v_paid_net integer;
  v_legacy_order_reduction integer;
  v_legacy_spent_reduction integer;
  v_variant record;
  v_imported integer := 0;
  v_skipped integer := 0;
begin
  if (select auth.uid()) is null or not private.is_admin(array['owner', 'admin']) then
    raise exception 'Geen toestemming om bestellingen te importeren.';
  end if;
  if jsonb_typeof(p_orders) <> 'array' or jsonb_array_length(p_orders) = 0 then
    raise exception 'Het importbestand bevat geen bestellingen.';
  end if;
  if jsonb_array_length(p_orders) > 250 then
    raise exception 'Importeer maximaal 250 bestellingen per keer.';
  end if;

  for v_order in select value from jsonb_array_elements(p_orders)
  loop
    v_external_reference := left(btrim(coalesce(v_order ->> 'external_reference', '')), 120);
    v_email := lower(btrim(coalesce(v_order ->> 'email', '')));
    if v_external_reference = '' or v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Elke bestelling heeft een bestelnummer en geldig e-mailadres nodig.';
    end if;

    if exists (
      select 1 from public.orders
      where source = 'csv-import' and lower(btrim(external_reference)) = lower(v_external_reference)
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_first_name := left(btrim(coalesce(v_order ->> 'first_name', '')), 120);
    v_last_name := left(btrim(coalesce(v_order ->> 'last_name', '')), 120);
    v_customer_name := left(btrim(concat_ws(' ', v_first_name, v_last_name)), 240);
    if v_customer_name = '' then v_customer_name := v_email; end if;
    v_phone := left(btrim(coalesce(v_order ->> 'phone', '')), 80);
    v_marketing_opt_in := coalesce((v_order ->> 'marketing_opt_in')::boolean, false);
    v_address := coalesce(v_order -> 'address', '{}'::jsonb);
    if jsonb_typeof(v_address) <> 'object' then v_address := '{}'::jsonb; end if;

    begin
      v_created_at := coalesce(nullif(v_order ->> 'created_at', '')::timestamptz, now());
    exception when others then
      v_created_at := now();
    end;

    v_status := case lower(coalesce(v_order ->> 'status', 'open'))
      when 'draft' then 'draft' when 'concept' then 'draft'
      when 'completed' then 'completed' when 'afgerond' then 'completed'
      when 'cancelled' then 'cancelled' when 'canceled' then 'cancelled' when 'geannuleerd' then 'cancelled'
      else 'open' end;
    v_payment_status := case lower(coalesce(v_order ->> 'payment_status', 'pending'))
      when 'paid' then 'paid' when 'betaald' then 'paid'
      when 'failed' then 'failed' when 'mislukt' then 'failed'
      when 'refunded' then 'refunded' when 'terugbetaald' then 'refunded'
      when 'partially_refunded' then 'partially_refunded' when 'gedeeltelijk terugbetaald' then 'partially_refunded'
      else 'pending' end;
    v_fulfillment_status := case lower(coalesce(v_order ->> 'fulfillment_status', 'unfulfilled'))
      when 'processing' then 'processing' when 'in behandeling' then 'processing'
      when 'shipped' then 'shipped' when 'verzonden' then 'shipped'
      when 'delivered' then 'delivered' when 'bezorgd' then 'delivered'
      when 'returned' then 'returned' when 'retour' then 'returned'
      else 'unfulfilled' end;
    v_currency := upper(left(coalesce(nullif(v_order ->> 'currency', ''), 'EUR'), 3));
    v_shipping := greatest(0, coalesce((v_order ->> 'shipping_cents')::integer, 0));
    v_discount := greatest(0, coalesce((v_order ->> 'discount_cents')::integer, 0));
    v_subtotal := 0;

    if jsonb_typeof(v_order -> 'items') = 'array' then
      for v_item in select value from jsonb_array_elements(v_order -> 'items')
      loop
        v_quantity := least(1000, greatest(1, coalesce((v_item ->> 'quantity')::integer, 1)));
        v_unit_price := greatest(0, coalesce((v_item ->> 'unit_price_cents')::integer, 0));
        v_line_total := greatest(0, coalesce((v_item ->> 'total_cents')::integer, v_unit_price * v_quantity));
        v_subtotal := v_subtotal + v_line_total;
      end loop;
    end if;
    v_subtotal := greatest(0, coalesce((v_order ->> 'subtotal_cents')::integer, v_subtotal));
    v_total := greatest(0, coalesce((v_order ->> 'total_cents')::integer, v_subtotal + v_shipping - v_discount));
    v_tax := greatest(0, coalesce((v_order ->> 'tax_cents')::integer, round(v_total - (v_total / 1.21))::integer));
    v_refunded := least(v_total, greatest(0, coalesce((v_order ->> 'refunded_cents')::integer, case when v_payment_status = 'refunded' then v_total else 0 end)));
    v_paid_net := case when v_payment_status in ('paid', 'partially_refunded', 'refunded') then greatest(0, v_total - v_refunded) else 0 end;

    insert into public.customers (
      email, first_name, last_name, phone, address,
      marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source
    ) values (
      v_email, v_first_name, v_last_name, v_phone, v_address,
      v_marketing_opt_in, case when v_marketing_opt_in then v_created_at else null end,
      case when v_marketing_opt_in then 'csv-import' else '' end
    )
    on conflict (email) do update set
      first_name = case when public.customers.first_name = '' then excluded.first_name else public.customers.first_name end,
      last_name = case when public.customers.last_name = '' then excluded.last_name else public.customers.last_name end,
      phone = case when public.customers.phone = '' then excluded.phone else public.customers.phone end,
      address = case when public.customers.address = '{}'::jsonb then excluded.address else public.customers.address end,
      marketing_opt_in = public.customers.marketing_opt_in or excluded.marketing_opt_in,
      marketing_opt_in_at = coalesce(public.customers.marketing_opt_in_at, excluded.marketing_opt_in_at),
      marketing_opt_in_source = coalesce(nullif(public.customers.marketing_opt_in_source, ''), excluded.marketing_opt_in_source),
      updated_at = now()
    returning id into v_customer_id;

    insert into public.orders (
      customer_id, customer_email, customer_name, status, payment_status, fulfillment_status,
      subtotal_cents, shipping_cents, discount_cents, tax_cents, total_cents, currency,
      shipping_address, note, source, external_reference, imported_at, created_at
    ) values (
      v_customer_id, v_email, v_customer_name, v_status, 'pending', v_fulfillment_status,
      v_subtotal, v_shipping, v_discount, v_tax, v_total, v_currency,
      v_address, left(coalesce(v_order ->> 'note', ''), 1000), 'csv-import', v_external_reference, now(), v_created_at
    ) returning id into v_order_id;

    if jsonb_typeof(v_order -> 'items') = 'array' then
      for v_item in select value from jsonb_array_elements(v_order -> 'items')
      loop
        v_quantity := least(1000, greatest(1, coalesce((v_item ->> 'quantity')::integer, 1)));
        v_unit_price := greatest(0, coalesce((v_item ->> 'unit_price_cents')::integer, 0));
        v_line_total := greatest(0, coalesce((v_item ->> 'total_cents')::integer, v_unit_price * v_quantity));
        select null::uuid as id, null::uuid as product_id, null::text as title, null::text as sku, null::text as product_name
        into v_variant;
        if btrim(coalesce(v_item ->> 'sku', '')) <> '' then
          select variant.id, variant.product_id, variant.title, variant.sku, product.name as product_name
          into v_variant
          from public.product_variants as variant
          join public.products as product on product.id = variant.product_id
          where upper(variant.sku) = upper(btrim(v_item ->> 'sku'))
          limit 1;
        end if;
        insert into public.order_items (
          order_id, product_id, variant_id, product_name, variant_name, sku,
          quantity, unit_price_cents, total_cents
        ) values (
          v_order_id, v_variant.product_id, v_variant.id,
          left(coalesce(nullif(v_item ->> 'product_name', ''), v_variant.product_name, 'Geïmporteerd artikel'), 200),
          left(coalesce(nullif(v_item ->> 'variant_name', ''), v_variant.title, ''), 160),
          left(coalesce(nullif(v_item ->> 'sku', ''), v_variant.sku, ''), 120),
          v_quantity, v_unit_price, v_line_total
        );
      end loop;
    end if;

    select least(1, legacy_order_count), least(v_paid_net, legacy_spent_cents)
    into v_legacy_order_reduction, v_legacy_spent_reduction
    from public.customers where id = v_customer_id;

    update public.customers as customer
    set
      legacy_order_count = customer.legacy_order_count - v_legacy_order_reduction,
      legacy_spent_cents = customer.legacy_spent_cents - v_legacy_spent_reduction,
      total_orders = customer.total_orders + 1 - v_legacy_order_reduction,
      total_spent_cents = customer.total_spent_cents - v_legacy_spent_reduction
    where customer.id = v_customer_id;

    insert into public.payments (
      order_id, provider, status, method, amount_cents, refunded_cents, currency, metadata, created_at
    ) values (
      v_order_id, 'import', v_payment_status, 'csv', v_total, v_refunded, v_currency,
      jsonb_build_object('batch_id', v_batch_id, 'external_reference', v_external_reference), v_created_at
    );

    v_imported := v_imported + 1;
  end loop;

  return jsonb_build_object('success', true, 'batch_id', v_batch_id, 'imported', v_imported, 'skipped', v_skipped);
end;
$$;

revoke all on function public.import_admin_orders(jsonb) from public, anon, authenticated;
grant execute on function public.import_admin_orders(jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'product_variants'
  ) then
    alter publication supabase_realtime add table public.product_variants;
  end if;
end;
$$;
