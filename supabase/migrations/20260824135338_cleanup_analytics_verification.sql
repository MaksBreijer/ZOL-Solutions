delete from public.analytics_events
where session_id = 'codex_verification_20260824'
  and metadata ->> 'verification' = 'true';
