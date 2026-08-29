-- Transactional public checkout, stock reservation and abuse protection.

create table public.checkout_rate_limits (
  fingerprint text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0)
);

revoke all on public.checkout_rate_limits from anon, authenticated;
grant select, insert, update, delete on public.checkout_rate_limits to service_role;
alter table public.checkout_rate_limits enable row level security;
create policy "service role manages checkout limits" on public.checkout_rate_limits
for all to service_role using (true) with check (true);

create or replace function public.enforce_checkout_rate_limit(p_fingerprint text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  insert into public.checkout_rate_limits (fingerprint, window_started_at, attempts)
  values (p_fingerprint, now(), 1)
  on conflict (fingerprint) do update
  set window_started_at = case
        when public.checkout_rate_limits.window_started_at < now() - interval '15 minutes' then now()
        else public.checkout_rate_limits.window_started_at
      end,
      attempts = case
        when public.checkout_rate_limits.window_started_at < now() - interval '15 minutes' then 1
        else public.checkout_rate_limits.attempts + 1
      end
  returning attempts into v_attempts;

  delete from public.checkout_rate_limits where window_started_at < now() - interval '24 hours';
  return v_attempts <= 6;
end;
$$;

revoke all on function public.enforce_checkout_rate_limit(text) from public, anon, authenticated;
grant execute on function public.enforce_checkout_rate_limit(text) to service_role;

drop function if exists public.create_checkout_order(jsonb, jsonb, text, text);

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
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number bigint;
  v_email text := lower(trim(coalesce(p_customer ->> 'email', '')));
  v_customer_name text;
  v_item jsonb;
  v_variant record;
  v_discount public.discounts%rowtype;
  v_has_discount boolean := false;
  v_quantity integer;
  v_unit_price integer;
  v_line_total integer;
  v_subtotal integer := 0;
  v_tax integer := 0;
  v_shipping integer := 0;
  v_discount_cents integer := 0;
  v_product_discount_cents integer := 0;
  v_total integer := 0;
  v_commerce jsonb := '{}'::jsonb;
  v_threshold integer := 0;
  v_shipping_tax_rate numeric := 21.00;
  v_code text := upper(trim(coalesce(p_discount_code, '')));
begin
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Vul een geldig e-mailadres in.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    raise exception 'De winkelwagen is ongeldig.';
  end if;

  select value into v_commerce from public.settings where key = 'commerce';
  v_shipping_tax_rate := greatest(
    0,
    coalesce(nullif(v_commerce ->> 'tax_rate', '')::numeric, 21.00)
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := least(10, greatest(1, coalesce((v_item ->> 'quantity')::integer, 1)));
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
      raise exception 'Een product is niet meer beschikbaar.';
    end if;
    if v_variant.stock < v_quantity then
      raise exception 'Niet genoeg voorraad voor %.', v_variant.product_name;
    end if;

    v_unit_price := coalesce(v_variant.price_cents, v_variant.product_price_cents);
    v_line_total := v_unit_price * v_quantity;
    v_subtotal := v_subtotal + v_line_total;
    v_tax := v_tax + round(v_line_total - (v_line_total / (1 + v_variant.tax_rate / 100.0)));
  end loop;

  v_shipping := coalesce((v_commerce ->> 'shipping_cents')::integer, 0);
  v_threshold := coalesce((v_commerce ->> 'free_shipping_threshold_cents')::integer, 0);
  if v_threshold > 0 and v_subtotal >= v_threshold then v_shipping := 0; end if;

  if v_code <> '' then
    select * into v_discount from public.discounts where code = v_code and method = 'code' for update;
    if not found then raise exception 'Deze kortingscode is niet geldig.'; end if;
    v_has_discount := true;
    if not v_discount.active or v_discount.starts_at > now() or (v_discount.ends_at is not null and v_discount.ends_at <= now()) then raise exception 'Deze kortingscode is niet actief.'; end if;
    if v_discount.usage_limit is not null and v_discount.usage_count >= v_discount.usage_limit then raise exception 'Deze kortingscode is volledig gebruikt.'; end if;
    if v_subtotal < v_discount.minimum_subtotal_cents then raise exception 'Het bestelbedrag is te laag voor deze kortingscode.'; end if;
  else
    select * into v_discount from public.discounts
    where method = 'automatic' and active = true and starts_at <= now()
      and (ends_at is null or ends_at > now()) and (usage_limit is null or usage_count < usage_limit)
      and minimum_subtotal_cents <= v_subtotal
    order by case discount_type when 'percentage' then round(v_subtotal * value / 100.0) when 'fixed_amount' then least(v_subtotal, value) else v_shipping end desc, created_at
    limit 1 for update;
    v_has_discount := found;
  end if;

  if v_has_discount then
    if v_discount.discount_type = 'percentage' then v_product_discount_cents := round(v_subtotal * v_discount.value / 100.0);
    elsif v_discount.discount_type = 'fixed_amount' then v_product_discount_cents := least(v_subtotal, v_discount.value);
    elsif v_discount.discount_type = 'free_shipping' then v_discount_cents := v_shipping;
    end if;
    v_discount_cents := v_discount_cents + v_product_discount_cents;
    if v_product_discount_cents > 0 and v_subtotal > 0 then v_tax := round(v_tax * ((v_subtotal - v_product_discount_cents)::numeric / v_subtotal)); end if;
  end if;
  if v_shipping > 0 and not (v_has_discount and v_discount.discount_type = 'free_shipping') then
    v_tax := v_tax + round(v_shipping - (v_shipping / (1 + v_shipping_tax_rate / 100.0)));
  end if;
  v_total := greatest(0, v_subtotal + v_shipping - v_discount_cents);
  v_customer_name := trim(concat_ws(' ', p_customer ->> 'first_name', p_customer ->> 'last_name'));

  insert into public.customers (email, first_name, last_name, phone, address, total_orders)
  values (
    v_email,
    left(coalesce(p_customer ->> 'first_name', ''), 120),
    left(coalesce(p_customer ->> 'last_name', ''), 120),
    left(coalesce(p_customer ->> 'phone', ''), 80),
    jsonb_build_object(
      'street', left(coalesce(p_customer ->> 'street', ''), 180),
      'postal_code', left(coalesce(p_customer ->> 'postal_code', ''), 30),
      'city', left(coalesce(p_customer ->> 'city', ''), 120),
      'country', 'NL'
    ),
    1
  )
  on conflict (email) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      phone = excluded.phone,
      address = excluded.address,
      total_orders = public.customers.total_orders + 1,
      updated_at = now()
  returning id into v_customer_id;

  insert into public.orders (
    customer_id, customer_email, customer_name, status, payment_status, fulfillment_status,
    subtotal_cents, shipping_cents, discount_id, discount_code, discount_cents, tax_cents, total_cents, currency, shipping_address, note, source
  ) values (
    v_customer_id, v_email, v_customer_name, 'open', 'pending', 'unfulfilled',
    v_subtotal, v_shipping, case when v_has_discount then v_discount.id end,
    case when v_has_discount then v_discount.code end, v_discount_cents, v_tax, v_total, 'EUR',
    jsonb_build_object(
      'street', left(coalesce(p_customer ->> 'street', ''), 180),
      'postal_code', left(coalesce(p_customer ->> 'postal_code', ''), 30),
      'city', left(coalesce(p_customer ->> 'city', ''), 120),
      'country', 'NL'
    ),
    left(coalesce(p_note, ''), 1000), 'zol-webshop'
  ) returning id, order_number into v_order_id, v_order_number;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := least(10, greatest(1, coalesce((v_item ->> 'quantity')::integer, 1)));
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

    v_unit_price := coalesce(v_variant.price_cents, v_variant.product_price_cents);
    v_line_total := v_unit_price * v_quantity;
    insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name, sku, quantity, unit_price_cents, total_cents)
    values (v_order_id, v_variant.product_id, v_variant.id, v_variant.product_name, v_variant.title, v_variant.sku, v_quantity, v_unit_price, v_line_total);
    update public.product_variants set stock = stock - v_quantity where id = v_variant.id;
  end loop;

  if v_has_discount then
    insert into public.discount_redemptions (discount_id, order_id, code, amount_cents)
    values (v_discount.id, v_order_id, v_discount.code, v_discount_cents);
    update public.discounts set usage_count = usage_count + 1 where id = v_discount.id;
  end if;

  insert into public.payments (order_id, provider, status, amount_cents, currency, metadata)
  values (v_order_id, 'mollie', 'pending', v_total, 'EUR', jsonb_build_object('checkout_ready', false));

  insert into public.analytics_events (session_id, event_name, page, metadata)
  values (left(coalesce(nullif(p_session_id, ''), gen_random_uuid()::text), 120), 'order_created', '/checkout/', jsonb_build_object('order_number', v_order_number, 'total_cents', v_total, 'discount_cents', v_discount_cents));

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal_cents', v_subtotal,
    'shipping_cents', v_shipping,
    'discount_code', case when v_has_discount then v_discount.code end,
    'discount_cents', v_discount_cents,
    'tax_cents', v_tax,
    'total_cents', v_total
  );
end;
$$;

revoke all on function public.create_checkout_order(jsonb, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.create_checkout_order(jsonb, jsonb, text, text, text) to service_role;

create or replace function private.sync_payment_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_paid_delta integer := 0;
  v_refund_delta integer := 0;
begin
  select customer_id into v_customer_id from public.orders where id = new.order_id;

  if new.status = 'paid' and (tg_op = 'INSERT' or old.status <> 'paid') then
    v_paid_delta := new.amount_cents;
  elsif tg_op = 'UPDATE' and old.status = 'paid' and new.status <> 'paid' then
    v_paid_delta := -old.amount_cents;
  end if;
  if tg_op = 'UPDATE' then v_refund_delta := new.refunded_cents - old.refunded_cents;
  else v_refund_delta := new.refunded_cents; end if;

  if v_customer_id is not null and (v_paid_delta <> 0 or v_refund_delta <> 0) then
    update public.customers
    set total_spent_cents = greatest(0, total_spent_cents + v_paid_delta - v_refund_delta)
    where id = v_customer_id;
  end if;

  update public.orders
  set payment_status = case new.status
    when 'paid' then 'paid'
    when 'failed' then 'failed'
    when 'refunded' then 'refunded'
    when 'partially_refunded' then 'partially_refunded'
    else payment_status
  end
  where id = new.order_id;
  return new;
end;
$$;

revoke all on function private.sync_payment_status() from public;
drop trigger if exists sync_payment_status_to_order on public.payments;
create trigger sync_payment_status_to_order
after insert or update of status, refunded_cents on public.payments
for each row execute function private.sync_payment_status();
