# Overnight Run — Coach Accuracy Program (2026-07-05)

Autonomous run, Aayan asleep, full merge+deploy authority granted. Deliverable requested: a large architecture document for the AI chess coach explaining how it works and why it doesn't, competitor architectures, then a fix plan and its execution.

## What you asked for → what shipped

1. **The document** — [docs/COACH_ARCHITECTURE_AND_ACCURACY_AUDIT.md](./COACH_ARCHITECTURE_AND_ACCURACY_AUDIT.md). Full subsystem-by-subsystem architecture with file:line evidence (built from 9 parallel code-reading agents), a 38-item defect census ranked by accuracy impact, the competitor/landscape section (chess.com, DecodeChess, Take Take Take, Maia, the academic commentary-generation lineage), and the training-reality verdict.

2. **The "huge missing piece" you suspected** — found it, and it's structural, not a training problem. **The anti-hallucination enforcement pipeline never ran on the path users actually hit.** Production clients hardcode `stream: true`, turn-1 game reviews are force-routed to a "realtime stream" wing where every validator is *log-only*, and raw model output streamed to the user unchecked. Second verified shock: the Maia grounding client called `/predict_at_rating`, an endpoint **that never existed** in the Maia microservice — 404 in every environment since it was built.

3. **You are NOT "training it wrong"** — there is zero fine-tuning anywhere in the product (verified exhaustively). Coach quality is prompting + engine grounding + post-hoc validation over stock Claude models. The fresh eval numbers prove the model was never the problem: with engine grounding, `claude-sonnet-4-6` goes **24% → 96%** on ChessQA short tactics. The accuracy was being lost in the grounding/enforcement/measurement layers, all of which are now fixed.

4. **The fix plan + execution** — [docs/COACH_ACCURACY_FIX_PLAN.md](./COACH_ACCURACY_FIX_PLAN.md), then shipped end to end.

## Shipped to main (all verified locally: tsc + build + vitest + validator gate, merged on green CI)

| PR | What it fixes |
|---|---|
| [#208](https://github.com/AayanHetam/chess-coach-ai/pull/208) | The audit document + fix plan |
| [#209](https://github.com/AayanHetam/chess-coach-ai/pull/209) (PR-A) | Stop feeding the model false facts: chessdb "draw" mislabel, Syzygy DTM plies-as-moves, Black-mate voter asymmetry, sortLines mixed-sign mate bug, timeout-sentinel fabricated evals, positionalClaim false-fire in degraded mode, Maia repointed to the endpoint that actually exists |
| [#210](https://github.com/AayanHetam/chess-coach-ai/pull/210) (PR-C) | Haiku follow-up surface: per-turn oracle facts (the prompt's VERIFIED-POSITION-FACTS rule was previously unsatisfiable), client sends the displayed FEN so follow-ups answer about the right board, uid-scoped contextId |
| [#211](https://github.com/AayanHetam/chess-coach-ai/pull/211) (PR-B) | **The headline fix:** post-stream surgical correction on game_review so error-severity validator fires actually change the user-visible text; severity-aware retry gating so warn-level fires stop burning flagship regenerations |
| [#212](https://github.com/AayanHetam/chess-coach-ai/pull/212) (PR-E) | Measurement resurrection: vendored ChessQA fixtures in-repo, harnesses self-contained, deterministic validator gate in CI, first accuracy numbers on the current flagship |
| [#213](https://github.com/AayanHetam/chess-coach-ai/pull/213) (PR-D) | Cache hygiene: move-history in the key (no more wrong-game narration on transpositions), never cache timeout/fallback non-answers, cache hits re-seed the follow-up contextId |
| [#214](https://github.com/AayanHetam/chess-coach-ai/pull/214) (PR-F) | Prompt integrity v3.6: one canonical opening-move policy (was four contradictory ones), removed the dead BOOK_* branch, removed the "200,000+ puzzles / Neo4j" claim asserted as fact, SAN-truncation annotation |
| [#215](https://github.com/AayanHetam/chess-coach-ai/pull/215) (PR-G) | Revived the dead puzzle-recommendation feature (was a guaranteed-throwing localhost fetch), env trim-hardening (AUTH_ENFORCED / SKIP_RETRIEVAL against the "true\n" hazard), chat temperature clamp, removed 3 dangerous dead files |
| [#216](https://github.com/AayanHetam/chess-coach-ai/pull/216) | Docs status update + fresh numbers |

## First accuracy numbers on the production flagship (claude-sonnet-4-6, since the June swap shipped blind)

- ChessQA short_tactics: **24% → 96% (+72pp)** with engine grounding
- ChessQA motifs: 48% → 48% (0pp) — generic engine context doesn't help motif recognition; the deterministic `detectMotifs` detector remains the lever, and is still unmeasured directly
- 2×2 factual (Sonnet judge): Haiku **2.44 ungrounded → 4.36 grounded**; Sonnet 4.40 → 4.64. Confirms the Haiku follow-up leak on current models and that position-fact grounding closes it to near-parity.

Committed under `scripts/eval/results/*-sonnet46.json`.

## Deliberately NOT done (needs your call — founder-gated)

- **Deploy the Lc0 microservice** — infra + cost decision. PR-A made the voter honest about its absence so nothing false-fires meanwhile.
- **Flip `TRACKING_ENABLED`** (prod LLM telemetry) — consent-gated; the tables still need `supabase-tracking/SETUP.sql` run first.
- **Raise the default analysis depth** past 12, or add a server-side engine re-verification of client evals — a latency/cost tradeoff.
- **Invert the flagship path to the "data-contract" architecture** (verbalize a closed set of grounded facts, the Take Take Take model) — the right long-term direction; too large for one night. Deserves its own design doc now that PR-B proved the correction loop works.

## Research gaps (honest)

The competitor deep-dives on **Chessvia** and **chesscoach.dev**, and the **Reddit sentiment sweep**, could not be completed — the research workflows died repeatedly on session-usage limits and a multi-hour network outage during the run. The landscape section is solid on chess.com / DecodeChess / Take Take Take / Maia / the academic lineage (primary sources), but those three specific targets are flagged as pending in the audit doc and are worth a follow-up when you're awake.

## Process notes

- Ran as multi-agent workflows for the audit + research, then executed the fixes as a 7-PR stack, each verified at its merged tip before the next.
- Two recurring interruptions: Anthropic session-usage limits (resumed workflows from journals via `resumeFromRunId`) and an intermittent network outage (retried pushes/CI waits). No work was lost.
