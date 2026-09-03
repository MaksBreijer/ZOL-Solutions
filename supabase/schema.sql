-- ZOL Solutions commerce and CMS schema
-- Applied to project hghlthmkpskxiuohrutw.

create extension if not exists pgcrypto;
create schema if not exists private;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.admin_allowed_emails (
  email text primary key check (email = lower(email)),
  role text not null default 'admin' check (role in ('owner', 'admin', 'editor', 'viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role text not null default 'admin' check (role in ('owner', 'admin', 'editor', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.is_admin(
  allowed_roles text[] default array['owner', 'admin', 'editor', 'viewer']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.admin_profiles
      where id = (select auth.uid())
        and active = true
        and role = any(allowed_roles)
    );
$$;

revoke all on function private.is_admin(text[]) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(text[]) to authenticated;

create or replace function private.handle_new_admin_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_profiles (id, email, full_name, role)
  select
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    allowed.role
  from public.admin_allowed_emails as allowed
  where allowed.email = lower(new.email)
  on conflict (id) do update
    set email = excluded.email,
        role = excluded.role,
        active = true,
        updated_at = now();
  return new;
end;
$$;

revoke all on function private.handle_new_admin_user() from public;

drop trigger if exists on_auth_user_created_zol_admin on auth.users;
create trigger on_auth_user_created_zol_admin
after insert or update of email on auth.users
for each row execute function private.handle_new_admin_user();

create trigger admin_profiles_updated_at
before update on public.admin_profiles
for each row execute function private.set_updated_at();

create or replace function private.protect_last_active_admin()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_removes_manager boolean;
  v_remaining_managers integer;
begin
  if tg_op = 'DELETE' then
    v_removes_manager := old.active and old.role in ('owner', 'admin');
  else
    v_removes_manager := old.active
      and old.role in ('owner', 'admin')
      and (not new.active or new.role not in ('owner', 'admin'));
  end if;
  if not v_removes_manager then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('zol:last-active-admin', 0));
  select count(*)::integer into v_remaining_managers
  from public.admin_profiles
  where id <> old.id and active = true and role in ('owner', 'admin');
  if v_remaining_managers < 1 then
    raise exception 'De laatste actieve beheerder kan niet worden verwijderd of gedeactiveerd.'
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.protect_last_active_admin() from public;
create trigger protect_last_active_admin
before delete or update of active, role on public.admin_profiles
for each row execute function private.protect_last_active_admin();

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
  check ((method = 'code' and code is not null and code = upper(code) and code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$') or (method = 'automatic' and code is null)),
  check ((discount_type = 'percentage' and value between 1 and 100) or (discount_type = 'fixed_amount' and value > 0) or (discount_type = 'free_shipping' and value = 0)),
  check (ends_at is null or ends_at > starts_at)
);

create unique index discounts_code_unique_idx on public.discounts (upper(code)) where code is not null;
create index discounts_active_dates_idx on public.discounts (active, starts_at, ends_at);
create index discounts_created_by_idx on public.discounts (created_by);
create trigger discounts_updated_at before update on public.discounts
for each row execute function private.set_updated_at();

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email))),
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  address jsonb not null default '{}'::jsonb,
  marketing_opt_in boolean not null default false,
  notes text not null default '',
  total_orders integer not null default 0 check (total_orders >= 0),
  total_spent_cents integer not null default 0 check (total_spent_cents >= 0),
  legacy_order_count integer not null default 0 check (legacy_order_count >= 0),
  legacy_spent_cents integer not null default 0 check (legacy_spent_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

create index customers_created_at_idx on public.customers (created_at desc);
create index customers_name_idx on public.customers (last_name, first_name);
create unique index customers_normalized_email_idx on public.customers (lower(btrim(email)));
create trigger customers_updated_at before update on public.customers
for each row execute function private.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  compare_at_price_cents integer check (compare_at_price_cents is null or compare_at_price_cents >= 0),
  tax_rate numeric(5,2) not null default 21.00 check (tax_rate >= 0),
  active boolean not null default true,
  featured boolean not null default false,
  images jsonb not null default '[]'::jsonb,
  video_url text not null default '',
  seo_title text not null default '',
  seo_description text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_active_idx on public.products (active, updated_at desc);
create trigger products_updated_at before update on public.products
for each row execute function private.set_updated_at();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  title text not null,
  sku text not null unique,
  size text not null,
  shoe_size text not null default '',
  stock integer not null default 0 check (stock >= 0),
  price_cents integer check (price_cents is null or price_cents >= 0),
  active boolean not null default true,
  external_variant_id text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_variants_product_idx on public.product_variants (product_id, sort_order);
create trigger product_variants_updated_at before update on public.product_variants
for each row execute function private.set_updated_at();

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity (start with 1001),
  customer_id uuid references public.customers(id) on delete set null,
  customer_email text not null,
  customer_name text not null default '',
  status text not null default 'open' check (status in ('draft', 'open', 'completed', 'cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'partially_refunded', 'refunded')),
  fulfillment_status text not null default 'unfulfilled' check (fulfillment_status in ('unfulfilled', 'processing', 'shipped', 'delivered', 'returned')),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  discount_id uuid references public.discounts(id) on delete set null,
  discount_code text,
  discount_cents integer not null default 0 check (discount_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  currency text not null default 'EUR',
  shipping_address jsonb not null default '{}'::jsonb,
  note text not null default '',
  tracking_code text not null default '',
  tracking_carrier text not null default '',
  tracking_url text not null default '',
  tracking_destination jsonb not null default '{"type":"customer"}'::jsonb check (
    jsonb_typeof(tracking_destination) = 'object'
    and tracking_destination ->> 'type' in ('customer', 'physio')
    and (
      tracking_destination ->> 'type' = 'customer'
      or (
        char_length(btrim(coalesce(tracking_destination ->> 'practice_name', ''))) between 1 and 140
        and char_length(btrim(coalesce(tracking_destination ->> 'street', ''))) between 1 and 160
        and char_length(btrim(coalesce(tracking_destination ->> 'postal_code', ''))) between 1 and 24
        and char_length(btrim(coalesce(tracking_destination ->> 'city', ''))) between 1 and 100
      )
    )
  ),
  invoice_url text not null default '',
  postnl jsonb not null default '{}'::jsonb check (jsonb_typeof(postnl) = 'object'),
  archived boolean not null default false,
  tags text[] not null default '{}'::text[],
  shipped_at timestamptz,
  delivered_at timestamptz,
  returned_at timestamptz,
  source text not null default 'webshop',
  external_reference text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_number)
);

create index orders_created_at_idx on public.orders (created_at desc);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_status_idx on public.orders (status, payment_status, fulfillment_status);
create index orders_discount_id_idx on public.orders (discount_id);
create index orders_archived_created_idx on public.orders (archived, created_at desc);
create index orders_postnl_barcode_idx on public.orders ((postnl ->> 'barcode'))
where coalesce(postnl ->> 'barcode', '') <> '';
create unique index orders_csv_external_reference_idx on public.orders (lower(btrim(external_reference)))
where source = 'csv-import' and external_reference is not null;
create trigger orders_updated_at before update on public.orders
for each row execute function private.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_name text not null default '',
  sku text not null default '',
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  created_at timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);

create table public.order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  author_email text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index order_notes_order_idx on public.order_notes (order_id, created_at desc);
create index order_notes_author_idx on public.order_notes (author_id);

create table public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references public.discounts(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  code text,
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

create index discount_redemptions_discount_idx on public.discount_redemptions (discount_id, created_at desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'mollie',
  provider_payment_id text,
  status text not null default 'open' check (status in ('open', 'pending', 'authorized', 'paid', 'failed', 'cancelled', 'expired', 'refunded', 'partially_refunded')),
  method text not null default '',
  amount_cents integer not null check (amount_cents >= 0),
  refunded_cents integer not null default 0 check (refunded_cents >= 0 and refunded_cents <= amount_cents),
  currency text not null default 'EUR',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_order_idx on public.payments (order_id, created_at desc);
create index payments_provider_idx on public.payments (provider, provider_payment_id);
create trigger payments_updated_at before update on public.payments
for each row execute function private.set_updated_at();

create table public.media (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null unique,
  public_url text not null,
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  alt_text text not null default '',
  kind text not null default 'image' check (kind in ('image', 'video', 'icon', 'document')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index media_created_at_idx on public.media (created_at desc);
create index media_kind_idx on public.media (kind, created_at desc);

create table public.site_content (
  id uuid primary key default gen_random_uuid(),
  page text not null default 'global',
  section text not null default 'general',
  content_key text not null unique,
  label text not null,
  content_type text not null default 'text' check (content_type in ('text', 'html', 'image', 'video', 'icon', 'button', 'color', 'link')),
  selector text not null default '',
  attribute text not null default 'textContent',
  value text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index site_content_page_idx on public.site_content (page, section, sort_order);
create trigger site_content_updated_at before update on public.site_content
for each row execute function private.set_updated_at();

create table public.settings (
  key text primary key,
  category text not null default 'general',
  label text not null,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

create index settings_category_idx on public.settings (category, key);
create trigger settings_updated_at before update on public.settings
for each row execute function private.set_updated_at();

create table public.activity_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text not null default '',
  action text not null,
  entity_type text not null,
  entity_id text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_created_at_idx on public.activity_log (created_at desc);

create table public.analytics_events (
  id bigint generated always as identity primary key,
  session_id text not null,
  event_name text not null check (event_name in ('page_view', 'product_view', 'add_to_cart', 'begin_checkout', 'payment_method_selected', 'checkout_error', 'contact_submit', 'cta_click', 'order_created')),
  page text not null default '',
  metadata jsonb not null default '{}'::jsonb check (octet_length(metadata::text) <= 4096),
  created_at timestamptz not null default now()
);

create index analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index analytics_events_session_idx on public.analytics_events (session_id, created_at desc);

-- Explicit Data API grants for projects created after the May 2026 exposure change.
grant select, insert, update, delete on public.admin_allowed_emails to authenticated;
grant select, insert, update, delete on public.admin_profiles to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.product_variants to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select, insert, delete on public.order_notes to authenticated;
grant select, insert, update, delete on public.discounts to authenticated;
grant select on public.discount_redemptions to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select, insert, update, delete on public.media to authenticated;
grant select, insert, update, delete on public.site_content to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
grant select, insert on public.activity_log to authenticated;
grant select on public.analytics_events to authenticated;
grant usage, select on all sequences in schema public to authenticated;

grant select on public.products, public.product_variants, public.site_content, public.settings, public.media to anon;
grant insert on public.analytics_events to anon, authenticated;
grant usage, select on sequence public.analytics_events_id_seq to anon;

alter table public.admin_allowed_emails enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_notes enable row level security;
alter table public.discounts enable row level security;
alter table public.discount_redemptions enable row level security;
alter table public.payments enable row level security;
alter table public.media enable row level security;
alter table public.site_content enable row level security;
alter table public.settings enable row level security;
alter table public.activity_log enable row level security;
alter table public.analytics_events enable row level security;

create policy "admins read allowed emails" on public.admin_allowed_emails
for select to authenticated using (private.is_admin());
create policy "owners add allowed emails" on public.admin_allowed_emails
for insert to authenticated with check (private.is_admin(array['owner']));
create policy "owners update allowed emails" on public.admin_allowed_emails
for update to authenticated using (private.is_admin(array['owner']))
with check (private.is_admin(array['owner']));
create policy "owners delete allowed emails" on public.admin_allowed_emails
for delete to authenticated using (private.is_admin(array['owner']));

create policy "admins read profiles" on public.admin_profiles
for select to authenticated using (id = (select auth.uid()) or private.is_admin());
create policy "owners manage profiles" on public.admin_profiles
for update to authenticated using (private.is_admin(array['owner']))
with check (private.is_admin(array['owner']));

create policy "admins manage customers" on public.customers
for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "public reads active products" on public.products
for select to anon using (active = true);
create policy "admins manage products" on public.products
for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "public reads active variants" on public.product_variants
for select to anon using (
  active = true and exists (
    select 1 from public.products where products.id = product_variants.product_id and products.active = true
  )
);
create policy "admins manage variants" on public.product_variants
for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "admins manage orders" on public.orders
for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage order items" on public.order_items
for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins read order notes" on public.order_notes
for select to authenticated using (private.is_admin());
create policy "admins create order notes" on public.order_notes
for insert to authenticated with check (private.is_admin() and author_id = (select auth.uid()));
create policy "owners and admins delete order notes" on public.order_notes
for delete to authenticated using (private.is_admin(array['owner', 'admin']));
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
create policy "admins manage payments" on public.payments
for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "public reads media metadata" on public.media
for select to anon using (true);
create policy "admins manage media" on public.media
for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "public reads active site content" on public.site_content
for select to anon using (active = true);
create policy "admins manage site content" on public.site_content
for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "public reads public settings" on public.settings
for select to anon using (is_public = true);
create policy "admins manage settings" on public.settings
for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "admins read activity" on public.activity_log
for select to authenticated using (private.is_admin());
create policy "admins create activity" on public.activity_log
for insert to authenticated with check (private.is_admin() and actor_id = (select auth.uid()));

create policy "public records analytics" on public.analytics_events
for insert to anon, authenticated with check (
  char_length(session_id) between 8 and 120
  and char_length(page) <= 300
);
create policy "admins read analytics" on public.analytics_events
for select to authenticated using (private.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.analytics_events;
exception
  when duplicate_object then null;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'zol-media',
  'zol-media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "public reads ZOL media" on storage.objects
for select to public using (bucket_id = 'zol-media');
create policy "admins upload ZOL media" on storage.objects
for insert to authenticated with check (bucket_id = 'zol-media' and private.is_admin());
create policy "admins update ZOL media" on storage.objects
for update to authenticated using (bucket_id = 'zol-media' and private.is_admin())
with check (bucket_id = 'zol-media' and private.is_admin());
create policy "admins delete ZOL media" on storage.objects
for delete to authenticated using (bucket_id = 'zol-media' and private.is_admin());

insert into public.admin_allowed_emails (email, role)
values ('maks@zolsolutions.nl', 'owner')
on conflict (email) do update set role = excluded.role;

insert into public.admin_profiles (id, email, full_name, role)
select users.id, lower(users.email), coalesce(users.raw_user_meta_data ->> 'full_name', 'Maks Breijer'), 'owner'
from auth.users as users
where lower(users.email) = 'maks@zolsolutions.nl'
on conflict (id) do update set role = 'owner', active = true;

insert into public.products (
  slug, name, description, price_cents, tax_rate, active, featured, images, video_url, seo_title, seo_description
)
values (
  'zol-inlegzolen',
  'De ZOL''tjes',
  'Dempende 3/4 inlegzolen voor sportende kinderen. Ontworpen voor comfort, ondersteuning en een stabiele basis tijdens het bewegen.',
  9995,
  21.00,
  true,
  true,
  '["/images/zol-familie.jpg", "/media/product-blue.jpg", "/media/product-detail.jpg"]'::jsonb,
  '',
  'De ZOL''tjes — ZOL Solutions',
  'Comfortabele 3/4 inlegzolen voor sportende kinderen.'
)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    price_cents = excluded.price_cents,
    images = excluded.images,
    updated_at = now();

insert into public.product_variants (product_id, title, sku, size, shoe_size, stock, active, external_variant_id, sort_order)
select product.id, variant.title, variant.sku, variant.size, variant.shoe_size, 20, true, variant.external_variant_id, variant.sort_order
from public.products as product
cross join (values
  ('XS — 34/35', 'ZOL-XS-3435', 'XS', '34/35', '53757641195857', 1),
  ('S — 36/37', 'ZOL-S-3637', 'S', '36/37', '53757641228625', 2),
  ('M — 38/39', 'ZOL-M-3839', 'M', '38/39', '53757641261393', 3),
  ('L — 40/41', 'ZOL-L-4041', 'L', '40/41', '53757641294161', 4),
  ('XL — 42/43', 'ZOL-XL-4243', 'XL', '42/43', '53757641326929', 5),
  ('XXL — 44/45', 'ZOL-XXL-4445', 'XXL', '44/45', null, 6)
) as variant(title, sku, size, shoe_size, external_variant_id, sort_order)
where product.slug = 'zol-inlegzolen'
on conflict (sku) do update
set title = excluded.title,
    size = excluded.size,
    shoe_size = excluded.shoe_size,
    external_variant_id = excluded.external_variant_id,
    sort_order = excluded.sort_order;

insert into public.settings (key, category, label, value, is_public) values
  ('company_profile', 'company', 'Bedrijfsgegevens', '{"name":"ZOL Solutions","email":"info@zolsolutions.nl","phone":"","kvk":"","vat_number":"","address":""}'::jsonb, false),
  ('commerce', 'checkout', 'Webshopinstellingen', '{"shipping_cents":0,"free_shipping_threshold_cents":0,"currency":"EUR","tax_rate":21,"mollie_enabled":false,"abandoned_checkout_minutes":10}'::jsonb, true),
  ('theme', 'website', 'Huisstijl', '{"primary":"#33669B","accent":"#F28C57","ink":"#10233B","background":"#F7F5F0"}'::jsonb, true),
  ('seo_defaults', 'website', 'Standaard SEO', '{"title":"ZOL Solutions","description":"Zachter landen. Beter sporten."}'::jsonb, true)
  ,('postnl_config', 'shipping', 'PostNL-koppeling', '{"enabled":false,"environment":"sandbox","production_enabled":false,"customer_number":"","customer_code":"","collection_location":"","non_eu_customer_code":"","barcode_series":"00000000-99999999","non_eu_barcode_series":"0000-9999","product_code":"3085","default_weight_grams":"500","shipment_type":"parcel","sender_company":"ZOL Solutions","sender_street":"Burgemeester Hogguerstraat","sender_house_number":"1111","sender_house_number_addition":"","sender_postal_code":"1064 EJ","sender_city":"Amsterdam","sender_country":"NL","sender_email":"info@zolsolutions.nl","sender_phone":"","label_output":"pdf"}'::jsonb, false)
on conflict (key) do nothing;

insert into public.discounts (title, code, method, discount_type, value, minimum_subtotal_cents, starts_at, active)
values ('20% korting op ZOL – Inlegzolen voor kinderen met hielpijn', 'KIDSCARE20', 'code', 'percentage', 20, 0, now(), true)
on conflict (upper(code)) where code is not null do update
set title = excluded.title, discount_type = excluded.discount_type, value = excluded.value, active = excluded.active, updated_at = now();

update public.discounts
set discount_type = 'percentage',
    value = 10,
    minimum_subtotal_cents = 19990,
    starts_at = coalesce(starts_at, now()),
    ends_at = null,
    active = true,
    updated_at = now()
where method = 'automatic'
  and title = '10% bundelkorting bij 2 paar';

insert into public.discounts (title, code, method, discount_type, value, minimum_subtotal_cents, starts_at, active)
select '10% bundelkorting bij 2 paar', null, 'automatic', 'percentage', 10, 19990, now(), true
where not exists (
  select 1
  from public.discounts
  where method = 'automatic'
    and title = '10% bundelkorting bij 2 paar'
);

insert into public.site_content (page, section, content_key, label, content_type, selector, attribute, value, sort_order) values
  ('global', 'navigation', 'global.nav.product', 'Navigatie: product', 'text', '.nav-links a[href="/product/"]', 'textContent', 'De ZOL''tjes', 10),
  ('global', 'navigation', 'global.nav.contact', 'Navigatie: contact', 'text', '.nav-links a[href="/contact/"]', 'textContent', 'Contact', 20),
  ('global', 'footer', 'global.footer.tagline', 'Footer slogan', 'text', '.site-footer > p', 'textContent', 'Zachter landen. Beter sporten.', 30),
  ('global', 'branding', 'global.brand.logo', 'ZOL-logo', 'image', '.brand img, .footer-brand img', 'src', '/media/zol-logo.png', 40),
  ('home', 'hero', 'home.hero.eyebrow', 'Hero bovenregel', 'text', '.hero .eyebrow', 'textContent', 'Ontwikkeld voor jonge sporters', 10),
  ('home', 'hero', 'home.hero.title', 'Hero titel', 'html', '#hero-title', 'innerHTML', 'Zachter landen. <em>Beter sporten.</em>', 20),
  ('home', 'hero', 'home.hero.intro', 'Hero introductie', 'text', '.hero-intro', 'textContent', 'Een dempende en stabiele basis voor kinderen die willen blijven bewegen — ook wanneer groeiende hielen gevoelig zijn.', 30),
  ('home', 'hero', 'home.hero.cta', 'Hero knop', 'text', '.hero-actions .button--primary', 'textContent', 'Bekijk de ZOL''tjes — €99,95', 40),
  ('home', 'partners', 'home.partner.tulp', 'Logo Tulp Hoofdklasse', 'image', '.partner-track a:nth-child(1) img', 'src', '/media/partner-tulp.png', 10),
  ('home', 'partners', 'home.partner.kidscare', 'Logo B&B Kids Care', 'image', '.partner-track a:nth-child(2) img', 'src', '/media/partner-kidscare.png', 20),
  ('home', 'partners', 'home.partner.bpcollege', 'Logo BP College', 'image', '.partner-track a:nth-child(3) img', 'src', '/media/partner-bpcollege.png', 30),
  ('home', 'partners', 'home.partner.bootfitter', 'Logo Dutch Bootfitter', 'image', '.partner-track a:nth-child(4) img', 'src', '/media/partner-bootfitter.png', 40),
  ('home', 'process', 'home.process.icon.place', 'Icoon plaatsen', 'icon', '.step-symbol--place', 'textContent', 'builtin:place', 20),
  ('home', 'process', 'home.process.icon.fit', 'Icoon controleren', 'icon', '.step-symbol--fit', 'textContent', 'builtin:fit', 21),
  ('home', 'process', 'home.process.icon.move', 'Icoon bewegen', 'icon', '.step-symbol--move', 'textContent', 'builtin:move', 22),
  ('product', 'purchase', 'product.purchase.icon.ready', 'Icoon direct klaar voor gebruik', 'icon', '.benefit-icon--ready', 'textContent', '✓', 21),
  ('product', 'purchase', 'product.purchase.icon.compact', 'Icoon compacte pasvorm', 'icon', '.benefit-icon--compact', 'textContent', '✓', 22),
  ('product', 'purchase', 'product.purchase.icon.made', 'Icoon handgemaakt in Nederland', 'icon', '.benefit-icon--made', 'textContent', '✓', 23),
  ('home', 'why', 'home.why.image', 'Waarom ZOL afbeelding', 'image', '.why-image img', 'src', '/media/product-detail.jpg', 20),
  ('home', 'buy', 'home.buy.image', 'Product CTA afbeelding', 'image', '.buy-image img', 'src', '/media/product-use.jpg', 20),
  ('product', 'purchase', 'product.title', 'Producttitel', 'html', '.product-purchase h1', 'innerHTML', 'ZOL 3/4 <em>inlegzolen.</em>', 10),
  ('product', 'purchase', 'product.summary', 'Productintroductie', 'text', '.product-summary', 'textContent', 'Dempende inlegzolen voor sportende kinderen met gevoelige hielen. Ontworpen voor extra comfort en stabiele ondersteuning tijdens rennen, springen en draaien.', 20),
  ('contact', 'hero', 'contact.title', 'Contacttitel', 'html', '.contact-hero h1', 'innerHTML', 'Laten we in <em>gesprek gaan.</em>', 10)
on conflict (content_key) do nothing;
