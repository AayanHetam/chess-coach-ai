# Production telemetry audit — chat-coaching path for CMIP comparison

**Date:** 2026-05-24 (Stage C Follow-up B closeout)
**Purpose:** determine whether pipeline telemetry from CMIP-tester traffic on `/api/chat` will be queryable in a form that can be compared against the synthetic-sweep baseline at month-end.

**TL;DR — surfaced as separate top-level finding before the question-by-question audit:**

**(A) Production does not run the pipeline at all today.** `MASTERMIND_VALIDATORS_ENABLED` is set in Preview only. Production chat-route traffic flows through the flag-off branch — no validators, no retries, no telemetry emission. CMIP testers hitting prod produce zero pipeline events regardless of any downstream collection infrastructure.

**(B) Even if the flag flipped, prod telemetry has nowhere queryable to go.** Log Drain is unconfigured. Sentry DSN is unset in every environment. All structured logs land in Vercel runtime logs (Hobby/Pro default retention: 1–24h) with no aggregation or query layer.

**Both must be addressed before CMIP can yield queryable end-of-month data.** Concrete options below in the Recommended Action section.

---

## (1) Production flag state

**`MASTERMIND_VALIDATORS_ENABLED` is set in Preview only. NOT set in Production.**

Verified via `npx vercel env ls production` (run 2026-05-24): the flag appears with `environments: Preview` only. `LOG_LEVEL` is also Preview-only. Production receives no value for either.

When the flag is undefined, `getMastermindEnv` at [`src/lib/mastermind/getMastermindEnv.ts:100`](../src/lib/mastermind/getMastermindEnv.ts#L100) reads `process.env.MASTERMIND_VALIDATORS_ENABLED` and parses to `validatorsEnabled: false`. The chat route at [`src/app/api/chat/route.ts:117`](../src/app/api/chat/route.ts#L117) gates the entire flag-on wing on this:
```typescript
if (validatorsEnabled) {
  // ... whole pipeline branch ...
}
```
When false: control falls through to the legacy `callLLM` path at [`src/app/api/chat/route.ts:222`](../src/app/api/chat/route.ts#L222). No `prepareMastermindContext`, no `runValidationPipeline`, no `forwardPipelineTelemetryForRoute`. **Zero telemetry events emitted on prod chat turns.**

---

## (2) Telemetry emission sites

**Single emission path: `forwardTelemetry` → `log.info/warn/error` → `console.log/warn/error`. No direct Sentry calls, no direct database writes, no custom HTTP endpoints.**

Walk:

1. Route calls `forwardPipelineTelemetryForRoute` at [`src/lib/mastermind/routeHelpers.ts:272-306`](../src/lib/mastermind/routeHelpers.ts#L272-L306) (callsites: [enhanced-analysis:1860](../src/app/api/enhanced-analysis/route.ts#L1860), [chat:189-197](../src/app/api/chat/route.ts#L189-L197)).
2. That builds a `RouteContext` and calls `forwardTelemetry` at [`src/lib/mastermind/validatorTelemetry.ts:117-128`](../src/lib/mastermind/validatorTelemetry.ts#L117-L128), which iterates events and calls `emitValidatorEvent` per event plus optionally `emitCitationRateSummary`.
3. `emitValidatorEvent` at [`src/lib/mastermind/validatorTelemetry.ts:134-163`](../src/lib/mastermind/validatorTelemetry.ts#L134-L163) builds a structured payload, then dispatches by `fire_reason` severity:
   - `fallback_used` → `log.error("mastermind validator fallback", payload)`
   - WARNING_FIRE_REASONS (qualitative_band_flip, numeric_diff_exceeds_threshold, unsupported_citation, regenerate_invoked) → `log.warn("mastermind validator fired", payload)`
   - Everything else (passed, parser_*, no_stockfish_eval) → `log.info("mastermind validator event", payload)`
4. `log.info/warn/error` resolves to [`src/lib/logging/logger.ts:65-108`](../src/lib/logging/logger.ts#L65-L108). In production (`NODE_ENV === "production"`, [line 15](../src/lib/logging/logger.ts#L15)), the entry is `JSON.stringify`'d and written via `console.log` / `console.warn` / `console.error` (lines 80-89).

**No other emission sites.** Specifically searched for: `addLogBreadcrumb` (not called from the logger — defined at [`src/lib/logging/sentryIntegration.ts:19-35`](../src/lib/logging/sentryIntegration.ts#L19-L35) but never invoked from `logger.ts`), `Sentry.captureMessage` / `Sentry.addBreadcrumb` (not used in mastermind telemetry code), `fetch` to any custom endpoint (none in telemetry path), Firestore writes (none in telemetry path).

The comment at [`validatorTelemetry.ts:19`](../src/lib/mastermind/validatorTelemetry.ts#L19) references "Drain in prod, colored to console in dev" — this anticipates a Log Drain that is **not currently configured** (see question 3). The telemetry events still emit, but their destination is Vercel's default runtime log stream.

---

## (3) Log Drain configuration

**No log drain configured anywhere visible in the repo or Vercel project resources.**

Checked:
- [`vercel.json`](../vercel.json) — 23 lines covering buildCommand, framework, function maxDuration, env injection, and crons (`/api/keep-maia-alive` daily). **No drain or integration block.**
- Repo grep for `drain`, `log_drain`, `datadog`, `axiom`, `logtail`, `better-stack`, `papertrail` across `src/`, `scripts/`, `MASTERMIND_CONTEXT/`, `*.json`, `*.config.*` — only matches are the aspirational `// Drain in prod` comment in `validatorTelemetry.ts:19` and the `Drop-in replacement` planning comment in `sentryIntegration.ts:8`.
- `npx vercel integration list` — returned "No resources found." (Vercel Log Drains created via the dashboard typically also appear here; absence is consistent with no drain configured.)

**Production logs go only to Vercel's built-in runtime log stream.** Default retention by tier:
- Hobby: ~1 hour of streaming logs in the dashboard
- Pro: 24 hours
- Enterprise: configurable

Vercel project tier is not visible from `npx vercel ls` output. Project belongs to `aayan-hs-projects` — assuming Pro tier or below based on no enterprise-specific configuration visible. **Effective retention: 1–24 hours, not queryable beyond the dashboard's tail-and-filter UI.**

---

## (4) Sentry integration

**Sentry is wired in code but `NEXT_PUBLIC_SENTRY_DSN` is NOT set in any environment per `vercel env ls`.**

Wired in code:
- [`sentry.client.config.ts`](../sentry.client.config.ts) — client-side init, gated on `process.env.NEXT_PUBLIC_SENTRY_DSN && document.location.hostname !== "localhost"` (lines 3-6).
- [`src/lib/sentry.ts`](../src/lib/sentry.ts) — `logErrorToSentry(error, context)` wrapping `Sentry.captureException`. Used at 6 callsites (CMIP internship apply actions, ErrorBoundary, Lichess fetch wrapper).
- [`src/lib/logging/sentryIntegration.ts`](../src/lib/logging/sentryIntegration.ts) — newer "drop-in replacement" with `addLogBreadcrumb` and request-context-aware `logErrorToSentry`. Exported via [`src/lib/logging/index.ts:9-13`](../src/lib/logging/index.ts#L9-L13). **`addLogBreadcrumb` is not called from anywhere — grep confirms zero call sites across `src/`.** The logger does not wire it.

Sentry env state (verified via `npx vercel env ls` filtering for SENTRY): **zero matches.** `NEXT_PUBLIC_SENTRY_DSN` is unset in Development, Preview, and Production. `isSentryEnabled()` at [`src/lib/sentry.ts:3-4`](../src/lib/sentry.ts#L3-L4) — `!!process.env.NEXT_PUBLIC_SENTRY_DSN && Sentry.isInitialized()` — returns **false everywhere.** `logErrorToSentry` calls fall through to `console.error` (line 16). `Sentry.init()` in `sentry.client.config.ts` never runs (DSN check fails).

**Sentry is effectively dead in production.** Even if the validator pipeline ran and even if `addLogBreadcrumb` were wired into the logger, no events would reach Sentry's backend. Sentry is also not designed for high-volume structured-event analysis: breadcrumbs are per-error context (max 100 per error scope), not a queryable event stream.

No Sentry project tier visible from local inspection.

---

## (5) Structured logger

**Hand-rolled wrapper around `console.log/warn/error`. Not pino, not winston. Final destination in production: Vercel runtime logs (per question 3).**

File: [`src/lib/logging/logger.ts`](../src/lib/logging/logger.ts) — 124 lines, single `Logger` class with `debug` / `info` / `warn` / `error` methods plus `child({ module })` for namespacing.

Behavior:
- Level filter at [line 66](../src/lib/logging/logger.ts#L66): entries below `LOG_LEVEL` are dropped. `LOG_LEVEL` defaults to `info` in production, `debug` in dev.
- Production output ([lines 80-89](../src/lib/logging/logger.ts#L80-L89)): `JSON.stringify(entry)` → `console.log/warn/error` by level. JSON-lines format.
- Dev output ([lines 90-107](../src/lib/logging/logger.ts#L90-L107)): colored ANSI-decorated single-line.
- Request correlation via `getRequestId()` at [line 73](../src/lib/logging/logger.ts#L73), wired from `requestContext.ts` AsyncLocalStorage.

Comment at [line 34](../src/lib/logging/logger.ts#L34): *"Production: minified JSON lines (for Vercel Log Drain / Datadog / Axiom)"* — describes the **intent** of the JSON-lines format, but no drain/Datadog/Axiom destination is currently configured (per question 3). The JSON lines go to Vercel's runtime log stream and stay there.

**The logger is correctly designed for downstream aggregation. The downstream aggregator is missing.**

---

## (6) The bridge question

**NO.** A query like *"show me all pipeline_telemetry events from /api/chat traffic in June 2026, grouped by check_name and fire_reason"* cannot be answered against production data today.

Concretely:
1. Pipeline doesn't run in production (flag off — finding 1). Zero events to query.
2. Even if (1) were fixed by flipping the flag: telemetry events land in `console.log` → Vercel runtime logs → 1–24h retention → no query layer (findings 3, 5).
3. Sentry is unconfigured (finding 4); it's also the wrong tool for this query shape.
4. No Firestore writes, no custom endpoint, no Datadog/Axiom/Logtail integration (finding 2).

For end-of-month CMIP comparison to be possible, **both** must be addressed:
- (i) Production flag: `MASTERMIND_VALIDATORS_ENABLED=true` in Production env.
- (ii) Telemetry destination: a queryable system the JSON-lines events can be aggregated into.

### Options for (ii) — telemetry destination

Expected CMIP volume: 50–200 chat-route turns/day × 30 days = ~1,500–6,000 turns total. Each turn emits ~3–8 telemetry events from the validator pipeline + 1 `citation_rate_summary` event. **Total: ~6,000–50,000 events/month.** Even the high end is small for any modern log destination.

**Option A — Vercel Log Drain → Axiom (recommended)**
- Setup: ~15 min via Vercel dashboard. Add Axiom integration, configure drain to route `console.log` output. Axiom free tier ([axiom.co](https://axiom.co)) gives 500 GB/month ingest + 30-day retention.
- Ongoing cost: **$0/month** at this volume (we're talking ~50 MB of structured logs).
- Query: Axiom's APL (Axiom Processing Language) supports `where`, `summarize`, `group by`. The query "events by check_name + fire_reason" is one line.
- Vercel infra support: yes, Log Drains are native to Vercel Pro tier. Hobby tier does not support custom Log Drains (only built-in dashboard streaming).
- **Caveat: requires Vercel Pro plan if currently on Hobby.** Pro is $20/seat/month.

**Option B — Custom Firestore writes (project already uses Firestore)**
- Setup: ~45 min. Add a `forwardTelemetryToFirestore(events, ctx)` function called alongside the existing `console.log` emission. Writes to a new `pipeline_telemetry` collection keyed by `correlation_id` + `ts_ms`. Optional 60-day TTL via Firestore TTL policy.
- Ongoing cost: **$0/month** at this volume. Firestore free tier is 50,000 writes/day; we'd burn ~1,500/day at peak — well under.
- Query: Firestore queries are document-pattern, not aggregation-friendly. To answer "group by check_name + fire_reason" requires either client-side aggregation in a Node script, or maintaining counter documents per (check_name, fire_reason) pair. Doable but more work than APL.
- Vercel infra support: native — Firebase Admin SDK already wired.
- **Caveat: write-side coupling. If Firestore is unreachable, do we drop the event or fail the request? Need a fire-and-forget pattern.**

**Option C — Sentry breadcrumb only (NOT recommended)**
- Setup: ~10 min — set `NEXT_PUBLIC_SENTRY_DSN`, wire `addLogBreadcrumb` into the logger.
- Ongoing cost: $0–$26/month depending on Sentry plan.
- Query: poor. Sentry breadcrumbs are per-error context, not a queryable event stream. The "group by check_name" query requires manual log inspection.
- **Not suitable for the comparison use case.** Listed for completeness.

**Option D — Do nothing, accept that CMIP comparison happens manually**
- The validator-disabled production means the comparison would be synthetic-preview-against-synthetic-preview anyway (since CMIP testers exercise the unvalidated flag-off path in prod). The "comparison" reduces to "do CMIP testers report problems the validators catch?" — a qualitative human-eyeball comparison rather than firing-rate-against-firing-rate.
- Ongoing cost: $0.
- **Caveat: re-scopes what "main sweep baseline" means. The synthetic-sweep firing rates would be the only quantitative measurement; CMIP would be a qualitative validation layer rather than a comparison cohort.**

---

## Separate finding (re-surfaced from TL;DR)

**The sweep design needs to acknowledge that production prod-chat is unvalidated.** Three implications worth flipping before the sweep runs:

1. The synthetic sweep against a preview deploy (with validators on) is **not directly comparable** to production prod-chat (with validators off). The synthetic data has retry behavior + fallback fires; the production data has neither.
2. CMIP testers exercising prod chat experience the pre-Mastermind path. Their feedback covers the LLM's raw output, not the validator stack's output.
3. To make the sweep ↔ CMIP comparison meaningful, **the validator flag must be on in production during CMIP** AND telemetry must be captured per option (A) or (B) above. Otherwise the sweep is its own thing and CMIP is its own thing.

---

## Recommended action

**Before CMIP starts (June 30 per project timeline), the minimum infrastructure to make end-of-month comparison possible:**

**Two commits, ~1 hour total work, $0/month ongoing if on Vercel Pro:**

### Commit 1: Enable validators in production
- Set `MASTERMIND_VALIDATORS_ENABLED=true` in the Production environment (Vercel dashboard or `vercel env add MASTERMIND_VALIDATORS_ENABLED production`).
- Set `LOG_LEVEL=info` in Production explicitly (currently undefined → defaults to info via logger.ts:13 anyway, but explicit avoids future ambiguity).
- **Production-impact:** chat-route turns now run the pipeline. Latency may increase by ~200ms prep + occasional retry (~10-20s on a small fraction of turns). Cost per chat turn increases by the validator parser calls (~$0.005–0.012/turn). At expected CMIP volume of 50–200 turns/day, ongoing API cost increase: ~$10–70 for the month.
- **Verification:** trigger one prod chat turn, check Vercel runtime logs for `mastermind validator event` JSON lines. Should appear.

### Commit 2: Wire Log Drain to Axiom (Option A)
- Verify Vercel project tier supports Log Drains (Pro+). If Hobby, surface to user for upgrade decision.
- Add Axiom integration via Vercel dashboard → Settings → Integrations → Axiom. Authorize. Configure drain to forward all Function log output.
- Verify by triggering one prod chat turn, then querying Axiom dataset for `event = "validator_event"` within last 5 minutes. Should return 1+ rows.
- **Bookmark for sweep-vs-CMIP comparison query (drafted, not run):**
  ```apl
  ['vercel-logs']
  | where _time >= datetime(2026-06-30T00:00:00Z)
  | where _time < datetime(2026-08-01T00:00:00Z)
  | where parse_json(message)['event'] == "validator_event"
  | where parse_json(message)['route'] == "/api/chat"
  | summarize count() by check_name = tostring(parse_json(message)['check_name']),
                        fire_reason = tostring(parse_json(message)['fire_reason'])
  | order by count_ desc
  ```

### If Vercel project is on Hobby tier (Log Drains unavailable)
**Fall back to Option B (Firestore writes).** ~45 min work, $0/month, but more code and less query power.

### Bullet list of work to confirm before CMIP

- [ ] Confirm Vercel project tier (look up in dashboard or `vercel project ls --debug`).
- [ ] Decide flag-flip date relative to CMIP start (recommend ≥1 week before so any flag-on regressions surface in prod traffic with low CMIP exposure).
- [ ] Pick Option A or B based on tier.
- [ ] Ship the two commits.
- [ ] Trigger a test chat turn, verify telemetry appears in the chosen destination.
- [ ] Document the query template in `MASTERMIND_CONTEXT/cleanup_followups.md` or a new `sweep_comparison_queries.md` so end-of-month analysis is push-button.

**No code change in this commit.** Document only — review and decide direction before any infrastructure work.
