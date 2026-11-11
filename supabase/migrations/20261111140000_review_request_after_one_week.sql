-- Reviewvraag gaat 7 dagen na bezorging uit (was 10); de eerste opvolgmail schuift naar 3 dagen (was 7).
update public.email_templates
set name = 'Opvolging na 3 dagen',
    description = 'Kale, persoonlijke mail van Maks & Thijn, 3 dagen na bezorging. Zonder opmaak of knop.'
where template_key = 'customer_followup_1';

update public.email_templates
set name = 'Reviewvraag na 1 week',
    description = replace(description, '10 dagen na bezorging', '7 dagen na bezorging'),
    body_template = replace(body_template, 'zo''n tien dagen bij jullie', 'een week bij jullie')
where template_key = 'customer_followup_3';
