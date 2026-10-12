-- Persoonlijke opvolgmails na een bestelling, bewerkbaar onder E-mails in de admin.
insert into public.email_templates (template_key, name, description, audience, subject_template, title_template, body_template, enabled, variables, sort_order)
values
  ('customer_followup_1', 'Opvolging na 2 weken', 'Kale, persoonlijke mail van Maks & Thijn, 14 dagen na bezorging. Zonder opmaak of knop.', 'customer',
   'Hoe bevallen de ZOL''tjes?', 'Hoe bevallen de ZOL''tjes?',
   E'Hoi {{customer_first_name}},\n\nTwee weken geleden kwamen de ZOL''tjes bij jullie binnen, dus we zijn benieuwd: hoe bevallen ze?\n\nMerk je al verschil tijdens of na het sporten? En zitten ze lekker in de schoen? Alles is welkom, ook als het (nog) niet goed gaat. Dan denken we graag met je mee.\n\nJe kunt gewoon op deze mail antwoorden.\n\nGroet,\nMaks & Thijn\nZOL Solutions',
   true, array['customer_first_name'], 140),
  ('customer_followup_2', 'Opvolging na 1 maand', 'Kale, persoonlijke mail van Maks & Thijn, 30 dagen na bezorging. Zonder opmaak of knop.', 'customer',
   'Hoe staat het er nu mee?', 'Hoe staat het er nu mee?',
   E'Hoi {{customer_first_name}},\n\nHet is nu ongeveer een maand geleden dat de ZOL''tjes binnenkwamen. Hoe staat het er nu mee?\n\nIs de hielpijn minder geworden, of speelt het nog? En kan er weer volop gesport worden?\n\nWe horen het heel graag, ook als je twijfels hebt of tips voor ons. Antwoord gewoon op deze mail.\n\nGroet,\nMaks & Thijn\nZOL Solutions',
   true, array['customer_first_name'], 141)
on conflict (template_key) do nothing;
