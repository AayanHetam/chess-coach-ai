-- TRK-5: 1-year retention purge.
--
-- Defines purge_old_tracking_rows() which deletes rows older than 1 year from
-- every tracking table, then schedules it daily via pg_cron IF the extension is
-- enabled. The function is always created, so if pg_cron isn't enabled yet the
-- operator can either enable it + run the cron.schedule below, or call the
-- function from an external scheduler. Idempotent: create-or-replace + a
-- name-keyed cron job.

create or replace function purge_old_tracking_rows() returns void
language sql
as $$
  delete from events            where ts < now() - interval '1 year';
  delete from llm_calls         where ts < now() - interval '1 year';
  delete from puzzle_attempts   where ts < now() - interval '1 year';
  delete from analysis_sessions where started_at < now() - interval '1 year';
$$;

comment on function purge_old_tracking_rows is
  'TRK-5 retention: deletes tracking rows older than 1 year. Scheduled daily via pg_cron when available.';

-- Schedule only if pg_cron is installed; no-op otherwise so the migration never
-- fails on a project where the extension hasn't been enabled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge-old-tracking-rows',
      '0 3 * * *',                         -- daily at 03:00 UTC
      'select purge_old_tracking_rows()'
    );
  else
    raise notice 'pg_cron not enabled — purge_old_tracking_rows() created but not scheduled. Enable pg_cron, then: select cron.schedule(''purge-old-tracking-rows'', ''0 3 * * *'', ''select purge_old_tracking_rows()'');';
  end if;
end $$;
