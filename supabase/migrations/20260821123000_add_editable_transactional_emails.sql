-- Editable, status-driven transactional e-mails for the ZOL webshop.

create table if not exists public.email_templates (
  template_key text primary key,
  name text not null,
  description text not null default '',
  audience text not null default 'customer' check (audience in ('customer', 'admin')),
  subject_template text not null,
  eyebrow_template text not null default '',
  title_template text not null,
  intro_template text not null default '',
  body_template text not null default '',
  button_label_template text not null default '',
  button_url_template text not null default '',
  enabled boolean not null default true,
  variables text[] not null default '{}',
  sort_order integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists email_templates_updated_at on public.email_templates;
create trigger email_templates_updated_at before update on public.email_templates
for each row execute function private.set_updated_at();

alter table public.email_templates enable row level security;
grant select, insert, update on public.email_templates to authenticated;
grant select, insert, update, delete on public.email_templates to service_role;

drop policy if exists "admins manage email templates" on public.email_templates;
create policy "admins manage email templates" on public.email_templates
for all to authenticated using (private.is_admin()) with check (private.is_admin());

alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check check (kind in (
  'contact_notification', 'admin_customer',
  'order_customer', 'order_admin', 'shipping_customer',
  'order_received', 'payment_confirmed', 'order_shipped', 'order_delivered',
  'order_returned', 'order_cancelled', 'refund_confirmed', 'new_order_admin'
));

insert into public.email_templates (
  template_key, name, description, audience, subject_template, eyebrow_template,
  title_template, intro_template, body_template, button_label_template,
  button_url_template, enabled, variables, sort_order
) values
  (
    'order_received', 'Bestelling ontvangen', 'Direct na het plaatsen van een bestelling.', 'customer',
    'We hebben bestelling #{{order_number}} ontvangen', 'Bestelling #{{order_number}}',
    'Bedankt, {{customer_first_name}}.', 'Je bestelling is goed bij ons binnengekomen.',
    'We houden je per e-mail op de hoogte van de betaling en verzending. Hieronder vind je nog één keer alle bestelgegevens.',
    'Naar ZOL Solutions', '{{website_url}}', true,
    array['customer_first_name','customer_name','order_number','order_id','order_total','website_url'], 10
  ),
  (
    'payment_confirmed', 'Betaling bevestigd', 'Zodra Mollie of een beheerder de betaling bevestigt.', 'customer',
    'Betaling ontvangen voor bestelling #{{order_number}}', 'Betaling ontvangen',
    'Je betaling is gelukt.', 'We gaan je ZOL''tjes klaarmaken voor verzending.',
    'Dank je wel voor je bestelling. Zodra het pakket aan de bezorgdienst is overgedragen, ontvang je automatisch de trackinggegevens.',
    'Naar ZOL Solutions', '{{website_url}}', true,
    array['customer_first_name','order_number','order_total','website_url'], 20
  ),
  (
    'order_shipped', 'Bestelling verzonden', 'Na het toevoegen van tracking en de status Verzonden.', 'customer',
    'Je ZOL-bestelling #{{order_number}} is onderweg', 'Onderweg met {{carrier}}',
    'Je ZOL''tjes zijn onderweg.', 'Je pakket is overgedragen aan {{carrier}}.',
    'Met de trackingcode hieronder kun je de zending volgen. Het kan even duren voordat de bezorgdienst de eerste scan toont.',
    'Volg je bestelling', '{{tracking_url}}', true,
    array['customer_first_name','order_number','carrier','tracking_code','tracking_url'], 30
  ),
  (
    'order_delivered', 'Bezorgd & bedankt', 'Wanneer een bestelling als bezorgd wordt gemarkeerd.', 'customer',
    'Veel plezier met je ZOL''tjes, {{customer_first_name}}', 'Bestelling #{{order_number}} bezorgd',
    'Zachter landen begint nu.', 'Je bestelling is volgens de bezorgstatus afgeleverd.',
    'Bedankt dat je voor ZOL hebt gekozen. Bouw het gebruik rustig op en controleer of de hielkuip stevig en comfortabel aansluit. Heb je een vraag? Antwoord gerust op deze e-mail.',
    'Bekijk gebruik & pasvorm', '{{website_url}}/#gebruik', true,
    array['customer_first_name','order_number','website_url'], 40
  ),
  (
    'order_returned', 'Retour ontvangen', 'Wanneer een beheerder een bestelling als retour verwerkt.', 'customer',
    'Retour geregistreerd voor bestelling #{{order_number}}', 'Retour geregistreerd',
    'We hebben je retour verwerkt.', 'Bestelling #{{order_number}} staat nu als retour geregistreerd.',
    'Een eventuele terugbetaling wordt apart bevestigd zodra die is uitgevoerd. Heb je nog vragen over de retour? Antwoord dan op deze e-mail.',
    'Contact opnemen', '{{website_url}}/#contact', true,
    array['customer_first_name','order_number','website_url'], 50
  ),
  (
    'order_cancelled', 'Bestelling geannuleerd', 'Wanneer de bestelstatus naar Geannuleerd verandert.', 'customer',
    'Bestelling #{{order_number}} is geannuleerd', 'Bestelling geannuleerd',
    'Je bestelling is geannuleerd.', 'Bestelling #{{order_number}} wordt niet verder verwerkt.',
    'Was er al betaald? Dan ontvang je een aparte bevestiging zodra de terugbetaling is uitgevoerd. Neem bij twijfel gerust contact met ons op.',
    'Contact opnemen', '{{website_url}}/#contact', true,
    array['customer_first_name','order_number','website_url'], 60
  ),
  (
    'refund_confirmed', 'Terugbetaling bevestigd', 'Na een volledige of gedeeltelijke terugbetaling.', 'customer',
    'Terugbetaling voor bestelling #{{order_number}}', 'Terugbetaling verwerkt',
    '{{refund_amount}} is terugbetaald.', 'De terugbetaling voor bestelling #{{order_number}} is verwerkt.',
    'Het bedrag wordt teruggestort via de oorspronkelijke betaalmethode. Afhankelijk van je bank kan het enkele werkdagen duren voordat dit zichtbaar is.',
    'Contact opnemen', '{{website_url}}/#contact', true,
    array['customer_first_name','order_number','refund_amount','refunded_total','website_url'], 70
  ),
  (
    'new_order_admin', 'Nieuwe bestelling — intern', 'Interne melding zodra een bestelling binnenkomt.', 'admin',
    'Nieuwe bestelling #{{order_number}} — {{order_total}}', 'Nieuwe webshopbestelling',
    'Bestelling #{{order_number}}', '{{customer_name}} heeft een bestelling geplaatst.',
    'Controleer de betaling, voorraad en adresgegevens in ZOL Admin. De klant heeft direct een ontvangstbevestiging gekregen wanneer e-mailverzending actief is.',
    'Open in ZOL Admin', '{{admin_url}}/#orders', true,
    array['customer_name','customer_email','order_number','order_total','admin_url'], 80
  )
on conflict (template_key) do nothing;

update public.settings
set value = value || jsonb_build_object(
  'logo_url', coalesce(nullif(value->>'logo_url', ''), 'https://zol-solutions.pages.dev/media/zol-logo.png'),
  'admin_url', coalesce(nullif(value->>'admin_url', ''), 'https://zol-solutions.pages.dev/admin/')
)
where key = 'email_config';

create or replace function private.enqueue_order_email(p_order_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'zol_email_webhook_secret'
  order by created_at desc
  limit 1;

  if v_secret is not null then
    perform net.http_post(
      url := 'https://hghlthmkpskxiuohrutw.supabase.co/functions/v1/order-email',
      body := jsonb_build_object('order_id', p_order_id, 'action', p_action),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-zol-email-secret', v_secret),
      timeout_milliseconds := 8000
    );
  end if;
end;
$$;

revoke all on function private.enqueue_order_email(uuid, text) from public;

create or replace function private.notify_created_order_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_order_email(new.id, 'created');
  return new;
end;
$$;

create or replace function private.notify_order_status_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    perform private.enqueue_order_email(new.id, 'paid');
  elsif new.payment_status in ('partially_refunded', 'refunded') and old.payment_status is distinct from new.payment_status then
    perform private.enqueue_order_email(new.id, 'refunded');
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform private.enqueue_order_email(new.id, 'cancelled');
  end if;

  if new.fulfillment_status = 'shipped' and old.fulfillment_status is distinct from 'shipped' and new.tracking_code <> '' then
    perform private.enqueue_order_email(new.id, 'shipping');
  elsif new.fulfillment_status = 'delivered' and old.fulfillment_status is distinct from 'delivered' then
    perform private.enqueue_order_email(new.id, 'delivered');
  elsif new.fulfillment_status = 'returned' and old.fulfillment_status is distinct from 'returned' then
    perform private.enqueue_order_email(new.id, 'returned');
  end if;
  return new;
end;
$$;

revoke all on function private.notify_created_order_emails() from public;
revoke all on function private.notify_order_status_emails() from public;

drop trigger if exists notify_paid_order_email on public.orders;
drop trigger if exists notify_created_order_emails on public.orders;
drop trigger if exists notify_order_status_emails on public.orders;

create trigger notify_created_order_emails
after insert on public.orders
for each row execute function private.notify_created_order_emails();

create trigger notify_order_status_emails
after update of status, payment_status, fulfillment_status, tracking_code on public.orders
for each row execute function private.notify_order_status_emails();
