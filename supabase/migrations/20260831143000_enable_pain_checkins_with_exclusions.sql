update public.settings
set value = jsonb_set(
      jsonb_set(
        jsonb_set(value, '{enabled}', 'true'::jsonb, true),
        '{automatic_sending}', 'true'::jsonb, true
      ),
      '{excluded_emails}',
      '["admiraalnj@gmail.com", "thijn@zolsolutions.nl", "maks@zolsolutions.nl"]'::jsonb,
      true
    )
where key = 'pilot_measurements';
