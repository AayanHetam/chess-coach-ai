-- Intent workstream stage I-1: intent_outcomes — the intent module's shadow
-- telemetry.
--
-- With INTENT_FACTS_ENABLED on, the contract carries `intent` (what each
-- carded move was FOR) but serializeForVerbalizer strips it — the user sees
-- nothing. This table is what makes that shadow measurable: one content-free
-- row per reviewed game, written at CONTRACT BUILD time by
-- src/lib/tracking/intentOutcomes.ts (both serving branches share the build,
-- so this writer cannot repeat the CI-6 per-branch telemetry gap).
--
-- Conventions mirror 20260613093000_tracking_schema.sql exactly:
--   * uuid PK via gen_random_uuid(), `ts timestamptz not null default now()`.
--   * RLS enabled with NO policies => service-role client only.
--   * Idempotent (if not exists) so a re-run is a no-op.
--
-- PRIVACY: aggregate counts and versions ONLY — no SANs, no FENs, no engine
-- lines, no scores, no prose. Consent-gated write (cm_consent=accepted, no
-- Sec-GPC), TRACKING_ENABLED-gated, 1-year retention like every other
-- tracking table (purge function extended below).

create table if not exists intent_outcomes (
  id                  uuid primary key default gen_random_uuid(),
  ts                  timestamptz not null default now(),
  is_intern           boolean not null default false,
  request_id          text,                  -- joins to llm_calls / events / referee_outcomes

  -- Identity of the reviewed generation
  contract_id         text not null,         -- CoachContract.contractId
  correlation_id      text,                  -- route requestId at build time
  contract_version    text,                  -- CONTRACT_VERSION
  intent_fingerprint  text,                  -- digest of INTENT_CALIBRATION at write time
  app_version         text,                  -- git sha / build id

  -- Aggregates. ply_counts = per-ply fact presence {family -> plies};
  -- episode_counts = the same rows collapsed to episodes {family -> episodes}.
  -- Quoting per-ply numbers alone overstates (25 of 34 "surviving mates" were
  -- consecutive plies of ONE lost ending) — store both, query the honest one.
  plies_analysed      integer not null default 0,
  mover_counts        jsonb not null default '{}'::jsonb,   -- {w, b}
  tier_counts         jsonb not null default '{}'::jsonb,   -- {tier0, tier1}
  ply_counts          jsonb not null default '{}'::jsonb,
  episode_counts      jsonb not null default '{}'::jsonb,
  purpose_counts      jsonb not null default '{}'::jsonb,   -- {escape, none, ...}
  quiet_plies         integer not null default 0,

  -- contract.buildMs for the request — the CPU envelope the intent
  -- computation lives inside; the arming flip shows up as a population shift.
  build_ms            integer
);

create index if not exists intent_outcomes_ts_idx       on intent_outcomes (ts desc);
create index if not exists intent_outcomes_contract_idx on intent_outcomes (contract_id);

alter table intent_outcomes enable row level security;

comment on table intent_outcomes is
  'Intent-module shadow telemetry, one content-free row per reviewed game. Aggregate counts only — no game content. episode_counts is the honest number; ply_counts is the raw one. intent_fingerprint names the calibration table in force. Consent-gated write, service-role only, 1-year retention.';

-- Extend the retention purge. Same pattern as the CI-5 extension: the prior
-- migration has already run on the live project, so only a create-or-replace
-- in a NEW migration actually changes the function body. The definitive
-- version of purge_old_tracking_rows now lives HERE.

create or replace function purge_old_tracking_rows() returns void
language sql
as $$
  delete from events            where ts < now() - interval '1 year';
  delete from llm_calls         where ts < now() - interval '1 year';
  delete from puzzle_attempts   where ts < now() - interval '1 year';
  delete from analysis_sessions where started_at < now() - interval '1 year';
  delete from referee_outcomes  where ts < now() - interval '1 year';
  delete from intent_outcomes   where ts < now() - interval '1 year';
$$;

comment on function purge_old_tracking_rows is
  'TRK-5 retention (extended CI-5 for referee_outcomes, I-1 for intent_outcomes): deletes tracking rows older than 1 year. Scheduled daily via pg_cron when available.';

-- Re-assert the schedule only if missing (no-op when already scheduled).
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
