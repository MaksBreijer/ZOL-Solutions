-- Het uurlijkse fysiocampagne-cronjob kreeg 401 van de functie-gateway (verify_jwt staat aan)
-- omdat er geen Authorization-header werd meegestuurd. De openbare anon-sleutel laat het verzoek
-- door de gateway; de functie controleert daarna zelf het geheime x-zol-marketing-secret.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'zol-physio-campaign-hourly'),
  command := $job$
    select net.http_post(
      url := 'https://hghlthmkpskxiuohrutw.supabase.co/functions/v1/physio-campaign',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnaGx0aG1rcHNreGl1b2hydXR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1Mzg4NjIsImV4cCI6MjEwMjExNDg2Mn0.6k_96OIaQwsu438ToSbtLwQvKKaXGRcMJlkVb5E4EG0',
        'x-zol-marketing-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'zol_marketing_cron_secret'
          order by created_at desc limit 1
        )
      ),
      body := '{"action":"run"}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);
