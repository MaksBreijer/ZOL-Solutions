-- Keep the storefront independent from the legacy Shopify domain before DNS cutover.
update public.site_content
set value = case content_key
  when 'global.brand.logo' then '/media/zol-logo.png'
  when 'home.hero.video' then '/media/zol-hero.mp4'
  when 'home.story.image' then '/media/story-team.jpg'
  when 'home.press.ad.image' then '/media/press-ad.png'
  when 'home.press.hockey.image' then '/media/press-hockey.png'
  when 'home.partner.tulp' then '/media/partner-tulp.png'
  when 'home.partner.kidscare' then '/media/partner-kidscare.png'
  when 'home.partner.bpcollege' then '/media/partner-bpcollege.png'
  when 'home.partner.bootfitter' then '/media/partner-bootfitter.png'
  when 'home.problem.image' then '/media/heel-anatomy.png'
  when 'home.solution.image' then '/media/product-blue.jpg'
  when 'home.why.image' then '/media/product-detail.jpg'
  when 'home.emotion.image' then '/media/sport-kids.jpg'
  when 'home.buy.image' then '/media/product-use.jpg'
  when 'product.image.second' then '/media/product-blue.jpg'
  when 'product.image.third' then '/media/product-detail.jpg'
  when 'product.usage.image' then '/media/product-use.jpg'
  when 'contact.team.image' then '/media/contact-team.jpg'
  else value
end
where content_key in (
  'global.brand.logo', 'home.hero.video', 'home.story.image',
  'home.press.ad.image', 'home.press.hockey.image', 'home.partner.tulp',
  'home.partner.kidscare', 'home.partner.bpcollege', 'home.partner.bootfitter',
  'home.problem.image', 'home.solution.image', 'home.why.image',
  'home.emotion.image', 'home.buy.image', 'product.image.second',
  'product.image.third', 'product.usage.image', 'contact.team.image'
);

update public.products
set images = '["/images/zol-familie.jpg", "/media/product-blue.jpg", "/media/product-detail.jpg"]'::jsonb
where slug = 'zol-inlegzolen';
