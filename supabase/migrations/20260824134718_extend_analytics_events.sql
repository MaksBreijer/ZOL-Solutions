alter table public.analytics_events
drop constraint if exists analytics_events_event_name_check;

alter table public.analytics_events
add constraint analytics_events_event_name_check
check (event_name in (
  'page_view',
  'product_view',
  'add_to_cart',
  'begin_checkout',
  'payment_method_selected',
  'checkout_error',
  'contact_submit',
  'cta_click',
  'order_created'
));

alter table public.analytics_events
add constraint analytics_events_metadata_size_check
check (octet_length(metadata::text) <= 4096);
