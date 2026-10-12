-- Persoonlijke opvolgmails na een bestelling (2 weken en 1 maand na bezorging).
alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check check (kind = any (array[
  'contact_notification', 'admin_customer', 'order_customer', 'order_admin', 'shipping_customer', 'order_received',
  'payment_confirmed', 'order_delayed', 'order_shipped', 'order_delivered', 'order_returned', 'order_cancelled',
  'refund_confirmed', 'new_order_admin', 'marketing_product_update', 'pilot_measurement', 'pain_checkin_invitation',
  'stock_back_in_stock', 'physio_campaign', 'physio_booking_admin', 'physio_booking_guest',
  'customer_followup_1', 'customer_followup_2'
]::text[]));
