# PR 1.C — Stage 3 wiring + gate verification + preview rollout — Plan

**Branch:** `mastermind/stage-3-wire` off `mastermind/stage-3-validators` (which carries 1.B + 1.A + planning-docs).
**Posture:** plan-first per user 2026-05-11. No code yet. Awaiting tech-lead review (architecture / wiring / flag) and Aayan review (gate thresholds / persona-fidelity rubric).
**Why stack on 1.B and not main:** 1.B's validators are referenced directly by the route wiring; merge order per [BUILD_PLAN.md §11.1](MASTERMIND_BUILD_PLAN.md) is planning-docs → primitives → validators+wiring.

---

## 0. Three-stage execution order (the headline)

PR 1.C is three stages in a deliberate order. Stage A must pass before Stage B starts. Stage C runs after Stage B is functionally complete.

| Stage | What | When |
|---|---|---|
| **A. Gate dry-run** | Prove the synthetic-tester gate catches a known-broken validator config — BEFORE touching any route. Build the dry-run harness, run with normal config (pass), run with intentionally weakened config (fail), revert config. | Commits 1–2 |
| **B. Wiring** | Wire `runValidationPipeline` into `/api/enhanced-analysis` and `/api/chat`; route reads `result.telemetry` and forwards to logger; feature flag `MASTERMIND_VALIDATORS_ENABLED`, preview-only. | Commits 3–N |
| **C. Sweep** | Full 50-turn synthetic-tester run against the preview deploy with flag on. Five metrics captured: chess correctness, structural grounding, persona fidelity, tool calls/turn, cost/turn. All five must pass thresholds for merge. | Final commit + PR description |

**Rationale.** "Does the gate work?" and "does the wiring work?" are independent questions. Conflating them means a passing sweep could mean either real quality or a broken gate that catches nothing. Stage A separates them.

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
| 1.3 | Structural-grounding metric definition — "at least one matching delta entry" sufficient, or require N citations per expected? | One match minimum (lenient); revisit if false-pass rate is high |
| 1.5 | What's the rollback procedure if 1.C.A.2 doesn't fail? | Pause PR 1.C, investigate gate, ship gate fix as a separate sub-PR before resuming wiring |
| 1.3 | Persona fidelity in dry-run: skip, or stub with a static rubric (e.g. heuristic length/tone keyword match)? | Skip in dry-run; full metric in Stage C |

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

### 2.5 Files in scope

| File | Change | LOC |
|---|---|---|
| `src/app/api/enhanced-analysis/route.ts` | Add flag check, route through runValidationPipeline when on, emit telemetry forwarding | ~150 |
| `src/app/api/chat/route.ts` | Same shape as enhanced-analysis, smaller | ~90 |
| `src/lib/mastermind/wireValidators.ts` | New: helper that wraps runValidationPipeline with route-specific context (user_id, session_id from cookie), parser injection, callLLM wiring, and the synthetic-streaming re-emit | ~140 |
| `src/lib/mastermind/validatorTelemetry.ts` | New: route-side telemetry forwarder. Reads `result.telemetry`, adds route-level context (user_id, session_id, response_id), calls `logger.info("validator_event", payload)` | ~60 |
| `src/env.ts` | Add `MASTERMIND_VALIDATORS_ENABLED` env var to the Zod schema | ~10 |
| `src/lib/mastermind/__tests__/wireValidators.test.ts` | Unit tests for the wiring helper | ~250 |
| `src/lib/mastermind/__tests__/validatorTelemetry.test.ts` | Unit tests for the telemetry forwarder | ~150 |

**Total Stage B: ~850 LOC + ~400 LOC tests.**

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

### 5.3 The five gate metrics

| Metric | Target | How measured |
|---|---|---|
| Chess correctness | 0 violations per 50-turn run | Sum `cumulativeIssues` with `severity="error"` after pipeline; sum `validateAIResponse` errors. Both must be 0. |
| Structural grounding | ≥ 0.85 | For each turn, ratio of "expected feature citations" (per the persona's scripted prompt) that appear in the response with matching delta entries. Mean across 50 turns. |
| Persona fidelity | ≥ 7/10 per persona, mean ≥ 7.5 | Separate flagship Claude rubric call (one per turn) scoring the response against the persona's tone profile. Costs ~$0.02/turn extra; only runs in sweeps, not production. |
| Tool calls/turn | ≤ 4 median | Count of `tool_call_*` SSE events per turn. Validators don't count (they're not "tools" in the agent-loop sense). In 1.C this is 0 since no agent loop yet — kept as a placeholder metric. |
| Cost per turn | ≤ $0.03 flagship, ≤ $0.005 fast | Sum from telemetry `costUsd` fields + route's `inputTokens/outputTokens` log. |

### 5.4 Comparison to baseline

The baseline is the same sweep against main with flag off. Required outcomes:

| Metric | Baseline (main) | Expected at PR 1.C |
|---|---|---|
| Chess correctness | Some violations (existing piece-on-square misses) | Fewer or equal violations (pipeline adds protection) |
| Structural grounding | Currently uncomputed (no prior measurement) | ≥ 0.85 (new metric, target threshold) |
| Persona fidelity | Currently uncomputed | ≥ 7/10 |
| Tool calls/turn | 0 (no agent loop) | 0 (no agent loop) |
| Cost per turn | ~$0.025 flagship | ≤ $0.035 (overhead ≤ $0.01 per Interpretation A) |

### 5.5 Aayan review items for Stage C

| § | Question | Default |
|---|---|---|
| 5.3 | Persona fidelity rubric — Claude flagship call per turn at $0.02 each × 50 turns = $1 per sweep. Acceptable? | Yes; sweeps run on every PR not on every commit, so ~10 sweeps/month at most |
| 5.3 | Structural grounding ≥ 0.85 — too high for a first measurement, or right? | Right per BUILD_PLAN §9.1. Adjust down if first sweep shows < 0.7 and adversarial inspection shows fixture issues |
| 5.4 | Cost-per-turn budget ≤ $0.035: hard fail or soft warning? | Hard fail. Tech-lead override possible if Stage C shows ~$0.04 but no path to lower; we'd then revisit Interpretation A's overhead assumption |

---

## 6. Summary commit sequence

Single PR, six commits in order. Each builds on the prior; no commit standalone-mergeable.

| # | Commit | Approx. LOC |
|---|---|---|
| 1.C.A.1 | Land dry-run gate harness + fixtures + thresholds + initial pass output | ~400 |
| 1.C.A.2 | Demonstrate gate sensitivity via `--override-tolerance=2000`; output in commit message | 0 (script flag only) |
| 1.C.B.1 | Wire `runValidationPipeline` into `/api/enhanced-analysis` behind flag + helper module | ~300 |
| 1.C.B.2 | Wire into `/api/chat` (same shape, smaller diff) | ~200 |
| 1.C.B.3 | Telemetry forwarding + Sentry tags + tests | ~250 |
| 1.C.C | Synthetic-tester sweep results captured in PR description; sweep output JSON committed to `audit/findings/agent-c-eval/` | ~30 KB JSON |

**Total PR 1.C: ~1,150 lib LOC + ~400 test LOC + dry-run + fixtures + sweep output.**

---

## 7. Verification — how I'll prove this works pre-merge

1. **TSC clean** at every commit.
2. **`npm run test` 100% green** at every commit.
3. **Stage A proof in commit messages:** 1.C.A.1 commit message includes the dry-run output (pass); 1.C.A.2 commit message includes the broken-config output (fail with specific metric that failed). Both reproducible by anyone via `npx tsx scripts/mastermind/validator-gate-dryrun.ts`.
4. **Stage B integration:** at least one passing turn against the preview deploy is captured in commit 1.C.B.1 description (curl or Playwright transcript).
5. **Stage C sweep:** the full 50-turn sweep output committed to `audit/findings/agent-c-eval/`. PR description includes the five-metric summary, baseline comparison, and total cost.
6. **Telemetry sample:** one full correlation_id's events from a passing turn AND one full trace from a failing-then-recovered turn, both committed as fixtures alongside the sweep output.

---

## 8. Open questions for review

| # | Question | Reviewer | Default |
|---|---|---|---|
| 1 | Footnote-append coexistence: Option A (stays alongside pipeline), B (disabled when flag on), or C (removed) — §2.4 | tech-lead | A — defense-in-depth, removable later |
| 2 | Streaming gotcha: buffer-then-restream (proposed) vs other approach — §2.1 | tech-lead | Buffer-then-restream with synthetic stream |
| 3 | Total pipeline budget 30s — too long, too short? — §2.3 | tech-lead | 30s |
| 4 | Flag name `MASTERMIND_VALIDATORS_ENABLED` (distinct from agent-loop flag) — §4.1 | tech-lead | This name |
| 5 | Promotion criterion 3 — "gate has caught at least one real regression" — how do we operationalize "real"? — §4.4 | tech-lead | A regression introduced unintentionally (not by --override flag) AND caught before merge by the gate. Honor-system; revisit if abuse |
| 6 | `user_tier` field in telemetry — populate now or skip until paid tier? — §3.5 | tech-lead | Populate with `"free"` for all in 1.C |
| 7 | Stage A — what's the rollback if gate doesn't fail on broken config? — §1.5 | tech-lead | Pause PR 1.C, ship gate fix as sub-PR, then resume |
| 8 | Persona fidelity rubric — flagship Claude call per turn at $0.02 × 50 = $1/sweep, acceptable? — §5.5 | Aayan | Yes |
| 9 | Structural grounding ≥ 0.85 threshold — right for first measurement? — §5.5 | Aayan | Yes; adjust down if fixtures need rework |
| 10 | Adversarial gate-sensitivity flags: tolerance, numeric threshold, confidence. Others worth supporting? — §1.2 | Aayan | These three; add fixture-injection as a separate `--inject-fixture` flag if needed later |

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

---

## 10. Pause

Plan written. No code yet. Awaiting:

- **Tech-lead** (questions 1-7 in §8): footnote coexistence, streaming, timeout, flag name, promotion criteria, telemetry field, rollback procedure.
- **Aayan** (questions 8-10): persona fidelity cost, structural grounding threshold, gate-sensitivity overrides.

On approval, I begin with 1.C.A.1 (dry-run harness). Code-only work; the doc updates this plan ships with are the `audit/findings/agent-c-eval/` sweep output and the commit messages for the two A-stage demonstrations.
