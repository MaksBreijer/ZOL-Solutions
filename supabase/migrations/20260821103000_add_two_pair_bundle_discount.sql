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

insert into public.discounts (
  title,
  code,
  method,
  discount_type,
  value,
  minimum_subtotal_cents,
  starts_at,
  active
)
select
  '10% bundelkorting bij 2 paar',
  null,
  'automatic',
  'percentage',
  10,
  19990,
  now(),
  true
where not exists (
  select 1
  from public.discounts
  where method = 'automatic'
    and title = '10% bundelkorting bij 2 paar'
);
