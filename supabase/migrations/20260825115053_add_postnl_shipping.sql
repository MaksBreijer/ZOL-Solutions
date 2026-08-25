-- Server-side PostNL label creation and private label storage.

alter table public.orders
  add column if not exists postnl jsonb not null default '{}'::jsonb;

alter table public.orders
  drop constraint if exists orders_postnl_object_check;
alter table public.orders
  add constraint orders_postnl_object_check check (jsonb_typeof(postnl) = 'object');

create index if not exists orders_postnl_barcode_idx
on public.orders ((postnl ->> 'barcode'))
where coalesce(postnl ->> 'barcode', '') <> '';

insert into public.settings (key, category, label, value, is_public)
values (
  'postnl_config',
  'shipping',
  'PostNL-koppeling',
  '{
    "enabled": false,
    "environment": "sandbox",
    "production_enabled": false,
    "customer_number": "",
    "customer_code": "",
    "collection_location": "",
    "non_eu_customer_code": "",
    "shipment_type": "parcel",
    "sender_company": "ZOL Solutions",
    "sender_street": "Burgemeester Hogguerstraat",
    "sender_house_number": "1111",
    "sender_house_number_addition": "",
    "sender_postal_code": "1064 EJ",
    "sender_city": "Amsterdam",
    "sender_country": "NL",
    "sender_email": "info@zolsolutions.nl",
    "sender_phone": "",
    "label_output": "pdf"
  }'::jsonb,
  false
)
on conflict (key) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('postnl-labels', 'postnl-labels', false, 5242880, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No storage policies are added for this private bucket. Labels contain customer
-- addresses and are exposed only through short-lived URLs signed by the admin function.
