update public.settings
set value = value || jsonb_build_object(
  'abandoned_checkout_minutes', coalesce(nullif(value ->> 'abandoned_checkout_minutes', '')::integer, 10)
)
where key = 'commerce';
