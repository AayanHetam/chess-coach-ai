# supabase-tracking/ — the telemetry warehouse (TRK-0)

This is a **second, separate Supabase project** from `../supabase/` (which holds the
CMIP intern portal). Keeping them separate isolates the high-volume event firehose
and consent-gated AI-conversation capture (disclosed on `/privacy`, with an age gate
and retention purge) from intern eval data. Decision + rationale:
[TRACKING_PLAN.md](../TRACKING_PLAN.md) §1.

## Env vars (distinct from CMIP's `SUPABASE_*`)

| Var | Purpose |
|---|---|
| `TRACKING_SUPABASE_URL` | This project's URL |
| `TRACKING_SUPABASE_SERVICE_ROLE_KEY` | Service-role key (bypasses RLS; server-only) |
| `TRACKING_ENABLED` | Master kill switch — every write no-ops unless truthy |
| `TRACKING_IP_SALT` | Salt for the SHA-256 IP hash (raw IPs are never stored) |

Server client: [src/lib/tracking/supabase.ts](../src/lib/tracking/supabase.ts).

## Applying migrations

1. Create the project at supabase.com (org "Chess Masti" → new project, name e.g. `chess-masti-tracking`).
2. Set `TRACKING_SUPABASE_URL` + `TRACKING_SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (dev) / Vercel (prod).
3. Apply the schema, either:
   - **CLI:** `supabase link --project-ref <ref> --workdir supabase-tracking` then
     `supabase db push --workdir supabase-tracking`, or
   - **SQL editor:** paste `migrations/20260613093000_tracking_schema.sql` (it is
     idempotent — `create table if not exists` throughout).

## Tables (schema-only in TRK-0)

`events` (firehose) · `llm_calls` (full prompt+response) · `puzzle_attempts` · `analysis_sessions`.

All have RLS enabled with **no policies** → only the service-role client reads/writes.
No instrumentation writes to them until later TRK PRs; 1-year retention purge lands in TRK-5.
