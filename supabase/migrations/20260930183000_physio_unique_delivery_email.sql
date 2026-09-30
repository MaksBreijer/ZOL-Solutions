-- An address may be queued or sent only once across all physio batches.
-- Failed and skipped rows can be reviewed and retried in a later batch.
create unique index if not exists physio_campaign_one_delivery_per_email_idx
  on public.physio_campaign_recipients (lower(email))
  where status in ('queued', 'sending', 'sent');
