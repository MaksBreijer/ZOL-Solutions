update public.site_content
set value = case content_key
  when 'home.press.ad.image' then 'https://zolsolutions.nl/cdn/shop/files/Met_de_zooltjes_van_ZOL_Solutions_kunnen_de_kinderen_wel_blijven_sporten._Bron_Algemeen_Dagblad_2.png?v=1779284818&width=1200'
  when 'home.press.hockey.image' then 'https://zolsolutions.nl/cdn/shop/files/Met_de_zooltjes_van_ZOL_Solutions_kunnen_de_kinderen_wel_blijven_sporten._Bron_Algemeen_Dagblad_4.png?v=1783497654&width=1200'
  else value
end
where content_key in ('home.press.ad.image', 'home.press.hockey.image');
