-- Reviewvraag 10 dagen na bezorging (customer_followup_3), bewerkbaar onder E-mails in de admin.
alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check check (kind = any (array[
  'contact_notification','admin_customer','order_customer','order_admin','shipping_customer','order_received','payment_confirmed',
  'order_delayed','order_shipped','order_delivered','order_returned','order_cancelled','refund_confirmed','new_order_admin',
  'marketing_product_update','pilot_measurement','pain_checkin_invitation','stock_back_in_stock','physio_campaign',
  'physio_booking_admin','physio_booking_guest','customer_followup_1','customer_followup_2','customer_followup_3',
  'welcome_discount','welcome_reminder'
]));

insert into public.email_templates (template_key, name, description, audience, subject_template, title_template, body_template, enabled, variables, sort_order)
values (
  'customer_followup_3', 'Reviewvraag na 10 dagen',
  'Kale, persoonlijke mail van Maks & Thijn, 10 dagen na bezorging, met een link naar Google en de productpagina. Wissel de Google-link gerust om voor de directe "schrijf een review"-link uit het Google Bedrijfsprofiel.',
  'customer',
  'Wil je je ervaring met de ZOL''tjes delen?', 'Wil je je ervaring met de ZOL''tjes delen?',
  E'Hoi {{customer_first_name}},\n\nDe ZOL''tjes zijn nu zo''n tien dagen bij jullie. Hopelijk zitten ze fijn in de schoen!\n\nMogen we je om een kleine gunst vragen? Andere ouders twijfelen vaak of een zool echt iets voor hun kind is. Jouw eerlijke ervaring, positief of kritisch, helpt hen enorm.\n\nEen review achterlaten kan hier (duurt een minuut):\nhttps://maps.google.com/?cid=654808623137506283\n\nLiever op onze eigen website? Dat kan ook:\nhttps://zolsolutions.nl/product/#reviews\n\nHeb je een foto of korte video van je kind in actie met de ZOL''tjes? Stuur hem gerust als antwoord op deze mail en laat even weten of we hem (zonder naam) mogen gebruiken.\n\nGaat het (nog) niet zoals je hoopte? Antwoord dan vooral op deze mail, dan denken we met je mee.\n\nGroet,\nMaks & Thijn\nZOL Solutions',
  true, array['customer_first_name'], 142
)
on conflict (template_key) do nothing;
