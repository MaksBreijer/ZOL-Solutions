update public.site_content
set value = case content_key
  when 'home.press.ad.image' then 'https://zolsolutions.nl/cdn/shop/files/DSC06583_09e69a5c-769e-434c-8451-c11116385894.jpg?v=1775822921&width=1400'
  when 'home.press.hockey.image' then 'https://zolsolutions.nl/cdn/shop/files/DSC06659.jpg?v=1780586175&width=1800'
  when 'home.emotion.image' then 'https://zolsolutions.nl/cdn/shop/files/Ontwerp_zonder_titel_2.jpg?v=1776766536&width=1800'
  else value
end
where content_key in (
  'home.press.ad.image',
  'home.press.hockey.image',
  'home.emotion.image'
);
