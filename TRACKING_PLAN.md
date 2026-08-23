# Tracking & Telemetry Plan — "Track Everything"

> Status: **SHIPPED — the tracking stack is live in production and E2E-verified.**
> Drafted 2026-06-13, plan-first per the Mastermind/CMIP playbook; kept as the design of
> record for the schema and rationale. Where this document and the code disagree, the
> code wins — see [src/lib/tracking/](src/lib/tracking/) and [supabase/migrations/](supabase/migrations/).

## 1. Goal (as scoped with Aayan, 2026-06-13)

Capture **every puzzle, every user, every game, every prompt, every interaction** — and
serve four uses off one foundation:

1. **All-purpose event pipeline** — an append-only firehose every feature writes to.
2. **Coaching quality / eval data** — full prompt→response pairs + outcomes (feeds Mastermind + CMIP).
3. **Growth analytics** — funnels, retention, cohorts, feature adoption (toward the 1M MAU goal).
4. **User-facing progress** — persistent puzzle/game history (feeds the Puzzle Coach SRS plan).

**Decisions locked (2026-06-13):**

- Storage = **Supabase (Postgres)**; LLM capture = **full content, all calls**.
- **Separate Supabase project** from the CMIP intern portal — new env vars `TRACKING_SUPABASE_URL` + `TRACKING_SUPABASE_SERVICE_ROLE_KEY` (distinct from CMIP's `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`). Isolates the high-volume firehose + minors' content from intern eval data.
- **Single `TRACKING_ENABLED` kill switch** gating every write, mirroring `MASTERMIND_VALIDATORS_ENABLED` — instant prod off-switch with no deploy.
- **Build all PRs dev/preview-only; the prod flag flips ONLY after the privacy-policy update + consent banner are live.** No compliance gap, no stalled work.
- **Retention = 1 year** for `events`, `llm_calls`, and `puzzle_attempts` (daily purge job; see §4).
- **Consent-gated tracking.** A cookie-consent banner + neutral age gate gate all behavioral capture; only strictly-necessary cookies (auth session) are exempt. Design in §4.1. Anon-id + client beacons + content capture do **not** fire until consent is recorded. (My call, per Aayan's delegation.)
- **`analysis_sessions` = dedicated table** (not derived). DDL in §3.2.
- **No backfill** — start clean at go-live; existing IndexedDB/Firestore history is not imported.
- **Privacy policy** drafted at [PRIVACY_POLICY_DRAFT.md](PRIVACY_POLICY_DRAFT.md) (needs qualified review — see its header).

## 2. What exists today (audit, 2026-06-13)

| Layer                    | Today                                                  | Gap                                         |
| ------------------------ | ------------------------------------------------------ | ------------------------------------------- |
| Firestore                | users, saved games, chats+messages, scouts, insights   | live app state only — not analytical        |
| GA4 + Firebase Analytics | `page_view`, `analyze_game`, `play_game`, share dialog | **disabled on localhost**; thin; no funnels |
| Vercel Analytics         | web vitals only                                        | no custom events                            |
| Server logs              | structured JSON → console + Sentry breadcrumbs         | ephemeral, not queryable                    |
| `llmStatsAggregator`     | token/latency totals **in-memory**                     | resets every cold start; no content         |
| Supabase                 | CMIP `intern_allowlist`, `intern_flags` only           | no general tracking tables                  |
| IndexedDB                | puzzle/SRS state, client-only                          | never reaches the server                    |

**Not tracked at all:** puzzle attempts, prompt→response pairs (except manual CMIP flags),
interaction journeys, funnels, analysis-session lifecycle, logged-out behavior.

## 3. Architecture

Single foundation, three write surfaces, layered tables.

```
            client interactions                 server actions               every callLLM()
                    │                                  │                            │
            track() + sendBeacon                trackEvent()                 capture hook in
                    │                                  │                       llmProvider.ts
                    ▼                                  ▼                            ▼
              POST /api/track ──────────────►  src/lib/tracking/track.ts  ◄── recordLLMCallFull()
                                                       │
                                          service-role Supabase client
                                          (generalized from intern/supabase.ts)
                                                       │
              ┌────────────────────────────┬──────────┴───────────┬───────────────────────┐
              ▼                            ▼                       ▼                       ▼
          events (firehose)           llm_calls               puzzle_attempts        analysis_sessions
        every interaction          full prompt+response      structured outcomes     game-analysis lifecycle
```

### 3.1 Identity spine

- Signed-in users: reuse the Firestore **`uid`** as a `text` foreign key on every row (same pattern as `intern_flags.intern_uid`, sourced from the `cm_session` JWT). No new identity table.
- Logged-out users: an **`anon_id`** cookie (httpOnly, 1-yr, set by `/api/track` on first hit) so we keep the pre-signup funnel. On sign-in we stamp an `anon_id → uid` stitch event so journeys join across the boundary.
- `is_intern` copied from the session for easy filtering.

### 3.2 Tables (DDL sketch — matches `intern_flags` conventions: `text` uids, `jsonb`, `timestamptz default now()`, `gen_random_uuid()`, RLS enabled / no policies = service-role only)

**`events`** — the firehose. One row per interaction.

```sql
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  ts          timestamptz not null default now(),
  event_name  text not null,            -- 'puzzle.attempt' | 'analysis.started' | 'chat.message' | 'page.view' | 'share.created' | ...
  uid         text,                     -- Firestore uid if signed in
  anon_id     text,                     -- cookie id for logged-out
  session_id  text,                     -- per-tab/session
  is_intern   boolean not null default false,
  surface     text,                     -- route/page that emitted it
  request_id  text,                     -- correlate with llm_calls
  props       jsonb not null default '{}'::jsonb,
  ip_hash     text,                     -- SHA-256(ip + salt), never raw IP
  user_agent  text,
  referrer    text,
  app_version text                      -- git sha / build id
);
create index if not exists events_uid_ts_idx     on events (uid, ts desc);
create index if not exists events_anon_ts_idx     on events (anon_id, ts desc);
create index if not exists events_name_ts_idx     on events (event_name, ts desc);
create index if not exists events_request_idx     on events (request_id);
alter table events enable row level security;
```

**`llm_calls`** — full prompt/response capture. The eval-data goldmine. One row per `callLLM`/`callLLMStream`.

```sql
create table if not exists llm_calls (
  id               uuid primary key default gen_random_uuid(),
  ts               timestamptz not null default now(),
  uid              text,
  anon_id          text,
  is_intern        boolean not null default false,
  request_id       text,                -- joins to events
  feature          text not null,       -- 'enhanced-analysis' | 'chat' | 'puzzle-hint' | 'puzzle-chat' | 'classify-intent' | ...
  tier             text not null,       -- 'flagship' | 'fast'
  provider         text not null,       -- 'anthropic' | 'openai'
  model            text not null,
  prompt_version   text,                -- coachChatPrompt VERSION
  system_prompt    text not null,       -- full system payload
  messages         jsonb not null,      -- LLMMessage[] sent
  response_text    text,                -- full completion (null on error)
  input_tokens     integer,
  output_tokens    integer,
  cache_creation_tokens integer,
  cache_read_tokens     integer,
  elapsed_ms       integer,
  primary_error    jsonb,               -- set when Anthropic→OpenAI fallback fired
  fen              text,                 -- position context if available
  game_pgn         text,
  status           text not null default 'ok' check (status in ('ok','error')),
  error            text
);
create index if not exists llm_calls_uid_ts_idx  on llm_calls (uid, ts desc);
create index if not exists llm_calls_feature_idx  on llm_calls (feature, ts desc);
create index if not exists llm_calls_request_idx  on llm_calls (request_id);
alter table llm_calls enable row level security;
```

**`puzzle_attempts`** — structured outcomes (analytics + user-facing progress; complements, doesn't replace, IndexedDB SRS).

```sql
create table if not exists puzzle_attempts (
  id            uuid primary key default gen_random_uuid(),
  ts            timestamptz not null default now(),
  uid           text,
  anon_id       text,
  puzzle_id     text not null,
  source        text,                   -- dataset / mistake / adaptive / feed
  fen           text,
  themes        text[],
  rating        integer,
  user_moves    jsonb,                  -- moves the user played
  correct       boolean,
  solved_without_hint boolean,
  hints_used    integer not null default 0,
  ms_to_solve   integer,
  attempt_index integer                 -- 1st/2nd/... attempt at this puzzle
);
create index if not exists puzzle_attempts_uid_ts_idx on puzzle_attempts (uid, ts desc);
create index if not exists puzzle_attempts_puzzle_idx  on puzzle_attempts (puzzle_id);
alter table puzzle_attempts enable row level security;
```

**`analysis_sessions`** — game-analysis lifecycle (dedicated table, per decision).

```sql
create table if not exists analysis_sessions (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  uid           text,
  anon_id       text,
  game_pgn      text,
  status        text not null default 'active' check (status in ('active','completed','abandoned')),
  moves_queried integer not null default 0,   -- distinct moves the user asked about
  chat_turns    integer not null default 0,
  request_id    text                          -- joins to events / llm_calls
);
create index if not exists analysis_sessions_uid_idx on analysis_sessions (uid, started_at desc);
alter table analysis_sessions enable row level security;
```

### 3.3 Server emitter — `src/lib/tracking/`

- New `getTrackingSupabase()` client pointing at the **separate** tracking project (`TRACKING_SUPABASE_URL` / `TRACKING_SUPABASE_SERVICE_ROLE_KEY`), modeled on `src/lib/intern/supabase.ts` (lazy + cached, `persistSession: false`, service-role). CMIP's `getInternSupabase()` is left untouched — different project, different keys.
- Every write is gated by `TRACKING_ENABLED` (no-op early-return when unset/`"false"`; remember the `.trim()` gotcha from the Mastermind flag — Vercel appended a `\n`).
- `track.ts`: `trackEvent(evt)` inserts into `events`; `recordLLMCallFull(row)` inserts into `llm_calls`; `recordPuzzleAttempt(row)` inserts into `puzzle_attempts`.
- **Never block or break a user request.** Every write is wrapped in try/catch that swallows and `logger.warn`s on failure. On Vercel serverless, un-awaited promises can be frozen after the response flushes — so use `waitUntil()` (`@vercel/functions`) to let fire-and-forget writes finish. This is a real gotcha and is a first-class requirement, not a nicety.

### 3.4 LLM capture hook (the key insight)

`callLLM()` and `callLLMStream()` are the **single choke point** ([llmProvider.ts:454](src/lib/llmProvider.ts#L454), [:387](src/lib/llmProvider.ts#L387)) — they hold both the full prompt (`opts.system` + `opts.systemSuffix` + `opts.messages`) and the result (`content`). Add an optional `capture` field to `CallLLMOptions`:

```ts
capture?: { uid?: string; anonId?: string; isIntern?: boolean; requestId?: string;
            feature: string; promptVersion?: string; fen?: string; gamePgn?: string };
```

When present, after the result resolves (or on the streaming `done` event / on error) fire `recordLLMCallFull()`. Routes pass `capture` through; the 6 existing `recordLLMCall()` in-memory aggregator calls stay as-is (they're cheap and feed the live dashboard). One hook covers all current + future callsites.

### 3.5 Client emitter — `/api/track` + `src/lib/tracking/client.ts`

- `track(name, props)` batches and flushes via `navigator.sendBeacon` (survives page unload); `/api/track` attaches uid (session cookie), anon_id (cookie), ip_hash, ua, referrer, then inserts into `events`.
- Replaces the localhost-disabled GA-only path and retires the stubbed `src/lib/visitorTracker.ts` (CLAUDE.md flags it as a no-op TODO awaiting a `/api/visits` proxy — this supersedes it).

## 4. Privacy & safety — REQUIRED workstream, not optional

The audience **includes minors** (chess learners). Full content + identity capture raises COPPA (FTC) / GDPR-K / CCPA duties. Baked in from day one:

- **Hash IPs** (`SHA-256(ip + TRACKING_IP_SALT)`) — never store raw IP.
- **Service-role only** — RLS enabled, zero policies (same as `intern_flags`); the browser never reads these tables.
- **Deletion path** — a `purgeUserData(uid)` that deletes from `events` + `llm_calls` + `puzzle_attempts` + `analysis_sessions`, wired into account deletion so a data-removal request is honorable.
- **Retention = 1 year.** Daily purge: Supabase `pg_cron` job running `delete from <t> where ts < now() - interval '1 year'` across all four tables (use `started_at` for `analysis_sessions`). Documented + reversible by changing the interval.
- **Privacy policy** — drafted at [PRIVACY_POLICY_DRAFT.md](PRIVACY_POLICY_DRAFT.md); needs qualified review (esp. COPPA). **Hard gate on the prod `TRACKING_ENABLED` flip.**
- Don't capture secrets into `props`/`system_prompt` (system prompt is app-authored, low risk, but assert no env interpolation leaks).

### 4.1 Consent architecture (cookie banner + age gate)

Tracking is **consent-gated**. Three cookie tiers:

| Tier                    | Examples                                 | Consent needed?                                                     |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| Strictly necessary      | `cm_session` auth JWT                    | No (exempt)                                                         |
| Analytics / product     | `anon_id`, client `track()` beacons, GA4 | **Yes**                                                             |
| AI-conversation capture | `llm_calls` content rows                 | **Yes** (covered by ToS accept for signed-in; gated for logged-out) |

- **Banner** (first visit): Accept all / Reject non-essential / Manage. Choice stored in a `cm_consent` cookie. **Reject** = strictly-necessary only — no `anon_id`, no client beacons, no GA, and logged-out coach content is not retained.
- **The consent decision itself is recorded** server-side (legitimate-interest record of the choice) regardless of outcome.
- **Honor Global Privacy Control** — if the request carries `Sec-GPC: 1`, default analytics/sale-share consent to off.
- **13+ account eligibility gate** at signup. Users who cannot confirm that they are at least 13 may not create an account or use the service. Parental permission does not create an exception, and Chess Masti does not currently operate a verified parental-consent system.
- **CCPA/CPRA** — we do not sell data; include a "Do Not Sell or Share" disclosure + honor GPC as the opt-out signal.

> ⚠️ **Note:** the 13+ eligibility control, policy, and consent design should be reviewed by someone qualified.

## 5. Cost & scale

- At current scale: negligible (well within Supabase Pro).
- The cost driver at scale is `llm_calls` full text. Scaling path (deferred, documented): monthly partitioning, cold-tier archival, or sampling above a volume threshold (always keep flagged/low-rated/error rows). `log()` any future sampling so coverage gaps are never silent.

## 6. Phasing (stacked PRs — CI-gated tsc+vitest; verify locally on the stack tip before shipping)

| PR        | Scope                                                                                                                                                      | Ships                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **TRK-0** | This plan + migrations (`events`, `llm_calls`, `puzzle_attempts`) + generalize Supabase client + privacy/retention doc                                     | schema only, no instrumentation                                           |
| **TRK-1** | `src/lib/tracking/` core: `trackEvent`, `waitUntil` plumbing, `/api/track` endpoint, `anon_id` cookie + unit tests                                         | server + client event ingestion                                           |
| **TRK-2** | LLM full capture: `capture` field on `CallLLMOptions`, hook in `callLLM`/`callLLMStream`, wire enhanced-analysis + chat + puzzle-hint + puzzle-chat        | **eval-data unlock**                                                      |
| **TRK-3** | `puzzle_attempts` + `analysis_sessions` writes (**start clean — no backfill**)                                                                             | user-facing progress foundation                                           |
| **TRK-4** | Client `track()` SDK + sendBeacon, instrument page views / feature opens / shares / clicks, retire `visitorTracker.ts`                                     | full interaction coverage                                                 |
| **TRK-5** | Read side: funnel/retention SQL + admin views, `purgeUserData`, retention `pg_cron`, optional dashboard                                                    | analytics + deletion + 1-yr purge                                         |
| **TRK-6** | **Consent & privacy**: cookie banner (Accept/Reject/Manage), `cm_consent` cookie, 13+ account eligibility gate, GPC handling, ship the privacy-policy page | **gates the prod flag flip; must precede enabling TRK-4 beacons in prod** |

## 7. Open questions — ALL RESOLVED 2026-06-13

- ~~Kill switch~~ → **single `TRACKING_ENABLED`** (§1).
- ~~Supabase project~~ → **separate project** (§1).
- ~~Retention TTLs~~ → **1 year**, daily `pg_cron` purge (§4).
- ~~`anon_id` pre-consent~~ → **consent-gated**; build a cookie banner + 13+ account eligibility gate (§4.1, TRK-6). Approach delegated to + chosen by Claude.
- ~~Privacy-policy owner~~ → **draft authored** at [PRIVACY_POLICY_DRAFT.md](PRIVACY_POLICY_DRAFT.md); needs qualified review.
- ~~`analysis_sessions`~~ → **dedicated table** (§3.2).
- ~~Backfill~~ → **start clean** (TRK-3).

> Status after 2026-06-13: all questions resolved. **Awaiting Aayan + tech-lead sign-off on the plan before TRK-0 code is written.** Two compliance long-poles (privacy-policy review + consent/age-gate design) should get qualified eyes given the youth-facing audience.
