insert into public.discounts (
  title, code, method, discount_type, value, minimum_subtotal_cents, starts_at, active
)
values (
  '20% korting op ZOL – Inlegzolen voor kinderen met hielpijn',
  'KIDSCARE20',
  'code',
  'percentage',
  20,
  0,
  now(),
  true
)
on conflict (upper(code)) where code is not null do update
set title = excluded.title,
    discount_type = excluded.discount_type,
    value = excluded.value,
    active = excluded.active,
    updated_at = now();
