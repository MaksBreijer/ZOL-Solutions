-- Turn the internal measurement pilot into a consent-based customer pain check-in.
-- Technical table names stay stable so existing test data and reports remain intact.

create table if not exists public.pilot_consent_invites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  token_hash text unique check (token_hash is null or char_length(token_hash) = 64),
  token_expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sent', 'accepted', 'declined', 'expired', 'cancelled')),
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  send_count integer not null default 0 check (send_count >= 0),
  last_email_message_id uuid references public.email_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id)
);

create index if not exists pilot_consent_invites_status_idx
on public.pilot_consent_invites (status, created_at)
where status in ('pending', 'sent');

create index if not exists pilot_consent_invites_order_id_idx
on public.pilot_consent_invites (order_id)
where order_id is not null;

drop trigger if exists pilot_consent_invites_updated_at on public.pilot_consent_invites;
create trigger pilot_consent_invites_updated_at before update on public.pilot_consent_invites
for each row execute function private.set_updated_at();

alter table public.pilot_consent_invites enable row level security;
grant select on public.pilot_consent_invites to authenticated;
grant select, insert, update, delete on public.pilot_consent_invites to service_role;

drop policy if exists "admins read pain questionnaire invitations" on public.pilot_consent_invites;
create policy "admins read pain questionnaire invitations" on public.pilot_consent_invites
for select to authenticated using ((select private.is_admin()));

alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check check (kind in (
  'contact_notification', 'admin_customer',
  'order_customer', 'order_admin', 'shipping_customer',
  'order_received', 'payment_confirmed', 'order_shipped', 'order_delivered',
  'order_returned', 'order_cancelled', 'refund_confirmed', 'new_order_admin',
  'marketing_product_update', 'pilot_measurement', 'pain_checkin_invitation'
));

insert into public.email_templates (
  template_key, name, description, audience, subject_template, eyebrow_template,
  title_template, intro_template, body_template, button_label_template,
  button_url_template, enabled, variables, sort_order
) values (
  'pain_checkin_invitation',
  'Pijnvragenlijst — uitnodiging',
  'Eenmalige uitnodiging voor klanten met een betaalde bestelling. De vragen starten pas na expliciete toestemming.',
  'customer',
  'Hoe gaat het met de hielpijn bij het gebruik van de ZOL’tjes?',
  'ZOL · even horen hoe het gaat',
  'Hoe gaat het nu met de hielpijn?',
  'Hoi {{customer_first_name}}, we horen graag hoe het dragen van de ZOL’tjes in de praktijk gaat.',
  'Met vier korte vragenlijsten verspreid over twaalf weken krijgen we een beter beeld van de hielpijn, het comfort en het meedoen met sport. Deelname is vrijwillig. Omdat de vragen over de gezondheid van je kind gaan, vragen we je eerst om als ouder of verzorger expliciet toestemming te geven. Zonder toestemming slaan we geen antwoorden over de gezondheid op.',
  'Lees meer en geef toestemming',
  '{{consent_url}}',
  true,
  array['customer_first_name','consent_url'],
  95
)
on conflict (template_key) do update set
  name = excluded.name,
  description = excluded.description,
  subject_template = excluded.subject_template,
  eyebrow_template = excluded.eyebrow_template,
  title_template = excluded.title_template,
  intro_template = excluded.intro_template,
  body_template = excluded.body_template,
  button_label_template = excluded.button_label_template,
  button_url_template = excluded.button_url_template,
  enabled = excluded.enabled,
  variables = excluded.variables,
  sort_order = excluded.sort_order;

update public.email_templates set
  name = case template_key
    when 'pilot_baseline' then 'Pijnvragenlijst — 0-meting'
    when 'pilot_week1' then 'Pijnvragenlijst — week 1'
    when 'pilot_week4' then 'Pijnvragenlijst — week 4'
    when 'pilot_week12' then 'Pijnvragenlijst — week 12'
  end,
  description = case template_key
    when 'pilot_baseline' then 'Direct na toestemming: hoe lang bestaat de hielpijn en wat is de pijnscore?'
    when 'pilot_week1' then 'Na zeven dagen: comfort, gebruik, pasvorm en pijnscore.'
    when 'pilot_week4' then 'Na vier weken: verandering, sportdeelname en pijnscore.'
    when 'pilot_week12' then 'Na twaalf weken: gebruik, sportdeelname, resultaat en opmerkingen.'
  end,
  subject_template = case template_key
    when 'pilot_baseline' then 'Hoe gaat het nu met de hielpijn?'
    when 'pilot_week1' then 'Hoe gaat het na één week met de ZOL’tjes?'
    when 'pilot_week4' then 'Hoe gaat het na vier weken met de hielpijn?'
    when 'pilot_week12' then 'Hoe gaat het na twaalf weken met de ZOL’tjes?'
  end,
  eyebrow_template = case template_key
    when 'pilot_baseline' then 'ZOL · 0-meting'
    when 'pilot_week1' then 'ZOL · na 1 week'
    when 'pilot_week4' then 'ZOL · na 4 weken'
    when 'pilot_week12' then 'ZOL · na 12 weken'
  end,
  title_template = case template_key
    when 'pilot_baseline' then 'Hoe is de hielpijn op dit moment?'
    when 'pilot_week1' then 'Hoe bevallen de ZOL’tjes?'
    when 'pilot_week4' then 'Is de hielpijn veranderd?'
    when 'pilot_week12' then 'Hoe gaat het nu met je kind?'
  end,
  intro_template = case template_key
    when 'pilot_baseline' then 'Hoi {{customer_first_name}}, fijn dat je met ons deelt hoe het nu gaat.'
    when 'pilot_week1' then 'Hoi {{customer_first_name}}, we zijn benieuwd hoe de eerste week is verlopen.'
    when 'pilot_week4' then 'Hoi {{customer_first_name}}, we horen graag hoe het na vier weken gaat.'
    when 'pilot_week12' then 'Hoi {{customer_first_name}}, dit is de laatste korte vragenlijst.'
  end,
  body_template = case template_key
    when 'pilot_baseline' then 'Beantwoord hieronder de eerste vraag. Daarna volgen nog enkele korte vragen over de hielpijn en sport. Je hoeft niet in te loggen.'
    when 'pilot_week1' then 'Beantwoord hieronder de eerste vraag. Daarna vragen we kort naar gebruik, pasvorm en hielpijn. Je hoeft niet in te loggen.'
    when 'pilot_week4' then 'Beantwoord hieronder de eerste vraag. Daarna volgen nog twee korte vragen over sport en hielpijn.'
    when 'pilot_week12' then 'Beantwoord hieronder de eerste vraag. Daarna ronden we af met enkele korte vragen over het gebruik, sport en de hielpijn.'
  end
where template_key in ('pilot_baseline', 'pilot_week1', 'pilot_week4', 'pilot_week12');

update public.settings
set label = 'Pijnvragenlijsten',
    value = jsonb_set(
      jsonb_set(value, '{automatic_sending}', coalesce(value->'automatic_sending', 'false'::jsonb), true),
      '{enabled}', coalesce(value->'enabled', 'false'::jsonb), true
    )
where key = 'pilot_measurements';

-- Reuse the existing internal mail secret. The Edge Function independently
-- validates this secret before it can send invitations or due questionnaires.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'zol-pain-checkins-daily';

    perform cron.schedule(
      'zol-pain-checkins-daily',
      '15 8 * * *',
      $cron$
      select net.http_post(
        url := 'https://hghlthmkpskxiuohrutw.supabase.co/functions/v1/pilot-measurement',
        body := '{"action":"send_due"}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-zol-email-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'zol_email_webhook_secret'
            order by created_at desc
            limit 1
          )
        ),
        timeout_milliseconds := 120000
      );
      $cron$
    );
  end if;
end;
$$;
