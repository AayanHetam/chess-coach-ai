-- Tracking retention — the mechanism behind the /privacy sentence:
--   "these records are deleted automatically after at most one year."
--
-- WHY THIS FILE EXISTS
-- The retention job was scheduled by hand in the Supabase dashboard. That
-- worked, but it was not in version control: nobody could verify it was still
-- scheduled, a project restore would not recreate it, and a reviewer had no way
-- to check the promise against the code. This declares the intended state, so
-- applying it converges whatever is currently scheduled onto this definition.
--
-- IDEMPOTENT. Safe to run repeatedly, and safe to run when a job of this name
-- already exists — it is unscheduled first.
--
-- SCOPE. This is the RETENTION promise only ("deleted after at most one year").
-- The other promise — "email us and we'll delete your account and saved games
-- within seven days" — covers Firestore, which pg_cron cannot reach. That one
-- is served by scripts/ops/delete-user.ts. Two promises, two mechanisms.

create extension if not exists pg_cron;

-- Column names differ per table and are NOT guessable — they were read from the
-- live schema, not assumed. `analysis_sessions` uses `started_at`; everything
-- else uses `ts`. Getting this wrong silently deletes nothing (unknown column
-- would error) or, worse, the wrong rows.
create or replace function public.purge_expired_tracking(retain_days int default 365)
returns table (table_name text, deleted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := now() - make_interval(days => retain_days);
  n bigint;
begin
  delete from public.events where ts < cutoff;
  get diagnostics n = row_count; table_name := 'events'; deleted := n; return next;

  delete from public.llm_calls where ts < cutoff;
  get diagnostics n = row_count; table_name := 'llm_calls'; deleted := n; return next;

  delete from public.puzzle_attempts where ts < cutoff;
  get diagnostics n = row_count; table_name := 'puzzle_attempts'; deleted := n; return next;

  delete from public.referee_outcomes where ts < cutoff;
  get diagnostics n = row_count; table_name := 'referee_outcomes'; deleted := n; return next;

  -- Different column on purpose — see the note above.
  delete from public.analysis_sessions where started_at < cutoff;
  get diagnostics n = row_count; table_name := 'analysis_sessions'; deleted := n; return next;
end;
$$;

comment on function public.purge_expired_tracking(int) is
  'Deletes tracking rows older than retain_days (default 365). Backs the /privacy one-year retention promise. Run manually to test: select * from public.purge_expired_tracking();';

-- Replace any existing schedule of the same name so this file is the source of
-- truth rather than one of two competing definitions.
do $$
begin
  perform cron.unschedule('purge-expired-tracking');
exception when others then
  null; -- not scheduled yet
end $$;

-- 03:30 UTC daily — off-peak, and well inside a one-year window.
select cron.schedule(
  'purge-expired-tracking',
  '30 3 * * *',
  $$select public.purge_expired_tracking(365);$$
);

-- VERIFY AFTER APPLYING:
--   select jobid, jobname, schedule, active, command from cron.job
--    where jobname = 'purge-expired-tracking';
--   select * from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname='purge-expired-tracking')
--    order by start_time desc limit 5;
--
-- DRY-CHECK WITHOUT DELETING (how many rows WOULD go today):
--   select count(*) from public.events where ts < now() - interval '365 days';
