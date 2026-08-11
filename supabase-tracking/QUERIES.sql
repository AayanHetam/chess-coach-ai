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
select arming_fingerprint,
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
group by arming_fingerprint
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
