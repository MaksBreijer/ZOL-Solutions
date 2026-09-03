-- Physio orders receive shipment notifications, including free samples/replacements.
-- Other physio lifecycle emails stay unchanged. Customer lifecycle emails stay
-- enabled, and every tracking number keeps its existing deduplication key.
create or replace function private.notify_order_status_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_type = 'customer' then
    if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
      perform private.enqueue_order_email(new.id, 'paid');
    elsif new.payment_status in ('partially_refunded', 'refunded') and old.payment_status is distinct from new.payment_status then
      perform private.enqueue_order_email(new.id, 'refunded');
    end if;

    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      perform private.enqueue_order_email(new.id, 'cancelled');
    end if;
  end if;

  if new.fulfillment_status = 'shipped'
    and btrim(coalesce(new.tracking_code, '')) <> ''
    and (old.fulfillment_status is distinct from 'shipped' or old.tracking_code is distinct from new.tracking_code)
    and not (
      coalesce(new.postnl->>'environment', '') = 'sandbox'
      and coalesce(new.postnl->>'barcode', '') = new.tracking_code
    ) then
    perform private.enqueue_order_email(new.id, 'shipping');
  elsif new.order_type = 'customer' then
    if new.fulfillment_status = 'delivered' and old.fulfillment_status is distinct from 'delivered' then
      perform private.enqueue_order_email(new.id, 'delivered');
    elsif new.fulfillment_status = 'returned' and old.fulfillment_status is distinct from 'returned' then
      perform private.enqueue_order_email(new.id, 'returned');
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.notify_order_status_emails() from public;

create or replace trigger notify_order_status_emails
after update on public.orders
for each row
when (new.order_type in ('customer', 'physio'))
execute function private.notify_order_status_emails();
