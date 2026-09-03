-- Keep return/delete actions from putting the same items back in stock twice.
alter table public.orders add column if not exists stock_restored_at timestamptz;

-- Recover previous restorations from the existing return audit trail.
update public.orders as o
set stock_restored_at = (
  select max(a.created_at) from public.activity_log as a
  where a.entity_type = 'order' and a.entity_id = o.id::text
    and a.action = 'Retour verwerkt'
    and coalesce(a.details ->> 'stock_restored', '0') ~ '^[1-9][0-9]*$'
)
where o.stock_restored_at is null and exists (
  select 1 from public.activity_log as a
  where a.entity_type = 'order' and a.entity_id = o.id::text
    and a.action = 'Retour verwerkt'
    and coalesce(a.details ->> 'stock_restored', '0') ~ '^[1-9][0-9]*$'
);

create or replace function public.return_admin_order(
  p_order_id uuid,
  p_restore_stock boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order record;
  v_actor_email text;
  v_restored integer := 0;
begin
  if (select auth.uid()) is null or not private.is_admin(array['owner', 'admin']) then
    raise exception 'Geen toestemming om retouren te verwerken.';
  end if;

  select id, order_number, fulfillment_status, stock_restored_at
  into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'Bestelling niet gevonden.'; end if;

  if v_order.fulfillment_status = 'returned' then
    return jsonb_build_object('order_id', v_order.id, 'stock_restored', 0, 'already_returned', true);
  end if;

  if p_restore_stock and v_order.stock_restored_at is null then
    with restored as (
      update public.product_variants as variant
      set stock = variant.stock + item.quantity
      from (
        select variant_id, sum(quantity)::integer as quantity
        from public.order_items
        where order_id = v_order.id and variant_id is not null
        group by variant_id
      ) as item
      where variant.id = item.variant_id
      returning item.quantity
    )
    select coalesce(sum(quantity), 0)::integer into v_restored from restored;
  end if;

  update public.orders
  set fulfillment_status = 'returned', status = 'completed', returned_at = now(),
      stock_restored_at = case when v_restored > 0 then now() else stock_restored_at end
  where id = v_order.id;

  select email into v_actor_email from public.admin_profiles where id = (select auth.uid());
  insert into public.activity_log (actor_id, actor_email, action, entity_type, entity_id, details)
  values ((select auth.uid()), coalesce(v_actor_email, ''), 'Retour verwerkt', 'order', v_order.id::text,
    jsonb_build_object('order_number', v_order.order_number, 'stock_restored', v_restored));

  return jsonb_build_object('order_id', v_order.id, 'stock_restored', v_restored, 'already_returned', false);
end;
$$;

revoke all on function public.return_admin_order(uuid, boolean) from public, anon, authenticated;
grant execute on function public.return_admin_order(uuid, boolean) to authenticated;

create or replace function public.delete_admin_order(
  p_order_id uuid,
  p_restore_stock boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order record;
  v_paid_net integer := 0;
  v_restore_stock boolean;
begin
  if (select auth.uid()) is null or not private.is_admin(array['owner', 'admin']) then
    raise exception 'Geen toestemming om bestellingen te verwijderen.';
  end if;

  select id, order_number, customer_id, source, stock_restored_at
  into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'Bestelling niet gevonden.'; end if;

  select coalesce(sum(
    case
      when status in ('paid', 'partially_refunded', 'refunded')
        then greatest(0, amount_cents - refunded_cents)
      else 0
    end
  ), 0)::integer
  into v_paid_net
  from public.payments
  where order_id = v_order.id;

  v_restore_stock := coalesce(p_restore_stock, false) and v_order.source is distinct from 'csv-import' and v_order.stock_restored_at is null;
  if v_restore_stock then
    update public.product_variants as variant
    set stock = variant.stock + item.quantity
    from (
      select variant_id, sum(quantity)::integer as quantity
      from public.order_items
      where order_id = v_order.id and variant_id is not null
      group by variant_id
    ) as item
    where variant.id = item.variant_id;
  end if;

  if v_order.customer_id is not null then
    update public.customers
    set total_orders = greatest(0, total_orders - 1),
        total_spent_cents = greatest(0, total_spent_cents - v_paid_net)
    where id = v_order.customer_id;
  end if;

  delete from public.orders where id = v_order.id;
  return jsonb_build_object(
    'success', true,
    'order_number', v_order.order_number,
    'stock_restored', v_restore_stock
  );
end;
$$;

revoke all on function public.delete_admin_order(uuid, boolean) from public, anon, authenticated;
grant execute on function public.delete_admin_order(uuid, boolean) to authenticated;
