update public.settings
set value = value || jsonb_build_object(
  'barcode_series', coalesce(nullif(value ->> 'barcode_series', ''), '00000000-99999999'),
  'non_eu_barcode_series', coalesce(nullif(value ->> 'non_eu_barcode_series', ''), '0000-9999'),
  'product_code', coalesce(nullif(value ->> 'product_code', ''), '3085'),
  'default_weight_grams', coalesce(nullif(value ->> 'default_weight_grams', ''), '500')
)
where key = 'postnl_config';
