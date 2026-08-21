create index if not exists email_templates_updated_by_idx
on public.email_templates (updated_by)
where updated_by is not null;
