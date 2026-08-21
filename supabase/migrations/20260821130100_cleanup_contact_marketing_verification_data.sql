-- Remove only the synthetic record used to verify the consent and unsubscribe flow.

delete from public.email_messages
where contact_message_id in (
  select id from public.contact_messages where email = 'codex-marketing-test@example.invalid'
);

delete from public.contact_messages
where email = 'codex-marketing-test@example.invalid';

delete from public.customers
where email = 'codex-marketing-test@example.invalid';
