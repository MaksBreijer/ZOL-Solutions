alter table public.physio_campaign_recipients
  add column if not exists contact_person text not null default '',
  add column if not exists personal_opening text not null default '';
