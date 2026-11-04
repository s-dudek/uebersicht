-- Zeitplan: ruft jede Minute die Funktion "send-reminders" auf.
-- ERST ausführen, nachdem die Edge Function angelegt ist.
-- PROJEKT-ID und DEIN_CRON_SECRET ersetzen (fertig ausgefüllt steht es in deiner Datei mit den Schlüsseln).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('send-reminders') where exists (select 1 from cron.job where jobname = 'send-reminders');
select cron.schedule(
  'send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://PROJEKT-ID.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'DEIN_CRON_SECRET'),
    body    := '{}'::jsonb
  );
  $$
);
