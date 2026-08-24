update public.settings
set value = jsonb_build_object(
  'title', 'ZOL Solutions — Inlegzolen voor sportende kinderen',
  'description', 'Dempende en stabiele 3/4 inlegzolen voor sportende kinderen met gevoelige hielen. Ontwikkeld met voetspecialisten en handgemaakt in Nederland.'
)
where key = 'seo_defaults';
