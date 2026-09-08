-- A pain check-in only makes sense after the customer has actually received
-- and used the product. Keep the delay editable in the existing private config.
update public.settings
set value = jsonb_set(value, '{invitation_delay_days_after_delivery}', '7'::jsonb, true)
where key = 'pilot_measurements';

update public.email_templates
set description = 'Eenmalige uitnodiging, zeven dagen nadat een betaalde webshopbestelling als bezorgd is geregistreerd. De vragen starten pas na expliciete toestemming.',
    updated_at = now()
where template_key = 'pain_checkin_invitation';

-- Revoke links that were sent while their linked order was not delivered yet.
-- The pending invitation can be sent again by the corrected scheduler after
-- delivery plus the configured waiting period; send_count preserves the audit.
update public.pilot_consent_invites invite
set status = 'pending',
    token_hash = null,
    token_expires_at = null,
    sent_at = null,
    updated_at = now()
where invite.status = 'sent'
  and exists (
    select 1
    from public.orders orders
    where orders.id = invite.order_id
      and (orders.fulfillment_status <> 'delivered' or orders.delivered_at is null)
  );
