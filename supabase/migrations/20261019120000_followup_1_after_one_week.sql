-- Opvolgmail 1 gaat 7 dagen na bezorging uit (was 14).
update public.email_templates
set name = 'Opvolging na 1 week',
    description = 'Kale, persoonlijke mail van Maks & Thijn, 7 dagen na bezorging. Zonder opmaak of knop.'
where template_key = 'customer_followup_1';
