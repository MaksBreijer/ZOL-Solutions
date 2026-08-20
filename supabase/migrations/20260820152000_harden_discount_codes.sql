alter table public.discounts drop constraint discounts_code_method_check;
alter table public.discounts add constraint discounts_code_method_check check (
  (method = 'code' and code is not null and code = upper(code) and code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$')
  or (method = 'automatic' and code is null)
);
