-- Never allow the final active owner/admin account to be removed or deactivated.

create or replace function private.protect_last_active_admin()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_removes_manager boolean;
  v_remaining_managers integer;
begin
  if tg_op = 'DELETE' then
    v_removes_manager := old.active and old.role in ('owner', 'admin');
  else
    v_removes_manager := old.active
      and old.role in ('owner', 'admin')
      and (not new.active or new.role not in ('owner', 'admin'));
  end if;

  if not v_removes_manager then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zol:last-active-admin', 0)
  );

  select count(*)::integer
  into v_remaining_managers
  from public.admin_profiles
  where id <> old.id
    and active = true
    and role in ('owner', 'admin');

  if v_remaining_managers < 1 then
    raise exception 'De laatste actieve beheerder kan niet worden verwijderd of gedeactiveerd.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.protect_last_active_admin() from public;

drop trigger if exists protect_last_active_admin on public.admin_profiles;
create trigger protect_last_active_admin
before delete or update of active, role on public.admin_profiles
for each row execute function private.protect_last_active_admin();
