-- DOZ ONLINE — 0006: scheduled cleanup (pg_cron)
-- Deletes expired rooms (cascade: players/moves/events), stale rate-limit
-- rows and expired admin sessions every 30 minutes.
-- If pg_cron is unavailable in the target environment, lazy cleanup inside
-- RPCs (create_room runs it probabilistically) keeps growth bounded.

create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'doz-cleanup') then
    perform cron.schedule(
      'doz-cleanup',
      '*/30 * * * *',
      $cron$ select public.cleanup_expired_data() $cron$
    );
  end if;
end;
$$;
