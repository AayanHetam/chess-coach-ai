-- CI-5 Stage A: referee_outcomes — the shadow referee's real-traffic verdicts.
--
-- With CONTRACT_REFEREE_SHADOW on, the deterministic referee grades every real
-- user's coach review and logs what it WOULD have caught. Those log lines live
-- in Vercel's ephemeral stream and cannot be aggregated; this table is where
-- the fabrication-rate measurement actually gets computed from.
--
-- One row per shadow-refereed review (i.e. per streamed game-review response),
-- written by src/lib/tracking/refereeOutcomes.ts. Joins to llm_calls / events
-- on request_id.
--
-- Conventions mirror 20260613093000_tracking_schema.sql exactly:
--   * uuid PK via gen_random_uuid(), `ts timestamptz not null default now()`.
--   * uid / anon_id are plain text (the user store is Firestore).
--   * RLS enabled with NO policies => service-role client only.
--   * Idempotent (if not exists) so a re-run is a no-op.
--
-- PRIVACY: `spans` contains coach-generated prose about the user's game, i.e.
-- AI-conversation content. The writer is gated on TRACKING_ENABLED *and* on
-- per-request consent (cm_consent=accepted, no Sec-GPC). Same 1-year retention
-- as every other tracking table — see 20260811090100_referee_outcomes_retention.sql.

create table if not exists referee_outcomes (
  id                  uuid primary key default gen_random_uuid(),
  ts                  timestamptz not null default now(),
  uid                 text,                  -- Firestore uid if signed in
  anon_id             text,                  -- cookie id for logged-out users
  is_intern           boolean not null default false,
  request_id          text,                  -- joins to llm_calls / events

  -- Identity of the reviewed generation
  contract_id         text not null,         -- CoachContract.contractId
  correlation_id      text,                  -- route requestId at referee time
  branch              text,                  -- 'stream-flagoff' | 'stream-flagon-fallback' | ...
  category            text,                  -- classified request category ('game_review' | ...)
  model               text,                  -- model that produced the prose
  prompt_version      text,                  -- coachChatPrompt VERSION
  verbalizer_version  text,                  -- VERBALIZER_PROMPT_VERSION
  contract_version    text,                  -- CONTRACT_VERSION
  arming_fingerprint  text,                  -- digest of DEFAULT_ARMING_TABLE at write time
  app_version         text,                  -- git sha / build id

  -- Block accounting
  blocks_seen         integer not null default 0,
  matched             integer not null default 0,
  unmatched           integer not null default 0,
  malformed_headers   integer not null default 0,

  -- Fire counts. referee_* = the referee's own severity (shadow truth).
  -- armed_*   = severity under the CURRENT arming table, i.e. how many fires
  --             WOULD have been enforced on the served path.
  referee_errors      integer not null default 0,
  referee_warns       integer not null default 0,
  armed_errors        integer not null default 0,
  armed_warns         integer not null default 0,

  -- {check -> fires} and {category -> fires} for this review.
  check_counts        jsonb not null default '{}'::jsonb,
  category_counts     jsonb not null default '{}'::jsonb,

  -- Cost / behaviour
  max_hold_ms         integer not null default 0,
  p95_hold_ms         integer not null default 0,
  relational_launched integer not null default 0,

  -- Flagged spans for adjudication: [{check, category, severity, armed, span,
  -- sentence, factIdPrefix, wouldPassWidenedWindow?}]. Capped at 40 per review
  -- by the writer.
  spans               jsonb not null default '[]'::jsonb
);

create index if not exists referee_outcomes_ts_idx       on referee_outcomes (ts desc);
create index if not exists referee_outcomes_contract_idx on referee_outcomes (contract_id);

alter table referee_outcomes enable row level security;

comment on table referee_outcomes is
  'CI-5 shadow-referee verdicts, one row per refereed coach review. armed_* = fires that WOULD have been enforced under the arming table named by arming_fingerprint. CONTAINS COACH PROSE ABOUT USER GAMES (spans) — consent-gated write, service-role only, 1-year retention.';
