-- Make public.customers the single source of truth for ZOL customer records.
-- Existing orders and contact requests are backfilled into the ZOL customer database.

alter table public.customers
  add column if not exists legacy_order_count integer not null default 0 check (legacy_order_count >= 0),
  add column if not exists legacy_spent_cents integer not null default 0 check (legacy_spent_cents >= 0);

create temporary table zol_customer_merge_map on commit drop as
select id as duplicate_id, keeper_id
from (
  select
    id,
    first_value(id) over (
      partition by lower(btrim(email))
      order by created_at, id
    ) as keeper_id
  from public.customers
  where btrim(email) <> ''
) ranked
where id <> keeper_id;

update public.customers as keeper
set
  first_name = coalesce(
    nullif(keeper.first_name, ''),
    (select max(nullif(duplicate.first_name, '')) from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id where map.keeper_id = keeper.id),
    ''
  ),
  last_name = coalesce(
    nullif(keeper.last_name, ''),
    (select max(nullif(duplicate.last_name, '')) from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id where map.keeper_id = keeper.id),
    ''
  ),
  phone = coalesce(
    nullif(keeper.phone, ''),
    (select max(nullif(duplicate.phone, '')) from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id where map.keeper_id = keeper.id),
    ''
  ),
  address = case
    when keeper.address <> '{}'::jsonb then keeper.address
    else coalesce(
      (select duplicate.address from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id where map.keeper_id = keeper.id and duplicate.address <> '{}'::jsonb order by duplicate.updated_at desc limit 1),
      '{}'::jsonb
    )
  end,
  notes = case
    when keeper.notes <> '' then keeper.notes
    else coalesce(
      (select max(nullif(duplicate.notes, '')) from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id where map.keeper_id = keeper.id),
      ''
    )
  end,
  total_orders = keeper.total_orders + coalesce(
    (select sum(duplicate.total_orders) from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id where map.keeper_id = keeper.id),
    0
  ),
  total_spent_cents = keeper.total_spent_cents + coalesce(
    (select sum(duplicate.total_spent_cents) from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id where map.keeper_id = keeper.id),
    0
  ),
  legacy_order_count = keeper.legacy_order_count + coalesce(
    (select sum(duplicate.legacy_order_count) from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id where map.keeper_id = keeper.id),
    0
  ),
  legacy_spent_cents = keeper.legacy_spent_cents + coalesce(
    (select sum(duplicate.legacy_spent_cents) from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id where map.keeper_id = keeper.id),
    0
  ),
  marketing_opt_in = keeper.marketing_opt_in or exists (
    select 1 from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id
    where map.keeper_id = keeper.id and duplicate.marketing_opt_in
  ),
  marketing_opt_in_at = coalesce(
    keeper.marketing_opt_in_at,
    (select min(duplicate.marketing_opt_in_at) from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id where map.keeper_id = keeper.id)
  ),
  marketing_opt_in_source = coalesce(
    nullif(keeper.marketing_opt_in_source, ''),
    (select max(nullif(duplicate.marketing_opt_in_source, '')) from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id where map.keeper_id = keeper.id),
    ''
  ),
  marketing_last_sent_at = coalesce(
    keeper.marketing_last_sent_at,
    (select max(duplicate.marketing_last_sent_at) from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id where map.keeper_id = keeper.id)
  ),
  marketing_next_send_at = coalesce(
    keeper.marketing_next_send_at,
    (select min(duplicate.marketing_next_send_at) from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id where map.keeper_id = keeper.id)
  ),
  marketing_unsubscribed_at = case
    when keeper.marketing_opt_in or exists (
      select 1 from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id
      where map.keeper_id = keeper.id and duplicate.marketing_opt_in
    ) then null
    else coalesce(
      keeper.marketing_unsubscribed_at,
      (select max(duplicate.marketing_unsubscribed_at) from public.customers duplicate join zol_customer_merge_map map on map.duplicate_id = duplicate.id where map.keeper_id = keeper.id)
    )
  end,
  updated_at = now()
where exists (select 1 from zol_customer_merge_map map where map.keeper_id = keeper.id);

update public.orders as orders
set customer_id = map.keeper_id
from zol_customer_merge_map map
where orders.customer_id = map.duplicate_id;

update public.contact_messages as messages
set customer_id = map.keeper_id
from zol_customer_merge_map map
where messages.customer_id = map.duplicate_id;

update public.email_messages as messages
set customer_id = map.keeper_id
from zol_customer_merge_map map
where messages.customer_id = map.duplicate_id;

delete from public.customers as duplicate
using zol_customer_merge_map map
where duplicate.id = map.duplicate_id;

update public.customers
set email = lower(btrim(email))
where email <> lower(btrim(email));

update public.orders
set customer_email = lower(btrim(customer_email))
where customer_email <> lower(btrim(customer_email));

create unique index if not exists customers_normalized_email_idx
on public.customers (lower(btrim(email)));

alter table public.customers drop constraint if exists customers_email_normalized_check;
alter table public.customers add constraint customers_email_normalized_check
check (email = lower(btrim(email)));

with latest_order as (
  select * from (
    select
      lower(btrim(customer_email)) as email,
      btrim(customer_name) as customer_name,
      shipping_address,
      created_at,
      row_number() over (partition by lower(btrim(customer_email)) order by created_at desc, id desc) as row_number
    from public.orders
    where btrim(customer_email) <> ''
  ) ranked
  where row_number = 1
)
insert into public.customers (email, first_name, last_name, address, created_at)
select
  latest_order.email,
  case
    when position(' ' in latest_order.customer_name) > 0 then split_part(latest_order.customer_name, ' ', 1)
    else latest_order.customer_name
  end,
  case
    when position(' ' in latest_order.customer_name) > 0 then regexp_replace(latest_order.customer_name, E'^\\S+\\s*', '')
    else ''
  end,
  coalesce(latest_order.shipping_address, '{}'::jsonb),
  latest_order.created_at
from latest_order
on conflict ((lower(btrim(email)))) do nothing;

with latest_contact as (
  select * from (
    select
      lower(btrim(email)) as email,
      btrim(name) as customer_name,
      phone,
      created_at,
      row_number() over (partition by lower(btrim(email)) order by created_at desc, id desc) as row_number
    from public.contact_messages
    where btrim(email) <> ''
  ) ranked
  where row_number = 1
)
insert into public.customers (email, first_name, last_name, phone, created_at)
select
  latest_contact.email,
  case
    when position(' ' in latest_contact.customer_name) > 0 then split_part(latest_contact.customer_name, ' ', 1)
    else latest_contact.customer_name
  end,
  case
    when position(' ' in latest_contact.customer_name) > 0 then regexp_replace(latest_contact.customer_name, E'^\\S+\\s*', '')
    else ''
  end,
  coalesce(latest_contact.phone, ''),
  latest_contact.created_at
from latest_contact
on conflict ((lower(btrim(email)))) do nothing;

update public.orders as orders
set
  customer_id = customers.id,
  customer_email = customers.email
from public.customers as customers
where lower(btrim(orders.customer_email)) = lower(btrim(customers.email))
  and (orders.customer_id is distinct from customers.id or orders.customer_email is distinct from customers.email);

update public.contact_messages as messages
set customer_id = customers.id
from public.customers as customers
where lower(btrim(messages.email)) = lower(btrim(customers.email))
  and messages.customer_id is distinct from customers.id;

update public.email_messages as messages
set customer_id = customers.id
from public.customers as customers
where lower(btrim(messages.recipient_email)) = lower(btrim(customers.email))
  and messages.customer_id is distinct from customers.id
  and messages.kind not in ('order_admin', 'new_order_admin', 'contact_notification');

with zol_customer_totals as (
  select
    customers.id,
    count(distinct orders.id)::integer as zol_order_count,
    coalesce(sum(
      case
        when payments.status in ('paid', 'partially_refunded', 'refunded')
          then greatest(0, payments.amount_cents - payments.refunded_cents)
        else 0
      end
    ), 0)::integer as zol_spent_cents
  from public.customers as customers
  left join public.orders as orders on orders.customer_id = customers.id
  left join public.payments as payments on payments.order_id = orders.id
  group by customers.id
)
update public.customers as customers
set
  legacy_order_count = greatest(customers.legacy_order_count, customers.total_orders - zol_customer_totals.zol_order_count),
  legacy_spent_cents = greatest(customers.legacy_spent_cents, customers.total_spent_cents - zol_customer_totals.zol_spent_cents),
  total_orders = greatest(customers.legacy_order_count, customers.total_orders - zol_customer_totals.zol_order_count) + zol_customer_totals.zol_order_count,
  total_spent_cents = greatest(customers.legacy_spent_cents, customers.total_spent_cents - zol_customer_totals.zol_spent_cents) + zol_customer_totals.zol_spent_cents,
  updated_at = now()
from zol_customer_totals
where customers.id = zol_customer_totals.id
  and (
    customers.legacy_order_count is distinct from greatest(customers.legacy_order_count, customers.total_orders - zol_customer_totals.zol_order_count)
    or customers.legacy_spent_cents is distinct from greatest(customers.legacy_spent_cents, customers.total_spent_cents - zol_customer_totals.zol_spent_cents)
    or customers.total_orders is distinct from greatest(customers.legacy_order_count, customers.total_orders - zol_customer_totals.zol_order_count) + zol_customer_totals.zol_order_count
    or customers.total_spent_cents is distinct from greatest(customers.legacy_spent_cents, customers.total_spent_cents - zol_customer_totals.zol_spent_cents) + zol_customer_totals.zol_spent_cents
  );

grant select, insert, update, delete on public.customers to authenticated, service_role;
alter table public.customers enable row level security;
