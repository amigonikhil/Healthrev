-- Keep raw product events for 12 months (ADMIN.md §10). Runs nightly at 02:15 IST.
create extension if not exists pg_cron;
select cron.schedule(
  'creator-assist-events-retention',
  '45 20 * * *',
  $$ delete from public.events where created_at < now() - interval '12 months' $$
);
