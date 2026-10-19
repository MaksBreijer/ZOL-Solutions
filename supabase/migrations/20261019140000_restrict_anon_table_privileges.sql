-- Defense in depth: RLS already limits anonymous visitors, but they still held every
-- table privilege (including TRUNCATE, which ignores RLS). Keep only what the public site uses.
revoke all on all tables in schema public from anon;

grant select on table public.products, public.product_variants, public.settings, public.site_content, public.media to anon;
grant insert on table public.analytics_events to anon;

-- New tables should not be exposed to anonymous visitors by default.
alter default privileges in schema public revoke all on tables from anon;
