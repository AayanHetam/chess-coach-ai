-- TRK-0: tracking / telemetry warehouse schema.
--
-- Lives in a SEPARATE Supabase project from the CMIP portal (supabase/). This
-- project holds the "track everything" firehose + full AI-conversation capture.
-- See TRACKING_PLAN.md for the full design, privacy posture, and phasing.
--
-- Conventions mirror supabase/migrations/20260517190000_intern_flags.sql:
--   * Firestore user uid is a plain `text` column (not an FK to a users table —
--     the user store is Firestore, sourced from the cm_session JWT).
--   * RLS enabled with NO policies on every table => only the service_role
--     client (src/lib/tracking/supabase.ts) can read/write. The browser never
--     touches these tables.
--   * `timestamptz not null default now()`, `gen_random_uuid()` for ids.
--   * IPs are NEVER stored raw — only `ip_hash` = SHA-256(ip + TRACKING_IP_SALT),
--     computed server-side before insert.
--
-- This migration is schema-only: no instrumentation writes to these tables
-- until later TRK PRs wire the emitters, and all writes are gated by the
-- TRACKING_ENABLED flag. Retention (1-year pg_cron purge) lands in TRK-5.

-- ── events: the firehose. One row per interaction. ──────────────────────────
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  ts          timestamptz not null default now(),
  event_name  text not null,            -- 'puzzle.attempt' | 'analysis.started' | 'chat.message' | 'page.view' | 'share.created' | 'consent.set' | ...
  uid         text,                     -- Firestore uid if signed in
  anon_id     text,                     -- cookie id for logged-out users
  session_id  text,                     -- per-tab/session id
  is_intern   boolean not null default false,
  surface     text,                     -- route/page that emitted it
  request_id  text,                     -- correlate with llm_calls / analysis_sessions
  props       jsonb not null default '{}'::jsonb,
  ip_hash     text,                     -- SHA-256(ip + salt); never raw IP
  user_agent  text,
  referrer    text,
  app_version text                      -- git sha / build id
);
create index if not exists events_uid_ts_idx   on events (uid, ts desc);
create index if not exists events_anon_ts_idx   on events (anon_id, ts desc);
create index if not exists events_name_ts_idx   on events (event_name, ts desc);
create index if not exists events_request_idx   on events (request_id);
alter table events enable row level security;
comment on table events is
  'TRK-0 firehose: one row per user/system interaction. Generic props jsonb so new event types need no migration. Service-role only (RLS, no policies).';

-- ── llm_calls: full prompt + response capture. The eval-data goldmine. ──────
create table if not exists llm_calls (
  id                    uuid primary key default gen_random_uuid(),
  ts                    timestamptz not null default now(),
  uid                   text,
  anon_id               text,
  is_intern             boolean not null default false,
  request_id            text,                -- joins to events / analysis_sessions
  feature               text not null,       -- 'enhanced-analysis' | 'chat' | 'puzzle-hint' | 'puzzle-chat' | 'classify-intent' | ...
  tier                  text not null,       -- 'flagship' | 'fast'
  provider              text not null,       -- 'anthropic' | 'openai'
  model                 text not null,
  prompt_version        text,                -- coachChatPrompt VERSION
  system_prompt         text not null,       -- full system payload sent
  messages              jsonb not null,      -- LLMMessage[] sent
  response_text         text,                -- full completion (null on error)
  input_tokens          integer,
  output_tokens         integer,
  cache_creation_tokens integer,
  cache_read_tokens     integer,
  elapsed_ms            integer,
  primary_error         jsonb,               -- set when Anthropic->OpenAI fallback fired
  fen                   text,                -- position context if available
  game_pgn              text,
  status                text not null default 'ok' check (status in ('ok','error')),
  error                 text
);
create index if not exists llm_calls_uid_ts_idx  on llm_calls (uid, ts desc);
create index if not exists llm_calls_feature_idx  on llm_calls (feature, ts desc);
create index if not exists llm_calls_request_idx  on llm_calls (request_id);
alter table llm_calls enable row level security;
comment on table llm_calls is
  'TRK-0 full prompt+response capture, one row per callLLM/callLLMStream. Feeds Mastermind/CMIP eval. CONTAINS USER CONVERSATION CONTENT incl. minors — service-role only, 1-year retention, purged on account deletion.';

-- ── puzzle_attempts: structured outcomes (analytics + user-facing progress). ─
create table if not exists puzzle_attempts (
  id                  uuid primary key default gen_random_uuid(),
  ts                  timestamptz not null default now(),
  uid                 text,
  anon_id             text,
  puzzle_id           text not null,
  source              text,                  -- dataset | mistake | adaptive | feed
  fen                 text,
  themes              text[],
  rating              integer,
  user_moves          jsonb,                 -- moves the user played
  correct             boolean,
  solved_without_hint boolean,
  hints_used          integer not null default 0,
  ms_to_solve         integer,
  attempt_index       integer                -- 1st/2nd/... attempt at this puzzle
);
create index if not exists puzzle_attempts_uid_ts_idx on puzzle_attempts (uid, ts desc);
create index if not exists puzzle_attempts_puzzle_idx  on puzzle_attempts (puzzle_id);
alter table puzzle_attempts enable row level security;
comment on table puzzle_attempts is
  'TRK-0 structured puzzle outcomes. Complements (does not replace) client IndexedDB SRS state. Service-role only.';

-- ── analysis_sessions: game-analysis lifecycle (dedicated, per decision). ────
create table if not exists analysis_sessions (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  uid           text,
  anon_id       text,
  game_pgn      text,
  status        text not null default 'active' check (status in ('active','completed','abandoned')),
  moves_queried integer not null default 0,  -- distinct moves the user asked about
  chat_turns    integer not null default 0,
  request_id    text                         -- joins to events / llm_calls
);
create index if not exists analysis_sessions_uid_idx on analysis_sessions (uid, started_at desc);
alter table analysis_sessions enable row level security;
comment on table analysis_sessions is
  'TRK-0 game-analysis lifecycle: started/completed/abandoned + move-query/turn counts. Service-role only.';
