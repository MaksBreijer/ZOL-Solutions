-- Four low-friction outcome measurements for the ZOL customer pilot.
-- Health-related answers are isolated from commerce records and are never
-- exposed directly to anonymous website visitors.

create table if not exists public.pilot_enrollments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'completed', 'withdrawn')),
  consent_confirmed_at timestamptz not null,
  consent_source text not null check (char_length(consent_source) between 3 and 160),
  enrolled_by uuid references auth.users(id) on delete set null,
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id),
  check (completed_at is null or completed_at >= enrolled_at),
  check (withdrawn_at is null or withdrawn_at >= enrolled_at)
);

create table if not exists public.pilot_invites (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.pilot_enrollments(id) on delete cascade,
  timepoint text not null check (timepoint in ('baseline', 'week1', 'week4', 'week12')),
  sequence integer not null check (sequence between 0 and 3),
  due_at timestamptz not null,
  token_hash text unique check (token_hash is null or char_length(token_hash) = 64),
  token_expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sent', 'started', 'completed', 'expired', 'cancelled')),
  sent_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  send_count integer not null default 0 check (send_count >= 0),
  last_email_message_id uuid references public.email_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, timepoint)
);

create table if not exists public.pilot_responses (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.pilot_invites(id) on delete cascade,
  question_key text not null check (question_key ~ '^[a-z][a-z0-9_]{1,49}$'),
  answer jsonb not null check (jsonb_typeof(answer) in ('string', 'number', 'boolean')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invite_id, question_key)
);

create index if not exists pilot_enrollments_order_id_idx on public.pilot_enrollments (order_id) where order_id is not null;
create index if not exists pilot_enrollments_status_idx on public.pilot_enrollments (status, enrolled_at desc);
create index if not exists pilot_enrollments_enrolled_by_idx on public.pilot_enrollments (enrolled_by) where enrolled_by is not null;
create index if not exists pilot_invites_enrollment_id_idx on public.pilot_invites (enrollment_id, sequence);
create index if not exists pilot_invites_due_idx on public.pilot_invites (status, due_at) where status in ('pending', 'sent', 'started');
create index if not exists pilot_invites_last_email_message_id_idx on public.pilot_invites (last_email_message_id) where last_email_message_id is not null;
create index if not exists pilot_responses_invite_id_idx on public.pilot_responses (invite_id, submitted_at);

drop trigger if exists pilot_enrollments_updated_at on public.pilot_enrollments;
create trigger pilot_enrollments_updated_at before update on public.pilot_enrollments
for each row execute function private.set_updated_at();
drop trigger if exists pilot_invites_updated_at on public.pilot_invites;
create trigger pilot_invites_updated_at before update on public.pilot_invites
for each row execute function private.set_updated_at();
drop trigger if exists pilot_responses_updated_at on public.pilot_responses;
create trigger pilot_responses_updated_at before update on public.pilot_responses
for each row execute function private.set_updated_at();

alter table public.pilot_enrollments enable row level security;
alter table public.pilot_invites enable row level security;
alter table public.pilot_responses enable row level security;

grant select on public.pilot_enrollments, public.pilot_invites, public.pilot_responses to authenticated;
grant select, insert, update, delete on public.pilot_enrollments, public.pilot_invites, public.pilot_responses to service_role;

drop policy if exists "admins read pilot enrollments" on public.pilot_enrollments;
create policy "admins read pilot enrollments" on public.pilot_enrollments
for select to authenticated using ((select private.is_admin()));
drop policy if exists "admins read pilot invites" on public.pilot_invites;
create policy "admins read pilot invites" on public.pilot_invites
for select to authenticated using ((select private.is_admin()));
drop policy if exists "admins read pilot responses" on public.pilot_responses;
create policy "admins read pilot responses" on public.pilot_responses
for select to authenticated using ((select private.is_admin()));

insert into public.settings (key, category, label, value, is_public)
values (
  'pilot_measurements',
  'pilot',
  'Pilotmetingen',
  '{"enabled":false,"test_mode":true,"automatic_sending":false,"allowed_emails":["thijn@zolsolutions.nl","maks@zolsolutions.nl"]}'::jsonb,
  false
)
on conflict (key) do nothing;

alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check check (kind in (
  'contact_notification', 'admin_customer',
  'order_customer', 'order_admin', 'shipping_customer',
  'order_received', 'payment_confirmed', 'order_shipped', 'order_delivered',
  'order_returned', 'order_cancelled', 'refund_confirmed', 'new_order_admin',
  'marketing_product_update', 'pilot_measurement'
));

insert into public.email_templates (
  template_key, name, description, audience, subject_template, eyebrow_template,
  title_template, intro_template, body_template, button_label_template,
  button_url_template, enabled, variables, sort_order
) values
  (
    'pilot_baseline', 'Pilotmeting — start', 'Handmatig bij de start van de pilot.', 'customer',
    'Korte startmeting voor de ZOL’tjes', 'ZOL pilot · start',
    'Hoe is de hielpijn nu?', 'Hoi {{customer_first_name}}, dit duurt ongeveer één minuut.',
    'Klik hieronder direct op de pijnscore die het beste past. Daarna verschijnen nog een paar korte vragen. Je hoeft niet in te loggen.',
    '', '', true, array['customer_first_name','measurement_url'], 100
  ),
  (
    'pilot_week1', 'Pilotmeting — week 1', 'Handmatig zeven dagen na de start.', 'customer',
    'Hoe bevallen de ZOL’tjes na één week?', 'ZOL pilot · week 1',
    'Hoe comfortabel zitten ze?', 'Hoi {{customer_first_name}}, één klik brengt je meteen verder.',
    'Kies hieronder een score. Daarna volgen nog een paar korte vragen. Je hoeft niet in te loggen.',
    '', '', true, array['customer_first_name','measurement_url'], 110
  ),
  (
    'pilot_week4', 'Pilotmeting — week 4', 'Handmatig vier weken na de start.', 'customer',
    'Korte ZOL-check na vier weken', 'ZOL pilot · week 4',
    'Hoe gaat het vergeleken met de start?', 'Hoi {{customer_first_name}}, bedankt dat je weer één minuut helpt.',
    'Klik op het antwoord dat het beste past. Daarna volgen nog een paar korte vragen.',
    '', '', true, array['customer_first_name','measurement_url'], 120
  ),
  (
    'pilot_week12', 'Pilotmeting — week 12', 'Handmatig twaalf weken na de start.', 'customer',
    'Laatste korte ZOL-meting', 'ZOL pilot · week 12',
    'Worden de ZOL’tjes nog gebruikt?', 'Hoi {{customer_first_name}}, dit is de laatste korte meting.',
    'Kies hieronder het antwoord dat het beste past. Daarna ronden we af met een paar korte vragen.',
    '', '', true, array['customer_first_name','measurement_url'], 130
  )
on conflict (template_key) do nothing;
