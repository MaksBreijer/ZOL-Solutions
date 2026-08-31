create or replace function public.admin_session_is_active(
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and p_session_id is not null
    and exists (
      select 1
      from auth.sessions
      where id = p_session_id
        and user_id = p_user_id
    );
$$;

revoke all on function public.admin_session_is_active(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_session_is_active(uuid, uuid) to service_role;

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
      from auth.sessions
      where id = nullif((select auth.jwt() ->> 'session_id'), '')::uuid
        and user_id = (select auth.uid())
    )
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
