-- The optional checkout checkbox requests a later pain-evaluation invitation.
-- It must not subscribe the customer to product marketing.

alter table public.customers
  add column if not exists pain_evaluation_opt_in boolean not null default false,
  add column if not exists pain_evaluation_opt_in_at timestamptz,
  add column if not exists pain_evaluation_opt_in_source text not null default '';

comment on column public.customers.pain_evaluation_opt_in is
  'Customer asked to receive the separate pain-evaluation consent invitation after delivery.';
comment on column public.customers.pain_evaluation_opt_in_at is
  'Timestamp of the first explicit checkout choice to receive the invitation.';
comment on column public.customers.pain_evaluation_opt_in_source is
  'Source where the customer requested the pain-evaluation invitation.';

do $migration$
declare
  v_body text;
  v_updated text;
begin
  select p.prosrc
  into v_body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_checkout_order'
    and pg_get_function_identity_arguments(p.oid) =
      'p_customer jsonb, p_items jsonb, p_note text, p_session_id text, p_discount_code text';

  if v_body is null then
    raise exception 'create_checkout_order(jsonb, jsonb, text, text, text) was not found';
  end if;

  v_updated := replace(
    v_body,
    '  v_marketing_opt_in boolean := coalesce((p_customer ->> ''marketing_opt_in'')::boolean, false);',
    '  v_marketing_opt_in boolean := coalesce((p_customer ->> ''marketing_opt_in'')::boolean, false);' || E'\n' ||
    '  v_pain_evaluation_opt_in boolean := coalesce((p_customer ->> ''pain_evaluation_opt_in'')::boolean, false);'
  );

  v_updated := replace(
    v_updated,
    '    marketing_unsubscribed_at, marketing_next_send_at',
    '    marketing_unsubscribed_at, marketing_next_send_at,' || E'\n' ||
    '    pain_evaluation_opt_in, pain_evaluation_opt_in_at, pain_evaluation_opt_in_source'
  );

  v_updated := replace(
    v_updated,
    '    null, case when v_marketing_opt_in then now() + interval ''21 days'' end',
    '    null, case when v_marketing_opt_in then now() + interval ''21 days'' end,' || E'\n' ||
    '    v_pain_evaluation_opt_in, case when v_pain_evaluation_opt_in then now() end,' || E'\n' ||
    '    case when v_pain_evaluation_opt_in then ''checkout_pain_evaluation'' else '''' end'
  );

  v_updated := replace(
    v_updated,
$old$
    marketing_next_send_at = case
      when excluded.marketing_opt_in then coalesce(public.customers.marketing_next_send_at, excluded.marketing_next_send_at)
      else public.customers.marketing_next_send_at
    end,
    updated_at = now()
$old$,
$new$
    marketing_next_send_at = case
      when excluded.marketing_opt_in then coalesce(public.customers.marketing_next_send_at, excluded.marketing_next_send_at)
      else public.customers.marketing_next_send_at
    end,
    pain_evaluation_opt_in = public.customers.pain_evaluation_opt_in or excluded.pain_evaluation_opt_in,
    pain_evaluation_opt_in_at = coalesce(public.customers.pain_evaluation_opt_in_at, excluded.pain_evaluation_opt_in_at),
    pain_evaluation_opt_in_source = case
      when excluded.pain_evaluation_opt_in then excluded.pain_evaluation_opt_in_source
      else public.customers.pain_evaluation_opt_in_source
    end,
    updated_at = now()
$new$
  );

  if v_updated = v_body
    or position('v_pain_evaluation_opt_in boolean' in v_updated) = 0
    or position('pain_evaluation_opt_in_source' in v_updated) = 0
    or position('checkout_pain_evaluation' in v_updated) = 0 then
    raise exception 'create_checkout_order could not be patched safely for pain-evaluation consent';
  end if;

  execute format($ddl$
    create or replace function public.create_checkout_order(
      p_customer jsonb,
      p_items jsonb,
      p_note text default '',
      p_session_id text default '',
      p_discount_code text default ''
    )
    returns jsonb
    language plpgsql
    security invoker
    set search_path = ''
    as %L
  $ddl$, v_updated);
end;
$migration$;

revoke all on function public.create_checkout_order(jsonb, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.create_checkout_order(jsonb, jsonb, text, text, text) to service_role;
