-- Read-only, server-authoritative quote used by the public checkout.

create or replace function public.quote_checkout_order(
  p_items jsonb,
  p_discount_code text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
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
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    raise exception 'De winkelwagen is ongeldig.';
  end if;

  select value into v_commerce from public.settings where key = 'commerce';

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := least(10, greatest(1, coalesce((v_item ->> 'quantity')::integer, 1)));
    select variant.id, variant.stock, variant.active, variant.price_cents,
      product.name as product_name, product.price_cents as product_price_cents,
      product.tax_rate, product.active as product_active
    into v_variant
    from public.product_variants as variant
    join public.products as product on product.id = variant.product_id
    where variant.id = (v_item ->> 'variant_id')::uuid;

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
    select * into v_discount from public.discounts where code = v_code and method = 'code';
    if not found then raise exception 'Deze kortingscode is niet geldig.'; end if;
    v_has_discount := true;
    if not v_discount.active or v_discount.starts_at > now() or (v_discount.ends_at is not null and v_discount.ends_at <= now()) then
      raise exception 'Deze kortingscode is niet actief.';
    end if;
    if v_discount.usage_limit is not null and v_discount.usage_count >= v_discount.usage_limit then
      raise exception 'Deze kortingscode is volledig gebruikt.';
    end if;
    if v_subtotal < v_discount.minimum_subtotal_cents then
      raise exception 'Besteed minimaal €% om deze kortingscode te gebruiken.',
        to_char(v_discount.minimum_subtotal_cents / 100.0, 'FM999999990D00');
    end if;
  else
    select * into v_discount from public.discounts
    where method = 'automatic' and active = true and starts_at <= now()
      and (ends_at is null or ends_at > now())
      and (usage_limit is null or usage_count < usage_limit)
      and minimum_subtotal_cents <= v_subtotal
    order by case discount_type
      when 'percentage' then round(v_subtotal * value / 100.0)
      when 'fixed_amount' then least(v_subtotal, value)
      else v_shipping
    end desc, created_at
    limit 1;
    v_has_discount := found;
  end if;

  if v_has_discount then
    if v_discount.discount_type = 'percentage' then
      v_product_discount_cents := round(v_subtotal * v_discount.value / 100.0);
    elsif v_discount.discount_type = 'fixed_amount' then
      v_product_discount_cents := least(v_subtotal, v_discount.value);
    elsif v_discount.discount_type = 'free_shipping' then
      v_discount_cents := v_shipping;
    end if;
    v_discount_cents := v_discount_cents + v_product_discount_cents;
    if v_product_discount_cents > 0 and v_subtotal > 0 then
      v_tax := round(v_tax * ((v_subtotal - v_product_discount_cents)::numeric / v_subtotal));
    end if;
  end if;

  v_total := greatest(0, v_subtotal + v_shipping - v_discount_cents);
  return jsonb_build_object(
    'subtotal_cents', v_subtotal,
    'shipping_cents', v_shipping,
    'discount_code', case when v_has_discount then v_discount.code end,
    'discount_title', case when v_has_discount then v_discount.title end,
    'discount_type', case when v_has_discount then v_discount.discount_type end,
    'discount_cents', v_discount_cents,
    'tax_cents', v_tax,
    'total_cents', v_total,
    'automatic', v_has_discount and v_discount.method = 'automatic'
  );
end;
$$;

revoke all on function public.quote_checkout_order(jsonb, text) from public, anon, authenticated;
grant execute on function public.quote_checkout_order(jsonb, text) to service_role;
