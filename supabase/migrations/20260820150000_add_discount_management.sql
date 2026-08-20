-- Durable ZOL discount management and authoritative checkout calculation.

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  code text,
  method text not null default 'code' check (method in ('code', 'automatic')),
  discount_type text not null default 'percentage' check (discount_type in ('percentage', 'fixed_amount', 'free_shipping')),
  value integer not null default 0 check (value >= 0),
  minimum_subtotal_cents integer not null default 0 check (minimum_subtotal_cents >= 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discounts_code_method_check check (
    (method = 'code' and code is not null and code = upper(code) and code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$')
    or (method = 'automatic' and code is null)
  ),
  constraint discounts_type_value_check check (
    (discount_type = 'percentage' and value between 1 and 100)
    or (discount_type = 'fixed_amount' and value > 0)
    or (discount_type = 'free_shipping' and value = 0)
  ),
  constraint discounts_dates_check check (ends_at is null or ends_at > starts_at)
);

create unique index discounts_code_unique_idx on public.discounts (upper(code)) where code is not null;
create index discounts_active_dates_idx on public.discounts (active, starts_at, ends_at);
create index discounts_created_by_idx on public.discounts (created_by);
create trigger discounts_updated_at before update on public.discounts
for each row execute function private.set_updated_at();

create table public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references public.discounts(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  code text,
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

create index discount_redemptions_discount_idx on public.discount_redemptions (discount_id, created_at desc);

alter table public.orders
  add column discount_id uuid references public.discounts(id) on delete set null,
  add column discount_code text,
  add column discount_cents integer not null default 0 check (discount_cents >= 0);

create index orders_discount_id_idx on public.orders (discount_id);

grant select, insert, update, delete on public.discounts to authenticated;
grant select on public.discount_redemptions to authenticated;
grant select, insert, update, delete on public.discounts, public.discount_redemptions to service_role;

alter table public.discounts enable row level security;
alter table public.discount_redemptions enable row level security;

create policy "admins read discounts" on public.discounts
for select to authenticated using (private.is_admin());
create policy "owners and admins create discounts" on public.discounts
for insert to authenticated with check (private.is_admin(array['owner', 'admin']));
create policy "owners and admins update discounts" on public.discounts
for update to authenticated using (private.is_admin(array['owner', 'admin']))
with check (private.is_admin(array['owner', 'admin']));
create policy "owners and admins delete discounts" on public.discounts
for delete to authenticated using (private.is_admin(array['owner', 'admin']));
create policy "admins read discount redemptions" on public.discount_redemptions
for select to authenticated using (private.is_admin());

drop function if exists public.create_checkout_order(jsonb, jsonb, text, text);

create function public.create_checkout_order(
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
  v_code text := upper(trim(coalesce(p_discount_code, '')));
begin
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Vul een geldig e-mailadres in.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    raise exception 'De winkelwagen is ongeldig.';
  end if;

  select value into v_commerce from public.settings where key = 'commerce';

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := least(10, greatest(1, coalesce((v_item ->> 'quantity')::integer, 1)));
    select variant.id, variant.product_id, variant.title, variant.sku, variant.stock, variant.active,
      variant.price_cents, product.name as product_name, product.price_cents as product_price_cents,
      product.tax_rate, product.active as product_active
    into v_variant
    from public.product_variants as variant
    join public.products as product on product.id = variant.product_id
    where variant.id = (v_item ->> 'variant_id')::uuid
    for update of variant;

    if not found or not v_variant.active or not v_variant.product_active then raise exception 'Een product is niet meer beschikbaar.'; end if;
    if v_variant.stock < v_quantity then raise exception 'Niet genoeg voorraad voor %.', v_variant.product_name; end if;
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
      and (ends_at is null or ends_at > now())
      and (usage_limit is null or usage_count < usage_limit)
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

  v_total := greatest(0, v_subtotal + v_shipping - v_discount_cents);
  v_customer_name := trim(concat_ws(' ', p_customer ->> 'first_name', p_customer ->> 'last_name'));

  insert into public.customers (email, first_name, last_name, phone, address, total_orders)
  values (v_email, left(coalesce(p_customer ->> 'first_name', ''), 120), left(coalesce(p_customer ->> 'last_name', ''), 120), left(coalesce(p_customer ->> 'phone', ''), 80),
    jsonb_build_object('street', left(coalesce(p_customer ->> 'street', ''), 180), 'postal_code', left(coalesce(p_customer ->> 'postal_code', ''), 30), 'city', left(coalesce(p_customer ->> 'city', ''), 120), 'country', 'NL'), 1)
  on conflict (email) do update set first_name = excluded.first_name, last_name = excluded.last_name,
    phone = excluded.phone, address = excluded.address, total_orders = public.customers.total_orders + 1, updated_at = now()
  returning id into v_customer_id;

  insert into public.orders (
    customer_id, customer_email, customer_name, status, payment_status, fulfillment_status,
    subtotal_cents, shipping_cents, discount_id, discount_code, discount_cents, tax_cents, total_cents,
    currency, shipping_address, note, source
  ) values (
    v_customer_id, v_email, v_customer_name, 'open', 'pending', 'unfulfilled',
    v_subtotal, v_shipping, case when v_has_discount then v_discount.id end,
    case when v_has_discount then v_discount.code end, v_discount_cents, v_tax, v_total, 'EUR',
    jsonb_build_object('street', left(coalesce(p_customer ->> 'street', ''), 180), 'postal_code', left(coalesce(p_customer ->> 'postal_code', ''), 30), 'city', left(coalesce(p_customer ->> 'city', ''), 120), 'country', 'NL'),
    left(coalesce(p_note, ''), 1000), 'zol-webshop'
  ) returning id, order_number into v_order_id, v_order_number;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := least(10, greatest(1, coalesce((v_item ->> 'quantity')::integer, 1)));
    select variant.id, variant.product_id, variant.title, variant.sku, variant.price_cents,
      product.name as product_name, product.price_cents as product_price_cents
    into v_variant from public.product_variants as variant join public.products as product on product.id = variant.product_id
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

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'subtotal_cents', v_subtotal,
    'shipping_cents', v_shipping, 'discount_code', case when v_has_discount then v_discount.code end,
    'discount_cents', v_discount_cents, 'tax_cents', v_tax, 'total_cents', v_total);
end;
$$;

revoke all on function public.create_checkout_order(jsonb, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.create_checkout_order(jsonb, jsonb, text, text, text) to service_role;
