-- Allow explicit manual unit prices, including zero, for managers.

create or replace function public.create_admin_order(
  p_customer_id uuid,
  p_items jsonb,
  p_status text default 'open',
  p_payment_status text default 'pending',
  p_fulfillment_status text default 'unfulfilled',
  p_shipping_cents integer default 0,
  p_note text default '',
  p_order_type text default 'customer',
  p_physio jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_customer record;
  v_customer_id uuid;
  v_customer_email text;
  v_customer_name text;
  v_shipping_address jsonb;
  v_tracking_destination jsonb := '{"type":"customer"}'::jsonb;
  v_item jsonb;
  v_variant record;
  v_seen_variants uuid[] := array[]::uuid[];
  v_quantity integer;
  v_unit_price integer;
  v_line_total integer;
  v_subtotal integer := 0;
  v_tax integer := 0;
  v_total integer;
  v_order_id uuid;
  v_order_number bigint;
begin
  if (select auth.uid()) is null or not private.is_admin(array['owner', 'admin']) then
    raise exception 'Geen toestemming om bestellingen aan te maken.';
  end if;
  if p_order_type not in ('customer', 'physio') then
    raise exception 'Ongeldig bestellingstype.';
  end if;
  if p_status not in ('draft', 'open', 'completed', 'cancelled') then
    raise exception 'Ongeldige orderstatus.';
  end if;
  if p_payment_status not in ('pending', 'paid', 'failed') then
    raise exception 'Ongeldige betaalstatus.';
  end if;
  if p_fulfillment_status not in ('unfulfilled', 'processing', 'shipped', 'delivered', 'returned') then
    raise exception 'Ongeldige verzendstatus.';
  end if;
  if p_shipping_cents < 0 or p_shipping_cents > 1000000 then
    raise exception 'Ongeldige verzendkosten.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    raise exception 'Voeg minimaal één en maximaal twintig orderregels toe.';
  end if;

  if p_order_type = 'customer' then
    if p_customer_id is null then raise exception 'Kies een klant.'; end if;
    select id, email, first_name, last_name, address
    into v_customer
    from public.customers
    where id = p_customer_id
    for update;
    if not found then raise exception 'Klant niet gevonden.'; end if;

    v_customer_id := v_customer.id;
    v_customer_email := lower(v_customer.email);
    v_customer_name := trim(concat_ws(' ', v_customer.first_name, v_customer.last_name));
    v_shipping_address := v_customer.address;
  else
    if jsonb_typeof(p_physio) <> 'object' then
      raise exception 'Vul geldige fysiogegevens in.';
    end if;

    v_tracking_destination := jsonb_build_object(
      'type', 'physio',
      'practice_name', left(btrim(coalesce(p_physio ->> 'practice_name', '')), 140),
      'contact_name', left(btrim(coalesce(p_physio ->> 'contact_name', '')), 120),
      'email', left(lower(btrim(coalesce(p_physio ->> 'email', ''))), 254),
      'street', left(btrim(coalesce(p_physio ->> 'street', '')), 160),
      'postal_code', left(upper(btrim(coalesce(p_physio ->> 'postal_code', ''))), 24),
      'city', left(btrim(coalesce(p_physio ->> 'city', '')), 100),
      'country', 'NL'
    );

    if coalesce(v_tracking_destination ->> 'practice_name', '') = ''
      or coalesce(v_tracking_destination ->> 'street', '') = ''
      or coalesce(v_tracking_destination ->> 'postal_code', '') = ''
      or coalesce(v_tracking_destination ->> 'city', '') = '' then
      raise exception 'Vul praktijknaam, straat, postcode en plaats van de fysio in.';
    end if;
    if coalesce(v_tracking_destination ->> 'email', '') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
      raise exception 'Vul een geldig e-mailadres van de fysio in.';
    end if;

    v_customer_id := null;
    v_customer_email := v_tracking_destination ->> 'email';
    v_customer_name := v_tracking_destination ->> 'practice_name';
    v_shipping_address := jsonb_build_object(
      'street', v_tracking_destination ->> 'street',
      'postal_code', v_tracking_destination ->> 'postal_code',
      'city', v_tracking_destination ->> 'city',
      'country', 'NL'
    );
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_quantity < 1 or v_quantity > 100 then raise exception 'Ongeldig aantal.'; end if;

    select
      variant.id,
      variant.product_id,
      variant.title,
      variant.sku,
      variant.stock,
      variant.active,
      variant.price_cents,
      product.name as product_name,
      product.price_cents as product_price_cents,
      product.tax_rate,
      product.active as product_active
    into v_variant
    from public.product_variants as variant
    join public.products as product on product.id = variant.product_id
    where variant.id = (v_item ->> 'variant_id')::uuid
    for update of variant;

    if not found or not v_variant.active or not v_variant.product_active then
      raise exception 'Een gekozen product is niet beschikbaar.';
    end if;
    if v_variant.id = any(v_seen_variants) then
      raise exception 'Voeg elke maat maar één keer toe.';
    end if;
    if v_variant.stock < v_quantity then
      raise exception 'Niet genoeg voorraad voor %.', v_variant.title;
    end if;

    -- Missing/null prices retain the catalog price for existing callers.
    -- An explicit zero is a valid price for a free manual order line.
    if v_item ->> 'unit_price_cents' is not null then
      if jsonb_typeof(v_item -> 'unit_price_cents') <> 'number'
        or (v_item ->> 'unit_price_cents')::numeric < 0
        or (v_item ->> 'unit_price_cents')::numeric > 1000000
        or (v_item ->> 'unit_price_cents')::numeric <> trunc((v_item ->> 'unit_price_cents')::numeric) then
        raise exception 'Ongeldige stukprijs: gebruik hele centen tussen 0 en 1000000.';
      end if;
    end if;

    v_seen_variants := array_append(v_seen_variants, v_variant.id);
    v_unit_price := coalesce((v_item ->> 'unit_price_cents')::integer, v_variant.price_cents, v_variant.product_price_cents);
    v_line_total := v_unit_price * v_quantity;
    v_subtotal := v_subtotal + v_line_total;
    v_tax := v_tax + round(v_line_total - (v_line_total / (1 + v_variant.tax_rate / 100.0)));
  end loop;

  v_total := v_subtotal + p_shipping_cents;
  insert into public.orders (
    customer_id,
    customer_email,
    customer_name,
    order_type,
    status,
    payment_status,
    fulfillment_status,
    subtotal_cents,
    shipping_cents,
    tax_cents,
    total_cents,
    currency,
    shipping_address,
    note,
    source,
    tracking_destination
  ) values (
    v_customer_id,
    v_customer_email,
    v_customer_name,
    p_order_type,
    p_status,
    p_payment_status,
    p_fulfillment_status,
    v_subtotal,
    p_shipping_cents,
    v_tax,
    v_total,
    'EUR',
    v_shipping_address,
    left(coalesce(p_note, ''), 1000),
    'admin',
    v_tracking_destination
  ) returning id, order_number into v_order_id, v_order_number;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    select
      variant.id,
      variant.product_id,
      variant.title,
      variant.sku,
      variant.price_cents,
      product.name as product_name,
      product.price_cents as product_price_cents
    into v_variant
    from public.product_variants as variant
    join public.products as product on product.id = variant.product_id
    where variant.id = (v_item ->> 'variant_id')::uuid;

    v_unit_price := coalesce((v_item ->> 'unit_price_cents')::integer, v_variant.price_cents, v_variant.product_price_cents);
    v_line_total := v_unit_price * v_quantity;
    insert into public.order_items (
      order_id, product_id, variant_id, product_name, variant_name, sku,
      quantity, unit_price_cents, total_cents
    ) values (
      v_order_id, v_variant.product_id, v_variant.id, v_variant.product_name, v_variant.title,
      v_variant.sku, v_quantity, v_unit_price, v_line_total
    );
    update public.product_variants set stock = stock - v_quantity where id = v_variant.id;
  end loop;

  if v_customer_id is not null then
    update public.customers
    set total_orders = total_orders + 1
    where id = v_customer_id;
  end if;

  insert into public.payments (order_id, provider, status, method, amount_cents, currency, metadata)
  values (
    v_order_id,
    'manual',
    p_payment_status,
    'handmatig',
    v_total,
    'EUR',
    jsonb_build_object('created_in_admin', true, 'created_by', (select auth.uid()), 'order_type', p_order_type)
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'order_type', p_order_type,
    'subtotal_cents', v_subtotal,
    'shipping_cents', p_shipping_cents,
    'tax_cents', v_tax,
    'total_cents', v_total
  );
end;
$$;

revoke all on function public.create_admin_order(uuid, jsonb, text, text, text, integer, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_admin_order(uuid, jsonb, text, text, text, integer, text, text, jsonb) to authenticated;

