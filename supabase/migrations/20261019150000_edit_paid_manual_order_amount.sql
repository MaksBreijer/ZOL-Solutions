-- One transaction keeps article prices, totals, payment and the audit trail consistent.
create or replace function public.update_admin_order_amount(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_items jsonb,
  p_shipping_cents integer,
  p_discount_cents integer,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_item record;
  v_price numeric;
  v_subtotal bigint := 0;
  v_tax numeric := 0;
  v_total bigint;
  v_count integer;
  v_old_items jsonb;
  v_email text;
  v_in_ledger boolean := false;
begin
  if (select auth.uid()) is null or not private.is_admin(array['owner', 'admin']) then
    raise exception 'Geen toestemming om bedragen te wijzigen.';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Bestelling niet gevonden.'; end if;
  if p_expected_updated_at is null or v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'De bestelling is intussen gewijzigd. Sluit dit venster en open de bestelling opnieuw.';
  end if;
  if v_order.source <> 'admin' or v_order.payment_status not in ('pending', 'failed', 'paid')
    or v_order.status = 'cancelled' or v_order.fulfillment_status = 'returned' then
    raise exception 'Alleen handmatige bestellingen die niet zijn geannuleerd, geretourneerd of terugbetaald kunnen worden aangepast.';
  end if;
  -- Lock every existing payment; reject provider-managed or ambiguous payments.
  perform id from public.payments where order_id = p_order_id order by id for update;
  select count(*) into v_count from public.payments where order_id = p_order_id;
  if v_count <> 1 then raise exception 'De gekoppelde betaling kan niet handmatig worden aangepast.'; end if;
  select * into v_payment from public.payments where order_id = p_order_id;
  if v_payment.provider <> 'manual' or v_payment.provider_payment_id is not null
    or v_payment.status not in ('open', 'pending', 'failed', 'cancelled', 'expired', 'paid')
    or v_payment.refunded_cents <> 0
    or (v_order.payment_status = 'paid') <> (v_payment.status = 'paid') then
    raise exception 'Een bestaande betaling of terugbetaling kan niet worden overschreven.';
  end if;
  if p_shipping_cents is null or p_shipping_cents < 0 or p_shipping_cents > 1000000
    or p_discount_cents is null or p_discount_cents < 0 then
    raise exception 'Vul geldige verzendkosten en korting in.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 300 then
    raise exception 'Vul een reden van maximaal 300 tekens in.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Ongeldige artikelregels.'; end if;
  perform id from public.order_items where order_id = p_order_id order by id for update;
  select count(*), jsonb_agg(jsonb_build_object('id', id, 'unit_price_cents', unit_price_cents, 'total_cents', total_cents) order by id)
    into v_count, v_old_items from public.order_items where order_id = p_order_id;
  if v_count = 0 or jsonb_array_length(p_items) <> v_count
    or (select count(distinct value ->> 'id') from jsonb_array_elements(p_items)) <> v_count then
    raise exception 'Geef iedere bestaande artikelregel precies één keer op.';
  end if;
  for v_item in
    select item.*, supplied.value, product.tax_rate
    from jsonb_array_elements(p_items) as supplied(value)
    left join public.order_items item on item.id = (supplied.value ->> 'id')::uuid and item.order_id = p_order_id
    left join public.products product on product.id = item.product_id
  loop
    if v_item.id is null or v_item.tax_rate is null then raise exception 'Artikelregel of btw-tarief niet gevonden.'; end if;
    if jsonb_typeof(v_item.value -> 'unit_price_cents') is distinct from 'number' then raise exception 'Ongeldige stukprijs.'; end if;
    v_price := (v_item.value ->> 'unit_price_cents')::numeric;
    if v_price < 0 or v_price > 1000000 or v_price <> trunc(v_price) then raise exception 'Ongeldige stukprijs.'; end if;
    v_subtotal := v_subtotal + v_price::bigint * v_item.quantity;
    v_tax := v_tax + round(v_price * v_item.quantity - (v_price * v_item.quantity / (1 + v_item.tax_rate / 100.0)));
  end loop;
  if p_discount_cents > v_subtotal then raise exception 'De korting mag niet hoger zijn dan het subtotaal.'; end if;
  v_total := v_subtotal + p_shipping_cents - p_discount_cents;
  if v_subtotal > 2147483647 or v_total > 2147483647 then raise exception 'Het bedrag is te hoog.'; end if;
  -- Follow manual-order creation: tax is included in article prices, not shipping.
  v_tax := case when v_subtotal = 0 then 0 else round(v_tax * (v_subtotal - p_discount_cents) / v_subtotal) end;
  if not exists (
    select 1 from jsonb_array_elements(p_items) supplied(value)
    join public.order_items item on item.id = (supplied.value ->> 'id')::uuid
    where item.unit_price_cents <> (supplied.value ->> 'unit_price_cents')::integer
  ) and v_order.shipping_cents = p_shipping_cents and v_order.discount_cents = p_discount_cents then
    return jsonb_build_object('order_id', p_order_id, 'total_cents', v_order.total_cents, 'changed', false);
  end if;
  update public.order_items item set
    unit_price_cents = (supplied.value ->> 'unit_price_cents')::integer,
    total_cents = (supplied.value ->> 'unit_price_cents')::integer * item.quantity
  from jsonb_array_elements(p_items) supplied(value)
  where item.order_id = p_order_id and item.id = (supplied.value ->> 'id')::uuid;
  update public.orders set subtotal_cents = v_subtotal, shipping_cents = p_shipping_cents,
    discount_cents = p_discount_cents, total_cents = v_total, tax_cents = v_tax,
    discount_code = case when p_discount_cents <> v_order.discount_cents then null else discount_code end,
    discount_id = case when p_discount_cents <> v_order.discount_cents then null else discount_id end
  where id = p_order_id;
  update public.payments set amount_cents = v_total where id = v_payment.id;
  -- A paid order may already be in the ledger: post the difference as a correction so the books keep matching.
  if v_order.payment_status = 'paid' and to_regclass('public.accounting_entries') is not null then
    select exists (select 1 from public.accounting_entries where source_type = 'order_sale' and source_id = p_order_id and source_revision = 'sale') into v_in_ledger;
  end if;
  if v_in_ledger then
    declare
      v_delta_total bigint := v_total - v_order.total_cents;
      v_delta_vat bigint := v_tax::bigint - v_order.tax_cents;
      v_delta_net bigint := (v_total - v_tax::bigint) - (v_order.total_cents - v_order.tax_cents);
    begin
      if v_delta_total <> 0 then
        perform private.create_accounting_entry(
          current_date, 'sales', 'COR-' || v_order.order_number,
          'Bedragwijziging ZOL-' || v_order.order_number || ' · ' || btrim(p_reason),
          'order_amount_correction', p_order_id, extract(epoch from clock_timestamp())::text,
          jsonb_build_object('order_number', v_order.order_number, 'delta_total_cents', v_delta_total),
          jsonb_build_array(
            jsonb_build_object('account_code', '1300', 'description', 'Factuur ZOL-' || v_order.order_number, 'debit_cents', greatest(v_delta_total, 0), 'credit_cents', greatest(-v_delta_total, 0), 'vat_rate', 0),
            jsonb_build_object('account_code', '8000', 'description', 'Omzetcorrectie ZOL-' || v_order.order_number, 'debit_cents', greatest(-v_delta_net, 0), 'credit_cents', greatest(v_delta_net, 0), 'vat_rate', 21),
            jsonb_build_object('account_code', '1520', 'description', 'BTW-correctie ZOL-' || v_order.order_number, 'debit_cents', greatest(-v_delta_vat, 0), 'credit_cents', greatest(v_delta_vat, 0), 'vat_rate', 21)
          )
        );
      end if;
    end;
  end if;
  select email into v_email from public.admin_profiles where id = (select auth.uid());
  insert into public.activity_log(actor_id, actor_email, action, entity_type, entity_id, details)
  values ((select auth.uid()), v_email,
    'Bedrag gewijzigd van € ' || replace(to_char(v_order.total_cents / 100.0, 'FM9999999990.00'), '.', ',') ||
    ' naar € ' || replace(to_char(v_total / 100.0, 'FM9999999990.00'), '.', ',') || ' · ' || btrim(p_reason),
    'order', p_order_id, jsonb_build_object('order_number', v_order.order_number, 'reason', btrim(p_reason),
      'before', jsonb_build_object('total_cents', v_order.total_cents, 'shipping_cents', v_order.shipping_cents, 'discount_cents', v_order.discount_cents, 'tax_cents', v_order.tax_cents, 'items', v_old_items),
      'after', jsonb_build_object('total_cents', v_total, 'shipping_cents', p_shipping_cents, 'discount_cents', p_discount_cents, 'tax_cents', v_tax, 'items', p_items)));
  return jsonb_build_object('order_id', p_order_id, 'total_cents', v_total, 'changed', true);
end;
$$;
revoke all on function public.update_admin_order_amount(uuid, timestamptz, jsonb, integer, integer, text) from public, anon, authenticated;
grant execute on function public.update_admin_order_amount(uuid, timestamptz, jsonb, integer, integer, text) to authenticated;
