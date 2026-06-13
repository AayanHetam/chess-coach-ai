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

## Track B — GCC-Eval hedge measurement (FIRST RESULT, 2026-06-13)

**Did CH-1a (the static hedge, PROMPT 3.1→3.2) actually improve the 80%? First measurement says: no detectable benefit, small fluency cost — but underpowered.**

`scripts/eval/gcceval_hedge_eval.py`: generate coach commentary 3.1 (hedge block stripped) vs 3.2 (with hedge) on ChessQA semantic FEN+move positions (generator gets NO engine eval → judgment territory, where the hedge should matter most), then a Claude judge (GCC-Eval-style) scores **calibration** (engine-grounded: does the comment overclaim vs the Stockfish eval — the on-target metric) + **fluency** (GCC-Eval's verbatim prompt — quality guardrail).

| metric (1-5) | 3.1 | 3.2 | Δ |
|---|---|---|---|
| calibration | 2.29 | 2.21 | **−0.08** (noise) |
| fluency | 4.60 | 4.32 | **−0.28** |

**Read it carefully — it's "unproven," not "proven useless":** N=25 + a coarse 1-5 **Haiku** judge (not GPT-4o logprob-weighted like real GCC-Eval) → low power; −0.08 is indistinguishable from zero. The fluency −0.28 (hedge adds tentative language) is the more consistent signal. Also: the generator got no grounding (artificial isolation); production always grounds. **This tests CH-1a only, not CH-2.** Takeaway: the static hedge we shipped on faith shows **no measurable calibration gain here** — a strong reason to (a) run the rigorous version (GPT-4o judge, N≥100, sharper overclaim metric) before trusting CH-1a, and (b) NOT build CH-1b/extensions until the measurement is solid AND positive. Both calibration scores are low (~2.2/5), i.e. both 3.1 and 3.2 commentary overclaim relative to the engine — the bigger problem than the 3.1-vs-3.2 gap.
**WHY no improvement — investigated 2026-06-13 by reading the actual 3.1/3.2 comments:** the miscalibration is dominated by **confident FACTUAL position errors, not hedge-able strategic over-confidence.** In the generated pairs the coach confidently (a) attributes the move to the wrong player (3.1 "your queen" vs 3.2 "your opponent's queen" on the SAME move), (b) analyzes a *different move than was played* (g4 vs g6), (c) invents tactics ("attacking the rook on c7"). A prose hedge ("frame unverifiable judgments tentatively") **cannot fix errors the model doesn't know it's making** — and the model treats its chess assessments as facts, so the hedge instruction never fires on them. This is exactly why **grounding (Track A) gave +70pp** (it supplies the missing facts) and the hedge gives ~0. Both modes score only ~2.2/5 calibration — both overclaim — which is the real problem, and it's a *factual-grounding* problem, not a *tone* problem.

**Fixed re-run (player-color + eval-after-move confounds fixed, N=25, Haiku judge):** calibration 3.1=2.17 → 3.2=2.29 (**+0.125, still within noise**); fluency 4.44 → 4.16 (**−0.28, consistent cost**). Fixing the confounds did NOT reveal a hidden hedge benefit — the null is robust.

**Implication for CH-1a (shipped on faith):** the hedge reliably costs a little fluency for no detectable calibration gain, because it targets the wrong failure mode. **Recommend: reconsider/revert CH-1a; redirect the 80% effort at the actual failure (the coach confidently misreads the position) — i.e. stronger position-fact grounding reaching the commentary path, not prose tone.** Don't build CH-1b/CH-2 token extensions.

**Runner now supports `--judge openai`** (rigorous GPT-4o logprob-weighted, the true GCC-Eval method) — set up and ready; needs `OPENAI_API_KEY` uncommented in `.env.local` to run (it's commented locally). The GPT-4o number would sharpen the estimate but the mechanism above is already clear from reading the data. **Still TODO for full rigor:** GPT-4o judge run at N≥100; sharper claim-by-claim overclaim metric; relevance/completeness vs human references (our GM-games commentary).

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
