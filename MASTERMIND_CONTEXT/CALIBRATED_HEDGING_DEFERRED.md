# Calibrated Hedging — Deferred / Loose-Ends Register

Single source of truth for everything the calibrated-hedging effort has consciously
deferred, so nothing rots silently. Updated as pieces land. Parent plan:
`PR_CALIBRATED_HEDGING_PLAN.md`.

Legend: 🔴 not started · 🟡 partial/scaffolded · ✅ done (kept here for trace)

## Shipped (for context)
- ✅ **CH-1a** — static CONFIDENCE & HEDGING block in the system prompt (PROMPT_VERSION 3.2). PR #155 / commit 20cc02e. *Goes live on the next prod deploy.*
- ✅ **Verification-confidence score** (`positionConfidence.ts`) — backbone for CH-1b/CH-2/CH-3. PR #155.
- 🟡 **CH-2 (in progress)** — confidence-aware single-regen policy (this branch). The overclaim *validators* (`positionalClaim`, `materialWin`) already existed; CH-2 is the regen *policy*.

## Deferred — Calibrated Hedging
1. 🔴 **CH-1b — dynamic per-position calibration ladder.** The first attempt was reverted (it over-hedged forced mates, contradicted itself, duplicated per-mistake). To do it right: emit once per *focused* position (reuse the snapshot's `positionConfidence`), reconcile header level with body rungs from one signal, add mate/endgame rungs, skip or genericize for game_review (don't key on before-mistake eval), and don't leak the "VERIFICATION:" label to users. Wire alongside CH-2's focused-snapshot access.
2. 🔴 **CH-2 bare-evaluative token extension.** Bare `winning` / `crushing` / `losing` (not "winning material"/"completely winning", which `materialWin`/`positionalClaim` already catch) when the position is near-equal. Deferred because these are exactly the high-false-positive tokens the existing validators deliberately excluded; needs a tight precision gate + a precision test before it's safe.
3. 🔴 **CH-2 forcedness token group (Q5).** `the only move` / `forced` / `must play` / `no choice`. Needs "is this the sole legal recapture / only non-losing move?" detection (chess.js) to avoid false positives on genuinely forced moves.
4. 🔴 **CH-3 — user-facing confidence spectrum UI.** Render `positionConfidence` as engine-verified-vs-judgment (NOT a quality bar) + the low-grounding disclaimer. `confidenceDisclaimer()` is written and exported but **currently has zero callers** — CH-3 is its consumer. Apply the design OS (glass/MUI, no Tailwind).
5. 🔴 **CH-4 — plan-certainty token group.** `the winning plan` / `the correct plan` / `you must` / `definitely should`. Only if CH-2 telemetry shows it clears the precision bar.
6. 🔴 **Severity-aware retry gating.** Pipeline still uses `passed: issues.length === 0` (any warn → regen). The intended model is `passed: errors.length === 0` with warn→retry, error→fallback. Intersects the CH-2 regen policy; revisit together once Lc0/Maia make `error`-severity escalations actually fire.

## Deferred — Measurement (the headline gap)
7. 🟡 **ChessQA benchmark — first cross-category results (scaled 2026-06-13).** Scoped in `ACCURACY_BENCHMARK_SCOPE.md`. Runner `scripts/eval/chessqa_grounding_eval.py` (now concurrent, `--workers`; needs cloned CSSLab/chessqa-benchmark + python-chess venv + Stockfish). Claude Sonnet 4, OFF (bare) vs ON (Stockfish eval+PV injected):

   | Category | N | OFF | ON | Δ |
   |---|---|---|---|---|
   | Short Tactics | 50 | 18% | 88% | **+70pp** |
   | Motifs | 25 | 32% | 32% | **0pp** |
   | Semantic | 25 | 84% | 80% | **−4pp** |

   **The finding:** Stockfish grounding helps massively ONLY where the answer *is* the engine output (tactics). It does **nothing** for motif perception (eval/PV doesn't encode "there's a fork") and slightly *hurts* semantic commentary (within noise). This: (a) validates the grounding investment for the verifiable tactical/eval slice; (b) validates the separate **motif detector** (Stockfish is the wrong tool for motifs); (c) confirms the **80% strategic/semantic prose is NOT helped by engine grounding** → the calibrated-hedging + commentary-data lever is the right one there (Aayan's "use commentary data" instinct). **Caveats:** Motifs-ON used Stockfish context, NOT our `detectMotifs` detector — so "Motifs 0pp" means *generic engine context* doesn't help motifs, it does NOT test our actual motif grounding (v2: inject the detector's output). N still small for motifs/semantic; Semantic −4pp within noise. **STILL TODO:** Motifs with the real detector; Position Judgment (exact-cp, harsh); larger N; **GCC-Eval for the 80%**.
8. 🔴 **Per-validator PRECISION testing.** We test that validators *fire* (recall); we do NOT measure how often they wrongly flag a correct statement (false-positive rate). For a trust moat, precision is the bigger risk. Build a corpus of *correct* confident sentences + assert the validators stay quiet.
9. 🔴 **CMIP → standing eval-set.** The 80% (strategic/pedagogical prose) can't be engine-graded; the CMIP feedback portal is the designed human-eval feeder. Nothing consumes it as a benchmark yet.
10. 🔴 **Production validator telemetry mining.** The flag's been on ~2 weeks; `citation_rate` + per-validator fire counts are accruing. Mine them for a real-traffic engagement/precision signal.

## Deferred — Infra / Ops
11. 🔴 **Lc0 deployment.** `LC0_API_URL` is unset in prod → Lc0 grounding is dark → `positional_plan` MED→HIGH upgrades + Lc0-veto severity escalation never fire in production. Separate infra workstream.
12. 🟡 **Prod deploy.** CH-1a + the cleaned `MASTERMIND_VALIDATORS_ENABLED="true"` value land on the next chessmasti.com deploy. No action needed — just don't forget it changes live coach behavior.

## Deferred — carried from earlier grounding work (cross-ref)
13. 🔴 **M2 await-ordering invariant** — snapshot must be awaited before `withPipelineTimeout`. Review-enforced via the route comment; not unit-testable without timing injection. See [[project_stage9_validators_open]].
14. 🟡 **`positionConfidence` snapshot consumers** — threaded onto `VoterSnapshot` (optional) but only CH-2 (regen) and CH-3 (UI) read it. Until both land it's partly inert scaffolding (intentional).
