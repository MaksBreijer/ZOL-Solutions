do $$
begin
  alter publication supabase_realtime add table public.analytics_events;
exception
  when duplicate_object then null;
end;
$$;
