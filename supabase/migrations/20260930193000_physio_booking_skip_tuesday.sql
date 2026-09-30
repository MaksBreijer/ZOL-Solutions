update public.settings
set value = value || '{"blocked_weekdays":[2]}'::jsonb
where key = 'physio_booking';
