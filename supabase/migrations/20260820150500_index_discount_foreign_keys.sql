create index if not exists discounts_created_by_idx on public.discounts (created_by);
create index if not exists orders_discount_id_idx on public.orders (discount_id);
