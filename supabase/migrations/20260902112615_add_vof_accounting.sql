-- ZOL VOF accounting foundation: double-entry ledger, expenses, bank imports,
-- VAT periods, private documents and an immutable audit trail.

create table public.accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{4}$'),
  name text not null,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  vat_treatment text not null default 'none' check (vat_treatment in ('none', 'input', 'output')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2020 and 2100),
  quarter integer not null check (quarter between 1 and 4),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, quarter),
  check (starts_on <= ends_on),
  check ((status = 'open' and closed_at is null) or (status = 'closed' and closed_at is not null))
);

create table public.accounting_entries (
  id uuid primary key default gen_random_uuid(),
  entry_number bigint generated always as identity unique,
  entry_date date not null,
  journal text not null check (journal in ('sales', 'purchases', 'bank', 'general')),
  reference text not null default '',
  description text not null,
  source_type text,
  source_id uuid,
  source_revision text not null default '1',
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (source_type, source_id, source_revision)
);

create table public.accounting_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.accounting_entries(id) on delete restrict,
  account_id uuid not null references public.accounting_accounts(id) on delete restrict,
  description text not null default '',
  debit_cents bigint not null default 0 check (debit_cents >= 0),
  credit_cents bigint not null default 0 check (credit_cents >= 0),
  vat_rate numeric(5,2) not null default 0 check (vat_rate in (0, 9, 21)),
  created_at timestamptz not null default now(),
  check ((debit_cents > 0 and credit_cents = 0) or (credit_cents > 0 and debit_cents = 0))
);

create table public.accounting_expenses (
  id uuid primary key default gen_random_uuid(),
  supplier text not null,
  invoice_number text not null default '',
  invoice_date date not null,
  due_date date,
  description text not null default '',
  category_account_code text not null references public.accounting_accounts(code) on delete restrict,
  total_cents bigint not null check (total_cents > 0),
  amount_excluding_vat_cents bigint not null check (amount_excluding_vat_cents >= 0),
  vat_cents bigint not null check (vat_cents >= 0),
  vat_rate numeric(5,2) not null check (vat_rate in (0, 9, 21)),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  document_path text,
  entry_id uuid unique references public.accounting_entries(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'posted')),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_excluding_vat_cents + vat_cents = total_cents)
);

create table public.accounting_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  import_hash text not null unique,
  account_ref text not null default '',
  booked_on date not null,
  amount_cents bigint not null check (amount_cents <> 0),
  currency text not null default 'EUR' check (char_length(currency) = 3),
  counterparty text not null default '',
  counterparty_iban text not null default '',
  description text not null default '',
  status text not null default 'unmatched' check (status in ('unmatched', 'matched', 'ignored')),
  matched_order_id uuid references public.orders(id) on delete set null,
  matched_expense_id uuid references public.accounting_expenses(id) on delete set null,
  imported_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  imported_at timestamptz not null default now(),
  check ((status = 'matched' and (matched_order_id is not null or matched_expense_id is not null)) or status <> 'matched')
);

create table public.accounting_audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE', 'POST', 'CLOSE', 'OPEN')),
  before_data jsonb,
  after_data jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index accounting_entries_date_idx on public.accounting_entries(entry_date desc);
create index accounting_entries_source_idx on public.accounting_entries(source_type, source_id);
create index accounting_lines_entry_idx on public.accounting_lines(entry_id);
create index accounting_lines_account_idx on public.accounting_lines(account_id);
create index accounting_expenses_date_idx on public.accounting_expenses(invoice_date desc);
create index accounting_bank_date_idx on public.accounting_bank_transactions(booked_on desc);
create index accounting_bank_status_idx on public.accounting_bank_transactions(status, booked_on desc);
create index accounting_audit_record_idx on public.accounting_audit_log(table_name, record_id, created_at desc);

create trigger accounting_accounts_updated_at before update on public.accounting_accounts
for each row execute function private.set_updated_at();
create trigger accounting_periods_updated_at before update on public.accounting_periods
for each row execute function private.set_updated_at();
create trigger accounting_expenses_updated_at before update on public.accounting_expenses
for each row execute function private.set_updated_at();

insert into public.accounting_accounts (code, name, account_type, vat_treatment) values
  ('1000', 'Bank', 'asset', 'none'),
  ('1100', 'Mollie tussenrekening', 'asset', 'none'),
  ('1300', 'Debiteuren', 'asset', 'none'),
  ('1520', 'BTW af te dragen', 'liability', 'output'),
  ('1600', 'Crediteuren', 'liability', 'none'),
  ('1800', 'BTW te vorderen', 'asset', 'input'),
  ('2000', 'Kapitaal VOF', 'equity', 'none'),
  ('4000', 'Inkoop en productie', 'expense', 'input'),
  ('4400', 'Verzend- en verpakkingskosten', 'expense', 'input'),
  ('4500', 'Marketingkosten', 'expense', 'input'),
  ('4600', 'Software en abonnementen', 'expense', 'input'),
  ('4700', 'Kantoor- en algemene kosten', 'expense', 'input'),
  ('4900', 'Betaalkosten', 'expense', 'input'),
  ('8000', 'Omzet ZOL’tjes', 'revenue', 'output');

insert into public.accounting_periods (year, quarter, starts_on, ends_on)
select y, q,
  make_date(y, ((q - 1) * 3) + 1, 1),
  (make_date(y, ((q - 1) * 3) + 1, 1) + interval '3 months - 1 day')::date
from generate_series(extract(year from current_date)::integer - 1, extract(year from current_date)::integer + 1) as y
cross join generate_series(1, 4) as q
on conflict (year, quarter) do nothing;

create or replace function private.assert_open_accounting_period(p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.accounting_periods
    where p_date between starts_on and ends_on and status = 'closed'
  ) then
    raise exception 'Deze boekhoudperiode is afgesloten.' using errcode = '23514';
  end if;
end;
$$;

revoke all on function private.assert_open_accounting_period(date) from public;

create or replace function private.audit_accounting_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record_id uuid;
begin
  v_record_id := case when tg_op = 'DELETE' then old.id else new.id end;
  insert into public.accounting_audit_log (table_name, record_id, operation, before_data, after_data, actor_id)
  values (
    tg_table_name,
    v_record_id,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.audit_accounting_change() from public;

create trigger audit_accounting_accounts after insert or update or delete on public.accounting_accounts
for each row execute function private.audit_accounting_change();
create trigger audit_accounting_periods after insert or update or delete on public.accounting_periods
for each row execute function private.audit_accounting_change();
create trigger audit_accounting_entries after insert or update or delete on public.accounting_entries
for each row execute function private.audit_accounting_change();
create trigger audit_accounting_expenses after insert or update or delete on public.accounting_expenses
for each row execute function private.audit_accounting_change();
create trigger audit_accounting_bank after insert or update or delete on public.accounting_bank_transactions
for each row execute function private.audit_accounting_change();

create or replace function private.protect_accounting_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'accounting_expenses' then
    perform private.assert_open_accounting_period(case when tg_op = 'DELETE' then old.invoice_date else new.invoice_date end);
    if old.status = 'posted' then
      raise exception 'Een geboekte kostenregel kan niet worden gewijzigd of verwijderd. Maak een correctieboeking.' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and old.status = 'draft' and new.status = 'posted'
      and coalesce(current_setting('app.accounting_posting', true), '') <> 'on' then
      raise exception 'Boek kosten via de gecontroleerde boekingsactie.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'accounting_bank_transactions' then
    perform private.assert_open_accounting_period(case when tg_op = 'DELETE' then old.booked_on else new.booked_on end);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.protect_accounting_records() from public;

create trigger protect_accounting_expenses before update or delete on public.accounting_expenses
for each row execute function private.protect_accounting_records();
create trigger protect_accounting_bank before update or delete on public.accounting_bank_transactions
for each row execute function private.protect_accounting_records();

create or replace function private.create_accounting_entry(
  p_entry_date date,
  p_journal text,
  p_reference text,
  p_description text,
  p_source_type text,
  p_source_id uuid,
  p_source_revision text,
  p_metadata jsonb,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_line jsonb;
  v_debit bigint := 0;
  v_credit bigint := 0;
  v_account_id uuid;
  v_debit_line bigint;
  v_credit_line bigint;
  v_active_lines integer := 0;
begin
  if not private.is_admin(array['owner', 'admin']) then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;
  perform private.assert_open_accounting_period(p_entry_date);
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'Een boeking heeft minimaal twee regels nodig.' using errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_debit_line := greatest(coalesce((v_line ->> 'debit_cents')::bigint, 0), 0);
    v_credit_line := greatest(coalesce((v_line ->> 'credit_cents')::bigint, 0), 0);
    if v_debit_line = 0 and v_credit_line = 0 then
      continue;
    end if;
    if v_debit_line > 0 and v_credit_line > 0 then
      raise exception 'Elke boekingsregel moet debet of credit zijn.' using errcode = '22023';
    end if;
    v_active_lines := v_active_lines + 1;
    v_debit := v_debit + v_debit_line;
    v_credit := v_credit + v_credit_line;
  end loop;
  if v_active_lines < 2 or v_debit <= 0 or v_debit <> v_credit then
    raise exception 'Debet en credit zijn niet in balans.' using errcode = '23514';
  end if;

  insert into public.accounting_entries (
    entry_date, journal, reference, description, source_type, source_id,
    source_revision, metadata, created_by
  ) values (
    p_entry_date, p_journal, coalesce(p_reference, ''), p_description,
    p_source_type, p_source_id, coalesce(p_source_revision, '1'),
    coalesce(p_metadata, '{}'::jsonb), auth.uid()
  )
  on conflict (source_type, source_id, source_revision) do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    select id into v_entry_id from public.accounting_entries
    where source_type is not distinct from p_source_type
      and source_id is not distinct from p_source_id
      and source_revision = coalesce(p_source_revision, '1');
    return v_entry_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_debit_line := greatest(coalesce((v_line ->> 'debit_cents')::bigint, 0), 0);
    v_credit_line := greatest(coalesce((v_line ->> 'credit_cents')::bigint, 0), 0);
    if v_debit_line = 0 and v_credit_line = 0 then continue; end if;
    select id into v_account_id from public.accounting_accounts where code = v_line ->> 'account_code' and active = true;
    if v_account_id is null then
      raise exception 'Onbekende of inactieve grootboekrekening: %', v_line ->> 'account_code' using errcode = '23503';
    end if;
    insert into public.accounting_lines (
      entry_id, account_id, description, debit_cents, credit_cents, vat_rate
    ) values (
      v_entry_id,
      v_account_id,
      coalesce(v_line ->> 'description', ''),
      v_debit_line,
      v_credit_line,
      coalesce((v_line ->> 'vat_rate')::numeric, 0)
    );
  end loop;

  return v_entry_id;
end;
$$;

revoke all on function private.create_accounting_entry(date, text, text, text, text, uuid, text, jsonb, jsonb) from public;
grant execute on function private.create_accounting_entry(date, text, text, text, text, uuid, text, jsonb, jsonb) to authenticated, service_role;

create or replace function private.post_accounting_expense(p_expense_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.accounting_expenses;
  v_entry_id uuid;
  v_lines jsonb;
begin
  if not private.is_admin(array['owner', 'admin']) then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;
  select * into v_expense from public.accounting_expenses where id = p_expense_id for update;
  if not found then raise exception 'Kostenregel niet gevonden.' using errcode = 'P0002'; end if;
  if v_expense.status = 'posted' then return v_expense.entry_id; end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_expense.category_account_code, 'description', v_expense.description, 'debit_cents', v_expense.amount_excluding_vat_cents, 'credit_cents', 0, 'vat_rate', v_expense.vat_rate),
    jsonb_build_object('account_code', '1800', 'description', 'Voorbelasting ' || v_expense.supplier, 'debit_cents', v_expense.vat_cents, 'credit_cents', 0, 'vat_rate', v_expense.vat_rate),
    jsonb_build_object('account_code', '1600', 'description', v_expense.supplier, 'debit_cents', 0, 'credit_cents', v_expense.total_cents, 'vat_rate', 0)
  );

  v_entry_id := private.create_accounting_entry(
    v_expense.invoice_date, 'purchases', v_expense.invoice_number,
    v_expense.supplier || case when v_expense.description = '' then '' else ' — ' || v_expense.description end,
    'expense', v_expense.id, '1', jsonb_build_object('vat_cents', v_expense.vat_cents), v_lines
  );

  perform set_config('app.accounting_posting', 'on', true);
  update public.accounting_expenses set status = 'posted', entry_id = v_entry_id where id = v_expense.id;
  insert into public.accounting_audit_log (table_name, record_id, operation, after_data, actor_id)
  values ('accounting_expenses', v_expense.id, 'POST', jsonb_build_object('entry_id', v_entry_id), auth.uid());
  return v_entry_id;
end;
$$;

revoke all on function private.post_accounting_expense(uuid) from public;
grant execute on function private.post_accounting_expense(uuid) to authenticated, service_role;

create or replace function public.post_accounting_expense(p_expense_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.post_accounting_expense(p_expense_id); $$;

revoke all on function public.post_accounting_expense(uuid) from public, anon;
grant execute on function public.post_accounting_expense(uuid) to authenticated;

create or replace function private.sync_accounting_sales()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_payment record;
  v_entry_id uuid;
  v_created integer := 0;
  v_refunds integer := 0;
  v_existing_refund bigint;
  v_delta bigint;
  v_delta_ex_vat bigint;
  v_delta_vat bigint;
  v_revision text;
begin
  if not private.is_admin(array['owner', 'admin']) then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;

  for v_order in
    select * from public.orders
    where payment_status in ('paid', 'partially_refunded', 'refunded') and total_cents > 0
    order by created_at
  loop
    if not exists (
      select 1 from public.accounting_entries
      where source_type = 'order_sale' and source_id = v_order.id and source_revision = 'sale'
    ) then
      v_entry_id := private.create_accounting_entry(
        v_order.created_at::date, 'sales', 'ZOL-' || v_order.order_number,
        'Verkoop aan ' || coalesce(nullif(v_order.customer_name, ''), v_order.customer_email),
        'order_sale', v_order.id, 'sale', jsonb_build_object('order_number', v_order.order_number),
        jsonb_build_array(
          jsonb_build_object('account_code', '1300', 'description', 'Factuur ZOL-' || v_order.order_number, 'debit_cents', v_order.total_cents, 'credit_cents', 0, 'vat_rate', 0),
          jsonb_build_object('account_code', '8000', 'description', 'Omzet ZOL-' || v_order.order_number, 'debit_cents', 0, 'credit_cents', v_order.total_cents - v_order.tax_cents, 'vat_rate', 21),
          jsonb_build_object('account_code', '1520', 'description', 'BTW ZOL-' || v_order.order_number, 'debit_cents', 0, 'credit_cents', v_order.tax_cents, 'vat_rate', 21)
        )
      );
      v_created := v_created + 1;
    end if;
  end loop;

  for v_payment in
    select p.*, o.order_number, o.total_cents, o.tax_cents
    from public.payments p join public.orders o on o.id = p.order_id
    where p.refunded_cents > 0
    order by p.created_at
  loop
    select coalesce(sum((metadata ->> 'refund_delta_cents')::bigint), 0)
      into v_existing_refund
    from public.accounting_entries
    where source_type = 'payment_refund' and source_id = v_payment.id;
    v_delta := v_payment.refunded_cents - v_existing_refund;
    if v_delta > 0 then
      v_delta_vat := case when v_payment.total_cents > 0 then round(v_payment.tax_cents::numeric * v_delta / v_payment.total_cents)::bigint else 0 end;
      v_delta_ex_vat := v_delta - v_delta_vat;
      v_revision := v_payment.refunded_cents::text;
      v_entry_id := private.create_accounting_entry(
        coalesce(v_payment.updated_at, v_payment.created_at)::date, 'sales', 'REF-' || v_payment.order_number,
        'Terugbetaling ZOL-' || v_payment.order_number,
        'payment_refund', v_payment.id, v_revision,
        jsonb_build_object('refund_delta_cents', v_delta, 'refund_total_cents', v_payment.refunded_cents),
        jsonb_build_array(
          jsonb_build_object('account_code', '8000', 'description', 'Omzetcorrectie', 'debit_cents', v_delta_ex_vat, 'credit_cents', 0, 'vat_rate', 21),
          jsonb_build_object('account_code', '1520', 'description', 'BTW-correctie', 'debit_cents', v_delta_vat, 'credit_cents', 0, 'vat_rate', 21),
          jsonb_build_object('account_code', '1300', 'description', 'Terugbetaling', 'debit_cents', 0, 'credit_cents', v_delta, 'vat_rate', 0)
        )
      );
      v_refunds := v_refunds + 1;
    end if;
  end loop;

  return jsonb_build_object('sales_created', v_created, 'refunds_created', v_refunds);
end;
$$;

revoke all on function private.sync_accounting_sales() from public;
grant execute on function private.sync_accounting_sales() to authenticated, service_role;

create or replace function public.sync_accounting_sales()
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.sync_accounting_sales(); $$;

revoke all on function public.sync_accounting_sales() from public, anon;
grant execute on function public.sync_accounting_sales() to authenticated;

create or replace function private.post_accounting_correction(
  p_entry_date date,
  p_reference text,
  p_description text,
  p_debit_code text,
  p_credit_code text,
  p_amount_cents bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin(array['owner', 'admin']) then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;
  if p_amount_cents <= 0 or p_debit_code = p_credit_code or btrim(coalesce(p_description, '')) = '' then
    raise exception 'Vul een geldig bedrag, omschrijving en twee verschillende rekeningen in.' using errcode = '22023';
  end if;
  return private.create_accounting_entry(
    p_entry_date, 'general', coalesce(p_reference, ''), p_description,
    'manual_correction', gen_random_uuid(), '1', '{}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('account_code', p_debit_code, 'description', p_description, 'debit_cents', p_amount_cents, 'credit_cents', 0, 'vat_rate', 0),
      jsonb_build_object('account_code', p_credit_code, 'description', p_description, 'debit_cents', 0, 'credit_cents', p_amount_cents, 'vat_rate', 0)
    )
  );
end;
$$;

revoke all on function private.post_accounting_correction(date, text, text, text, text, bigint) from public;
grant execute on function private.post_accounting_correction(date, text, text, text, text, bigint) to authenticated, service_role;

create or replace function public.post_accounting_correction(
  p_entry_date date,
  p_reference text,
  p_description text,
  p_debit_code text,
  p_credit_code text,
  p_amount_cents bigint
)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.post_accounting_correction(p_entry_date, p_reference, p_description, p_debit_code, p_credit_code, p_amount_cents); $$;

revoke all on function public.post_accounting_correction(date, text, text, text, text, bigint) from public, anon;
grant execute on function public.post_accounting_correction(date, text, text, text, text, bigint) to authenticated;

create or replace function private.set_accounting_period_status(p_period_id uuid, p_status text)
returns public.accounting_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period public.accounting_periods;
begin
  if not private.is_admin(array['owner', 'admin']) then
    raise exception 'Geen toegang.' using errcode = '42501';
  end if;
  if p_status not in ('open', 'closed') then raise exception 'Ongeldige periodestatus.' using errcode = '22023'; end if;
  update public.accounting_periods set
    status = p_status,
    closed_by = case when p_status = 'closed' then auth.uid() else null end,
    closed_at = case when p_status = 'closed' then now() else null end
  where id = p_period_id returning * into v_period;
  if not found then raise exception 'Periode niet gevonden.' using errcode = 'P0002'; end if;
  insert into public.accounting_audit_log (table_name, record_id, operation, after_data, actor_id)
  values ('accounting_periods', p_period_id, case when p_status = 'closed' then 'CLOSE' else 'OPEN' end, to_jsonb(v_period), auth.uid());
  return v_period;
end;
$$;

revoke all on function private.set_accounting_period_status(uuid, text) from public;
grant execute on function private.set_accounting_period_status(uuid, text) to authenticated, service_role;

create or replace function public.set_accounting_period_status(p_period_id uuid, p_status text)
returns public.accounting_periods
language sql
security invoker
set search_path = ''
as $$ select private.set_accounting_period_status(p_period_id, p_status); $$;

revoke all on function public.set_accounting_period_status(uuid, text) from public, anon;
grant execute on function public.set_accounting_period_status(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'accounting-documents', 'accounting-documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

grant select on public.accounting_accounts, public.accounting_periods, public.accounting_entries,
  public.accounting_lines, public.accounting_expenses, public.accounting_bank_transactions,
  public.accounting_audit_log to authenticated;
grant insert, update, delete on public.accounting_expenses, public.accounting_bank_transactions to authenticated;

alter table public.accounting_accounts enable row level security;
alter table public.accounting_periods enable row level security;
alter table public.accounting_entries enable row level security;
alter table public.accounting_lines enable row level security;
alter table public.accounting_expenses enable row level security;
alter table public.accounting_bank_transactions enable row level security;
alter table public.accounting_audit_log enable row level security;

create policy "finance admins read accounts" on public.accounting_accounts for select to authenticated
using ((select private.is_admin(array['owner', 'admin'])));
create policy "finance admins manage accounts" on public.accounting_accounts for all to authenticated
using ((select private.is_admin(array['owner', 'admin']))) with check ((select private.is_admin(array['owner', 'admin'])));
create policy "finance admins read periods" on public.accounting_periods for select to authenticated
using ((select private.is_admin(array['owner', 'admin'])));
create policy "finance admins manage periods" on public.accounting_periods for all to authenticated
using ((select private.is_admin(array['owner', 'admin']))) with check ((select private.is_admin(array['owner', 'admin'])));
create policy "finance admins read entries" on public.accounting_entries for select to authenticated
using ((select private.is_admin(array['owner', 'admin'])));
create policy "finance admins read lines" on public.accounting_lines for select to authenticated
using ((select private.is_admin(array['owner', 'admin'])));
create policy "finance admins read expenses" on public.accounting_expenses for select to authenticated
using ((select private.is_admin(array['owner', 'admin'])));
create policy "finance admins manage expenses" on public.accounting_expenses for all to authenticated
using ((select private.is_admin(array['owner', 'admin']))) with check ((select private.is_admin(array['owner', 'admin'])));
create policy "finance admins read bank" on public.accounting_bank_transactions for select to authenticated
using ((select private.is_admin(array['owner', 'admin'])));
create policy "finance admins manage bank" on public.accounting_bank_transactions for all to authenticated
using ((select private.is_admin(array['owner', 'admin']))) with check ((select private.is_admin(array['owner', 'admin'])));
create policy "finance admins read audit" on public.accounting_audit_log for select to authenticated
using ((select private.is_admin(array['owner', 'admin'])));

create policy "finance admins read documents" on storage.objects for select to authenticated
using (bucket_id = 'accounting-documents' and (select private.is_admin(array['owner', 'admin'])));
create policy "finance admins upload documents" on storage.objects for insert to authenticated
with check (bucket_id = 'accounting-documents' and (select private.is_admin(array['owner', 'admin'])));
create policy "finance admins replace documents" on storage.objects for update to authenticated
using (bucket_id = 'accounting-documents' and (select private.is_admin(array['owner', 'admin'])))
with check (bucket_id = 'accounting-documents' and (select private.is_admin(array['owner', 'admin'])));
create policy "finance admins remove documents" on storage.objects for delete to authenticated
using (bucket_id = 'accounting-documents' and (select private.is_admin(array['owner', 'admin'])));
