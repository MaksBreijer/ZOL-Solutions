-- Keep the custom storefront aligned with the five sizes sold by ZOL.
update public.product_variants
set active = false
where size = 'XXL' and shoe_size = '44/45';
