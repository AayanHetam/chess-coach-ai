-- CI-5: extend the TRK-5 retention purge to cover referee_outcomes.
--
-- The privacy policy promises a 1-year ceiling on EVERY tracking table, and
-- referee_outcomes carries coach prose about user games, so it purges on the
-- same schedule as the rest.
--
-- Why a new migration rather than an edit to 20260613110000_retention_purge.sql:
-- that migration has already been applied to the live tracking project, so an
-- in-place edit would never re-run and the function would keep its old body.
-- `create or replace` here is the only thing that actually changes the live DB.
-- Idempotent, and it re-declares the full function body (the definitive
-- version of purge_old_tracking_rows now lives HERE, not in the TRK-5 file).
--
-- The pg_cron job installed by TRK-5 is name-keyed ('purge-old-tracking-rows')
-- and calls the function by name, so it picks up this body with no rescheduling.

create or replace function purge_old_tracking_rows() returns void
language sql
as $$
  delete from events            where ts < now() - interval '1 year';
  delete from llm_calls         where ts < now() - interval '1 year';
  delete from puzzle_attempts   where ts < now() - interval '1 year';
  delete from analysis_sessions where started_at < now() - interval '1 year';
  delete from referee_outcomes  where ts < now() - interval '1 year';
$$;

comment on function purge_old_tracking_rows is
  'TRK-5 retention (extended CI-5 for referee_outcomes): deletes tracking rows older than 1 year. Scheduled daily via pg_cron when available.';

-- Re-assert the schedule only if it is missing, so a project where TRK-5 ran
-- before pg_cron was enabled gets picked up here. No-op when already scheduled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'purge-old-tracking-rows') then
      perform cron.schedule(
        'purge-old-tracking-rows',
        '0 3 * * *',                         -- daily at 03:00 UTC
        'select purge_old_tracking_rows()'
      );
    end if;
  else
    raise notice 'pg_cron not enabled — purge_old_tracking_rows() replaced but not scheduled. Enable pg_cron, then: select cron.schedule(''purge-old-tracking-rows'', ''0 3 * * *'', ''select purge_old_tracking_rows()'');';
  end if;
end $$;
