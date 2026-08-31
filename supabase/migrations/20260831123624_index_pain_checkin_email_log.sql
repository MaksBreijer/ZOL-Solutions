create index if not exists pilot_consent_invites_last_email_message_id_idx
on public.pilot_consent_invites (last_email_message_id)
where last_email_message_id is not null;
