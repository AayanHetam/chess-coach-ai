# PR 1.C — Stage 3 wiring + gate verification + preview rollout — Plan

**Branch:** `mastermind/stage-3-wire` off `mastermind/stage-3-validators` (which carries 1.B + 1.A + planning-docs).
**Posture:** plan-first per user 2026-05-11; **revised 2026-05-17 per coaching review (Revisions 1–4 below)**. No code yet. Original §8 open questions ratified — see §8 for the audit trail.
**Why stack on 1.B and not main:** 1.B's validators are referenced directly by the route wiring; merge order per [BUILD_PLAN.md §11.1](MASTERMIND_BUILD_PLAN.md) is planning-docs → primitives → validators+wiring.

## Revision summary (2026-05-17)

This plan was materially revised after the original 2026-05-11 draft. The four revisions:

1. **§5.3 metrics** — flat 0.85 structural-grounding metric retired. Replaced by two metrics across six question categories: **hallucination rate** (≥95% per category, no exceptions) and **citation rate** (per-category floors from 20% to 90% — see §5.3.2). Both metrics resist each other's gaming.
2. **§2.5 + §6 scope** — three additional validators added: `scoutCitation.ts`, `userHistoryCitation.ts`, `jhamtaniCitation.ts`. Each extends the PR 1.B parser-then-cross-check pattern to a new data source. Total LOC grows from ~1,150 lib / ~400 test to **~3,500 lib / ~1,500 test**. Aayan explicitly authorized scope expansion for quality.
3. **§1.7 persona-script pipeline (new)** — five existing persona scripts keep their voices but their *questions* are replaced with real prompts scraped from r/chess, r/chessbeginners, Lichess forums, Chess.com forums, and Chess Stack Exchange. Pipeline: scrape (ToS-compliant per source) → classify into six categories → Aayan 30-question spot-check → rewrite persona scripts with observed category distribution.
4. **§11 CMIP redirection (new)** — post-1.C work is **CMIP human evaluation infrastructure**, not Phase 2 (agent loop). Phase 2 is blocked until CMIP produces enough human ratings to either confirm or recalibrate the synthetic-tester metrics. Documented in BUILD_PLAN.md as the phase-2-gating decision.

---

## 0. Three-stage execution order (the headline)

PR 1.C is three stages in a deliberate order. Stage A must pass before Stage B starts. Stage C runs after Stage B is functionally complete.

| Stage | What | When |
|---|---|---|
| **A. Gate dry-run + persona pipeline + new validators** | Prove the synthetic-tester gate catches a known-broken validator config — BEFORE touching any route. Build dry-run harness with both metrics (hallucination + citation), run with normal config (pass), run with weakened config (fail). Also: scrape real forum questions, classify into six categories, Aayan spot-check, rewrite persona scripts. Also: ship the three new citation validators (scout, user-history, jhamtani) and the six-category classifier as library code (no route changes yet). | Commits 1–N1 |
| **B. Wiring** | Wire `runValidationPipeline` into `/api/enhanced-analysis` and `/api/chat`; route reads `result.telemetry` and forwards to logger; feature flag `MASTERMIND_VALIDATORS_ENABLED`, preview-only. | Commits N1+1 to N2 |
| **C. Sweep** | Full 50-turn synthetic-tester run against the preview deploy with flag on, using the rewritten persona prompts. Five metrics captured per §5.3: hallucination rate per category, citation rate per category, chess correctness, persona fidelity, cost. All metrics must pass for merge. | Final commit + PR description |

**Rationale.** "Does the gate work?" and "does the wiring work?" are independent questions. Conflating them means a passing sweep could mean either real quality or a broken gate that catches nothing. Stage A separates them. **Revision 2026-05-17:** the new citation validators and the persona-script rewrite also live in Stage A because they're library code + script work that's not coupled to the route; doing them in Stage A means Stage B's wiring is mechanical (just plug runValidationPipeline in) and Stage C's sweep exercises the full surface from day one.

---

## 1. Stage A — Gate dry-run

### 1.1 Goal

Prove the synthetic-tester's pass/fail logic catches a regression. We deliberately weaken a validator config to a no-op level (e.g., adjacent-band tolerance = 2000 cp, so qualitative checks tolerate everything), run the gate, confirm it fails. Then restore the config. The proof is the *log output*, attached to the PR description.

### 1.2 New files

| File | LOC | Purpose |
|---|---|---|
| `scripts/mastermind/validator-gate-dryrun.ts` | ~180 | Runs `runValidationPipeline` against a fixture of `(stockfish, delta, rolediff, response)` tuples; computes the five gate metrics; compares against thresholds; exits 0 on pass, 1 on fail. Accepts `--override-tolerance=N`, `--override-numeric=N`, `--override-confidence=F` flags to simulate broken validator configs without modifying source. |
| `scripts/mastermind/fixtures/gate-dryrun.json` | ~12 KB | 20 hand-curated tuples: 10 known-good responses (validator should pass), 10 known-bad (validator should catch). Drawn from the synthetic-tester output dataset where available; new fixtures added for adversarial coverage. |
| `scripts/mastermind/gate-thresholds.json` | ~1 KB | The five thresholds per [BUILD_PLAN.md §9.1](MASTERMIND_BUILD_PLAN.md): chess-correctness violations ≤ 0, structural-grounding ≥ 0.85, persona-fidelity ≥ 7/10, tool calls/turn median ≤ 4, cost/turn ≤ $0.03 flagship. Versioned so future tightening is auditable. |

### 1.3 Dry-run metric computation

The full synthetic-tester computes five metrics. The dry-run replicates four (persona fidelity requires an external rubric Claude call and is deferred to Stage C). Four metrics:

| Metric | Dry-run computation |
|---|---|
| Chess correctness | Count `eval_mismatch_*` + `feature_citation_unsupported` issues in `cumulativeIssues` AFTER all retries. Should be 0 if validators fully corrected. |
| Structural grounding | For each fixture's "expected feature claims," check whether the LLM's response (or pipeline output) cites at least one matching feature-delta entry. Ratio: matched / total expected. Target ≥ 0.85. |
| Tool calls/turn | The fixtures don't exercise tools (no agent loop in 1.C). Hard-coded to 0 in dry-run; full metric measured in Stage C. |
| Cost/turn | Sum `totalCostUsd` across all fixtures, divide by fixture count. |
| Persona fidelity | Skipped in dry-run; full metric measured in Stage C with real Claude rubric call. |

### 1.4 Commit sequence

| Commit | What |
|---|---|
| 1.C.A.1 | Land `validator-gate-dryrun.ts` + fixture + thresholds. Run it. Output: pass on PR 1.B as-is. Commit message includes the log. |
| 1.C.A.2 | Demonstrate gate sensitivity. Run `npx tsx scripts/mastermind/validator-gate-dryrun.ts --override-tolerance=2000`. Output: fail. Commit message includes the log. **No source modification** — the override is a script flag, validator code stays correct. |

### 1.5 What "the gate works" means concretely

After 1.C.A.1 + 1.C.A.2:
- `npx tsx scripts/mastermind/validator-gate-dryrun.ts` → exit 0 with passing metrics.
- `npx tsx scripts/mastermind/validator-gate-dryrun.ts --override-tolerance=2000` → exit 1 with chess-correctness failure (qualitative-flip fixtures pass through the weakened validator unchecked).

If 1.C.A.2 doesn't fail, the gate is broken. Stop. Investigate why the broken-validator config still produces passing metrics. Possible causes: fixture set too forgiving, threshold too lax, metric computation wrong. Fix before wiring.

### 1.6 Aayan-review items for Stage A

| § | Question | Default |
|---|---|---|
| 1.5 | What's the rollback procedure if 1.C.A.2 doesn't fail? | Pause PR 1.C, investigate gate, ship gate fix as a separate sub-PR before resuming wiring |
| 1.3 | Persona fidelity in dry-run: skip, or stub with a static rubric (e.g. heuristic length/tone keyword match)? | Skip in dry-run; full metric in Stage C |

### 1.7 Persona-script rewrite from real forum data (REVISED 2026-05-17)

The five existing persona scripts (`confused_beginner`, `tilted_intermediate`, `curious_advanced`, `hinglish_learner`, `trick_questioner`) keep their **voices** — tone, vocabulary, comprehension level — but the **questions** each persona asks are replaced with real questions scraped from chess discourse online. This makes the sweep representative of what users actually ask, not what we imagined they'd ask.

#### 1.7.1 Sources (priority order)

| Source | Access pattern | ToS posture | Estimated yield |
|---|---|---|---|
| r/chess + r/chessbeginners | **Reddit API via OAuth.** Use `r/chess/search` and `r/chessbeginners/search` with `q=?` and `flair_name="help"` filters. Public API, documented rate limit 60 req/min, ToS allows research use with attribution. Use [Reddit API rules](https://www.redditinc.com/policies/data-api-terms) — store post IDs not content, re-fetch live for analysis when needed. | API-allowed | ~150 questions |
| Lichess forums (study/practice) | **No public API for forums.** Lichess [Terms of Service](https://lichess.org/terms-of-service) allow non-commercial research; the forum HTML is scrape-permissive by precedent (the lichess-bot community has done it). Use a polite scraper with `User-Agent: chessmasti-research-bot` and a 2-second delay between requests. | ToS-permissive; scraping by precedent | ~80 questions |
| Chess.com forums | **Skip confirmed (Aayan 2026-05-17).** Chess.com [API](https://www.chess.com/news/view/published-data-api) does not expose forums; their [ToS](https://www.chess.com/legal/terms) doesn't explicitly permit scraping. Documented in COMPLIANCE.md as a known coverage gap. Revisit only if a researcher contact at chess.com can be reached for explicit permission. | ToS-restrictive | 0 (skipped) |
| Chess Stack Exchange | **Stack Exchange [API](https://api.stackexchange.com/docs)**, documented and generous. Public domain via CC BY-SA license — no scraping concerns. Use `chess.stackexchange.com` site filter with `tagged=beginner,opening,middlegame,endgame,strategy`. | API-allowed, CC BY-SA | ~70 questions |

**Net target:** ~300 questions if all three permitted sources hit their estimated yields; ~220 if chess.com stays skipped. Either is sufficient — the synthetic-tester uses 50 turns, so a 4× oversample lets the category-distribution rewrite be statistically meaningful.

#### 1.7.2 Pipeline stages

1. **Scrape.** New script `scripts/mastermind/persona-data/scrape-forum-questions.ts` (~250 LOC). Per-source modules: `reddit.ts`, `lichess.ts`, `stackexchange.ts`. Outputs `scripts/mastermind/persona-data/raw-questions.json` — array of `{source, sourceUrl, capturedAt, questionText, contextMeta}`. **Rate-limited per source; idempotent re-runs use a local dedup cache keyed by sourceUrl.**
2. **Classify.** New script `scripts/mastermind/persona-data/classify-questions.ts` (~120 LOC). Runs the six-category classifier (§6) over the raw questions. Outputs `classified-questions.json` adding `{category, confidence}` per entry. Cost: ~300 questions × $0.001/classify ≈ $0.30 total.
3. **Spot-check.** Aayan reads a **30-question random sample** (uniform across the six categories — 5 per category). For each, Aayan flags the assigned category as correct or wrong. Pass criterion: ≥27/30 correct (90%).

   **On failure (<27/30) — anti-auto-iterate rule (Aayan 2026-05-17):** CC does **not** auto-iterate the classifier prompt. Aayan reads every misclassification first. The misclassifications may reveal the categories themselves are wrong (e.g., "opponent prep" and "improvement strategy" blur on certain question shapes), not just the prompt. Only Aayan decides whether to (a) iterate the classifier prompt, (b) redefine the categories, or (c) accept the misclassifications and proceed. CC waits for explicit go before any prompt refinement work.

4. **Rewrite persona scripts.** New script `scripts/mastermind/persona-data/rewrite-scripts.ts` (~180 LOC). For each persona, draws a 10-question sequence weighted by the **observed category distribution** from the classified corpus (e.g., if 35% of real questions are "improvement strategy," then 35% of the persona's prompts come from that category).

   **Strict voice-transform rule (Aayan 2026-05-17):** the transform preserves **question type and underlying intent exactly**. Only **tone and vocabulary** shift to match the persona profile. A "confused_beginner" version of "Why did White's bishop give up the diagonal?" might be "I don't understand why the bishop moved off that long line, was that bad?" — same question, different voice. If a scraped question doesn't fit a persona (e.g., a deeply technical question into the confused_beginner voice), **skip it rather than transform aggressively.** This anchor keeps the synthetic distribution honest against real user distribution. Transform is a Haiku call (~$0.001/question; ~$0.05/persona × 5 personas = $0.25 total). Final output: replace existing `scripts/synthetic-tester/personas/<persona>.md` files.

#### 1.7.3 ToS compliance documentation

Committed alongside the scraper: `scripts/mastermind/persona-data/COMPLIANCE.md` documenting per-source:
- ToS link reviewed (with date of review)
- Rate-limit posture (req/min, delay between)
- Attribution requirements (Reddit: post ID + permalink; Stack Exchange: CC BY-SA citation in any derivative; Lichess: User-Agent identification)
- What we store (post ID + question text only; **never user identity, usernames, or other PII**)
- What we don't store (votes, scores, user metadata)
- Take-down procedure if a source contacts us
- **Coverage gap: chess.com forums skipped** (Aayan 2026-05-17). Revisit if a researcher contact yields explicit permission.
- **Refresh cadence (Aayan 2026-05-17):** quarterly re-scrape after the initial 1.C run, with the same per-source dedup behavior. Refresh is mechanical — re-run `scrape-forum-questions.ts`, re-classify, append-only to the corpus (existing question IDs aren't re-fetched).
- **Retirement trigger (Aayan 2026-05-17):** **once CMIP produces real user questions from Chess Masti's own users at sufficient volume (rough threshold: ≥500 categorized real-user questions across the six categories), retire the forum scraper entirely.** Real questions from logged-in coach users displace scraped public-forum questions as the persona-script source. The COMPLIANCE.md file gains a retirement-decision section at that point recording the cutover date and the final scraped-corpus snapshot for ISEF reproducibility.

#### 1.7.4 §1.7 questions — RESOLVED 2026-05-17

All four answers ratified to §8.1 round-2 decisions; reflected in §1.7.1–§1.7.3 above.

| # | Question | Decision |
|---|---|---|
| 1.7-a | Skip chess.com forums entirely, or attempt scraping? | **Skip.** Documented in COMPLIANCE.md (§1.7.3) as a known coverage gap. |
| 1.7-b | Spot-check pass criterion (27/30) and failure behavior | **27/30 confirmed.** On failure, Aayan reads every misclassification before any iteration starts; CC does NOT auto-iterate the prompt. Categories themselves may be the issue, not the prompt. |
| 1.7-c | Persona voice-transform strictness | **Strict.** Question type + intent preserved exactly. Tone/vocabulary shift only. If a question doesn't fit a persona, skip-not-transform. |
| 1.7-d | Scrape cadence | **Once at 1.C, then quarterly until CMIP launches.** Retire scraper once CMIP yields ≥500 real-user questions across categories. |

---

## 2. Stage B — Wiring

### 2.1 Request lifecycle for `/api/enhanced-analysis`

Current shape (post-1.A primitives, pre-1.C wiring):

```
1. Auth + request schema validation
2. Build prompt context (uses Stage 3 primitives — feature delta, threat tree, etc.)
3. Call callLLMStream → SSE-stream tokens to client
4. After stream completes, run validateAIResponse (existing chess.js validator)
5. Apply footnote-append if validateAIResponse flagged issues
6. Final response is what was already streamed; footnote is appended via a separate SSE event
```

Proposed shape with PR 1.C:

```
1. Auth + request schema validation
2. Build prompt context
3. IF MASTERMIND_VALIDATORS_ENABLED for this request:
     a. Call runValidationPipeline (NON-STREAMING — buffers full response server-side)
        → drives initial LLM call + parser sub-calls + validators + up to 2 retries + fallback
     b. Emit "validating…" SSE event to client during pipeline run
        (UI shows the existing spinner; this event lets us narrate "running grounding checks" if we want)
     c. After pipeline returns, stream final response to client in chunks (synthetic streaming
        from the buffered response — preserves the visual streaming feel)
     d. Run validateAIResponse on final response (existing chess.js checks coexist)
     e. Apply footnote-append if validateAIResponse flagged issues (delta validators ran via pipeline)
   ELSE (flag off):
     a. Call callLLMStream → SSE-stream tokens (current path, unchanged)
     b. Run validateAIResponse post-stream
     c. Footnote-append if needed
4. Forward result.telemetry to logger (when flag on; see §3)
```

**The streaming gotcha.** runValidationPipeline buffers because retries can replace the response. Streaming attempt 1 then retracting it is bad UX. The synthetic re-stream (step 3c) preserves the streaming visual without exposing intermediate state. Latency cost: full LLM time before user sees first token (current: ~1.5s to first token streaming; new: ~5-8s to first token with validation).

**Mitigation.** Emit a `validating` SSE event with a phase indicator so the UI can show "Grounding the analysis…" between request start and first content token. Smaller win than streaming would be, but better than silence.

### 2.2 `/api/chat` lifecycle

Same shape, smaller stakes. Chat is `tier: "fast"` (Haiku 4.5), responses are short. Per-turn validator overhead is more noticeable as a percentage of total turn time. Still worth running for chess-correctness consistency.

### 2.3 Timeout budget

| Phase | Budget | Behavior on exceed |
|---|---|---|
| Each Haiku parser call | 3 s | Abort, treat as parser_json_invalid (silent skip with telemetry) |
| Each Sonnet flagship attempt (initial / retry) | 12 s | Abort, treat as a failed attempt, advance to next retry or fallback |
| Total pipeline budget | 30 s | If exceeded, return the buffered partial response with a `pipeline_timed_out` telemetry event. Fail-soft: user always gets something. |

The 30 s ceiling is critical: the current route's p99 is ~10 s. Adding the pipeline could push p99 over 30 s in pathological cases (full retry path with cold caches). The fallback synthesizer is the safety net — it's pure CPU and runs in <10 ms.

### 2.4 Cutover from footnote-append

Three coexistence options:

| Option | Footnote-append when flag ON | When flag OFF |
|---|---|---|
| A (proposed) | Stays live alongside pipeline. validateAIResponse runs post-pipeline on the final response. Any chess.js-level issues still get the footnote treatment. | Stays live (current behavior, unchanged). |
| B | Disabled when flag ON. Pipeline handles all validation. validateAIResponse runs but its corrected_response is ignored. | Stays live. |
| C | Removed entirely under flag. Wholesale replacement. | Stays live. |

**Default: Option A.** Reasoning:
- validateAIResponse catches a different class of errors (piece-on-square, illegal-move, nonexistent-square) than the pipeline validators (eval mismatch, feature citation). Both classes can happen on the same response. Running both is defense-in-depth.
- Rollback is just flipping the flag. Footnote-append is the always-available safety net.
- Removing footnote-append is a separate concern — appropriate after PR 1.C has been in prod stably for 30+ days, not during the preview rollout.

**Decision needed from tech-lead.** A vs B vs C.

### 2.5 Files in scope (AUDIT-REVISED 2026-05-17)

Audit findings (§A/§C/§D in [PR_1C_DATA_AUDIT.md](PR_1C_DATA_AUDIT.md)) materially changed the per-validator scope: scout expanded to full coverage, user-history restricted to 3 derivable claim types, jhamtani deferred to PR 1.D entirely.

#### 2.5.1 Stage A — library additions (new validators + classifier + persona pipeline)

| File | Change | LOC |
|---|---|---|
| `src/lib/mastermind/categorization/categoryClassifier.ts` | Six-category Haiku classifier (§6.1). Takes `userQuestion: string`, returns `{ category, confidence }`. Cached system prompt. | ~120 |
| `src/lib/mastermind/categorization/categoryPrompts.ts` | Cached classifier system prompt with six-category definitions + exemplars | ~80 |
| `src/lib/mastermind/validators/scoutCitation.ts` | **EXPANDED per audit §C.** Validates full `ScoutAnalytics` + `Collisions` surface — 20 claim types across prep, profile, stalker, psychology, rivals, collisions, novelty, checklist, recent-form | **~1,100** |
| `src/lib/mastermind/validators/userHistoryCitation.ts` | **RESTRICTED per audit §D.** Ships 3 server-derivable claim types only: `time_control_performance`, `opening_repertoire_performance`, `hours_played_claim`. Other 3 deferred to PR 1.E | **~150** |
| ~~`src/lib/mastermind/validators/jhamtaniCitation.ts`~~ | **DEFERRED per audit §A — does not ship in PR 1.C.** Queued for PR 1.D | **0** |
| `src/lib/mastermind/validators/userHistoryAggregates.ts` | New helper module for the 3 derivable claim types: `aggregateWinRateByTimeControl`, `aggregateScoreByOpening`, `countGamesInDateRange`. Pure functions over `Game[]` from Firestore | ~140 |
| `src/lib/mastermind/validators/citationRate.ts` | Helper computing citation-rate metric per category given `ValidatorResult` + source's `Opportunity[]` | ~120 |
| `src/lib/mastermind/validators/parserPrompts.ts` | Extend with **TWO** new cached prompts: `SCOUT_CITATION_PARSER_SYSTEM` (covers all 20 claim types), `USER_HISTORY_CITATION_PARSER_SYSTEM` (covers 3 derivable types). Jhamtani prompt NOT shipped | +200 |
| `src/lib/mastermind/validators/types.ts` | Extend with the 20 scout `FeatureClaimType` values, 3 user-history values, `Opportunity` interface, `CitationRateResult`. Reserve `jhamtani` data-source slot in types but leave field unused | +110 |
| `src/lib/mastermind/validators/index.ts` | Add exports for the 2 new validators + classifier; extend `runValidationPipeline` to accept `dataSources: { scout?, userHistory? }`. Jhamtani slot reserved in type, unused in PR 1.C | +120 |
| `src/lib/mastermind/__tests__/categorization/categoryClassifier.test.ts` | Mocked-parser tests over six categories + adversarial cases | ~180 |
| `src/lib/mastermind/__tests__/validators/scoutCitation.test.ts` | Mocked-parser tests + cross-check over scout-output fixtures across all 20 claim types | **~550** |
| `src/lib/mastermind/__tests__/validators/userHistoryCitation.test.ts` | Mocked-parser tests + cross-check over fixture `Game[]` for the 3 derivable types | **~160** |
| `src/lib/mastermind/__tests__/validators/userHistoryAggregates.test.ts` | Direct unit tests on the 3 aggregator helpers | ~140 |
| `src/lib/mastermind/__tests__/validators/citationRate.test.ts` | Opportunities-counted-correctly + per-category rate aggregation | ~140 |
| `scripts/mastermind/persona-data/scrape-forum-questions.ts` | Reddit + Lichess + Stack Exchange scrapers, ToS-aware | ~250 |
| `scripts/mastermind/persona-data/classify-questions.ts` | Runs `categoryClassifier` over raw questions, outputs categorized corpus | ~120 |
| `scripts/mastermind/persona-data/rewrite-scripts.ts` | Draws from categorized corpus weighted by observed distribution; applies persona-voice transform (strict per §1.7-c) | ~180 |
| `scripts/mastermind/persona-data/COMPLIANCE.md` | ToS posture per source (§1.7.3) including retirement trigger | ~120 lines doc |
| `scripts/mastermind/validator-gate-dryrun.ts` | Runs all four shipped validators (PR 1.B's two + PR 1.C's two: scout, user-history). Concept-explanation category metric reports as "n/a — deferred to PR 1.D" | ~300 |
| `scripts/mastermind/fixtures/gate-dryrun.json` | Hand-curated tuples spanning the FIVE active categories (concept_explanation has no citation metric in 1.C) | ~36 KB |
| `scripts/mastermind/gate-thresholds.json` | Revised per §5.3 — hallucination ≥0.95 per active category; citation floors per active category (concept_explanation marked deferred) | ~2 KB |

#### 2.5.2 Stage B — route wiring (mostly unchanged from original §2.5)

| File | Change | LOC |
|---|---|---|
| `src/app/api/enhanced-analysis/route.ts` | Add flag check, route through `runValidationPipeline` when on, fetch scout/user-history/jhamtani data alongside feature delta, emit telemetry forwarding | ~220 |
| `src/app/api/chat/route.ts` | Same shape as enhanced-analysis, smaller | ~130 |
| `src/lib/mastermind/wireValidators.ts` | New: route-side helper that fetches the four data sources (feature delta, scout, user history, jhamtani) and threads them into `runValidationPipeline` | ~220 |
| `src/lib/mastermind/validatorTelemetry.ts` | New: route-side telemetry forwarder. Reads `result.telemetry`, adds route-level context (user_id, session_id, response_id, category), calls logger | ~80 |
| `src/env.ts` | Add `MASTERMIND_VALIDATORS_ENABLED` env var to the Zod schema | ~10 |
| `src/lib/mastermind/__tests__/wireValidators.test.ts` | Unit tests for the wiring helper | ~280 |
| `src/lib/mastermind/__tests__/validatorTelemetry.test.ts` | Unit tests for the telemetry forwarder | ~180 |

#### 2.5.3 Stage C — sweep outputs (committed JSON, not LOC)

| File | Purpose |
|---|---|
| `audit/findings/agent-c-eval/sweep-{date}.json` | Full 50-turn sweep results: per-turn response, telemetry, latency, cost, hallucination + citation metrics |
| `audit/findings/agent-c-eval/sweep-{date}-summary.md` | Human-readable summary: aggregate metrics, by-category breakdown, baseline comparison |

#### 2.5.4 LOC totals (AUDIT-REVISED 2026-05-17)

| Stage | Lib LOC | Test LOC | Other |
|---|---|---|---|
| A (validators + classifier + persona pipeline + dry-run) | **~2,140** | **~1,170** | ~720 LOC scripts + ~38 KB fixtures + ~120 lines compliance doc |
| B (route wiring + telemetry forwarding) | ~660 | ~460 | — |
| C (sweep outputs) | — | — | ~50 KB JSON |
| **PR 1.C total** | **~2,800** | **~1,630** | scripts + fixtures + compliance + sweep output |

Net shift from the prior (pre-audit) estimate: scout LOC grew dramatically (+~820 lib + ~270 test for full ~20-pattern coverage), user-history shrank (−~110 lib + ~110 test for 3-of-6 scope), jhamtani removed entirely (−240 lib + ~250 test). Plus the new `userHistoryAggregates.ts` helper module (+140 lib + ~140 test).

PR 1.D (Jhamtani wire-up) and PR 1.E (puzzle-stats sync + restore deferred user-history claim types) are separate, Aayan-triggered PRs — not auto-rolling — that restore the deferred surface area. See §11 below.

### 2.6 Don't-touch list (per spec + existing CLAUDE.md)

- `aiResponseValidator.ts` source — coexists, not modified.
- Stockfish-before-LLM ordering.
- Maia-2 API.
- Neo4j shapes.
- Sonnet/Haiku tier routing (regenerate calls same tier).
- `enhancedOpenAIService.ts` — legacy client-side path, out of scope.

---

## 3. Stage B — Telemetry forwarding

### 3.1 Log shape

Every event in `result.telemetry` becomes one structured log entry:

```jsonc
{
  "module": "mastermind-validator",     // Sentry tag for filtering
  "event": "validator_event",           // log channel
  "check_name": "eval_mismatch_qualitative",
  "fire_reason": "qualitative_band_flip",
  "retry_count": 0,
  "final_outcome": null,                // populated only on terminal events
  "correlation_id": "cm-9k3j2-abc...",  // threads through all events in one turn
  "user_id": "uid-...",                 // route adds from session cookie
  "session_id": "sess-...",             // route adds
  "response_id": "resp-...",            // route generates per turn
  "route": "/api/enhanced-analysis",    // route adds
  "user_tier": "free" | "paid",         // route adds from user profile (Phase 5.E hook)
  "expected": { "band": "slightly_better", "cp": 70 },
  "actual": { "band": "winning", "cp": null },
  "llm_span": "Black is winning",
  "parser_confidence": 0.95,
  "ts_ms": 1715491234567
}
```

### 3.2 Sentry integration

Existing `@/lib/logging/sentryIntegration.ts` carries the structured-log → Sentry bridge. PR 1.C adds:
- Sentry tags: `module=mastermind-validator`, `fire_reason=<value>`, `final_outcome=<value>` (when present), `route=<value>`.
- Sentry context: full event payload as `validator_event_context` extra.
- Sentry level: `info` for `fire_reason=passed`, `warning` for fires, `error` for `final_outcome=fallback_used`.

This lets Sentry alerts trigger on `final_outcome=fallback_used` (which means 2 retries failed — production-grade signal we want to know about).

### 3.3 ISEF dataset extraction

The ISEF paper's hallucination escape-rate dataset comes from these logs.

Query pattern (Sentry export → Parquet → analysis notebook):
```
module = "mastermind-validator"
AND event = "validator_event"
AND fire_reason != "passed"
```

Each row is one validator fire. Aggregations:
- Escape rate by `fire_reason` over time → does the gate catch fewer hallucinations as the model gets better, or does the production distribution drift?
- Recovery rate: `count(final_outcome="passed_after_retry") / count(final_outcome IN ("passed_after_retry","fallback_used"))`. High = regenerate is effective.
- Fallback rate: `count(final_outcome="fallback_used") / count(all turns)`. Low = LLM rarely needs the safety net.
- Persona × fire-rate breakdown: which user personas trigger more fires?

The ISEF appendix references this query pattern directly. **Aayan should review the schema before commit** so the dataset shape supports the paper's claims.

### 3.4 PII discipline

`llm_span` contains LLM text — could include user-supplied content in degenerate cases (jailbreak attempt with PII). Posture:
- Truncate `llm_span` to 200 chars (already enforced in the parser-prompt header).
- Do not log user input (the messages array) — only the LLM's response excerpt.
- `correlation_id` is opaque; safe to log.

### 3.5 Aayan/tech-lead review items for Stage B telemetry

| § | Question | Default |
|---|---|---|
| 3.1 | `user_tier` field — populate now (placeholder for Phase 5.E) or skip? | Populate now with `"free"` for all (paid tier doesn't exist yet) |
| 3.2 | Sentry alert on `final_outcome=fallback_used`? | Yes, low-priority alert (warns when >1% of turns hit fallback) |
| 3.3 | Dataset retention policy | Indefinite for paid; 90 days for free (matches `MastermindSession` retention from BUILD_PLAN §10) |
| 3.4 | Truncate `llm_span` to 200 chars — sufficient for ISEF analysis? | Yes; the citation matching only needs the surrounding clause |

---

## 4. Stage B — Feature flag

### 4.1 Name

`MASTERMIND_VALIDATORS_ENABLED` (boolean env var, parsed in `src/env.ts`).

**Distinct from `MASTERMIND_AGENT_LOOP_ENABLED`** (Phase 2). The validators wire on first; the agent loop comes later. Two separate flags = two separate rollout knobs.

### 4.2 Posture: preview-only per Aayan 2026-05-11

Earlier (PR 1.B decision §3): "flag-off-on-merge to prod" — the validator code would land in prod with the flag off, and a separate ops action would flip it.

**Revised (Aayan 2026-05-11):** preview-only at PR 1.C merge. Flag stays `false` in prod and `true` in preview. The flip to prod=true happens later, **after the synthetic-tester gate has caught at least one real regression in CI** — that's the empirical proof that the gate is doing real work, not rubber-stamping.

Rationale: shipping the flag to prod (even off) means we're tacitly committing to flip it. Aayan prefers a "we'll flip when the gate proves itself" posture. Preview-only at merge time is the most conservative starting position.

### 4.3 Concrete "preview" definition

| Aspect | Detail |
|---|---|
| Vercel environments | Two scopes: Production (chessmasti.com) and Preview (every `*.vercel.app` deploy from non-main branches). |
| Env-var setting | Preview: `MASTERMIND_VALIDATORS_ENABLED=true`. Production: `MASTERMIND_VALIDATORS_ENABLED=false` (or unset; default false). |
| Who sees it | All preview traffic — i.e., anyone visiting a preview URL during testing. The chessmasti.com prod URL gets unchanged behavior. |
| Per-user overrides | Not in 1.C. Hardcoded boolean env var. Adding per-user (e.g., test cohort) overrides is a follow-up if needed. |
| Toggle | `vercel env edit MASTERMIND_VALIDATORS_ENABLED Preview` → set value → redeploy preview. ~60s end-to-end. |
| Rollback | Same: edit env var, redeploy. ~60s. |

### 4.4 Promotion criteria (flip preview → prod)

Document these criteria in this PR; the actual flip is a follow-up ops change after PR 1.C merges.

Criteria (all must be true):
1. PR 1.C merged to main.
2. Synthetic-tester sweep on the preview branch shows all five gate metrics passing.
3. The gate has caught at least one **real** regression in a subsequent PR's CI run. ("Real" = a regression that wasn't deliberately introduced for testing.)
4. No `final_outcome=fallback_used` events in preview logs over a 7-day window.
5. p95 turn latency in preview ≤ 1.5× p95 turn latency in prod.

When all five hold, ops opens a small PR setting `MASTERMIND_VALIDATORS_ENABLED=true` in Production env. Estimated timing: 2-6 weeks after PR 1.C lands, depending on when criterion 3 fires.

### 4.5 Aayan/tech-lead review items for Stage B flag

| § | Question | Default |
|---|---|---|
| 4.3 | Per-user override for preview? (Beta cohort of paid users get it on prod even before promotion criteria met) | Skip in 1.C; revisit if there's a paid-tier launch before promotion criteria fire |
| 4.4 | Promotion criterion 4 — 7-day clean window: too short? too long? | 7 days; tightenable to 14 if pace allows |
| 4.4 | Promotion criterion 5 — 1.5× latency ceiling, reasonable? | Yes; if real overhead is >1.5× we want to revisit before flipping |

---

## 5. Stage C — Synthetic-tester first run after wiring

### 5.1 Goal

The full 50-turn sweep against a preview deploy with `MASTERMIND_VALIDATORS_ENABLED=true`. Five metrics captured. All five must pass for PR 1.C merge.

### 5.2 Execution

```
1. Push mastermind/stage-3-wire to GitHub → Vercel auto-builds preview URL.
2. Set MASTERMIND_VALIDATORS_ENABLED=true in Preview env.
3. Wait for preview deploy ready (~2 min).
4. Run: `tsx scripts/synthetic-tester/run.ts --target=<preview-url> --concurrency=2`.
5. Sweep runs 10 master-game PGNs × 5 personas = 50 turns. Each turn: persona asks
   a scripted prompt about the game, route returns a coaching response.
6. Tester captures: response text, validator telemetry (forwarded from route logs),
   latency, total cost per turn.
7. Tester computes the five gate metrics + writes a run report.
8. Compare against the baseline run (same sweep against main with flag off).
```

### 5.3 The gate metrics — hallucination + citation across six categories (REVISED 2026-05-17)

Original flat 0.85 grounding metric retired. Replaced with two metrics that measure different failure modes and resist gaming each other.

#### 5.3.1 Hallucination rate

**Definition.** Of factual claims made by the coach in a response, the fraction supported by the relevant data source.

**Target.** ≥ 95% **across all six categories, no exceptions.** A 95% overall rate masking 70% on one category and 100% on another is not acceptable. Report the by-category breakdown alongside the overall rate; any category < 95% fails the gate.

**Hard-ceiling rule (Aayan 2026-05-17).** This is a hard ceiling. **No per-category relaxation, ever.** If a category's first sweep falls short, the fix is the validator — precision-tightening, broader claim-type coverage, prompt iteration — **not the threshold**. Validator iteration under this rule is **permitted and expected; threshold relaxation is not.** Iterations to validator code triggered by a short hallucination-rate on a category are **not scope creep** — they are required for merge. Plan-wise: PR 1.C's commit sequence (§7) explicitly leaves room for "validator iteration" commits between the initial Stage A landings and the Stage C sweep.

**Computation.** For each turn:
1. The pipeline runs through all five validators (PR 1.B: `evalClaim`, `featureDeltaCitation`; PR 1.C: `scoutCitation`, `userHistoryCitation`, `jhamtaniCitation`). Each validator's parser counts the factual claims it detects.
2. Total claims = sum across all five validators per turn.
3. Hallucinated claims = total `cumulativeIssues` from `runValidationPipeline` AFTER all retries (final response, not initial response).
4. Hallucination rate per turn = 1 − (hallucinated / total).
5. Per-category aggregate: filter turns by category (via §6 classifier) and average.

Claims of type `qualitative_commentary`, `metaphorical`, `conditional_speculation` are NOT counted in either numerator or denominator — they're not factual assertions.

#### 5.3.2 Citation rate

**Definition.** Of opportunities to cite personalized data (turns where relevant data exists in the corresponding source), the fraction the coach actually uses.

**Target — by category.** No flat floor; each category has its own. **Concept explanation floor temporarily lifted in PR 1.C** per audit §A — `jhamtaniCitation` is deferred to PR 1.D, so the floor is reinstated when PR 1.D lands.

| Category | Citation rate floor (PR 1.C) | Authoritative data source | First-consumer validator |
|---|---|---|---|
| Game review | 90% | Feature delta (PR 1.A `compute_feature_delta`) | `featureDeltaCitation` (PR 1.B) |
| Opponent prep | 85% | Scout output: full `ScoutAnalytics` + `Collisions` (audit §C expanded to ~20 patterns) — see [src/types/scout.ts](../src/types/scout.ts) | `scoutCitation` (new, §6.2) |
| Position analysis | 70% | Feature delta (PR 1.A) | `featureDeltaCitation` (PR 1.B) |
| Concept explanation | **n/a (deferred to PR 1.D)** | Jhamtani commentary corpus — corpus state uncertain per audit §A; validator deferred | None in 1.C; `jhamtaniCitation` queued for PR 1.D |
| Improvement strategy | 50% **on the 3 derivable claim types** (time_control_performance, opening_repertoire_performance, hours_played_claim — audit §D Option B) | `users/{uid}/games` subcollection aggregates; puzzle stats + rating history deferred to PR 1.E (localStorage-bound) | `userHistoryCitation` (new, §6.3) — restricted scope |
| Meta and motivational | 20% **on the 3 derivable claim types** (same restriction) | `users/{uid}/games` subcollection aggregates | `userHistoryCitation` (new, §6.3) — restricted scope |

**Computation.** For each turn:
1. Classify question into one of the six categories via §6 classifier.
2. Query the relevant data source. Count "opportunities" = the cardinality of cite-able entries in that source for the position/user/game context. Definition of "cite-able entry" is per-validator (see §6 for each validator's `countOpportunities` logic).
3. Count "citations" = entries the coach's response actually references (matched via that category's parser, same pattern as PR 1.B).
4. Citation rate for the turn = citations / opportunities. Zero-opportunity turns are excluded from the denominator entirely (you can't fail at citing what doesn't exist).
5. Aggregate by category across the sweep; each category must clear its floor.

**Why two metrics, not one.** Hallucination ceilings stop the coach from lying. Citation floors stop the coach from giving generic answers when personalized data is available. A response can hit 100% hallucination rate by saying nothing factual; can hit 100% citation rate by citing everything verbatim (verbose, low-signal). The two metrics together force the coach into the useful middle: cite when relevant data exists, don't invent when it doesn't. **Neither games the other.**

#### 5.3.3 The other three gate metrics (mostly unchanged)

| Metric | Target | How measured |
|---|---|---|
| Chess correctness (board-state) | 0 violations per 50-turn run | `validateAIResponse` errors (piece-on-square, illegal-move, nonexistent-square). Separate from §5.3.1 hallucination — the existing chess.js board-state check, kept as defense-in-depth per §2.4 Option A. |
| Persona fidelity | ≥ 7/10 per persona, mean ≥ 7.5 | Separate flagship Claude rubric call (one per turn) scoring the response against the persona's tone profile. ~$0.02/turn extra; only runs in sweeps, not production. |
| Cost per turn | ≤ $0.035 flagship, ≤ $0.005 fast | Sum from telemetry `costUsd` fields + route's `inputTokens/outputTokens` log. **Ceiling raised from $0.03 to $0.035** to absorb the new validators' parser cost (3 additional Haiku parses per turn at ~$0.001 each). Per Interpretation A, retries are replacement-not-addition; overhead bound is parsers + telemetry. |

Tool calls/turn (originally listed) dropped from PR 1.C since the agent loop isn't here yet; revisit in Phase 2.

#### 5.3.4 Pass criteria — all of the following must hold

- **Hallucination rate ≥ 95% per category**, not just overall. **Hard ceiling — see §5.3.1 hard-ceiling rule. Validator iteration is the response to a short category, not threshold relaxation.**
- **Citation rate ≥ floor per category** per §5.3.2 table.
- Chess correctness = 0 violations.
- Persona fidelity ≥ 7/10 per persona, mean ≥ 7.5.
- Cost per turn ≤ $0.035 flagship, ≤ $0.005 fast.

Failing any of the above blocks merge.

### 5.4 Comparison to baseline

The baseline is the same sweep against main with flag off. Required outcomes:

| Metric | Baseline (main) | Expected at PR 1.C |
|---|---|---|
| Hallucination rate (per category) | Uncomputed; some implicit hallucination exists | ≥ 0.95 per category |
| Citation rate (per category) | Uncomputed; coach probably under-cites scout/user-history | ≥ floor per category |
| Chess correctness | Some violations (existing piece-on-square misses) | Fewer or equal violations (pipeline adds protection) |
| Persona fidelity | Currently uncomputed | ≥ 7/10 |
| Cost per turn | ~$0.025 flagship | ≤ $0.035 (overhead ≤ $0.01 per Interpretation A) |

### 5.5 Stage C metric items — RESOLVED 2026-05-17

| § | Question | Decision |
|---|---|---|
| 5.3.2 | Citation rate floors — are these the right per-category numbers? Game review 90% / Opponent prep 85% / etc. | **Yes** per coaching-review 2026-05-17. Revisit after first sweep only if a category misses dramatically AND validator iteration can't close the gap |
| 5.3.1 | Hallucination ≥95% per category — too strict? | **Hard ceiling, no relaxation** (Aayan 2026-05-17). Below-target categories are validator failures to fix, not thresholds to lower. See §5.3.1 hard-ceiling rule |
| 5.3 | Persona fidelity rubric — flagship Claude call per turn at $0.02 × 50 = $1/sweep. Acceptable? | Approved (§8 Q8) |
| 5.4 | Cost-per-turn budget ≤ $0.035: hard fail or soft warning? | **Hard fail.** Tech-lead override possible if Stage C shows ~$0.04 with no path to lower; we'd then revisit Interpretation A's overhead assumption |

---

## 6. Six-category classifier + new validator specs (REVISED 2026-05-17)

This section specs the new library code Stage A adds. Each validator follows the PR 1.B parser-then-cross-check shape; only the data source and the cross-check logic vary.

### 6.1 Six-category classifier — `categoryClassifier.ts`

**Signature:**

```ts
export type QuestionCategory =
  | "game_review"            // Coach analyzes a played game
  | "opponent_prep"          // Coach analyzes opponent's tendencies / opening repertoire
  | "position_analysis"      // Coach analyzes a position outside game context
  | "concept_explanation"    // Coach explains a chess concept (pin, outpost, etc.)
  | "improvement_strategy"   // Coach advises on what to study or how to improve
  | "meta_motivational";     // User asks about progress, motivation, frustration

export interface CategorizedQuestion {
  category: QuestionCategory;
  confidence: number;        // 0-1
  rationale: string;         // brief, why this category
}

export async function classifyQuestion(
  question: string,
  parseCall?: ParserCall
): Promise<CategorizedQuestion>;
```

**Cached system prompt** at `categoryPrompts.ts` (~800 tokens) defines each category with exemplars and disambiguators:
- "Why did I lose this rook ending?" → `game_review`
- "What does my opponent like to play vs the Najdorf?" → `opponent_prep`
- "Is +1.5 winning here?" → `position_analysis`
- "What's an outpost?" → `concept_explanation`
- "How do I get to 1800?" → `improvement_strategy`
- "I keep losing the same way, am I plateaued?" → `meta_motivational`

Returns structured JSON same pattern as the other parser prompts. Confidence <0.5 → caller treats as ambiguous and assigns to the lowest-floor category (`meta_motivational`) by default to avoid false-positive citation-rate failures.

### 6.2 `scoutCitation.ts` — opponent-prep validator (EXPANDED 2026-05-17 per audit §C)

**Data source.** [scoutService.ts](../src/lib/scoutService.ts) + [src/types/scout.ts](../src/types/scout.ts) `ScoutAnalytics` + `Collisions`. The audit found that the actual scout output is **substantially richer** than the original 5-claim spec accounted for; the full type carries 8 top-level fields plus a separate `Collisions` type. Aayan authorized full coverage (Option A in audit §C.5): all ~20 citation patterns the coach can legitimately make.

**Parser claim types (extends `FeatureClaimType`):**

#### 6.2.1 Opening / prep claims (`prep` + opening tree)

| Claim | Example | Source field | Cross-check |
|---|---|---|---|
| `opponent_plays_opening` | "Your opponent plays the Sicilian Dragon 60% of the time" | `prep.asWhite/asBlack.{weaknesses,strengths}[].name` + `totalGames / sum(totalGames)` | Opening tree frequency matches stated % within ±5% |
| `opponent_strength_opening` | "They score 70% with white in the King's Indian" | `prep.asWhite.strengths[].scorePct + .totalGames` | Stated score% within ±5% |
| `opponent_weakness_opening` | "They struggle as black against 1.d4 (45% score)" | `prep.asBlack.weaknesses[].scorePct + .totalGames` | Stated score% within ±5% |

#### 6.2.2 Profile claims (`profile`)

| Claim | Example | Source field | Cross-check |
|---|---|---|---|
| `archetype` | "They play like a positional grinder" | `profile.archetype` | Stated archetype matches the labeled archetype |
| `profile_dimension` | "Their attacking score is 78" | `profile.{ovr,atk,def,time,mind}` | Stated value within ±5 of the 0-100 score |
| `rating_by_timeclass` | "1800 in rapid, 1500 in blitz" | `profile.ratings.{bullet,blitz,rapid,classical,daily}` | Stated rating within ±25 |
| `peak_rating` | "They peaked at 2050" | `profile.peakRating` | Stated within ±25 |
| `low_rating` | "Bottomed out at 1750" | `profile.lowRating` | Stated within ±25 |
| `latest_rating` | "Currently rated 1920" | `profile.latestRating` | Stated within ±25 |
| `recent_form_trend` | "They've won 6 of their last 10" | `profile.recent[]` + `profile.recentAccuracy` | Recent W/D/L counts match stated ratio within ±1 |
| `phase_elo` | "Their endgame ELO is 200 below their middlegame" | `profile.phaseElo.{opening,middle,endgame,baseline}` | Stated delta within ±50 cp |

#### 6.2.3 Stalker claims (`stalker`)

| Claim | Example | Source field | Cross-check |
|---|---|---|---|
| `stalker_total` | "Stalker Score 72 — highly exploitable" | `stalker.total + .predictability` | Stated score within ±5 + predictability bucket match |
| `stalker_factor` | "Tilts hard after a loss (factor score 80)" | `stalker.factors[].{id,score}` matching `tilts`/`time_trouble`/`limited_rep`/`repetitive` | Factor id present + score within ±10 |

#### 6.2.4 Psychology claims (`psychology`)

| Claim | Example | Source field | Cross-check |
|---|---|---|---|
| `tilt_pattern` | "Loss rate jumps to 68% after a previous loss" | `psychology.tiltAfterLossLossRate` | Stated % within ±5 |
| `timeout_pattern` | "Loses 15% of games on time" | `psychology.timeoutRate` | Stated % within ±5 |
| `resign_pattern` | "Resigns in 60% of losses" | `psychology.resignRate` | Stated % within ±5 |
| `checkmate_rate` | "Wins 40% of games by checkmate" | `psychology.checkmateRate` | Stated % within ±5 |
| `quick_loss_pattern` | "Loses 12% of games under 50 plies" | `psychology.quickLossRate` | Stated % within ±5 |
| `long_game_pattern` | "Long games (>120 plies) are 35% of their losses" | `psychology.longGameLossRate` | Stated % within ±5 |
| `streak_claim` | "Max win streak of 14, longest losing run was 7" | `psychology.{maxWinStreak,maxLossStreak}` | Stated streak ±1 |
| `avg_game_length` | "Their games average 60 plies" | `psychology.avgGameLength` | Stated avg within ±10 plies |

#### 6.2.5 Rival / collision / novelty / checklist / form claims

| Claim | Example | Source field | Cross-check |
|---|---|---|---|
| `rival_record` | "You've played them 8 times — you're 3-2-3" | `rivals[].{name,games,wins,draws,losses,scorePct}` | Counts match the rival entry by name |
| `collision_edge` | "When you play White and they play Black, you score 65% in the Caro-Kann" | `Collisions.whenYouPlayWhite[]` / `whenYouPlayBlack[]` (separate type) | Specific `CollisionLine` exists with matching `eco`/`name`, `yourScorePct` within ±5 |
| `novelty_finding` | "On move 8 in game X they deviated from their book" | `novelty[]` `NoveltyFinding{moves,playedMove,bookMove,bookFrequency,ply,gameLost}` | Matching novelty entry by gameId or `playedMove` |
| `checklist_item` | "Watch out for their kingside attack pattern" | `checklist[]` `ChecklistItem{id,title,detail,severity}` | Checklist entry exists with matching title or id |
| `recent_form_bucket` | "Their last 20 games: 12 wins, 3 draws, 5 losses" | `recentBuckets[]` `{label,wins,draws,losses}` | Bucket exists with matching label + counts |

**20 claim types total.** Roughly grouped: 3 opening, 7 profile, 2 stalker, 8 psychology + rivals/collisions/novelty/checklist/form.

**Opportunity counting** (for citation-rate denominator):
- Each `prep` opening entry (weaknesses + strengths, both colors) = 1 opportunity
- Each `profile` dimension with non-default value = 1 opportunity each (ovr, atk, def, time, mind, ratings entries, peakRating, lowRating, archetype, phaseElo deltas)
- Stalker total + each non-zero factor = 1 opportunity each
- Each `psychology` metric with notable value (defined per-metric — e.g., timeoutRate > 5%, maxWinStreak > 3) = 1 opportunity
- Each rival, novelty finding, checklist item, recent-form bucket = 1 opportunity each
- Each `CollisionLine` in `whenYouPlayWhite` and `whenYouPlayBlack` = 1 opportunity each

A coach response in the opponent-prep category needs to cite ≥85% of available opportunities. Note that "available" is data-driven: an opponent with limited game history may have fewer opportunities, in which case the floor applies to that smaller denominator.

**Cross-source coordination — DEFERRED, measure-then-decide (Aayan 2026-05-17).** The audit (§F.4) flagged composite claims like "Your opponent crushes you in Najdorf positions" (combines opponent-plays-Najdorf from scout AND your win-rate vs Najdorf from user history). Not enumerated as a separate claim type in 1.C — handled by parser emitting two separate claims (one against scout, one against user history). If the coach phrases it as a single sentence, parser splits into two.

**Build against measured behavior, not hypothesis.** After Stage C sweep completes, examine sweep telemetry for LLM responses that span data sources. If composite-claim patterns appear at meaningful rate (rough threshold: ≥5% of turns in `opponent_prep` or `improvement_strategy` categories produce a sentence the parser had to split across scout + user-history validators), file **PR 1.F** to add a `cross_source_claim` type + a coordinator that catches the composite claim atomically. If the pattern doesn't appear, the validator stays unbuilt. See §11.6 for PR 1.F conditional queue entry.

### 6.3 `userHistoryCitation.ts` — improvement-strategy + meta-motivational validator (RESTRICTED 2026-05-17 per audit §D)

**Data source.** Firestore — **`users/{uid}/games` subcollection only** (verified via audit §D.2; other claimed subcollections like `puzzle_stats` and `rating_history` don't exist server-side — they're localStorage atoms). All reads server-side via Firebase Admin (per CLAUDE.md auth model).

**Audit-restricted scope (Aayan 2026-05-17 Option B).** Ship the 3 claim types that ARE server-derivable from the `games` subcollection. Defer the 3 claim types that depend on localStorage data to **PR 1.E (puzzle-stats sync precursor + restore three deferred user-history claim types)** — Aayan-triggered, not auto-rolling.

**Parser claim types shipped in PR 1.C (3 of original 6):**

| Claim | Example | Source | Cross-check |
|---|---|---|---|
| `time_control_performance` | "You're 65% in rapid but only 48% in blitz" | Aggregation over `users/{uid}/games[]` filtered by `timeControl` field + computing W/L/D ratios per bucket | Win rate by time control matches stated value within ±5%. New helper: `aggregateWinRateByTimeControl(games)` |
| `opening_repertoire_performance` | "You score 60% with white in 1.e4 e5 lines" | Aggregation over `games[]` parsing PGN headers (ECO, opening) + result | Stated score% within ±5% over the named opening/color combination. New helper: `aggregateScoreByOpening(games, color?)` |
| `hours_played_claim` | "You've played 120 games this month" | Count + date-range filter over `games[]` | Stated count within ±2; date range matched against `games[].createdAt` timestamps. New helper: `countGamesInDateRange(games, fromMs, toMs)` |

**Parser claim types DEFERRED to PR 1.E (3 deferred):**

| Claim | Why deferred | Restore target |
|---|---|---|
| `rating_trajectory` | Rating history lives in `puzzleStats.ratingHistory` (localStorage atom at [puzzleRating.ts:46](../src/lib/puzzleRating.ts#L46)); no server endpoint reads it | PR 1.E — adds `/api/puzzle-stats` POST endpoint, client syncs on update, server reads from Firestore |
| `puzzle_stats_claim` | Full `PuzzleStats` (rating, totalAttempts, accuracy, streaks, themeStats) is localStorage-only | Same — PR 1.E sync |
| `puzzle_rating_trajectory` | `puzzleStats.ratingHistory[]` time-series — localStorage-only | Same — PR 1.E sync |

**Opportunity counting (PR 1.C scope only):**
- Each distinct time-control bucket the user has played ≥10 games in = 1 opportunity (`time_control_performance`)
- Each opening/color combination with ≥5 games = 1 opportunity (`opening_repertoire_performance`)
- The total game count + date-range coverage = 1 opportunity (`hours_played_claim`)

**Citation rate floors with restricted scope:**
- improvement-strategy: still **≥50%** of available opportunities (floor unchanged; floor measures coverage of what IS available, which is now smaller per user)
- meta-motivational: still **≥20%** (same reasoning)

**Important nuance for the audit-restricted scope.** With 3 of 6 claim types deferred, the citation-rate denominator shrinks. A coach response that previously would have cited puzzle stats (e.g., "your puzzle rating jumped 100 points") now produces zero validator activity for that part of the response — neither a hallucination fire (parser skips because the claim_type isn't in the parser's enumerated list) nor a citation opportunity. **Net effect:** improvement-strategy responses citing only localStorage data will read as "no opportunities, no citations" and pass the floor trivially. This is acceptable for PR 1.C; PR 1.E closes the gap.

**Surface in §5.3.4 pass criteria:** for PR 1.C, citation-rate floor for improvement_strategy applies to whatever opportunities are derivable; PR 1.E will tighten this once puzzle stats are server-readable.

### 6.4 `jhamtaniCitation.ts` — DEFERRED to PR 1.D (Aayan 2026-05-17 per audit §A)

**Original spec scope was wrong.** Audit §A revealed that the §6.4 schema (`:Concept` / `:HAS_COMMENTARY` / `:CommentaryEntry`) does not match the actual loader (`:Commentary` nodes hung off `:Position` via `[:FROM_POSITION]`). Beyond that, live Aura state is unknown — Aayan may have removed the Commentary nodes at some point. The `/api/commentary-by-fen` route has zero in-app callers, and [conceptRetrieval.ts](../src/lib/concept/conceptRetrieval.ts) doesn't reference Commentary at all.

**Aayan's call (audit §A.5 Option C — defer).** `jhamtaniCitation.ts` does NOT ship in PR 1.C. Concept-explanation category has **no automated citation-rate validator** in 1.C.

**What this means for the gate (§5.3.2):**

- **Hallucination ceiling still applies** to concept-explanation responses. The LLM cannot fabricate concepts — the `evalClaim` + `featureDeltaCitation` validators still catch eval-mismatch and false feature deltas inside concept-explanation prose. If the coach says "an outpost is a knight that controls e5" against a position where e5 isn't actually controlled, `featureDeltaCitation` catches the structural-claim error.
- **No per-category citation floor for concept_explanation in PR 1.C.** The 60% floor is dropped from §5.3.4 pass criteria (see §5.3.2 table updated below). Concept-explanation category turns flow through the pipeline but the citation-rate metric is reported as "n/a — validator deferred to PR 1.D" rather than producing a pass/fail signal.

**PR 1.D queued (NOT auto-rolling — Aayan triggers explicitly).** Name: **"Jhamtani wire-up."** Step 1 is **investigation-only**: find where the corpus actually lives today (in-repo `data/chess-commentary/`? live Aura with `:Commentary` nodes? cloud storage? removed entirely?). Decide whether and how to restore it. Then re-spec `jhamtaniCitation.ts` against the verified shape and ship.

**Implication on docs (handled separately).** The audit (§A.5) flagged that 4 prod pages claim "298,000+ Jhamtani expert-commentary pairs" — those will be addressed by a separate doc-fix PR off main, not bundled into PR 1.C. Aayan's directive 2026-05-17.

### 6.5 Citation-rate aggregator — `citationRate.ts`

Pure helper consumed by `runValidationPipeline`:

```ts
export interface Opportunity {
  category: QuestionCategory;
  dataSource: "feature_delta" | "scout" | "user_history" | "jhamtani";
  entry: unknown;            // opaque; the validator knows its shape
  citedByLlm: boolean;       // populated by the parser after match
}

export interface CitationRateResult {
  overall: number;
  byCategory: Record<QuestionCategory, { rate: number; cited: number; opportunities: number }>;
}

export function computeCitationRate(opportunities: Opportunity[]): CitationRateResult;
```

`runValidationPipeline` is extended to accept `dataSources: { scout?, userHistory? }` alongside `featureDelta`. **Note: `jhamtani` data source is deferred to PR 1.D** per audit §A (§6.4); the field is reserved in the type but unused in PR 1.C. Each source is optional; if absent, that source contributes zero opportunities (and zero citations) — appropriate for turns where the source isn't applicable to the question.

---

## 7. Summary commit sequence (AUDIT-REVISED 2026-05-17)

Single PR, ~16 commits in order. Each builds on the prior; no commit standalone-mergeable.

| # | Commit | Approx. LOC |
|---|---|---|
| 1.C.A.1 | Land `categoryClassifier.ts` + cached prompt + tests | ~380 |
| 1.C.A.2 | Land `scoutCitation.ts` + tests (full 20-pattern coverage) | **~1,650** |
| 1.C.A.3 | Land `userHistoryAggregates.ts` helpers + tests | ~280 |
| 1.C.A.4 | Land `userHistoryCitation.ts` + tests (3 derivable claim types) | **~310** |
| ~~1.C.A.5 jhamtani~~ | **REMOVED — deferred to PR 1.D per audit §A** | — |
| 1.C.A.5 | Land `citationRate.ts` helper + extend `runValidationPipeline` (data sources: scout + userHistory, jhamtani reserved) + tests | ~380 |
| 1.C.A.6 | Land persona-data scraper + classifier-run + COMPLIANCE.md (incl. retirement trigger per §1.7.3) | ~470 |
| 1.C.A.7 | Aayan spot-check sample produced; if ≥27/30 pass, persona-script rewrite committed. On failure, Aayan reviews every misclassification before any prompt iteration starts (§1.7.2 anti-auto-iterate rule). | ~200 + replacement of `personas/*.md` |
| 1.C.A.8 | Land dry-run gate harness (expanded for the **four** active validators: PR 1.B's two + scout + userHistory) + fixtures spanning the **five active categories** (concept_explanation marked deferred) + thresholds (revised per §5.3, concept_explanation floor lifted) + initial pass output | ~700 |
| 1.C.A.9 | Demonstrate gate sensitivity via `--override-tolerance=2000` and `--override-citation-floor=0` (new flags). Outputs in commit message. | 0 (script flag only) |
| 1.C.B.1 | Wire `runValidationPipeline` into `/api/enhanced-analysis` behind flag + `wireValidators.ts` helper fetching three data sources (feature delta + scout + user-history; jhamtani slot reserved but unused) | ~440 |
| 1.C.B.2 | Wire into `/api/chat` (same shape, smaller diff) | ~310 |
| 1.C.B.3 | Telemetry forwarding + Sentry tags + tests | ~260 |
| 1.C.C.0 | First synthetic-tester sweep against preview deploy. Capture by-category hallucination + citation breakdowns (concept_explanation citation reported as "n/a — deferred to PR 1.D"). | ~50 KB JSON output |
| 1.C.C.iter.* | **Validator iteration commits (open count)** — one or more, fired by §5.3.1 hard-ceiling rule if any active category misses 95% hallucination on the first sweep. Each iteration fixes the responsible validator (precision tightening, broader claim-type coverage, prompt iteration), re-runs the sweep. Not scope creep — required for merge. | varies |
| 1.C.C.final | Final sweep passes all gate metrics per §5.3.4. PR description summarizes by-category breakdown + total cost + iteration history + the two deferred surface areas (jhamtani for PR 1.D, three localStorage-bound claim types for PR 1.E). | ~50 KB JSON |

**Total PR 1.C audit-revised: ~2,800 lib + ~1,630 test + scripts + fixtures + compliance doc + sweep output + N iteration commits.** Up from ~1,150 / ~400 original; up from ~2,500 / ~1,580 pre-audit revised. Scout expansion drives most of the growth; jhamtani removal and user-history scope reduction partially offset.

### 7.1 Scope correction (Stage A reopened — 2026-05-18)

The audit-revised commit sequence above lists nine Stage A commits (1.C.A.1–1.C.A.9). **Only five shipped under the initial "Stage A sealed" attempt:** classifier, classifier boundary iteration, dry-run harness, gate sensitivity demo, fixture extension. Four were skipped: `scoutCitation` (1.C.A.2), `userHistoryAggregates` (1.C.A.3), `userHistoryCitation` (1.C.A.4), `citationRate` + `runValidationPipeline.dataSources` extension (1.C.A.5). The persona-data work (1.C.A.6–1.C.A.7) was also skipped but is a separable concern (see below).

When Stage B planning surfaced this in [PR_1C_STAGE_B_PLAN.md §0](PR_1C_STAGE_B_PLAN.md), Aayan rejected the tighter Stage B scope (which would have wired only feature-delta + role-diff and treated the unbuilt validators as a follow-up commit). Reopened Stage A 2026-05-18. **Stage B is paused pending the four outstanding items.**

**Rationale:** wiring routes with only feature-delta + role-diff coverage means the Stage C sweep measures opponent_prep and improvement_strategy citation rates against validators that don't exist — meaningless numbers. Stage B would be paid for twice (build, sweep, then re-build the validators, re-sweep). Also, Scout citation and user-history citation are the higher-differentiation validators — the part of the architecture nobody else has. Shipping Stage B without them would ship the commodity half of the validation layer first.

**Stage A redefined.** The original five-commit "seal" is reframed as Stage A.1–A.5 (the work that did ship). The four outstanding items become Stage A.6–A.9, in this order:

| # | Commit | Plan doc | Status |
|---|---|---|---|
| 1.C.A.1 | `categoryClassifier.ts` + boundary iteration | §6.1, classifier boundaries reviewed 2026-05-18 | ✅ shipped (`cc8bd81`, `495a416`) |
| 1.C.A.2 | dry-run gate harness + 20 fixtures + thresholds | §1.2 (renumbered from original A.8) | ✅ shipped (`120653b`) |
| 1.C.A.3 | gate sensitivity demo (`--override-tolerance=2000`) | §1.5 (renumbered from original A.9) | ✅ shipped (`587043a`) |
| 1.C.A.4 | dry-run fixture extension (BAD-11, GOOD-11, ratio metric) | Stage A.2.5 brief | ✅ shipped (`84a5118`) |
| 1.C.A.5 | (build plan rewrite — orchestrator framing, not gating) | [MASTERMIND_BUILD_PLAN.md](MASTERMIND_BUILD_PLAN.md) | ✅ shipped (`6e2907c`, `fd8d851` Stage B plan) |
| **1.C.A.6** | **`scoutCitation.ts` + tests (full claim-type coverage)** | **[PR_1C_SCOUT_CITATION_PLAN.md](PR_1C_SCOUT_CITATION_PLAN.md)** | ⏳ in flight — plan-first |
| **1.C.A.7** | **`userHistoryAggregates.ts` helpers + tests** | TBD (plan addendum after Aayan sign-off on §6.3 scope) | ⏳ queued |
| **1.C.A.8** | **`userHistoryCitation.ts` + tests (3 derivable claim types)** | TBD (plan addendum) | ⏳ queued |
| **1.C.A.9** | **`citationRate.ts` + `runValidationPipeline.dataSources` extension + tests** | TBD (plan addendum — touches PR 1.B sealed surface; Aayan approves the touch as part of this scope correction) | ⏳ queued |

**On the persona-data work (originally 1.C.A.6–1.C.A.7).** Out of Stage A's current critical path. The persona scraper + script rewrite gates Stage C sweep quality (per-category question distribution must reflect real questions, not Aayan's hand-written persona scripts). Two options for resequencing:

- **Option A (default):** ship persona work in parallel with Stage A.6–A.9 since it's independent code. Aayan-triggered when Stage A.7 (userHistoryAggregates) is mid-flight.
- **Option B:** defer persona work until just before Stage C. Stage C runs against Aayan's existing personas first, then re-runs against the scraped-corpus personas after they ship. Two sweep runs, but cleaner separation.

Default Option A unless Aayan signals otherwise. Either way, persona work does NOT gate Stage B from resuming — Stage B unblocks when 1.C.A.6–A.9 seal.

**PR 1.B is touched by 1.C.A.9** — the `runValidationPipeline.dataSources` extension adds optional parameters to the pipeline's signature in `src/lib/mastermind/validators/index.ts`. The "PR 1.B sealed" rule was a planning convenience; extending the pipeline's signature with optional fields is non-breaking and was always implicit in the audit-revised §2.5 scope. Aayan ratified this scope correction 2026-05-18.

**Renumbered commit sequence (the new authoritative version):**

| # | Commit | Status |
|---|---|---|
| 1.C.A.1 – 1.C.A.5 | Classifier, dry-run harness, sensitivity demo, fixture extension, build plan rewrite | ✅ shipped |
| 1.C.A.6 | scoutCitation (this PR adds it) | ⏳ in flight |
| 1.C.A.7 | userHistoryAggregates | ⏳ queued |
| 1.C.A.8 | userHistoryCitation | ⏳ queued |
| 1.C.A.9 | citationRate + runValidationPipeline.dataSources extension | ⏳ queued |
| 1.C.A.10 | persona-data scraper + classifier-run + COMPLIANCE.md (was original 1.C.A.6) | ⏳ Option A: in parallel with A.7; Option B: deferred to A.11.5 pre-Stage-C |
| 1.C.A.11 | persona-script rewrite + spot-check (was original 1.C.A.7) | ⏳ same as above |
| 1.C.B.1 – 1.C.B.3 | Route wiring (Stage B) | ⏸️ paused pending A.6–A.9 |
| 1.C.C.0 – 1.C.C.final | Stage C sweep + iteration | ⏸️ pending Stage B |

Total ETA shift: ~2 weeks of Stage A work re-added; Stage B unchanged in scope but resumes after Stage A seals. Calendar is flexible per [MASTERMIND_BUILD_PLAN.md §11](MASTERMIND_BUILD_PLAN.md) — this resequencing trades calendar for build correctness.

---

## 8. Decisions — RATIFIED 2026-05-17

Original §8 open questions resolved. Plan body updated; this section is the audit trail.

| # | Question | Decision | Section affected |
|---|---|---|---|
| 1 | Footnote-append coexistence | **Option A: stays alongside pipeline** (defense-in-depth) | §2.4 |
| 2 | Streaming gotcha | **Buffer-then-restream with `validating` SSE event** | §2.1 |
| 3 | Total pipeline budget | **30s** | §2.3 |
| 4 | Flag name | **`MASTERMIND_VALIDATORS_ENABLED`** (distinct from agent-loop flag) | §4.1 |
| 5 | "Real regression" definition | **Honor system** — regression introduced unintentionally and caught by the gate before merge | §4.4 |
| 6 | `user_tier` telemetry field | **Populate as `"free"`** (paid tier doesn't exist yet, but the field shape is ISEF-stable) | §3.5 |
| 7 | Stage A rollback procedure | **Pause PR 1.C, ship gate-fix sub-PR, resume** | §1.5 |
| 8 | Persona fidelity at $1/sweep | **Approved** | §5.5 |
| 9 | Structural grounding 0.85 | **SUPERSEDED by Revision 1** — replaced with hallucination ≥95% per category + per-category citation floors | §5.3 |
| 10 | Gate-sensitivity overrides | **Include all four: `--override-tolerance`, `--override-numeric`, `--override-confidence`, `--inject-fixture`** | §1.2 |

### 8.1 New questions added in the 2026-05-17 revision — RESOLVED 2026-05-17 (round 2)

Questions in §1.7.4 and §5.5 resolved. §6 (validator claim-type completeness) still open and sent to tech-lead for review before Stage A code starts.

| # | Question | Decision | Section updated |
|---|---|---|---|
| §1.7.4-a | chess.com forum skip vs scrape attempt | **Skip confirmed.** Documented in COMPLIANCE.md as a known coverage gap. | §1.7.1 (chess.com row), §1.7.3 |
| §1.7.4-b | Spot-check pass criterion (27/30) and behavior on failure | **27/30 confirmed.** On failure, **Aayan reads every misclassification before any classifier prompt iteration starts.** The misclassifications may reveal the categories themselves are wrong, not the classifier prompt. **Only Aayan makes that call. CC does not auto-iterate the classifier prompt on failed spot-check without explicit go from Aayan.** | §1.7.2 step 3 expanded |
| §1.7.4-c | Persona voice-transform semantic strictness | **Strict.** Preserve question type and underlying intent exactly. Only shift tone and vocabulary to match the persona profile. If a scraped question doesn't fit a persona, skip it rather than transform aggressively. Anchor that keeps the synthetic distribution honest against real user distribution. | §1.7.2 step 4 expanded |
| §1.7.4-d | Scrape cadence | **Once at PR 1.C, then quarterly refresh until CMIP launches.** Once CMIP produces real user questions from Chess Masti's own users, retire the scraper entirely. Retirement trigger documented in COMPLIANCE.md. | §1.7.1 (frequency note), §1.7.3 (retirement trigger) |
| §5.5-a | Hallucination ≥95% per category — is it a hard ceiling? | **Hard ceiling. No per-category relaxation, ever.** If a category's first sweep falls short, the fix is the validator — precision-tightening, broader claim-type coverage, prompt iteration — **not the threshold.** **Validator iteration is permitted and expected; threshold relaxation is not. Iterations under this rule are not scope creep — they are required for merge.** | §5.3.1 + §5.3.4 footnote |

**Remaining open for tech-lead review (blocks Stage A code start):**

- **§6.2-§6.4:** parser claim-type lists for `scoutCitation`, `userHistoryCitation`, `jhamtaniCitation`. Are the lists complete? Are there scout/user-history/jhamtani claim patterns the coach makes that I haven't enumerated? Reviewable as-is in §6 of this doc; sent in chat for direct review.

---

## 9. What this PR will NOT do (scope guards)

- Touch the agent loop (Phase 2 / PR 2.x scope).
- Add new Tier A content (Phase 3 / PR 3.x).
- Add chesstalker perspective (Phase 4).
- Flip the production flag (separate ops PR after promotion criteria fire).
- Remove footnote-append (separate follow-up after preview stability window).
- Add per-user feature-flag overrides (out-of-scope for preview-only rollout).
- Change Sonnet/Haiku tier routing.
- Modify `aiResponseValidator.ts` source.
- Build the absolute-state validator (FAILURE_MODES §10f deferred).
- Begin Phase 2 work — per §11 CMIP redirection.

---

## 10. Verification (AUDIT-REVISED)

How I'll prove PR 1.C works pre-merge:

1. **TSC clean** at every commit.
2. **`npm run test` 100% green** at every commit. Net new test count: ~1,630 LOC.
3. **Stage A.1-A.5 proof:** each shipped new validator (`scoutCitation` with 20 claim types, `userHistoryCitation` with 3 claim types) ships with mocked-parser tests covering positive, negative, adversarial cases per claim-type. `userHistoryAggregates` ships with direct unit tests on the 3 aggregator helpers. Citation-rate helper ships with opportunities-counted-correctly tests. **`jhamtaniCitation` does not exist in PR 1.C** — explicitly noted in commit messages and §6.4.
4. **Stage A.6-A.7 proof:** scraper produces a corpus of ≥220 questions (chess.com skipped per §1.7) committed alongside COMPLIANCE.md. Aayan's 30-question spot-check sample committed as a fixture; pass-criterion result (≥27/30) is the gate. Rewritten persona scripts diff'd against originals in PR description. **Strict voice-transform** rule observed per §1.7-c (skip-not-transform when a question doesn't fit a persona).
5. **Stage A.8-A.9 proof:** dry-run gate harness exits 0 with all active-category metrics passing on PR 1.B-as-is; exits non-zero on `--override-tolerance=2000` and `--override-citation-floor=0`. Both runs' outputs in commit messages. Concept-explanation category citation metric reports "n/a — deferred to PR 1.D" rather than producing a pass/fail.
6. **Stage B proof:** at least one passing turn against the preview deploy captured in commit 1.C.B.1 description.
7. **Stage C proof:** full 50-turn sweep against preview with `MASTERMIND_VALIDATORS_ENABLED=true`. **Active-category gate metrics passing** per §5.3.4: hallucination ≥95% per category (all 6 — concept_explanation hallucination still measured), citation ≥ floor per active category (5 — concept_explanation citation deferred). By-category breakdown in PR description.
8. **Telemetry sample:** one full correlation_id's events from a passing turn AND one from a failing-then-recovered turn, both committed as fixtures alongside the sweep output.
9. **Audit deferral surfaced in PR description:** explicit list of what PR 1.C ships vs what PR 1.D + PR 1.E restore (see §11.6 below).

---

## 11. CMIP redirection — post-1.C work is human evaluation, not Phase 2 (NEW 2026-05-17)

### 11.1 The redirection

After PR 1.C merges, **CMIP (Chess Masti Internship Program) feedback infrastructure is the next major workstream — NOT Phase 2 (agent loop refactor)**. This is a phase-ordering change vs the original [BUILD_PLAN.md §3](MASTERMIND_BUILD_PLAN.md) sequencing, which had Phase 2 queued right after Phase 1 completion.

### 11.2 Why CMIP comes first

The synthetic-tester metrics (hallucination rate, citation rate per category, persona fidelity) are *correlates* of coaching quality, not measurements of it. The honest test is: does a real user, reading a coach response, feel like they got a good answer? CMIP captures this signal at scale.

Concretely: CMIP gives interns the ability to (a) flag bad coach responses with a why-it-was-bad note, (b) author the *ideal* response they'd have wanted, (c) ship that data into a Supabase-backed feedback DB. The 1.A-1.D PRs (already shipped 2026-05-17, see [PR_CMIP_1_PLAN.md](PR_CMIP_1_PLAN.md)) put the infrastructure in place; the data accumulation now begins.

The next CMIP phase ("CMIP-2" or "human-eval-rollout") expands this beyond interns to real users via a rating UI on coach responses. Once the human-rating corpus exists, we can run a correlation analysis between the synthetic-tester metrics (PR 1.C) and the human ratings:

- **If correlation is strong:** synthetic-tester gates are doing useful work. Phase 2 unblocks.
- **If correlation is weak:** the metrics need recalibration. Iterate on either the validators (more accurate cross-checks), the category classifier (better question-routing), or the gate thresholds (different floors) before committing to Phase 2's agent loop refactor.

### 11.3 Why this gating is necessary

Phase 2 is a large structural refactor (`runValidationPipeline` becomes one tool among many; the route becomes a tool-using agent loop; AICoachChat.tsx grows tool-call narration UI). Doing that on top of metrics that turn out not to correlate with real user satisfaction would be expensive cleanup. The order-of-operations cost of pausing for CMIP rating data is small (a few weeks) relative to the cost of refactoring on a wrong foundation.

### 11.4 What stays paused

Until CMIP rating data confirms (or recalibrates) the metrics:
- **Phase 2 — Agent loop refactor** (entire phase, all PRs).
- Any new Mastermind tool integrations beyond Stage 3 validators.
- Tier A content authoring (Phase 3) — premature without a stable agent layer.
- Chesstalker perspective (Phase 4) — premature.

### 11.5 What continues

- **CMIP data accumulation** via the already-shipped 1.A-1.D infrastructure.
- **CMIP-2 design** for the human-rating UI (separate planning doc).
- **Bug fixes** in PR 1.C library code as preview surfaces issues.
- **Flag promotion** preview → prod when criteria in §4.4 fire (independent of Phase 2 gating).
- **Synthetic-tester refinement** as classifier or validator quality issues surface.

### 11.6 PR 1.D and PR 1.E — explicit-trigger queue (AUDIT 2026-05-17)

Two Aayan-triggered PRs queued post-1.C. **Neither auto-rolls.** Phase 2 (agent loop refactor) remains blocked on CMIP rating data regardless of 1.D / 1.E state.

#### PR 1.D — Jhamtani wire-up

**Trigger:** Aayan explicit go. PR 1.C completion does not auto-start it.

**Scope:**
1. **Step 1 (investigation only):** find where the corpus actually lives now. Candidates: (a) `data/chess-commentary/` on disk + `scripts/neo4j-loaders/load-commentary.mjs` can re-load to Aura; (b) live Aura with `:Commentary` nodes already present; (c) cloud storage; (d) removed entirely. Audit §A.3 flagged this as unverifiable from the audit branch. Land a sub-doc `PR_1D_INVESTIGATION.md` recording the verified state.
2. **Step 2:** decide whether and how to restore — load to Aura if needed.
3. **Step 3:** re-spec `jhamtaniCitation.ts` against the verified shape (the §6.4 original spec's `:Concept`/`:HAS_COMMENTARY` schema is wrong; actual loader builds `:Commentary` via `[:FROM_POSITION]` from `:Position`).
4. **Step 4:** ship `jhamtaniCitation.ts` + tests + extend `runValidationPipeline.dataSources.jhamtani`. Restore concept_explanation citation floor (60%) in §5.3.2.
5. **Step 5:** if Aura is confirmed populated with `:Commentary` nodes, optionally restore the doc-fix marketing copy (option (a) in the audit §A.5 follow-up).

**Hallucination ceiling for concept_explanation remains active in PR 1.C** (eval-mismatch + feature-citation validators still catch chess-correctness errors within concept-explanation prose). PR 1.D adds the *citation* dimension.

#### PR 1.E — puzzle-stats sync precursor + restore three deferred user-history claim types

**Trigger:** Aayan explicit go. Same explicit-trigger rule.

**Scope:**
1. **Step 1:** add `POST /api/puzzle-stats` endpoint. Client syncs `puzzleStatsAtom` ([puzzleRating.ts:46](../src/lib/puzzleRating.ts#L46)) to Firestore at `users/{uid}/puzzle_stats` (single doc) on every update.
2. **Step 2:** add `aggregatePuzzleStats(uid)` server-side reader. Firebase Admin reads `users/{uid}/puzzle_stats` doc.
3. **Step 3:** extend `userHistoryCitation.ts` parser + cross-check with the 3 deferred claim types — `rating_trajectory`, `puzzle_stats_claim`, `puzzle_rating_trajectory`. Restore the original 6-of-6 §6.3 scope.
4. **Step 4 (couples to MASTERMIND_TOOLS 🟡 partials per audit §D.4):** the same puzzle-stats sync also closes `get_weakness_profile`, `get_srs_state`, `get_repetit_history` from MASTERMIND_TOOLS (those are blocked on the same localStorage-only state). Update MASTERMIND_TOOLS table to ✅ for those tools.
5. **Step 5:** new sweep against preview confirms citation floors at improvement-strategy (50%) and meta-motivational (20%) are still passing with the restored claim types.

#### PR 1.F — `cross_source_claim` coordinator (CONDITIONAL, Aayan 2026-05-17)

**Trigger:** Aayan-explicit, AND the trigger criterion is met. Same explicit-trigger rule as 1.D / 1.E with one addition — the trigger is itself gated on observed behavior.

**Conditional trigger criterion:** after Stage C sweep telemetry is in, examine LLM responses for sentences that span data sources (scout + user-history; in the future scout + Jhamtani, etc.). If composite-claim sentences appear in **≥5% of turns in either `opponent_prep` or `improvement_strategy` categories**, file PR 1.F. Below that threshold, leave the coordinator unbuilt — the per-validator parsers handle the split-claim case adequately. Reporting + criterion check land in the Stage C sweep summary `audit/findings/agent-c-eval/sweep-{date}-summary.md`.

**Scope (if triggered):**
1. New `crossSourceCitation.ts` parser claim type — parser identifies sentences that name attributes from two or more data sources atomically.
2. New `crossSourceCoordinator.ts` — coordinates validator results from scout + user-history (or other source pairs) for composite claims; emits one validator issue per atomic composite rather than two separate ones.
3. Extend `runValidationPipeline` to route composite claims through the coordinator rather than each per-source validator individually.
4. Re-run Stage C sweep against the preview deploy with the coordinator wired; confirm hallucination/citation metrics improve on the composite-claim subset.

**Why measure-then-decide is the right posture.** Building the coordinator on hypothesis means we spend ~600 LOC + tests on a feature that may never fire. Building on measured behavior means the implementation is calibrated against real frequencies in the sweep dataset.

#### Sequencing

PR 1.D, PR 1.E, and PR 1.F are **independent** — any order. Both 1.D and 1.E are unconditional (just await Aayan trigger). 1.F is doubly gated: Aayan trigger AND the ≥5% measurement threshold. Earliest possible ordering:

```
PR 1.C → main
   ├── PR 1.D (Aayan trigger)            — restores concept_explanation citation
   ├── PR 1.E (Aayan trigger)            — restores 3 deferred user-history types
   ├── PR 1.F (conditional + Aayan)      — IF Stage C sweep shows composite-claim
   │                                       rate ≥5% in opponent_prep OR improvement_strategy
   └── CMIP-2 design + rollout           — produces human-rating corpus
        └── correlation analysis         — unlocks Phase 2 or recalibrates metrics
              └── Phase 2 (agent loop)
```

### 11.7 Documentation tasks for this revision

- Update [BUILD_PLAN.md §3 phasing overview](MASTERMIND_BUILD_PLAN.md) to insert "CMIP human evaluation" between Phase 1 and Phase 2, marked as a Phase 2 prerequisite. **Done in the same commit as this plan revision.**
- Update [BUILD_PLAN.md](MASTERMIND_BUILD_PLAN.md) with PR 1.D + PR 1.E queue entries. **Done in same commit.**
- Add a project memory entry noting Phase 2 is blocked on CMIP rating data + PR 1.D / 1.E are explicit-trigger only. **In conversation memory store.**

---

## 11.7 Known measurement gap — `feature_delta` opportunity counter not shipped in A.9 (NEW 2026-05-18)

Stage A.9's `citationRate.ts` aggregates citations per source against per-source opportunity arrays. Stage A.6 shipped `countScoutOpportunities`; Stage A.8 shipped `countUserHistoryOpportunities`. **No equivalent `countFeatureDeltaOpportunities` exists** — the `feature_delta` source has no opportunity counter.

**Consequence for the Stage C sweep:** `game_review` and `position_analysis` (whose [§5.3.2](PR_1C_PLAN.md) primary source is `feature_delta`) produce **hallucination-check data only** (PR 1.B's `featureDeltaCitation` still fires on unsupported claims), **no citation-rate denominator**. Future readers of [§5.3.2](PR_1C_PLAN.md) and Stage C reports should NOT assume those categories are fully measured against their listed citation-rate floors.

**Stage C treatment** (ratified Aayan 2026-05-18 C2): treat null citation-rate as "not measured" and pass-by-default. The hallucination ceiling still applies — PR 1.B catches fabricated feature-delta claims. The categories are not entirely unmeasured, just narrower than [§5.3.2](PR_1C_PLAN.md)'s floors imply.

**Tracking:** `MASTERMIND_CONTEXT/cleanup_followups.md` carries the build spec for `countFeatureDeltaOpportunities` when CMIP data informs what counts as a citable opportunity in feature_delta. Trigger: CMIP-2 surfaces real coach behavior on feature_delta claims, OR Stage C surfaces under-measurement complaints.

This note exists so future readers of `PR_1C_PLAN.md` see the gap explicitly rather than inferring "all six categories are fully measured" from the §5.3.2 table.

---

## 12. Pause (audit-revised)

Plan audit-revised. No code yet. PR 1.C scope is finalized:

- **§6.2** Scout — expanded to 20 claim types (full `ScoutAnalytics` + `Collisions` coverage).
- **§6.3** User history — restricted to 3 server-derivable claim types; 3 deferred to PR 1.E.
- **§6.4** Jhamtani — REMOVED from PR 1.C; deferred to PR 1.D.
- **§5.3.2** concept_explanation citation floor temporarily lifted; hallucination ceiling still applies.

Doc-fix PR (Jhamtani marketing claim removal) shipped separately off main as `docfix/jhamtani-marketing-claim`, commit `e2384f0`.

On approval of this audit-revised plan, **Stage A.1 unblocks**. Build begins with `categoryClassifier.ts` + cached prompt + tests, then bottom-up through `scoutCitation` (largest single piece at ~1,100 lib LOC), `userHistoryAggregates`, `userHistoryCitation`, then `citationRate` + `runValidationPipeline` extension, then persona pipeline, then dry-run harness, then Stage B wiring, then Stage C sweep with possible C.iter.* iterations.
