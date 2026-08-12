-- Tracking retention — the mechanism behind the /privacy sentence:
--   "these records are deleted automatically after at most one year."
--
-- THIS FILE CAPTURES WHAT IS ALREADY RUNNING IN PRODUCTION. It is not a new
-- design. The function and schedule below were read back from the live
-- database on 2026-08-12 and reproduced verbatim, so applying this is a NO-OP
-- against current state.
--
-- WHY IT EXISTS AT ALL
-- The job was created by hand in the Supabase dashboard. It works — verified
-- below — but it was not in version control: nobody could confirm it was still
-- scheduled, a project restore would not recreate it, and a reviewer had no way
-- to check the privacy promise against anything in the repo. That was the gap;
-- the job itself was already correct.
--
-- VERIFIED IN PRODUCTION 2026-08-12 (project chess-masti-tracking):
--   cron.job                → jobid 1, 'purge-old-tracking-rows', '0 3 * * *', active
--   cron.job_run_details    → 2 runs, both 'succeeded' (2026-08-11, 2026-08-12)
--   pg_available_extensions → pg_cron 1.6.4 installed
--
-- NOTE ON VALIDATING THIS: tracking only went live in August 2026, so nothing
-- is a year old yet and the job legitimately deletes zero rows on every run.
-- For roughly the next 11 months, "it deleted nothing" is the EXPECTED result
-- and is not evidence either way. The run-status check above is what actually
-- tells you it works.
--
-- SCOPE. This serves the one-year RETENTION promise only. The other promise —
-- "email us and we'll delete your account and saved games within seven days" —
-- covers Firestore, which pg_cron cannot reach; that one is served by
-- scripts/ops/delete-user.ts. Two promises, two mechanisms.
--
-- IDEMPOTENT: safe to apply repeatedly and safe when the job already exists.

create extension if not exists pg_cron;

-- Verbatim from production. Column names differ per table and are not
-- guessable: analysis_sessions uses `started_at`, the other four use `ts`.
create or replace function public.purge_old_tracking_rows()
returns void
language sql
as $function$
  delete from events            where ts < now() - interval '1 year';
  delete from llm_calls         where ts < now() - interval '1 year';
  delete from puzzle_attempts   where ts < now() - interval '1 year';
  delete from analysis_sessions where started_at < now() - interval '1 year';
  delete from referee_outcomes  where ts < now() - interval '1 year';
$function$;

comment on function public.purge_old_tracking_rows() is
  'Deletes tracking rows older than one year. Backs the /privacy retention promise. If a new tracking table with a timestamp is added, add it here AND to UID_TABLES in src/lib/tracking/purge.ts.';

-- Re-schedule under the SAME name production already uses, so this converges
-- rather than adding a second, competing job.
do $$
begin
  perform cron.unschedule('purge-old-tracking-rows');
exception when others then
  null; -- not scheduled yet
end $$;

select cron.schedule(
  'purge-old-tracking-rows',
  '0 3 * * *',
  $$select public.purge_old_tracking_rows();$$
);

-- VERIFY AFTER APPLYING:
--   select jobid, jobname, schedule, active from cron.job
--    where jobname = 'purge-old-tracking-rows';
--   select status, return_message, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname='purge-old-tracking-rows')
--    order by start_time desc limit 5;
