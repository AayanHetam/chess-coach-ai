# Objective
Given a user's game and rating, the coach TEACHES: it surfaces the single most important mistake for that rating band, explains *why* the better move is better through a named, causal concept anchored to engine-verified facts, and — in follow-up — diagnoses the user's reasoning before correcting it, scaffolding via a fade-by-mastery hint ladder rather than dumping the answer, while adapting across games via a per-user weakness memory. Measured by an engine-grounded helpfulness eval that cannot be gamed by saying less.

# Acceptance criteria
# The concrete, checkable bar. The loop cannot exit until every box is genuinely met
# AND a critique pass finds nothing new.

## Phase 1 — Helpfulness eval (BUILD FIRST; nothing else is trusted without it)
- [ ] An offline helpfulness grader scores a coach response on a 7-dimension rubric (0–2 each, max 14): (1) chess-correctness [hard gate: 0 caps total ≤4], (2) diagnostic accuracy, (3) insight depth/the-why, (4) actionability, (5) level-appropriateness, (6) assistance calibration (no infodump, no withholding), (7) focus/non-redundancy. Built into `scripts/synthetic-tester/`.
- [ ] The judge is ENGINE-GROUNDED: it receives FEN, move, eval-before/after, best move, multi-PV (top 3), classification, motif tags, concept-delta, and scores each dimension relative to that evidence only (limits judge hallucination).
- [ ] Claude-family jury (no OpenAI): ≥2 Claude models (e.g. Opus judge + a second Claude cross-check), probability-weighted scoring over {0,1,2}, conditional activation (N/A dims the position doesn't trigger), order/length-balanced for any pairwise use.
- [ ] UNGAMEABLE-BY-TERSENESS proof: a unit/fixture test shows an empty/terse "safe" response scores ~0 on dims 3+4+6 (insight, actionability, assistance) — so vagueness cannot win.
- [ ] Composes with the truthfulness floor as GATE → GRADE: floor (chess.js/Stockfish validators) passes/fails on facts; grader only grades validated responses; the grade (not validator pass-rate) is the optimization target.
- [ ] Frozen 50-position eval set, license-clean (Lichess CC0 or self-authored), spanning all 3 tiers, incl. blunders AND "move was best" cases.
- [ ] BASELINE the current coach (prompt v3.3) on the eval set; record per-dimension medians. (Park for human review of the number.)
- [ ] Judge calibration harness exists; one-time calibration against human-rated responses is a documented human gate before the auto-gate is trusted.

## Phase 2 — Concept-guided single-turn teaching
- [ ] Concept-delta layer: per analyzed move, diff concept scores before/after, pick top 1–2 deltas + enumerate opponent checks/captures/threats; inject into `getCoachChatSystemPrompt`. Reuses `featureDelta.ts` / `detectConcepts()` / `threatTree.ts`.
- [ ] Prompt rules: ONE primary idea per response (relevance filter), name the pattern, causal why (not eval restatement), heuristic→why→override, diagnose-before-correct.
- [ ] Sub-1400 split: `<800` (board vision / is-it-safe counting) vs `800–1200` (hope-chess→real-chess: enumerate opponent CCT) get materially different treatment.
- [ ] Helpfulness score: median ≥ 10/14 on the frozen set across tiers, no dimension averaging < 1.2; wins ≥60% length-balanced pairwise vs v3.3 baseline.

## Phase 3 — Per-user mastery store + cross-game memory
- [ ] A per-user concept-mastery store (net-new persistence) tracking recurring weaknesses across games; the coach's relevance filter uses it to pick the idea that matters for THIS user.
- [ ] Cross-game memory demonstrably changes the chosen primary idea vs a cold user (test).

## Phase 4 — Multi-turn Socratic
- [ ] EMT spine: pre-derived expectation + misconception sets per critical position; coach asks → student answers → coach adjusts, carrying state across `/api/chat` turns.
- [ ] Hint ladder (pump→hint→prompt→partial→answer) fading by mastery; ASK-vs-TELL rule; anti-sycophancy (eval decides, tone stays supportive); anti-over-rejection (check eval-delta before flagging a valid alt).
- [ ] Chat-path parity: Haiku follow-up path scores within 1.5 pts of flagship turn-1 on the same positions.

## Cross-cutting
- [ ] `npx tsc --noEmit` clean; `npm test` green incl. new tests; no chess-correctness regression; the truthfulness floor stays intact (dim 1 = 2 on ≥98% of responses, zero illegal-move/non-existent-piece outputs).
- [ ] Outcome predictivity (human/analytics, quarterly — NOT a CI gate): rubric dims 3/4/6 correlate (Spearman ≥0.3) with users' puzzle-accuracy lift on the taught concept.

gate: human
# Forced human by: the helpfulness grade uses an LLM jury (needs human calibration + spot-check before trusted), tone/usefulness needs your eye, and Phase-3/4 behavior (memory, Socratic dialogue) is judgment-heavy. The loop builds + measures + PARKS; never merges unattended.

# In scope
- `src/lib/prompts/coachChatPrompt.ts` — teaching prompt rules (pedagogy wins over masti where they conflict; keep the voice where they don't).
- A concept-delta layer reusing `featureDelta.ts` / `detectConcepts()` / `threatTree.ts`; injection into `getCoachChatSystemPrompt`.
- `src/app/api/chat/route.ts` — the multi-turn Socratic loop + EMT state across turns.
- A per-user concept-mastery store (new persistence) + cross-game weakness aggregation.
- `scripts/synthetic-tester/*` — the helpfulness grader (Claude jury), eval set, baseline + calibration harness.
- Self-authored few-shot exemplars (extend `src/data/goldStandardExamples.ts`); NAG vocabulary.

# Out of scope / do not touch
- RAG over scraped commentary; baking ANY copyrighted human annotations (GameKnot/Jhamtani, ChessBase/NIC, textbook/LEAP, chess.com/IMS) into shipped prompt or weights — LICENSING LANDMINE. Few-shot must be self-authored; clean human-text source is Lichess CC0 only.
- Training/fine-tuning a self-hosted model (C1 SFT/RL) — later objective.
- OpenAI / cross-vendor jury — not wanted; Claude-family jury only.
- chess.js core legality/mate/draw semantics; Stockfish-before-LLM ordering; Maia contract; Neo4j retrieval; two-tier split mechanics (use them, don't rewrite).
- The truthfulness floor's correctness behavior — extend/compose, never weaken it.

# Test budget
40.00   # USD product API. The jury (≥2 Claude models × eval-set) multiplies per-run cost; baseline + iteration over a phased build needs headroom.

# Build order note
Phase 1 (eval) is the gate for everything. Build + baseline + PARK for human review of the baseline number BEFORE Phase 2. Do not optimize teaching against an uncalibrated metric.
