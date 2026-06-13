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
