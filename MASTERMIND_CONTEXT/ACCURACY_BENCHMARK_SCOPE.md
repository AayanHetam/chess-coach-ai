# Accuracy Benchmark — Scope (ChessQA + GCC-Eval)

What it actually takes to produce the first **trustworthy before/after accuracy number** for the coach (flag-off vs flag-on / grounding off vs on). This is deferred-register item #7 — the biggest open gap in the whole accuracy effort. Scoping only; no build yet.

## The two benchmarks — and why they map onto our 20/80 split

| | **ChessQA** | **GCC-Eval** |
|---|---|---|
| Source | CSSLab (the **Maia** team — we already call MAIA_API_URL), Oct 2025, [arxiv 2510.23948](https://arxiv.org/pdf/2510.23948), [github](https://github.com/CSSLab/chessqa-benchmark) | POSTECH, NAACL 2025, [arxiv 2410.20811](https://arxiv.org/abs/2410.20811), [github](https://github.com/ml-postech/concept-guided-chess-commentary) |
| What it measures | LLM **chess understanding** — Structural / Motifs / Short Tactics / Position Judgment / Semantic | Chess **commentary quality** — relevance, completeness, clarity, fluency |
| Scoring | **Verifiable / auto-graded** (python-chess + Stockfish ground truth) | **LLM-judge** (extends G-Eval) + an expert chess model; correlated to human judgment |
| Maps to our… | **verifiable 20%** (the grounding/validator layer) | **strategic 80%** (the calibrated-hedging layer) |
| Data sources | Lichess Puzzles + Lichess Evaluations + Stockfish + ChessBase commentary | concept-guided commentary corpus |

This is a lucky fit: ChessQA tests exactly what the Stage 9 grounding should improve, GCC-Eval tests exactly what CH-1/CH-2 hedging should improve, and ChessQA shares our data sources + comes from the same lab as Maia.

## What we already have (the harness is ~half-built)
- `scripts/eval/stage9-live-test.ts` — runs the voter + validator path on hand-picked positions outside the route, `--output=FILE` JSON, ~$0.10/run. The closest thing to a runner.
- `scripts/synthetic-tester/` — generates (position, persona-question, coach-response, validator-verdict) at scale **through the route** (so it respects MASTERMIND_VALIDATORS_ENABLED), CSV out, `--games-file` for Lichess dumps, cost cap. Currently punts grading to **manual**.
- `scripts/data-pipeline/output/` — icannos studies, GM games, Lichess-evaluated positions already processed (~35MB).
- The Agent-A rubric (`audit/findings/agent-a-eval/scores.md`) — manual Halluc 0/1 over 5 fixtures = the 20%-hallucination baseline (n=5, too small to trust).
- Maia integration (CSSLab's own model) — same provenance as ChessQA.

**The gap is the grader, not the harness.** We can generate coach output flag-off/on today; what's missing is automated hallucination scoring. ChessQA *is* an auto-grader; GCC-Eval is an LLM-judge.

## Track A — ChessQA (recommended first: fast, auto-graded, credible)
Goal: "grounding moves verifiable chess accuracy from X% → Y%, per category."

1. Clone `CSSLab/chessqa-benchmark`; understand the question/answer/scorer format (½ day).
2. **Adapter**: for each ChessQA item, build our grounded prompt (`compileVoterResult().groundingContext` + the coach system prompt) and get an answer in **two modes** — grounding OFF (bare prompt) and ON (with the voter block). Bypass the conversational route and call `callLLM` directly, like `stage9-live-test.ts` does, so the output is parseable by ChessQA's scorer (~1–1.5 days).
3. Run ChessQA's verifiable scorer over both modes; report per-category deltas (½ day + API cost — bounded; pick a sample of N items, log what's dropped).
4. Wire it as `scripts/eval/chessqa-run.ts` + commit results to `scripts/eval/results/` (½ day).

**Effort ≈ 2–3 days + a bounded API spend. Output: a clean, defensible before/after number.**
Caveat to state in the report: ChessQA measures whether grounding helps the model *answer chess questions*, not directly the coach-prose hallucination rate — flag-on should win the Motifs/Short-Tactics/Position-Judgment categories because the answer is injected in-context.

## Track B — GCC-Eval (the 80% / does hedging help)
Goal: does CH-1/CH-2 calibration improve commentary quality + reduce confidently-wrong prose.

1. Clone `ml-postech/concept-guided-chess-commentary`; stand up its G-Eval-extended judge + expert model (this is the cost — an LLM judge + their model) (~1–1.5 days).
2. Generate coach commentary on their position set via the synthetic-tester (flag-off vs flag-on, PROMPT_VERSION 3.1 vs 3.2) (~1 day).
3. Score with GCC-Eval; report the 4 dimensions off-vs-on (½ day + judge API cost).

**Effort ≈ 3–5 days + judge cost.** Softer (LLM-judge) but it's the only thing that measures the 80% the hedging work targets.

## Recommendation
1. **Do Track A (ChessQA) first.** It's auto-graded, ~2–3 days, uses data + a lab we already integrate, and yields the rigorous number we've been missing. It also retroactively validates (or refutes) the entire Stage 9 grounding investment.
2. Then **Track B (GCC-Eval)** to measure the calibrated-hedging (CH-1/CH-2) work on the 80%.
3. Long-term, fold both into the **CMIP** loop so the number is standing, not one-shot.

**Risk to name up front:** if Track A shows grounding moves the needle <~5pp, that reframes the whole accuracy roadmap (the user's earlier "isn't this inefficient?" instinct). That's exactly why it should run before more grounding is built — which is the point.
