-- Remove overlapping permissive SELECT policies and index foreign keys.

drop policy if exists "managers manage customers" on public.customers;
create policy "managers insert customers" on public.customers for insert to authenticated
with check (private.is_admin(array['owner', 'admin']));
create policy "managers update customers" on public.customers for update to authenticated
using (private.is_admin(array['owner', 'admin'])) with check (private.is_admin(array['owner', 'admin']));
create policy "managers delete customers" on public.customers for delete to authenticated
using (private.is_admin(array['owner', 'admin']));

drop policy if exists "editors manage products" on public.products;
create policy "editors insert products" on public.products for insert to authenticated
with check (private.is_admin(array['owner', 'admin', 'editor']));
create policy "editors update products" on public.products for update to authenticated
using (private.is_admin(array['owner', 'admin', 'editor'])) with check (private.is_admin(array['owner', 'admin', 'editor']));
create policy "editors delete products" on public.products for delete to authenticated
using (private.is_admin(array['owner', 'admin', 'editor']));

drop policy if exists "editors manage variants" on public.product_variants;
create policy "editors insert variants" on public.product_variants for insert to authenticated
with check (private.is_admin(array['owner', 'admin', 'editor']));
create policy "editors update variants" on public.product_variants for update to authenticated
using (private.is_admin(array['owner', 'admin', 'editor'])) with check (private.is_admin(array['owner', 'admin', 'editor']));
create policy "editors delete variants" on public.product_variants for delete to authenticated
using (private.is_admin(array['owner', 'admin', 'editor']));

drop policy if exists "managers manage orders" on public.orders;
create policy "managers insert orders" on public.orders for insert to authenticated with check (private.is_admin(array['owner', 'admin']));
create policy "managers update orders" on public.orders for update to authenticated using (private.is_admin(array['owner', 'admin'])) with check (private.is_admin(array['owner', 'admin']));
create policy "managers delete orders" on public.orders for delete to authenticated using (private.is_admin(array['owner', 'admin']));

drop policy if exists "managers manage order items" on public.order_items;
create policy "managers insert order items" on public.order_items for insert to authenticated with check (private.is_admin(array['owner', 'admin']));
create policy "managers update order items" on public.order_items for update to authenticated using (private.is_admin(array['owner', 'admin'])) with check (private.is_admin(array['owner', 'admin']));
create policy "managers delete order items" on public.order_items for delete to authenticated using (private.is_admin(array['owner', 'admin']));

drop policy if exists "managers manage payments" on public.payments;
create policy "managers insert payments" on public.payments for insert to authenticated with check (private.is_admin(array['owner', 'admin']));
create policy "managers update payments" on public.payments for update to authenticated using (private.is_admin(array['owner', 'admin'])) with check (private.is_admin(array['owner', 'admin']));
create policy "managers delete payments" on public.payments for delete to authenticated using (private.is_admin(array['owner', 'admin']));

drop policy if exists "editors manage media" on public.media;
create policy "editors insert media" on public.media for insert to authenticated with check (private.is_admin(array['owner', 'admin', 'editor']));
create policy "editors update media" on public.media for update to authenticated using (private.is_admin(array['owner', 'admin', 'editor'])) with check (private.is_admin(array['owner', 'admin', 'editor']));
create policy "editors delete media" on public.media for delete to authenticated using (private.is_admin(array['owner', 'admin', 'editor']));

drop policy if exists "editors manage site content" on public.site_content;
create policy "editors insert site content" on public.site_content for insert to authenticated with check (private.is_admin(array['owner', 'admin', 'editor']));
create policy "editors update site content" on public.site_content for update to authenticated using (private.is_admin(array['owner', 'admin', 'editor'])) with check (private.is_admin(array['owner', 'admin', 'editor']));
create policy "editors delete site content" on public.site_content for delete to authenticated using (private.is_admin(array['owner', 'admin', 'editor']));

drop policy if exists "managers manage settings" on public.settings;
drop policy if exists "editors manage website settings" on public.settings;
create policy "writers insert settings" on public.settings for insert to authenticated
with check (private.is_admin(array['owner', 'admin']) or (category = 'website' and private.is_admin(array['editor'])));
create policy "writers update settings" on public.settings for update to authenticated
using (private.is_admin(array['owner', 'admin']) or (category = 'website' and private.is_admin(array['editor'])))
with check (private.is_admin(array['owner', 'admin']) or (category = 'website' and private.is_admin(array['editor'])));
create policy "writers delete settings" on public.settings for delete to authenticated
using (private.is_admin(array['owner', 'admin']) or (category = 'website' and private.is_admin(array['editor'])));

create index if not exists activity_log_actor_id_idx on public.activity_log (actor_id);
create index if not exists admin_allowed_emails_invited_by_idx on public.admin_allowed_emails (invited_by);
create index if not exists media_created_by_idx on public.media (created_by);
create index if not exists order_items_product_id_idx on public.order_items (product_id);
create index if not exists order_items_variant_id_idx on public.order_items (variant_id);

