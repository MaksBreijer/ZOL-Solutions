update public.site_content
set value = 'Bekijk de ZOL''tjes — €99,95',
    updated_at = now()
where content_key = 'home.hero.cta';
