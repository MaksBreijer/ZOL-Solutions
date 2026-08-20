update public.site_content
set value = case content_key
  when 'home.hero.eyebrow' then 'Sport-health innovatie uit Nederland'
  when 'home.hero.title' then 'Hielpijn hoeft sporten <em>niet in de weg te staan.</em>'
  when 'home.hero.intro' then 'ZOL is ontwikkeld voor sportende kinderen met hielpijn door de ziekte van Sever. Zachter landen, beter sporten.'
  when 'home.hero.cta' then 'Bekijk de oplossing'
  when 'home.problem.title' then 'Komt dit je <em>bekend voor?</em>'
  when 'home.problem.lead' then 'De ziekte van Sever is een veelvoorkomende oorzaak van hielpijn bij actieve kinderen in de groei. De groeischijf aan de achterkant van het hielbot kan gevoelig raken door herhaalde belasting.'
  when 'home.solution.title' then 'Ontwikkeld voor sportende voeten <em>in de groei.</em>'
  when 'home.technology.title' then 'Ondersteuning waar de beweging <em>begint.</em>'
  when 'home.process.title' then 'Van schoen naar sport in <em>drie stappen.</em>'
  when 'home.why.title' then 'Ontstaan vanuit ervaring. <em>Ontwikkeld met een doel.</em>'
  when 'home.reviews.title' then 'Voelbaar verschil, verteld door <em>ouders.</em>'
  when 'home.buy.title' then 'Een zachte basis voor iedere <em>training.</em>'
  else value
end
where content_key in (
  'home.hero.eyebrow',
  'home.hero.title',
  'home.hero.intro',
  'home.hero.cta',
  'home.problem.title',
  'home.problem.lead',
  'home.solution.title',
  'home.technology.title',
  'home.process.title',
  'home.why.title',
  'home.reviews.title',
  'home.buy.title'
);
