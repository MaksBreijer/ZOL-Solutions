-- Optionele tijd (HH:MM) bij taken, kansen en evenementen voor de CRM-agenda.
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
  if coalesce(p_data ->> 'time', '') <> '' and (p_data ->> 'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Ongeldige tijd.'; end if;
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
