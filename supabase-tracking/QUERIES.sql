-- TRK-5: read-side analyst queries for the tracking warehouse.
--
-- Copy/paste into the Supabase SQL editor. These are the starting funnels;
-- a dashboard (Metabase/Grafana/a Next admin page) can wrap them later. All
-- assume the 1-year-retained tables from TRK-0/TRK-2.

-- ── Daily active users (signed-in + anon), last 30 days ──────────────────────
select date_trunc('day', ts) as day,
       count(distinct coalesce(uid, anon_id)) as dau
from events
where ts > now() - interval '30 days'
group by 1 order by 1;

-- ── MAU (rolling 28-day) ─────────────────────────────────────────────────────
select count(distinct coalesce(uid, anon_id)) as mau_28d
from events
where ts > now() - interval '28 days';

-- ── Activation funnel: visited → analyzed a game → solved a puzzle ───────────
with visited as (select distinct coalesce(uid, anon_id) as actor from events),
     analyzed as (select distinct coalesce(uid, anon_id) as actor from events where event_name = 'analysis.started'
                  union select distinct coalesce(uid, anon_id) from analysis_sessions),
     puzzled as (select distinct coalesce(uid, anon_id) as actor from puzzle_attempts)
select (select count(*) from visited)  as visited,
       (select count(*) from analyzed) as analyzed,
       (select count(*) from puzzled)  as solved_a_puzzle;

-- ── Puzzle solve rate + first-try (no-hint) rate ─────────────────────────────
select count(*)                                        as attempts,
       round(avg((correct)::int) * 100, 1)             as solve_pct,
       round(avg((solved_without_hint)::int) * 100, 1) as first_try_no_hint_pct,
       round(avg(hints_used), 2)                       as avg_hints
from puzzle_attempts
where ts > now() - interval '30 days';

-- ── Analysis abandonment rate ────────────────────────────────────────────────
select status, count(*),
       round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
from analysis_sessions
where started_at > now() - interval '30 days'
group by status;

-- ── LLM usage + token volume by feature (cost driver) ────────────────────────
select feature,
       count(*)                              as calls,
       round(avg(elapsed_ms))                as avg_ms,
       sum(input_tokens)                     as input_tokens,
       sum(output_tokens)                    as output_tokens,
       sum(cache_read_tokens)                as cache_read_tokens,
       count(*) filter (where status = 'error') as errors
from llm_calls
where ts > now() - interval '30 days'
group by feature order by calls desc;

-- ── Anthropic→OpenAI fallback rate (provider drift signal) ───────────────────
select count(*) filter (where primary_error is not null) as fallbacks,
       count(*)                                          as total,
       round(100.0 * count(*) filter (where primary_error is not null) / nullif(count(*),0), 2) as fallback_pct
from llm_calls
where ts > now() - interval '7 days';

-- ── Returning-user retention: actors active this week who were also active prior ─
with this_week as (select distinct coalesce(uid, anon_id) a from events where ts > now() - interval '7 days'),
     prior as (select distinct coalesce(uid, anon_id) a from events where ts <= now() - interval '7 days' and ts > now() - interval '35 days')
select (select count(*) from this_week) as active_this_week,
       (select count(*) from this_week t join prior p on t.a = p.a) as returning;


-- ═══════════════════════════════════════════════════════════════════════════
-- CI-5: shadow-referee outcomes (referee_outcomes)
--
-- These three are what the morning report runs. Read them with the arming
-- caveat in mind: `armed_errors` counts fires the CURRENT arming table would
-- have ENFORCED, and `arming_fingerprint` names that table. Always group or
-- filter by arming_fingerprint when a window spans a re-arming, or you are
-- averaging two different measurements.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── HEADLINE: real-traffic fabrication rate ──────────────────────────────────
-- Share of real user reviews with at least one would-be-ENFORCED fire.
-- Denominator is reviews the referee actually graded (matched > 0): a review
-- where no block anchored to its contract was never checked, so counting it
-- as clean would silently deflate the rate.
--
-- TWO EXCLUSIONS THAT MATTER (added CI-6, 2026-08-12):
--
--  1. `uid not like 'claude-verify%'` — live-fire verification fires real
--     reviews through production to prove a writer works. Those rows are
--     genuine referee output but synthetic traffic, and this query is the
--     "what are real users seeing" number. Excluded by convention on the uid
--     prefix; keep using that prefix for any future probe.
--
--  2. `branch` — read the note in refereeOutcomes.ts before mixing branches.
--     'contract-enforced' rows come from the SERVED path, where the referee
--     already ran with the arming table applied, so referee_* and armed_* are
--     equal by construction. Shadow rows ('stream-flagoff', 'stream-flagon-
--     fallback') carry two genuinely different numbers. Averaging the two
--     populations answers no question. Group by branch, or filter to one.
select branch,
       arming_fingerprint,
       count(*)                                            as reviews,
       count(*) filter (where armed_errors > 0)            as reviews_with_error,
       round(100.0 * count(*) filter (where armed_errors > 0)
             / nullif(count(*), 0), 2)                     as fabrication_rate_pct,
       round(avg(armed_errors)::numeric, 3)                as mean_armed_errors_per_review,
       sum(armed_errors)                                   as armed_error_fires,
       sum(armed_warns)                                    as armed_warn_fires
from referee_outcomes
where ts > now() - interval '7 days'
  and matched > 0
  and (uid is null or uid not like 'claude-verify%')
group by branch, arming_fingerprint
order by reviews desc;

-- Same number as a daily trend (single arming table assumed; add
-- arming_fingerprint to the group-by if a re-arming lands mid-window).
select date_trunc('day', ts)                               as day,
       count(*)                                            as reviews,
       round(100.0 * count(*) filter (where armed_errors > 0)
             / nullif(count(*), 0), 2)                     as fabrication_rate_pct
from referee_outcomes
where ts > now() - interval '30 days' and matched > 0
group by 1 order by 1;

-- ── Per-check fire distribution (where the fabrication actually lives) ───────
-- check_counts is {check -> fires}; unroll it. `reviews_touched` is how many
-- distinct reviews the check fired in, which is the number that matters for
-- precision work — one review spraying 6 fires is not 6 bad reviews.
select kv.key                                              as check_name,
       sum(kv.value::int)                                  as fires,
       count(*)                                            as reviews_touched,
       round(100.0 * count(*) / nullif((select count(*) from referee_outcomes
                                        where ts > now() - interval '7 days'
                                          and matched > 0), 0), 2) as pct_of_reviews
from referee_outcomes ro,
     lateral jsonb_each_text(ro.check_counts) kv
where ro.ts > now() - interval '7 days' and ro.matched > 0
group by kv.key
order by fires desc;

-- Same cut by referee category (finer than check — e.g. square_unknown vs
-- san_unknown inside san_whitelist).
select kv.key as category, sum(kv.value::int) as fires, count(*) as reviews_touched
from referee_outcomes ro, lateral jsonb_each_text(ro.category_counts) kv
where ro.ts > now() - interval '7 days' and ro.matched > 0
group by kv.key order by fires desc;

-- ── SPAN SAMPLER for adjudication ────────────────────────────────────────────
-- Span-level review is how every arming decision has been made. This pulls a
-- random sample of ARMED-ERROR spans (the ones that would have been enforced)
-- with the sentence they sit in. Change the `s->>'armed'` filter to 'warn' to
-- adjudicate a candidate before arming it, and set `check_name` to focus on
-- one check.
select ro.ts,
       ro.contract_id,
       ro.request_id,                    -- join to llm_calls for the full prose
       ro.model,
       ro.verbalizer_version,
       s->>'check'          as check_name,
       s->>'category'       as category,
       s->>'severity'       as referee_severity,
       s->>'armed'          as armed,
       s->>'factIdPrefix'   as fact_id,
       s->>'span'           as span,
       s->>'sentence'       as sentence
from referee_outcomes ro,
     lateral jsonb_array_elements(ro.spans) s
where ro.ts > now() - interval '7 days'
  and s->>'armed' = 'error'
  -- and s->>'check' = 'tactical_keyword'
order by random()
limit 50;

-- ── Referee cost + coverage (is the shadow gate healthy?) ────────────────────
-- Unanchored blocks are blind spots: an unmatched or malformed block is prose
-- the referee never graded, so a rising share here means the headline rate is
-- measured over less and less of the traffic.
select count(*)                                            as reviews,
       sum(blocks_seen)                                    as blocks,
       sum(matched)                                        as matched,
       sum(unmatched)                                      as unmatched,
       sum(malformed_headers)                              as malformed,
       round(100.0 * sum(unmatched + malformed_headers)
             / nullif(sum(blocks_seen), 0), 2)             as unanchored_pct,
       max(max_hold_ms)                                    as worst_hold_ms,
       round(avg(p95_hold_ms)::numeric, 2)                 as avg_p95_hold_ms,
       sum(relational_launched)                            as haiku_parses
from referee_outcomes
where ts > now() - interval '7 days';

-- ═════════════════════════════════════════════════════════════════════════════
-- INTENT SHADOW (I-1) — intent_outcomes
-- One content-free row per reviewed game with INTENT_FACTS_ENABLED on.
-- episode_counts is the honest number; ply_counts is the raw one (quoting
-- per-ply counts overstated 34 "surviving mates" that were 7 episodes).
-- Always group by intent_fingerprint before comparing across dates — a
-- calibration retune is a different population.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Is the shadow alive? Rows per day vs refereed reviews ────────────────────
select date_trunc('day', ts) as day,
       count(*)              as intent_rows,
       sum(plies_analysed)   as plies,
       round(avg(build_ms)::numeric, 0) as avg_build_ms
from intent_outcomes
group by 1 order by 1 desc limit 14;

-- ── What does the module SAY on real traffic? Episode mix per family ─────────
select intent_fingerprint,
       count(*)                                                   as reviews,
       sum((episode_counts->>'unaddressedThreat')::int)           as unaddressed,
       sum((episode_counts->>'escape')::int)                      as escapes,
       sum((episode_counts->>'material')::int)                    as material,
       sum((episode_counts->>'mate')::int)                        as mates,
       sum((episode_counts->>'cost')::int)                        as cost,
       sum((episode_counts->>'trap')::int)                        as traps,
       sum((episode_counts->>'prophylaxis')::int)                 as prophylaxis,
       sum(quiet_plies)                                           as quiet_plies
from intent_outcomes
where ts > now() - interval '7 days'
group by 1;

-- ── Per-ply vs per-episode inflation check (the 34-vs-7 lesson, live) ────────
select sum((ply_counts->>'unaddressedThreat')::int)      as unaddressed_plies,
       sum((episode_counts->>'unaddressedThreat')::int)  as unaddressed_episodes
from intent_outcomes
where ts > now() - interval '7 days';

-- ── Purpose distribution — what the moves were FOR ──────────────────────────
select purpose_counts, count(*)
from intent_outcomes
where ts > now() - interval '7 days'
group by 1 order by 2 desc limit 20;

-- ── Tier watch: Tier 1 stays 0 until stage I-2 wires null-move probes ────────
select sum((tier_counts->>'tier0')::int) as tier0_plies,
       sum((tier_counts->>'tier1')::int) as tier1_plies
from intent_outcomes
where ts > now() - interval '7 days';

-- ── Cost envelope: does arming show up in contract build time? ──────────────
select percentile_cont(0.5)  within group (order by build_ms) as p50_ms,
       percentile_cont(0.95) within group (order by build_ms) as p95_ms,
       max(build_ms)                                          as worst_ms
from intent_outcomes
where ts > now() - interval '7 days' and build_ms is not null;
