-- AVG-toestemming voor onderzoek met SMC Almere, gevraagd bij gebruik van de SMC-kortingscode.
-- De korting geldt ongeacht de keuze: toestemming moet vrij gegeven zijn (AVG art. 7 lid 4).

create table if not exists public.research_consents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  email text not null,
  discount_code text not null default '',
  study text not null default 'smc_almere_sever',
  consent_given boolean not null,
  consent_text_version text not null,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists research_consents_order_id_idx on public.research_consents(order_id);
create index if not exists research_consents_email_idx on public.research_consents(lower(email));

alter table public.research_consents enable row level security;
-- Geen policies: alleen de service role (edge functions) mag lezen/schrijven.

comment on table public.research_consents is
  'Keuze van klanten (ja/nee) om gegevens te laten gebruiken voor onderzoek naar de ziekte van Sever samen met SMC Almere.';
