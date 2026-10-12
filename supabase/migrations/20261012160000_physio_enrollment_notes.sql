-- Interne notities per gemailde praktijk (alleen zichtbaar in de admin, nooit in een mail).
alter table public.physio_sequence_enrollments
  add column if not exists notes jsonb not null default '[]'::jsonb;
