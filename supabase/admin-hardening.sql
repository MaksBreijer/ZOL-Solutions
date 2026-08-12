-- Role separation and expanded editable website content.

drop policy if exists "admins manage customers" on public.customers;
create policy "admins read customers" on public.customers for select to authenticated using (private.is_admin());
create policy "managers manage customers" on public.customers for all to authenticated
using (private.is_admin(array['owner', 'admin'])) with check (private.is_admin(array['owner', 'admin']));

drop policy if exists "admins manage products" on public.products;
create policy "admins read products" on public.products for select to authenticated using (private.is_admin());
create policy "editors manage products" on public.products for all to authenticated
using (private.is_admin(array['owner', 'admin', 'editor'])) with check (private.is_admin(array['owner', 'admin', 'editor']));

drop policy if exists "admins manage variants" on public.product_variants;
create policy "admins read variants" on public.product_variants for select to authenticated using (private.is_admin());
create policy "editors manage variants" on public.product_variants for all to authenticated
using (private.is_admin(array['owner', 'admin', 'editor'])) with check (private.is_admin(array['owner', 'admin', 'editor']));

drop policy if exists "admins manage orders" on public.orders;
create policy "admins read orders" on public.orders for select to authenticated using (private.is_admin());
create policy "managers manage orders" on public.orders for all to authenticated
using (private.is_admin(array['owner', 'admin'])) with check (private.is_admin(array['owner', 'admin']));

drop policy if exists "admins manage order items" on public.order_items;
create policy "admins read order items" on public.order_items for select to authenticated using (private.is_admin());
create policy "managers manage order items" on public.order_items for all to authenticated
using (private.is_admin(array['owner', 'admin'])) with check (private.is_admin(array['owner', 'admin']));

drop policy if exists "admins manage payments" on public.payments;
create policy "admins read payments" on public.payments for select to authenticated using (private.is_admin());
create policy "managers manage payments" on public.payments for all to authenticated
using (private.is_admin(array['owner', 'admin'])) with check (private.is_admin(array['owner', 'admin']));

drop policy if exists "admins manage media" on public.media;
create policy "admins read media" on public.media for select to authenticated using (private.is_admin());
create policy "editors manage media" on public.media for all to authenticated
using (private.is_admin(array['owner', 'admin', 'editor'])) with check (private.is_admin(array['owner', 'admin', 'editor']));

drop policy if exists "admins manage site content" on public.site_content;
create policy "admins read site content" on public.site_content for select to authenticated using (private.is_admin());
create policy "editors manage site content" on public.site_content for all to authenticated
using (private.is_admin(array['owner', 'admin', 'editor'])) with check (private.is_admin(array['owner', 'admin', 'editor']));

drop policy if exists "admins manage settings" on public.settings;
create policy "admins read settings" on public.settings for select to authenticated using (private.is_admin());
create policy "managers manage settings" on public.settings for all to authenticated
using (private.is_admin(array['owner', 'admin'])) with check (private.is_admin(array['owner', 'admin']));
create policy "editors manage website settings" on public.settings for all to authenticated
using (category = 'website' and private.is_admin(array['editor']))
with check (category = 'website' and private.is_admin(array['editor']));

drop policy if exists "admins create activity" on public.activity_log;
create policy "editors create activity" on public.activity_log for insert to authenticated
with check (private.is_admin(array['owner', 'admin', 'editor']) and actor_id = (select auth.uid()));

drop policy if exists "admins upload ZOL media" on storage.objects;
drop policy if exists "admins update ZOL media" on storage.objects;
drop policy if exists "admins delete ZOL media" on storage.objects;
create policy "editors upload ZOL media" on storage.objects for insert to authenticated
with check (bucket_id = 'zol-media' and private.is_admin(array['owner', 'admin', 'editor']));
create policy "editors update ZOL media" on storage.objects for update to authenticated
using (bucket_id = 'zol-media' and private.is_admin(array['owner', 'admin', 'editor']))
with check (bucket_id = 'zol-media' and private.is_admin(array['owner', 'admin', 'editor']));
create policy "editors delete ZOL media" on storage.objects for delete to authenticated
using (bucket_id = 'zol-media' and private.is_admin(array['owner', 'admin', 'editor']));

update public.site_content set selector = '.hero .eyebrow', value = 'Ontwikkeld voor jonge sporters' where content_key = 'home.hero.eyebrow';
update public.site_content set value = 'Zachter landen. <em>Beter sporten.</em>' where content_key = 'home.hero.title';
update public.site_content set value = 'Een dempende en stabiele basis voor kinderen die willen blijven bewegen — ook wanneer groeiende hielen gevoelig zijn.' where content_key = 'home.hero.intro';
update public.site_content set value = 'Laten we in <em>gesprek gaan.</em>' where content_key = 'contact.title';

insert into public.site_content (page, section, content_key, label, content_type, selector, attribute, value, sort_order) values
  ('global', 'announcement', 'global.announcement', 'Bovenbalk', 'html', '.announcement a', 'innerHTML', 'Hielpijn tijdens of na het sporten? <span>Ontdek hoe het ontstaat →</span>', 1),
  ('global', 'navigation', 'global.nav.cta', 'Navigatieknop', 'text', '.nav-cta', 'textContent', 'Bekijk de ZOL''tjes', 30),
  ('home', 'hero', 'home.hero.video', 'Hero video', 'video', '.hero-media video source', 'src', 'https://zolsolutions.nl/cdn/shop/videos/c/vp/9b2f8028627e418eafc58c7fa17e396c/9b2f8028627e418eafc58c7fa17e396c.HD-1080p-4.8Mbps-83950345.mp4?v=0', 50),
  ('home', 'problem', 'home.problem.title', 'Probleem titel', 'html', '#problem-title', 'innerHTML', 'Groeien vraagt veel van een <em>jonge hiel.</em>', 10),
  ('home', 'problem', 'home.problem.lead', 'Probleem introductie', 'text', '.problem-copy .lead', 'textContent', 'Morbus Sever is een veelvoorkomende oorzaak van hielpijn bij actieve kinderen in de groei. De groeizone aan de achterkant van het hielbot kan gevoelig raken door herhaalde belasting en trekkracht van de achillespees.', 20),
  ('home', 'problem', 'home.problem.image', 'Anatomische afbeelding', 'image', '.anatomy-image img', 'src', 'https://zolsolutions.nl/cdn/shop/files/ziekte_van_sever_hielpijn.png?v=1775822547&width=1200', 30),
  ('home', 'solution', 'home.solution.title', 'Oplossing titel', 'html', '#solution-title', 'innerHTML', 'Compact in de schoen. <em>Groot in comfort.</em>', 10),
  ('home', 'solution', 'home.solution.image', 'Productafbeelding', 'image', '.product-blueprint .product-photo img', 'src', 'https://zolsolutions.nl/cdn/shop/files/DSC06856_2_78da3c94-741e-441f-85d0-dac25e743e66.jpg?v=1780586207&width=1600', 20),
  ('home', 'technology', 'home.technology.title', 'Techniek titel', 'html', '#technology-title', 'innerHTML', 'Drie functies. <em>Eén rustige basis.</em>', 10),
  ('home', 'process', 'home.process.title', 'Werking titel', 'html', '#process-title', 'innerHTML', 'Van schoen naar <em>sportmoment.</em>', 10),
  ('home', 'why', 'home.why.title', 'Waarom ZOL titel', 'html', '#why-title', 'innerHTML', 'Ontworpen voor het echte <em>sportleven.</em>', 10),
  ('home', 'emotion', 'home.emotion.image', 'Sportfoto', 'image', '.emotion img', 'src', 'https://zolsolutions.nl/cdn/shop/files/DSC06720.jpg?v=1775822898&width=2000', 10),
  ('home', 'reviews', 'home.reviews.title', 'Reviews titel', 'html', '#reviews-title', 'innerHTML', 'Wat ouders en jonge sporters <em>merken.</em>', 10),
  ('home', 'buy', 'home.buy.title', 'Product CTA titel', 'html', '#buy-title', 'innerHTML', 'Klaar voor de volgende <em>training?</em>', 10),
  ('product', 'gallery', 'product.image.main', 'Hoofdafbeelding product', 'image', '.product-gallery-main > img', 'src', '/images/zol-familie.jpg', 10),
  ('product', 'gallery', 'product.image.second', 'Productafbeelding 2', 'image', '.product-gallery-secondary img:first-child', 'src', 'https://zolsolutions.nl/cdn/shop/files/DSC06856_2_78da3c94-741e-441f-85d0-dac25e743e66.jpg?v=1780586207&width=1200', 20),
  ('product', 'gallery', 'product.image.third', 'Productafbeelding 3', 'image', '.product-gallery-secondary img:last-child', 'src', 'https://zolsolutions.nl/cdn/shop/files/DSC06631.jpg?v=1780586255&width=1200', 30),
  ('product', 'story', 'product.story.title', 'Productverhaal titel', 'html', '#product-story-title', 'innerHTML', 'Ondersteuning zonder een volle schoen te <em>voelen.</em>', 10),
  ('product', 'usage', 'product.usage.title', 'Gebruik titel', 'html', '.product-in-use-copy h2', 'innerHTML', 'Van verpakking naar <em>training.</em>', 10),
  ('product', 'usage', 'product.usage.image', 'Gebruiksafbeelding', 'image', '.product-in-use-image img', 'src', 'https://zolsolutions.nl/cdn/shop/files/DSC06659.jpg?v=1780586175&width=1800', 20),
  ('product', 'sizing', 'product.sizing.title', 'Maatadvies titel', 'html', '#size-title', 'innerHTML', 'De juiste basis begint bij de <em>juiste maat.</em>', 10),
  ('product', 'questions', 'product.questions.title', 'Veelgestelde vragen titel', 'html', '#questions-title', 'innerHTML', 'Veelgestelde <em>vragen.</em>', 10),
  ('product', 'cta', 'product.cta.title', 'Contact CTA', 'html', '.page-cta h2', 'innerHTML', 'We denken persoonlijk met je <em>mee.</em>', 10),
  ('contact', 'hero', 'contact.intro', 'Contactintroductie', 'text', '.contact-hero-copy > p:nth-of-type(2)', 'textContent', 'Een vraag over hielklachten, de juiste maat of een mogelijke samenwerking? Stuur ons een bericht. We denken graag persoonlijk met je mee.', 20),
  ('contact', 'hero', 'contact.button', 'Contactknop', 'text', '.contact-hero .button', 'textContent', 'Stuur een bericht', 30),
  ('contact', 'form', 'contact.form.title', 'Formuliertitel', 'html', '.contact-form-intro h2', 'innerHTML', 'Waar kunnen we je mee <em>helpen?</em>', 10),
  ('contact', 'team', 'contact.team.title', 'Teamtitel', 'html', '.contact-human-copy h2', 'innerHTML', 'Geen helpdesk. Gewoon <em>Maks &amp; Thijn.</em>', 10),
  ('contact', 'team', 'contact.team.image', 'Teamafbeelding', 'image', '.contact-human-image img', 'src', 'https://zolsolutions.nl/cdn/shop/files/DSC06583_09e69a5c-769e-434c-8451-c11116385894.jpg?v=1775822921&width=1400', 20)
on conflict (content_key) do update
set label = excluded.label,
    content_type = excluded.content_type,
    selector = excluded.selector,
    attribute = excluded.attribute,
    value = excluded.value,
    updated_at = now();

