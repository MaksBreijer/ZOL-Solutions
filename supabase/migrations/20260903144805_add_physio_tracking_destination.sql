-- Store the actual recipient of a manually registered shipment. Existing
-- shipments continue to point to the customer by default.

alter table public.orders
  add column if not exists tracking_destination jsonb not null default '{"type":"customer"}'::jsonb;

alter table public.orders
  drop constraint if exists orders_tracking_destination_check;

alter table public.orders
  add constraint orders_tracking_destination_check check (
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
  );

comment on column public.orders.tracking_destination is
  'Recipient for the current tracking record: customer or a manually entered physiotherapy practice.';
