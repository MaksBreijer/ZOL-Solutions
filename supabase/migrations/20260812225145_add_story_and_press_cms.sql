-- Editable homepage story and press content.
insert into public.site_content (
  page,
  section,
  content_key,
  label,
  content_type,
  selector,
  attribute,
  value,
  sort_order
) values
  ('global', 'navigation', 'global.nav.story', 'Navigatie: ons verhaal', 'text', '.nav-links a[href="#ons-verhaal"]', 'textContent', 'Ons verhaal', 15),
  ('home', 'story', 'home.story.title', 'Verhaal titel', 'html', '#story-title', 'innerHTML', 'Begonnen vanuit iets <em>persoonlijks.</em>', 10),
  ('home', 'story', 'home.story.lead', 'Verhaal introductie', 'text', '.story-copy .lead', 'textContent', 'Voor Maks was de ziekte van Sever geen abstract probleem: hij had er zelf mee te maken. De frustratie van niet vrij kunnen sporten werd jaren later het vertrekpunt voor ZOL.', 20),
  ('home', 'story', 'home.story.image', 'Verhaal teamfoto', 'image', '.story-image img', 'src', 'https://zolsolutions.nl/cdn/shop/files/DSC06589.jpg?v=1776766027&width=1600', 30),
  ('home', 'story', 'home.story.origin', 'Ontwerp met een geschiedenis', 'text', '.story-chapter--origin p', 'textContent', 'Zijn vader, RegisterPodoloog Marco-Paul Breijer, ontwikkelde een zoolontwerp waarin demping en stabilisatie samenkwamen. Na zijn overlijden bleef het ontwerp liggen — tot Maks en Thijn besloten het verder te brengen.', 40),
  ('home', 'story', 'home.story.mission', 'Van vakmanschap naar missie', 'text', '.story-chapter--mission p', 'textContent', 'Met hun ervaring als skibootfitters en de kennis van voetspecialisten vertaalden zij die basis naar een compacte zool voor groeiende sporters.', 50),
  ('home', 'story', 'home.story.quote', 'Missie uitspraak', 'text', '.story-quote strong', 'textContent', '“Kinderen niet onnodig langs de kant laten staan.”', 60),
  ('home', 'press', 'home.press.title', 'Media titel', 'html', '#press-title', 'innerHTML', 'Ons verhaal krijgt een podium. <em>Hielpijn ook.</em>', 10),
  ('home', 'press', 'home.press.ad.image', 'Afbeelding Algemeen Dagblad', 'image', '.press-card--ad img', 'src', 'https://zolsolutions.nl/cdn/shop/files/Met_de_zooltjes_van_ZOL_Solutions_kunnen_de_kinderen_wel_blijven_sporten._Bron_Algemeen_Dagblad_2.png?v=1779284818&width=1200', 20),
  ('home', 'press', 'home.press.ad.title', 'Titel Algemeen Dagblad', 'text', '.press-card--ad h3', 'textContent', 'Van een persoonlijk probleem naar een eigen sportmerk.', 21),
  ('home', 'press', 'home.press.ad.link', 'Link Algemeen Dagblad', 'link', '.press-card--ad', 'href', 'https://www.ad.nl/amsterdam/amsterdamse-studenten-bouwen-eigen-bedrijf-op-we-hadden-bijna-alle-schoenmakers-van-de-stad-gemaild~a0513f73/', 22),
  ('home', 'press', 'home.press.hockey.image', 'Afbeelding Hockey Magazine', 'image', '.press-card--hockey img', 'src', 'https://zolsolutions.nl/cdn/shop/files/Met_de_zooltjes_van_ZOL_Solutions_kunnen_de_kinderen_wel_blijven_sporten._Bron_Algemeen_Dagblad_4.png?v=1783497654&width=1200', 30),
  ('home', 'press', 'home.press.hockey.title', 'Titel Hockey Magazine', 'text', '.press-card--hockey h3', 'textContent', 'Hielpijn bij je sportkind: dit is wat je moet weten.', 31),
  ('home', 'press', 'home.press.hockey.link', 'Link Hockey Magazine', 'link', '.press-card--hockey', 'href', 'https://hockey-magazine.nl/hielpijn-bij-je-sportkind-dit-is-wat-je-moet-weten/', 32)
on conflict (content_key) do update
set page = excluded.page,
    section = excluded.section,
    label = excluded.label,
    content_type = excluded.content_type,
    selector = excluded.selector,
    attribute = excluded.attribute,
    value = excluded.value,
    sort_order = excluded.sort_order,
    updated_at = now();
