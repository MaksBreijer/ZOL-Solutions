-- Voorraad gaat pas af zodra een webshopbetaling echt geslaagd is,
-- niet meer bij het aanmaken van de checkoutbestelling.

alter table public.orders add column if not exists stock_deducted_at timestamptz;

-- Bestaande bestellingen zijn al afgeboekt bij aanmaken (behalve CSV-imports).
update public.orders
set stock_deducted_at = created_at
where stock_deducted_at is null and source is distinct from 'csv-import';

-- Checkout: alleen voorraad controleren, niet meer afboeken.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.create_checkout_order'::regproc);
  if position('update public.product_variants set stock = stock - v_quantity where id = v_variant.id;' in v_def) = 0 then
    raise exception 'create_checkout_order: afboekregel niet gevonden';
  end if;
  v_def := replace(v_def, 'update public.product_variants set stock = stock - v_quantity where id = v_variant.id;', '');
  execute v_def;
end $$;

-- Handmatige/admin-bestellingen boeken direct af: markeer ze bij aanmaken.
create or replace function private.mark_admin_order_stock_deducted()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.source is distinct from 'zol-webshop' and new.source is distinct from 'csv-import' then
    new.stock_deducted_at := coalesce(new.stock_deducted_at, now());
  end if;
  return new;
end $$;

drop trigger if exists mark_admin_order_stock_deducted on public.orders;
create trigger mark_admin_order_stock_deducted
before insert on public.orders
for each row execute function private.mark_admin_order_stock_deducted();

-- Webshop: afboeken op het moment dat de betaling 'paid' wordt (precies één keer).
create or replace function private.deduct_stock_on_paid()
returns trigger language plpgsql set search_path to '' as $$
declare v_short jsonb;
begin
  if new.payment_status = 'paid'
     and new.stock_deducted_at is null
     and new.stock_restored_at is null
     and new.source = 'zol-webshop' then
    select jsonb_agg(jsonb_build_object('sku', variant.sku, 'stock', variant.stock, 'ordered', item.quantity))
    into v_short
    from (select variant_id, sum(quantity)::integer as quantity from public.order_items
          where order_id = new.id and variant_id is not null group by variant_id) as item
    join public.product_variants as variant on variant.id = item.variant_id
    where variant.stock < item.quantity;

    update public.product_variants as variant
    set stock = greatest(0, variant.stock - item.quantity)
    from (select variant_id, sum(quantity)::integer as quantity from public.order_items
          where order_id = new.id and variant_id is not null group by variant_id) as item
    where variant.id = item.variant_id;

    update public.orders set stock_deducted_at = now() where id = new.id;

    if v_short is not null then
      insert into public.activity_log (actor_email, action, entity_type, entity_id, details)
      values ('systeem', 'Betaalde bestelling met te weinig voorraad', 'order', new.id::text,
        jsonb_build_object('order_number', new.order_number, 'items', v_short));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists deduct_stock_on_paid on public.orders;
create trigger deduct_stock_on_paid
after update of payment_status on public.orders
for each row when (new.payment_status = 'paid' and new.stock_deducted_at is null)
execute function private.deduct_stock_on_paid();

-- Retour en verwijderen: alleen terugboeken als er ook echt is afgeboekt.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.delete_admin_order'::regproc);
  v_def := replace(v_def, 'select id, order_number, customer_id, source, stock_restored_at', 'select id, order_number, customer_id, source, stock_restored_at, stock_deducted_at');
  v_def := replace(v_def, 'and v_order.stock_restored_at is null;', 'and v_order.stock_restored_at is null and v_order.stock_deducted_at is not null;');
  execute v_def;

  v_def := pg_get_functiondef('public.return_admin_order'::regproc);
  v_def := replace(v_def, 'select id, order_number, fulfillment_status, stock_restored_at', 'select id, order_number, fulfillment_status, stock_restored_at, stock_deducted_at');
  v_def := replace(v_def, 'if p_restore_stock and v_order.stock_restored_at is null then', 'if p_restore_stock and v_order.stock_restored_at is null and v_order.stock_deducted_at is not null then');
  execute v_def;
end $$;
