-- CMIP-1.B: intern_flags table.
--
-- Captures every "this assistant response was bad" event from a CMIP intern's
-- dogfooding session, with enough context for the data to be exported as a
-- (bad, ideal) pair for downstream Mastermind eval consumption (CMIP-1.D).
--
-- Design decision 2026-05-17: the why_wrong + ideal_response fields are
-- captured at flag time (not later in CMIP-1.C). This raises per-flag friction
-- but raises data quality — the intern writes the ideal response while the
-- bad response is fresh in their mind. CMIP-1.C is now a viewer + quota
-- dashboard rather than an author-from-scratch surface.
--
-- Schema notes:
--   * intern_email -> FK to intern_allowlist.email.
--   * intern_uid: the Firestore user UID, from the cm_session JWT.
--   * chat_session_id: nullable (some chats have no contextId).
--   * flagged_message_tier: nullable (we don't always know which tier
--     produced the flagged message).
--   * flag_category: CHECK-constrained to ('bad','inaccurate','incomplete').
--   * why_wrong: NOT NULL, min 30 chars enforced server-side.
--   * ideal_response: NOT NULL, min 50 chars enforced server-side.
--   * RLS enabled with no policies — only service_role reads/writes.

create table if not exists intern_flags (
  id uuid primary key default gen_random_uuid(),
  intern_email text not null references intern_allowlist(email),
  intern_uid text not null,
  chat_session_id text,
  flagged_message_id text not null,
  flagged_message_content text not null,
  flagged_message_index integer not null,
  flagged_message_tier text,
  prompt_version text not null,
  chat_history jsonb not null,
  game_pgn text,
  fen_at_flag text,
  flag_category text not null check (flag_category in ('bad','inaccurate','incomplete')),
  why_wrong text not null check (length(why_wrong) >= 30),
  ideal_response text not null check (length(ideal_response) >= 50),
  flagged_at timestamptz not null default now()
);

create index if not exists intern_flags_intern_recent_idx
  on intern_flags (intern_email, flagged_at desc);

alter table intern_flags enable row level security;

comment on table intern_flags is
  'CMIP intern flag events. Each row is a captured (chat, game, bad response, why_wrong, ideal_response) tuple captured in one shot at flag time.';
