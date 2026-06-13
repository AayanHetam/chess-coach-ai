-- TRK-2: per-call context bag on llm_calls.
--
-- A generic jsonb so each feature can attach its own context (puzzleId, stage,
-- contextId, branch, category, ...) without a column per feature. Keeps the
-- typed columns for the fields we query/join on; everything else lands here.

alter table llm_calls add column if not exists props jsonb not null default '{}'::jsonb;

comment on column llm_calls.props is
  'TRK-2 per-call context bag (puzzleId, stage, contextId, branch, ...). Feature-specific; not indexed by default.';
