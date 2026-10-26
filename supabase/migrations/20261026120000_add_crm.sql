-- CRM in de admin: organisaties, contactpersonen, kansen, taken, activiteiten, evenementen, inbox en privacybeheer.
-- Bron-ID's blijven de primaire sleutel (collection, id); alle bronvelden blijven verliesvrij in `data` staan.
-- Alle schrijfacties lopen via security definer-functies met rolcontrole, revisiecontrole en een servergeschreven auditregel.

create table if not exists public.crm_records (
  seq bigint generated always as identity,
  collection text not null check (collection in ('organizations','contacts','deals','tasks','activities','events','inbox','privacy_requests','privacy_incidents','privacy_settings','org_merges','source_meta')),
  id text not null check (id ~ '^[a-zA-Z0-9_-]{1,150}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision text not null,
  source_namespace text not null default 'zol-crm',
  import_batch_id uuid,
  import_revision text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists crm_records_collection_seq_idx on public.crm_records (collection, seq);
create index if not exists crm_records_import_batch_idx on public.crm_records (import_batch_id) where import_batch_id is not null;

create table if not exists public.crm_erased (
  key text primary key check (key ~ '^sha256:[0-9a-f]{64}$'),
  erased_at timestamptz not null default now(),
  import_batch_id uuid
);

create table if not exists public.crm_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid,
  actor_email text not null default '',
  legacy_actor_id text,
  action text not null,
  resource text not null default '',
  record_ids text[] not null default '{}',
  import_batch_id uuid
);
create index if not exists crm_audit_at_idx on public.crm_audit (at desc);

create table if not exists public.crm_files (
  file_key text primary key check (file_key ~ '^files/[a-zA-Z0-9_-]{1,150}$'),
  inbox_id text,
  file_name text not null default '',
  content_type text not null default '',
  size bigint not null default 0,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  import_batch_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_pending_file_deletes (
  file_key text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_import_batches (
  id uuid primary key,
  namespace text not null,
  status text not null default 'applied' check (status in ('applied', 'rolled_back')),
  created_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  report jsonb not null default '{}'::jsonb
);

alter table public.crm_records enable row level security;
alter table public.crm_erased enable row level security;
alter table public.crm_audit enable row level security;
alter table public.crm_files enable row level security;
alter table public.crm_pending_file_deletes enable row level security;
alter table public.crm_import_batches enable row level security;

revoke all on public.crm_records, public.crm_erased, public.crm_audit, public.crm_files, public.crm_pending_file_deletes, public.crm_import_batches from anon, authenticated;
grant select on public.crm_records, public.crm_files to authenticated;
grant select on public.crm_audit, public.crm_erased to authenticated;

drop policy if exists "crm admins read business records" on public.crm_records;
create policy "crm admins read business records" on public.crm_records for select to authenticated
using (
  private.is_admin()
  and (collection in ('organizations','contacts','deals','tasks','activities','events','inbox') or private.is_admin(array['owner','admin']))
);
drop policy if exists "crm admins read files" on public.crm_files;
create policy "crm admins read files" on public.crm_files for select to authenticated using (private.is_admin());
drop policy if exists "crm owners read audit" on public.crm_audit;
create policy "crm owners read audit" on public.crm_audit for select to authenticated using (private.is_admin(array['owner','admin']));
drop policy if exists "crm owners read erased" on public.crm_erased;
create policy "crm owners read erased" on public.crm_erased for select to authenticated using (private.is_admin(array['owner','admin']));

-- Rol in CRM-termen: owner/admin -> admin, editor -> member, viewer -> viewer.
create or replace function private.crm_role()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when private.is_admin(array['owner','admin']) then 'admin'
    when private.is_admin(array['editor']) then 'member'
    when private.is_admin(array['viewer']) then 'viewer'
  end;
$$;
revoke all on function private.crm_role() from public;
grant execute on function private.crm_role() to authenticated;

create or replace function private.crm_audit(p_action text, p_resource text default '', p_ids text[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  days integer := 180;
begin
  insert into public.crm_audit (actor_id, actor_email, action, resource, record_ids)
  values ((select auth.uid()), coalesce((select auth.jwt()) ->> 'email', ''), p_action, coalesce(p_resource, ''), coalesce(p_ids, '{}'));
  select least(3650, greatest(1, coalesce((data ->> 'auditDays')::integer, 180))) into days
  from public.crm_records where collection = 'privacy_settings' and id = 'policy';
  delete from public.crm_audit where at < now() - make_interval(days => coalesce(days, 180)) and import_batch_id is null;
end;
$$;
revoke all on function private.crm_audit(text, text, text[]) from public;

create or replace function private.crm_erasure_key(p_id text)
returns text language sql immutable set search_path = '' as $$
  select 'sha256:' || encode(sha256(convert_to(p_id, 'UTF8')), 'hex');
$$;

create or replace function private.crm_valid_date(p_value text)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if p_value !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  return to_char(p_value::date, 'YYYY-MM-DD') = p_value;
exception when others then
  return false;
end;
$$;

-- Zelfde regels als validateRecord in src/crm/model.js.
create or replace function private.crm_validate(p_collection text, p_id text, p_data jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  title_key text;
  key text;
  item jsonb;
begin
  if p_collection not in ('organizations','contacts','deals','tasks','activities','events','inbox') then raise exception 'Ongeldig record.'; end if;
  if p_data ->> 'id' is distinct from p_id then raise exception 'Ongeldige record-ID.'; end if;
  title_key := case when p_collection in ('organizations','contacts') then 'name' when p_collection = 'activities' then 'text' else 'title' end;
  if jsonb_typeof(p_data -> title_key) is distinct from 'string' or btrim(p_data ->> title_key) = '' or length(p_data ->> title_key) > 20000 then raise exception 'Vul een naam of omschrijving in.'; end if;
  foreach key in array array['due','date','nextDate'] loop
    if coalesce(p_data ->> key, '') <> '' and not private.crm_valid_date(p_data ->> key) then raise exception 'Ongeldige datum.'; end if;
  end loop;
  if p_collection = 'tasks' and coalesce(p_data ->> 'status', '') not in ('open','bezig','wacht-op-reactie','afgerond','vervallen') then raise exception 'Ongeldige taakstatus.'; end if;
  if p_collection = 'deals' and coalesce(p_data ->> 'stage', '') not in ('onbekend','te-benaderen','contact-gelegd','voorstel','onderhandeling','gewonnen','verloren') then raise exception 'Ongeldige pipelinefase.'; end if;
  if p_data ? 'value' and jsonb_typeof(p_data -> 'value') <> 'null' and (jsonb_typeof(p_data -> 'value') <> 'number' or (p_data ->> 'value')::numeric < 0) then raise exception 'Vul een geldig bedrag in.'; end if;
  foreach key in array array['organizationIds','contactIds','relatedIds'] loop
    if p_data ? key then
      if jsonb_typeof(p_data -> key) <> 'array' then raise exception 'Ongeldige relatieverwijzing.'; end if;
      for item in select value from jsonb_array_elements(p_data -> key) loop
        if jsonb_typeof(item) <> 'string' then raise exception 'Ongeldige relatieverwijzing.'; end if;
      end loop;
    end if;
  end loop;
  if length(p_data::text) > 100000 then raise exception 'Record is te groot.'; end if;
end;
$$;

create or replace function private.crm_check_references(p_collection text, p_data jsonb)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  org_ids text[] := '{}';
  contact_ids text[] := '{}';
begin
  if p_collection = 'tasks' then
    select coalesce(array_agg(value), '{}') into org_ids from jsonb_array_elements_text(coalesce(p_data -> 'organizationIds', '[]'::jsonb));
  elsif coalesce(p_data ->> 'organizationId', '') <> '' and p_collection in ('contacts','deals','events','inbox') then
    org_ids := array[p_data ->> 'organizationId'];
  end if;
  if exists (select 1 from unnest(org_ids) as ref(ref_id) where not exists (select 1 from public.crm_records r where r.collection = 'organizations' and r.id = ref.ref_id)) then
    raise exception 'Gekoppelde organisatie bestaat niet.';
  end if;
  select coalesce(array_agg(value), '{}') into contact_ids from jsonb_array_elements_text(coalesce(p_data -> 'contactIds', '[]'::jsonb));
  if exists (select 1 from unnest(contact_ids) as ref(ref_id) where not exists (select 1 from public.crm_records r where r.collection = 'contacts' and r.id = ref.ref_id)) then
    raise exception 'Gekoppelde persoon bestaat niet.';
  end if;
end;
$$;

create or replace function private.crm_list(p_collection text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(data || jsonb_build_object('revision', revision) order by seq), '[]'::jsonb)
  from public.crm_records where collection = p_collection;
$$;

create or replace function public.crm_get_state()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  role text := private.crm_role();
  result jsonb;
  settings jsonb;
begin
  if role is null then raise exception 'Je account heeft hiervoor geen toestemming.' using errcode = '42501'; end if;
  perform private.crm_audit('workspace.read');
  result := jsonb_build_object(
    'version', 1,
    'organizations', private.crm_list('organizations'), 'contacts', private.crm_list('contacts'), 'deals', private.crm_list('deals'),
    'tasks', private.crm_list('tasks'), 'activities', private.crm_list('activities'), 'events', private.crm_list('events'), 'inbox', private.crm_list('inbox'),
    'uncertainties', coalesce((select data -> 'uncertainties' from public.crm_records where collection = 'source_meta' and id = 'state'), '[]'::jsonb),
    'me', jsonb_build_object('id', (select auth.uid()), 'email', coalesce((select auth.jwt()) ->> 'email', ''), 'role', role),
    'updatedAt', (select max(updated_at) from public.crm_records)
  );
  if role = 'admin' then
    select coalesce(jsonb_object_agg(id, data || jsonb_build_object('revision', revision)), '{}'::jsonb) into settings from public.crm_records where collection = 'privacy_settings';
    result := result || jsonb_build_object('privacy', jsonb_build_object(
      'policy', settings -> 'policy', 'register', settings -> 'register',
      'requests', private.crm_list('privacy_requests'), 'incidents', private.crm_list('privacy_incidents'), 'organizationMerges', private.crm_list('org_merges'),
      'erasedIds', (select coalesce(jsonb_agg(key order by erased_at, key), '[]'::jsonb) from public.crm_erased)
    ));
  end if;
  return result;
end;
$$;

create or replace function public.crm_get_audit(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if private.crm_role() is distinct from 'admin' then raise exception 'Je account heeft hiervoor geen toestemming.' using errcode = '42501'; end if;
  perform private.crm_audit('privacy.read');
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'at', at, 'actorId', coalesce(actor_id::text, legacy_actor_id), 'actorEmail', actor_email, 'action', action, 'resource', resource, 'recordIds', record_ids) order by at desc), '[]'::jsonb)
    from (select * from public.crm_audit order by at desc limit greatest(1, least(coalesce(p_limit, 100), 500))) latest);
end;
$$;

create or replace function public.crm_log_event(p_action text, p_resource text default '', p_ids text[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.crm_role() is null then raise exception 'Je account heeft hiervoor geen toestemming.' using errcode = '42501'; end if;
  if p_action not in ('record.read', 'workspace.export', 'file.read', 'subject.export.review') then raise exception 'Onbekende actie.'; end if;
  if p_action = 'workspace.export' and private.crm_role() <> 'admin' then raise exception 'Je account heeft hiervoor geen toestemming.' using errcode = '42501'; end if;
  perform private.crm_audit(p_action, p_resource, p_ids);
end;
$$;

-- Eén atomaire schrijfactie. p_writes: [{collection,id,data,expectedRevision}], p_deletes: [{collection,id,expectedRevision}].
create or replace function public.crm_commit(
  p_action text, p_writes jsonb, p_deletes jsonb default '[]'::jsonb, p_erased_ids jsonb default '[]'::jsonb,
  p_resource text default '', p_record_ids jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  role text := private.crm_role();
  w jsonb; d jsonb;
  coll text; rid text; payload jsonb; expected text; existing public.crm_records%rowtype;
  fresh text; revisions jsonb := '{}'::jsonb; file_keys text[] := '{}';
  register jsonb; erased_id text; erased_key text; touches_business boolean := false; touched jsonb[] := '{}';
  is_merged boolean;
begin
  if role is null or role = 'viewer' then raise exception 'Je account heeft hiervoor geen toestemming.' using errcode = '42501'; end if;
  if p_action !~ '^[a-z][a-z.]{0,59}$' then raise exception 'Ongeldige actie.'; end if;
  if jsonb_typeof(p_writes) <> 'array' or jsonb_typeof(p_deletes) <> 'array' or jsonb_array_length(p_writes) + jsonb_array_length(p_deletes) > 2000 then raise exception 'Ongeldige aanvraag.'; end if;
  perform pg_advisory_xact_lock(hashtext('crm_commit'));

  for w in select value from jsonb_array_elements(p_writes) loop
    coll := w ->> 'collection';
    if coll in ('privacy_requests','privacy_incidents','privacy_settings','org_merges') and role <> 'admin' then raise exception 'Je account heeft hiervoor geen toestemming.' using errcode = '42501'; end if;
    if coll not in ('organizations','contacts','deals','tasks','activities','events','inbox','privacy_requests','privacy_incidents','privacy_settings','org_merges') then raise exception 'Ongeldig record.'; end if;
    if coll in ('organizations','contacts','deals','tasks','activities','events','inbox') then touches_business := true; end if;
  end loop;
  if (jsonb_array_length(p_deletes) > 0 or jsonb_array_length(p_erased_ids) > 0) and role <> 'admin' then raise exception 'Je account heeft hiervoor geen toestemming.' using errcode = '42501'; end if;

  -- Het verwerkingsregister moet compleet zijn voordat gegevens worden gewijzigd (zoals in het bron-CRM voor gedeelde opslag).
  if touches_business and p_action in ('record.write', 'file.upload') then
    select data into register from public.crm_records where collection = 'privacy_settings' and id = 'register';
    if register is null or coalesce(register ->> 'approvedAt', '') = '' or coalesce((register ->> 'processorAgreement')::boolean, false) is not true
       or coalesce(register ->> 'contactEmail', '') = '' or coalesce(register ->> 'noticeUrl', '') = '' or coalesce(register ->> 'hostingRegion', '') = ''
       or coalesce(register ->> 'legalBasis', '') = '' or register ->> 'legalBasis' like '%Nog per%' then
      raise exception 'Rond eerst het verwerkingsregister, de privacyinformatie en de verwerkersafspraken af in Beheer & privacy.' using errcode = 'P0409';
    end if;
  end if;

  for w in select value from jsonb_array_elements(p_writes) loop
    coll := w ->> 'collection'; rid := w ->> 'id'; payload := w -> 'data'; expected := nullif(w ->> 'expectedRevision', '');
    if rid is null or rid !~ '^[a-zA-Z0-9_-]{1,150}$' or jsonb_typeof(payload) <> 'object' then raise exception 'Ongeldige record-ID.'; end if;
    if length(payload::text) > 100000 then raise exception 'Record is te groot.'; end if;
    if coll in ('organizations','contacts','deals','tasks','activities','events','inbox') then
      perform private.crm_validate(coll, rid, payload);
      if exists (select 1 from public.crm_erased e where e.key in (rid, private.crm_erasure_key(rid))) then
        raise exception 'Dit record is verwijderd en kan niet opnieuw worden geïmporteerd.';
      end if;
    end if;
    select * into existing from public.crm_records where collection = coll and id = rid for update;
    if found then
      if expected is distinct from existing.revision then raise exception 'Dit dossier is intussen gewijzigd. Vernieuw het CRM en probeer opnieuw.' using errcode = 'P0409'; end if;
    elsif expected is not null then
      raise exception 'Dit dossier is intussen gewijzigd. Vernieuw het CRM en probeer opnieuw.' using errcode = 'P0409';
    end if;
    -- Een door de client gekozen nieuwe revisie blijft behouden (nodig voor het terugdraaien van samenvoegingen).
    fresh := case when coalesce(payload ->> 'revision', '') <> '' and payload ->> 'revision' is distinct from existing.revision then payload ->> 'revision' else gen_random_uuid()::text end;
    payload := payload || jsonb_build_object('revision', fresh, 'updatedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    insert into public.crm_records (collection, id, data, revision) values (coll, rid, payload, fresh)
    on conflict (collection, id) do update set data = excluded.data, revision = excluded.revision, updated_at = now();
    revisions := revisions || jsonb_build_object(coll || '/' || rid, fresh);
    touched := array_append(touched, payload || jsonb_build_object('_collection', coll));
  end loop;

  for d in select value from jsonb_array_elements(p_deletes) loop
    coll := d ->> 'collection'; rid := d ->> 'id'; expected := nullif(d ->> 'expectedRevision', '');
    select * into existing from public.crm_records where collection = coll and id = rid for update;
    if not found then continue; end if;
    if expected is distinct from existing.revision then raise exception 'Dit dossier is intussen gewijzigd. Vernieuw het CRM en probeer opnieuw.' using errcode = 'P0409'; end if;
    if coll = 'inbox' and coalesce(existing.data ->> 'fileKey', '') <> '' then file_keys := file_keys || (existing.data ->> 'fileKey'); end if;
    delete from public.crm_records where collection = coll and id = rid;
  end loop;

  if cardinality(file_keys) > 0 then
    delete from public.crm_files where file_key = any(file_keys);
    insert into public.crm_pending_file_deletes (file_key) select unnest(file_keys) on conflict do nothing;
  end if;

  for erased_id in select value from jsonb_array_elements_text(p_erased_ids) loop
    erased_key := private.crm_erasure_key(erased_id);
    insert into public.crm_erased (key) values (erased_key) on conflict do nothing;
    update public.crm_audit set record_ids = array_replace(record_ids, erased_id, erased_key) where erased_id = any(record_ids);
  end loop;

  -- Verwijzingen controleren op alles wat deze actie heeft geschreven.
  for payload in select unnest(touched) loop
    perform private.crm_check_references(payload ->> '_collection', payload);
  end loop;

  perform private.crm_audit(
    p_action, p_resource,
    case when p_action = 'subject.erase' then (select coalesce(array_agg(private.crm_erasure_key(value)), '{}') from jsonb_array_elements_text(p_record_ids))
         else (select coalesce(array_agg(value), '{}') from jsonb_array_elements_text(p_record_ids)) end
  );
  return jsonb_build_object('revisions', revisions, 'fileKeys', to_jsonb(file_keys));
end;
$$;

-- Bestandsupload: de inbox-notitie, het bestandsrecord en de activiteit komen samen of niet.
create or replace function public.crm_add_file(p_inbox jsonb, p_file jsonb, p_activity jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  role text := private.crm_role();
  rid text := p_inbox ->> 'id';
  file_key text := p_file ->> 'fileKey';
begin
  if role is null or role = 'viewer' then raise exception 'Je account heeft hiervoor geen toestemming.' using errcode = '42501'; end if;
  if file_key is distinct from p_inbox ->> 'fileKey' then raise exception 'Bestand niet gevonden.'; end if;
  insert into public.crm_files (file_key, inbox_id, file_name, content_type, size, sha256)
  values (file_key, rid, coalesce(p_file ->> 'fileName', ''), coalesce(p_file ->> 'contentType', ''), coalesce((p_file ->> 'size')::bigint, 0), p_file ->> 'sha256');
  perform public.crm_commit('file.upload', jsonb_build_array(
    jsonb_build_object('collection', 'inbox', 'id', rid, 'data', p_inbox, 'expectedRevision', null),
    jsonb_build_object('collection', 'activities', 'id', p_activity ->> 'id', 'data', p_activity, 'expectedRevision', null)
  ), '[]'::jsonb, '[]'::jsonb, 'inbox', jsonb_build_array(rid));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.crm_file_metadata(p_file_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  found_file public.crm_files%rowtype;
begin
  if private.crm_role() is null then raise exception 'Je account heeft hiervoor geen toestemming.' using errcode = '42501'; end if;
  select * into found_file from public.crm_files where file_key = p_file_key;
  if not found then raise exception 'Bestand niet gevonden.'; end if;
  perform private.crm_audit('file.read', 'inbox', array[found_file.inbox_id]);
  return jsonb_build_object('fileKey', found_file.file_key, 'fileName', found_file.file_name, 'contentType', found_file.content_type, 'size', found_file.size, 'sha256', found_file.sha256);
end;
$$;

create or replace function public.crm_pending_file_deletes()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if private.crm_role() is distinct from 'admin' then raise exception 'Je account heeft hiervoor geen toestemming.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(file_key), '[]'::jsonb) from public.crm_pending_file_deletes);
end;
$$;

create or replace function public.crm_clear_file_deletes(p_keys text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.crm_role() is distinct from 'admin' then raise exception 'Je account heeft hiervoor geen toestemming.' using errcode = '42501'; end if;
  delete from public.crm_pending_file_deletes where file_key = any(p_keys);
  perform private.crm_audit('maintenance.run');
end;
$$;

-- Importeren en terugdraaien: alleen met de service-rol (scripts/crm-import.mjs).
create or replace function public.crm_import_apply(
  p_batch uuid, p_namespace text, p_rows jsonb, p_erased jsonb, p_audit jsonb, p_files jsonb, p_report jsonb, p_allow_conflicts boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; existing public.crm_records%rowtype; rev text; inserted integer := 0; unchanged integer := 0; skipped_erased integer := 0;
  conflicts jsonb := '[]'::jsonb; audit_rows integer := 0; erased_rows integer := 0; file_rows integer := 0; f jsonb; a jsonb; k text;
begin
  if p_namespace !~ '^[a-z0-9][a-z0-9._-]{1,60}$' then raise exception 'Ongeldige bronnamespace.'; end if;
  perform pg_advisory_xact_lock(hashtext('crm_commit'));
  if exists (select 1 from public.crm_import_batches where id = p_batch) then raise exception 'Deze importbatch bestaat al.'; end if;
  insert into public.crm_import_batches (id, namespace, report) values (p_batch, p_namespace, coalesce(p_report, '{}'::jsonb));

  for k in select value from jsonb_array_elements_text(coalesce(p_erased, '[]'::jsonb)) loop
    insert into public.crm_erased (key, import_batch_id) values (k, p_batch) on conflict do nothing;
    if found then erased_rows := erased_rows + 1; end if;
  end loop;

  for r in select value from jsonb_array_elements(p_rows) loop
    -- Verwijderde personen komen nooit terug: ook geen records die naar hen verwijzen (activiteiten, taken, kansen).
    if r ->> 'collection' in ('organizations','contacts','deals','tasks','activities','events','inbox') and (
      exists (select 1 from public.crm_erased e where e.key in (r ->> 'id', private.crm_erasure_key(r ->> 'id')))
      or exists (
        select 1 from jsonb_array_elements_text(coalesce(r -> 'data' -> 'relatedIds', '[]'::jsonb) || coalesce(r -> 'data' -> 'contactIds', '[]'::jsonb)) as ref(ref_id)
        where exists (select 1 from public.crm_erased e where e.key in (ref.ref_id, private.crm_erasure_key(ref.ref_id)))
      )
    ) then
      skipped_erased := skipped_erased + 1; continue;
    end if;
    select * into existing from public.crm_records where collection = r ->> 'collection' and id = r ->> 'id';
    if found then
      if existing.data = (r -> 'data') then unchanged := unchanged + 1;
      else conflicts := conflicts || jsonb_build_object('collection', r ->> 'collection', 'id', r ->> 'id'); end if;
    else
      rev := coalesce(nullif(r -> 'data' ->> 'revision', ''), nullif(r -> 'data' ->> 'updatedAt', ''), 'import-' || p_batch::text);
      insert into public.crm_records (collection, id, data, revision, source_namespace, import_batch_id, import_revision)
      values (r ->> 'collection', r ->> 'id', r -> 'data', rev, p_namespace, p_batch, rev);
      inserted := inserted + 1;
    end if;
  end loop;
  if jsonb_array_length(conflicts) > 0 and not p_allow_conflicts then
    raise exception 'Importconflicten: %', conflicts::text using errcode = 'P0409';
  end if;

  for a in select value from jsonb_array_elements(coalesce(p_audit, '[]'::jsonb)) loop
    if exists (select 1 from public.crm_audit where at = (a ->> 'at')::timestamptz and action = a ->> 'action' and legacy_actor_id is not distinct from (a ->> 'actorId') and resource = coalesce(a ->> 'resource', '')) then continue; end if;
    insert into public.crm_audit (at, legacy_actor_id, actor_email, action, resource, record_ids, import_batch_id)
    values ((a ->> 'at')::timestamptz, a ->> 'actorId', coalesce(a ->> 'actorEmail', ''), a ->> 'action', coalesce(a ->> 'resource', ''),
            coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(a -> 'recordIds', '[]'::jsonb))), '{}'), p_batch);
    audit_rows := audit_rows + 1;
  end loop;

  for f in select value from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) loop
    insert into public.crm_files (file_key, inbox_id, file_name, content_type, size, sha256, import_batch_id)
    values (f ->> 'fileKey', f ->> 'inboxId', coalesce(f ->> 'fileName', ''), coalesce(f ->> 'contentType', ''), coalesce((f ->> 'size')::bigint, 0), f ->> 'sha256', p_batch)
    on conflict (file_key) do nothing;
    if found then file_rows := file_rows + 1; end if;
  end loop;

  return jsonb_build_object('batch', p_batch, 'inserted', inserted, 'unchanged', unchanged, 'skippedErased', skipped_erased,
    'conflicts', conflicts, 'audit', audit_rows, 'erasedKeys', erased_rows, 'files', file_rows);
end;
$$;

create or replace function public.crm_import_rollback(p_batch uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  removed integer; kept jsonb; file_keys jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('crm_commit'));
  if not exists (select 1 from public.crm_import_batches where id = p_batch and status = 'applied') then raise exception 'Importbatch niet gevonden of al teruggedraaid.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('collection', collection, 'id', id)), '[]'::jsonb) into kept
  from public.crm_records where import_batch_id = p_batch and revision is distinct from import_revision;
  with gone as (delete from public.crm_records where import_batch_id = p_batch and revision = import_revision returning 1)
  select count(*) into removed from gone;
  select coalesce(jsonb_agg(file_key), '[]'::jsonb) into file_keys from public.crm_files where import_batch_id = p_batch;
  delete from public.crm_files where import_batch_id = p_batch;
  delete from public.crm_audit where import_batch_id = p_batch;
  delete from public.crm_erased where import_batch_id = p_batch;
  update public.crm_import_batches set status = 'rolled_back', rolled_back_at = now() where id = p_batch;
  return jsonb_build_object('removed', removed, 'keptBecauseModified', kept, 'fileKeys', file_keys);
end;
$$;

revoke all on function public.crm_get_state(), public.crm_get_audit(integer), public.crm_log_event(text, text, text[]),
  public.crm_commit(text, jsonb, jsonb, jsonb, text, jsonb), public.crm_add_file(jsonb, jsonb, jsonb), public.crm_file_metadata(text),
  public.crm_pending_file_deletes(), public.crm_clear_file_deletes(text[]) from public, anon;
grant execute on function public.crm_get_state(), public.crm_get_audit(integer), public.crm_log_event(text, text, text[]),
  public.crm_commit(text, jsonb, jsonb, jsonb, text, jsonb), public.crm_add_file(jsonb, jsonb, jsonb), public.crm_file_metadata(text),
  public.crm_pending_file_deletes(), public.crm_clear_file_deletes(text[]) to authenticated;

revoke all on function public.crm_import_apply(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, boolean), public.crm_import_rollback(uuid) from public, anon, authenticated;
grant execute on function public.crm_import_apply(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, boolean), public.crm_import_rollback(uuid) to service_role;

-- Privé opslag voor bijlagen; alleen beheerders komen erbij. (Alleen op Supabase, waar het storage-schema bestaat.)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('crm-files', 'crm-files', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
    on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

    drop policy if exists "crm admins read files" on storage.objects;
    drop policy if exists "crm editors upload files" on storage.objects;
    drop policy if exists "crm owners delete files" on storage.objects;
    create policy "crm admins read files" on storage.objects for select to authenticated
      using (bucket_id = 'crm-files' and private.is_admin());
    create policy "crm editors upload files" on storage.objects for insert to authenticated
      with check (bucket_id = 'crm-files' and private.is_admin(array['owner', 'admin', 'editor']));
    create policy "crm owners delete files" on storage.objects for delete to authenticated
      using (bucket_id = 'crm-files' and private.is_admin(array['owner', 'admin']));
  end if;
end
$$;
