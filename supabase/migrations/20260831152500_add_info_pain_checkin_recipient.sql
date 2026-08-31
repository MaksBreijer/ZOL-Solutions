update public.settings
set value = jsonb_set(
      value,
      '{additional_invitation_emails}',
      '["info@zolsolutions.nl"]'::jsonb,
      true
    )
where key = 'pilot_measurements';
