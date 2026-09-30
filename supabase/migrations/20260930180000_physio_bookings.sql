create table if not exists public.physio_bookings (
  id uuid primary key default gen_random_uuid(),
  practice_name text not null,
  contact_name text not null,
  email text not null,
  phone text not null,
  message text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  google_event_id text,
  admin_notified_at timestamptz,
  guest_notified_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists physio_bookings_active_slot_idx
  on public.physio_bookings (start_at) where status in ('pending', 'confirmed');
create index if not exists physio_bookings_upcoming_idx
  on public.physio_bookings (start_at) where status = 'confirmed';

alter table public.physio_bookings enable row level security;
revoke all on public.physio_bookings from anon, authenticated;
grant all on public.physio_bookings to service_role;

alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check check (kind in (
  'contact_notification', 'admin_customer', 'order_customer', 'order_admin',
  'shipping_customer', 'order_received', 'payment_confirmed', 'order_delayed',
  'order_shipped', 'order_delivered', 'order_returned', 'order_cancelled',
  'refund_confirmed', 'new_order_admin', 'marketing_product_update',
  'pilot_measurement', 'pain_checkin_invitation', 'stock_back_in_stock',
  'physio_campaign', 'physio_booking_admin', 'physio_booking_guest'
));

insert into public.settings (key, category, label, value, is_public)
values ('physio_booking', 'calendar', 'Fysiogesprekken', '{"enabled":true,"start_hour":9,"end_hour":17,"slot_interval_minutes":20}'::jsonb, false)
on conflict (key) do nothing;
