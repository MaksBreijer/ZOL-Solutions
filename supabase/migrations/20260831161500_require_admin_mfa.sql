create or replace function private.is_admin(
  allowed_roles text[] default array['owner', 'admin', 'editor', 'viewer']
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    and exists (
      select 1
      from public.admin_profiles
      where id = (select auth.uid())
        and active = true
        and role = any(allowed_roles)
    );
$$;

revoke all on function private.is_admin(text[]) from public;
grant execute on function private.is_admin(text[]) to authenticated, service_role;
