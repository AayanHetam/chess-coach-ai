# Position-Fact Grounding — the real 80% lever

**Status:** DRAFT direction for review (chess/coaching → Aayan; architecture → tech-lead). Plan-first; no code yet. Supersedes the calibrated-hedging direction for the 80% (see `CALIBRATED_HEDGING_DEFERRED.md`).

## What the benchmarks proved
- **Track A (ChessQA):** engine grounding lifts tactical accuracy **+70pp** — because it supplies the *facts*.
- **Track B (GCC-Eval):** the prose hedge (CH-1a) gave **~0** calibration gain — because tone can't fix factual errors.
- **Root cause (from reading the comments):** the coach's miscalibration is **confident FACTUAL position errors** — it states the wrong player moved, analyzes a *different move than was played*, and invents tactics ("attacking the rook on c7"), all with full confidence. That's a *grounding* problem, not a *tone* problem.

So the 80% lever is: **make sure the coach actually knows the position facts before it comments** — whose move it was, the piece map, what the move attacks/defends, and the eval.

## The likely culprit: the fast follow-up path, not the flagship
- **Flagship `/api/enhanced-analysis`** already injects strong grounding (voter `groundingContext`, full game context). The Track B test exaggerated errors by giving the generator NO grounding — so the flagship path is probably *less* affected.
- **`/api/chat` (Haiku fast tier)** serves **most user turns after move 1**, using a *cached* system prompt + `buildCompactGameContext()` summary (per CLAUDE.md). This is where position-fact grounding is thinnest and Haiku (weaker) is doing the reading — the prime suspect for the confident-misread errors.

## Proposed work (investigate → fix → measure)
1. **Locate the leak (investigation first — don't assume).** Run the Track-B-style factual-error check on BOTH paths *with their real grounding*: flagship vs `/api/chat` follow-up. Quantify the confident-factual-error rate per path. Hypothesis: it concentrates on the Haiku follow-up path.
2. **Strengthen the facts that reach the commentary path.** Likely additions to `buildCompactGameContext` / the chat context: explicit **side-to-move + whose move is being discussed**, a compact **piece map**, the **move's targets/threats** (we already compute `threatTree` / `pieceRoleDiff` / `featureDelta` — thread the relevant slice), and the **eval**. Keep it token-cheap (Haiku context budget).
3. **Measure with the harness we built.** Re-run `scripts/eval/gcceval_hedge_eval.py` (calibration metric, ideally `--judge openai` at N≥100) before/after the grounding change. Success = the absolute calibration score moves off ~2.2/5, AND the ChessQA Motifs/Semantic categories improve when our *real* grounding (not just Stockfish) is injected.

## Open questions for review
1. Confirm the suspect: is the confident-misread error concentrated on `/api/chat` Haiku follow-ups, or also flagship? (Step 1 answers this.)
2. Token budget on the Haiku path — how much extra grounding can we afford before latency/cost regresses (the cost-at-1M-MAU concern)?
3. Is Haiku the right tier for follow-ups at all, or should fact-heavy turns escalate to flagship? (Bigger scope.)
4. Reuse vs rebuild: `threatTree`/`pieceRoleDiff`/`featureDelta` already exist for the flagship validators — can the chat path reuse them cheaply?

## Explicitly NOT doing (per the benchmark)
Calibrated-hedging prose (CH-1a reverted), CH-1b dynamic ladder, CH-2 token extensions, CH-4 — all target confident *tone*, which the data shows is the wrong failure mode.
