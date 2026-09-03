-- Send the existing order_received confirmation after creating either kind of
-- order, including unpaid/free manual orders. Do not use the paid event here.
-- pg_net dispatches after commit, so the RPC's order items and payment are ready.
-- Keep one INSERT trigger and the existing order-email deduplication mechanism.
create or replace trigger notify_created_order_emails
after insert on public.orders
for each row
when (new.order_type in ('customer', 'physio'))
execute function private.notify_created_order_emails();

-- Deliberately leave status/shipment notifications and existing orders alone.
