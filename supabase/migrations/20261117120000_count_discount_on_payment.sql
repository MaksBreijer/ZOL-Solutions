-- Kortingscode telt pas als "gebruikt" zodra de webshopbetaling echt geslaagd is.
-- Een mislukte/afgebroken betaling mag een persoonlijke (eenmalige) code niet opmaken.

alter table public.orders add column if not exists discount_counted_at timestamptz;

-- Bestaande betaalde bestellingen met korting zijn al geteld.
update public.orders set discount_counted_at = created_at
where discount_id is not null and discount_counted_at is null
  and (payment_status = 'paid' or source is distinct from 'zol-webshop');

-- Checkout: niet meer tellen bij aanmaken.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.create_checkout_order'::regproc);
  if position('update public.discounts set usage_count = usage_count + 1 where id = v_discount.id;' in v_def) = 0 then
    raise exception 'create_checkout_order: telregel kortingscode niet gevonden';
  end if;
  v_def := replace(v_def, 'update public.discounts set usage_count = usage_count + 1 where id = v_discount.id;', '');
  execute v_def;
end $$;

-- Teller herberekenen: alleen betaalde (of niet-webshop) bestellingen tellen.
update public.discounts d set usage_count = coalesce((
  select count(*) from public.discount_redemptions r
  join public.orders o on o.id = r.order_id
  where r.discount_id = d.id and o.discount_counted_at is not null), 0)
where d.code is not null
  and d.usage_count > coalesce((
  select count(*) from public.discount_redemptions r
  join public.orders o on o.id = r.order_id
  where r.discount_id = d.id and o.discount_counted_at is not null), 0);

-- Tellen op het moment dat de betaling 'paid' wordt (precies één keer).
create or replace function private.count_discount_on_paid()
returns trigger language plpgsql set search_path to '' as $$
begin
  update public.discounts as d set usage_count = d.usage_count + 1, updated_at = now()
  from public.discount_redemptions as r
  where r.order_id = new.id and d.id = r.discount_id;
  update public.orders set discount_counted_at = now() where id = new.id;
  return new;
end $$;

drop trigger if exists count_discount_on_paid on public.orders;
create trigger count_discount_on_paid
after update of payment_status on public.orders
for each row when (new.payment_status = 'paid' and new.discount_counted_at is null and new.discount_id is not null)
execute function private.count_discount_on_paid();

-- Niet-webshopbestellingen (admin/import) tellen hun korting zelf: markeer bij aanmaken.
create or replace function private.mark_non_webshop_discount_counted()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.source is distinct from 'zol-webshop' then
    new.discount_counted_at := coalesce(new.discount_counted_at, now());
  end if;
  return new;
end $$;

drop trigger if exists mark_non_webshop_discount_counted on public.orders;
create trigger mark_non_webshop_discount_counted
before insert on public.orders
for each row execute function private.mark_non_webshop_discount_counted();
