# MASTERMIND_BUILD_PLAN.md

The executable build plan for the Mastermind agentic chess coach. Reads as a self-contained brief for any builder (human or agent) walking in cold. Cross-references the static knowledge in this directory and the spec in [FUTURE_IDEAS.md §1](../FUTURE_IDEAS.md).

**Authored:** 2026-05-11. **Scope posture:** quality and innovation first; time-effectiveness explicitly de-prioritized (per user 2026-05-11). **Build kickoff was originally targeted for 2026-05-22**; user pulled in 11 days.

---

## 0. How to use this doc

- **First-time builder:** read sections 1, 2, and 3 to get oriented (~10 min). Then read the phase you're about to ship (4–8) in full. Treat sections 9–11 as reference.
- **Returning builder:** jump to the phase section. The mandatory call-site matrix at the bottom of each phase is the merge contract.
- **Stale-line-number disclaimer:** every file:line citation in this doc was verified against working-tree state on **2026-05-11**. `route.ts` has grown from 1,082 (CLAUDE.md citation) to 1,440 lines; numbers below are current. If a citation drifts > 50 lines from reality, fix the doc inline rather than re-deriving from scratch.

### Glossary

- **Mastermind** — the agentic coach surface. Tool-using Claude loop built into the existing `/api/enhanced-analysis` route + `AICoachChat.tsx` UI.
- **Stage 3 grounding** — the feature-delta + tablebase capability layer that makes coaching prose feel like a coach, not a templated engine. Per Reddit-thread audit 2026-05-08.
- **Tier A** — the pre-loaded data and content in `/data/` that the agent calls into for common asks (GM games, drills, endgame studies, opening traps). Listed in [MASTERMIND_TIER_A_GAPS.md](MASTERMIND_TIER_A_GAPS.md).
- **Tier B** — live-fetched tools (Lichess endpoints, chess.com, tablebase). Listed in [MASTERMIND_TOOLS.md](MASTERMIND_TOOLS.md) under `fetch_external`.
- **Mandatory call site** — every new tool ships with a designated first consumer in production code. No "built but never called." Contract enforced per [MASTERMIND_TOOLS.md §Mandatory call sites](MASTERMIND_TOOLS.md#mandatory-call-sites--the-anti-built-but-never-called-contract).
- **Quiescent position** — no captures pending, no checks, eval stable within 30 cp of the line's terminal eval. The resolution point of a variation.

---

## 1. North star and quality bar

The Mastermind is the **smart surface**. A user can type any of:

- "Why did I lose this rook ending?"
- "Show me Fischer-Spassky 1972 game 6"
- "Drill me on knight movement"
- "What's my biggest weakness vs 1.e4 players?"
- "Compare these two candidate moves at move 22"

…and Claude interprets the request, picks tools, runs them, and composes a coach-grade answer. Same chat surface, same `enhanced-analysis` route — no menu of separate features.

**Quality bar — what "done" looks like for a Mastermind turn:**

| Dimension | Target | How measured |
|---|---|---|
| Chess correctness | Zero invented lines, pieces, squares, evals | `aiResponseValidator.ts` + new `eval_mismatch` check (§9.2) |
| Structural grounding | Every claim about position change cites a feature delta from Stage 3 | Synthetic-tester rubric (§9.1) |
| Endgame grounding | Every ≤7-piece claim cites tablebase truth (category, DTM, DTZ) | Eval fixtures cover Lucena, Philidor, KP-vs-K |
| Persona fidelity | Tone matches user's `coachTone` and current persona profile | Synthetic-tester scores each turn under 5 personas (§9.1) |
| Cost per turn | Median ≤ $0.03 flagship, ≤ $0.005 fast | Per-tool telemetry (§9.4) |
| Latency to first token | ≤ 1.5 s p50 | SSE timing in `enhanced-analysis` |
| Tool-call transparency | Every tool call narrated when `narrate` visibility set | UI inspector panel (§5) |

The competitive thesis: **UI craft + grounded coaching prose** as the moat. Reference design language in [design-inspiration/atlaseducation/](../../design-inspiration/atlaseducation/). Every quality decision below should reinforce one of those two pillars.

---

## 2. Mental model of the current system

Builder must internalize these five facts before touching code.

### 2.1 The LLM funnel

Every server-side LLM call goes through [`callLLM()`](../src/lib/llmProvider.ts) at [llmProvider.ts:411](../src/lib/llmProvider.ts#L411). Streaming variant at [llmProvider.ts:344](../src/lib/llmProvider.ts#L344). Anthropic (Sonnet 4 / Haiku 4.5) is primary; OpenAI (gpt-4o / gpt-4o-mini) is the fallback — wired but `OPENAI_API_KEY` not configured in prod (treat Anthropic as sole provider in external copy).

Callers use a `tier: "flagship" | "fast"` — never a model name. **`cacheSystem: true` is already supported** at [llmProvider.ts:63,106,236](../src/lib/llmProvider.ts#L63). Verify every Mastermind callsite sets it for the system prompt and the static knowledge bundle.

### 2.2 The flagship analysis route

[`src/app/api/enhanced-analysis/route.ts`](../src/app/api/enhanced-analysis/route.ts) — 1,440 lines. Current shape:

- **L4**: imports `annotatePosition`, `annotationToPromptContext`.
- **L462**: `MOVE-BY-MOVE ANALYSIS` section assembly.
- **L469**: severity classification `BLUNDER / MISTAKE / INACCURACY / MINOR`.
- **L528**: `TOP MISTAKES` section assembly.
- **L541**: `annotatePosition(game.fen())` — only called once, on the **final FEN**. This is the gap Stage 3 closes.
- **L551–574**: `sortedMistakes` array built; top 3 sliced.
- **L698–700**: per-move classification thresholds (drop ≥ 300 / 150 / 50 cp).
- **L739**: `MOVE-BY-MOVE NARRATIVE` block pushed to `sections`.
- **L745–752**: `TOP MISTAKES` line construction and push.

Per-move loop is the integration site for Stage 3 (§4).

### 2.3 The frontend

[`src/components/AICoachChat.tsx`](../src/components/AICoachChat.tsx). SSE consumed at [L2362](../src/components/AICoachChat.tsx#L2362) via `fetch("/api/enhanced-analysis", …)`. Inline puzzles render in chat bubbles (architectural constraint — do not move to separate routes). Same surface will host:
- Tool-call narration bubbles (§5.2)
- Position-with-arrows overlays for `show_board_with_arrows` (§5.3)
- Inspector panel for trace debugging (§5.4)

### 2.4 The position annotator

[`src/lib/positionAnnotator.ts`](../src/lib/positionAnnotator.ts). Exports `annotatePosition(fen) → PositionAnnotation` with: threats, motifs, themes, pawn structure, king safety, piece activity, hanging pieces. Currently called **once** per analysis (final FEN only) at route.ts:541. Stage 3 calls it on N FENs per move and diffs them.

### 2.5 Auth + persistence

Server-side session via httpOnly cookie (`cm_session`). Firestore reads via Firebase Admin SDK. Three persistence tiers:
- **Firestore**: user profile, saved games, repertoire, chat history
- **IndexedDB**: client puzzle progress, SRS state, RepetIT history
- **Neo4j**: puzzle graph (themes, similarity)

Mastermind tools that read user state are listed in [MASTERMIND_TOOLS.md `read_user_state`](MASTERMIND_TOOLS.md#read_user_state). Several are 🟡 partial: their data lives in localStorage only and needs a server endpoint before the agent can read it on demand.

---

## 3. Phasing overview (REVISED 2026-05-17)

Five phases as before, with one new interstitial phase between Phase 1 and Phase 2: **CMIP human evaluation**. Phase 2 is blocked on CMIP rating data confirming (or recalibrating) the synthetic-tester metrics.

| Phase | Theme | Ships in PRs | Unlocks |
|---|---|---|---|
| 1 | **Stage 3 grounding (expanded)** | 3 PRs (1.A, 1.B, 1.C) | Coach-grade prose in flagship; primitives for Phase 2; synthetic-tester gate |
| **1.5** | **CMIP human evaluation** | 1.A-1.D shipped 2026-05-17; CMIP-2 (rating UI rollout) next | Real-user feedback corpus; correlation analysis vs synthetic-tester metrics |
| 2 | **Agent loop refactor** | 4 PRs — **BLOCKED on CMIP rating data** | Tool-using Claude inside `/api/enhanced-analysis` |
| 3 | **Tier A content + tools** | 5 PRs | GM games, drills, endgame studies, opening traps |
| 4 | **Multi-perspective + persona** | 2 PRs | Chesstalker voice, richer persona conditioning |
| 5 | **Innovation + distribution** | rolling | Reddit bot, browser ext, Lichess studies export |

### 3.1 Why CMIP gates Phase 2 (added 2026-05-17)

The synthetic-tester metrics introduced in PR 1.C (hallucination rate per category, citation rate per category, persona fidelity) are *correlates* of coaching quality, not measurements of it. They proxy "does this response cite the right grounded data without inventing claims?" — but they don't measure "does a real user feel like they got a good answer?"

CMIP closes that gap. Interns (1.A-1.D) flag bad responses and author ideal ones; CMIP-2 expands to real-user ratings via a UI on the coach surface. Once enough rating data accumulates, a correlation analysis between synthetic-tester metrics and human ratings tells us whether the gate is doing useful work:

- **Strong correlation:** the metrics are real proxies. Phase 2's agent loop refactor unblocks.
- **Weak correlation:** the metrics need recalibration. Iterate before committing to Phase 2.

Phase 2 is structurally large (route becomes tool-using agent loop, AICoachChat grows tool-call UI, runValidationPipeline becomes one tool among many). Building it on metrics that don't correlate with user satisfaction is expensive cleanup. The order-of-operations cost of pausing for CMIP data is small relative to that risk.

See [PR_1C_PLAN.md §11](PR_1C_PLAN.md) for the detailed CMIP redirection writeup.

**No work in this directory ships outside this phase plan.** Backlog items in MASTERMIND_TOOLS.md `STATUS: design-only` that don't fit a phase below are deferred until they earn a first consumer.

---

## 4. Phase 1 — Stage 3 grounding (expanded scope)

The user's directive on 2026-05-11 was "increase scope significantly, chase quality and innovation." Original Stage 3 (MASTERMIND_TOOLS.md) was four tools: `compute_feature_delta`, `find_resolution_point`, `fetch_lichess_tablebase`, `compare_features`. Expanded scope adds **seven more capabilities** that turn the same loop into a meaningfully smarter analysis.

### 4.1 Capability set (11 capabilities, 3 PRs)

| # | Capability | New in this scope? | First consumer |
|---|---|---|---|
| 1 | `compute_feature_delta(fenBefore, fenAfter, fenAtResolution?)` | Original | Per-move loop ≥ INACCURACY |
| 2 | `find_resolution_point(fen, pv)` | Original | Used by #1 |
| 3 | `fetch_lichess_tablebase(fen)` | Original | Per-move loop, ≤7 pieces |
| 4 | `compare_features(fenA, fenB)` | Original | Tool layer (Phase 2 consumer) |
| 5 | **Eval-mismatch validator** | **Expansion** | Validator pipeline post-LLM |
| 6 | **Regenerate-on-validation-failure** | **Expansion** | Validator pipeline; replaces footnote-append |
| 7 | **Hybrid resolution: heuristic → LLM tag for low-confidence cases** | **Expansion** | `find_resolution_point` internal |
| 8 | **Piece-role tracking** (defender → attacker, attacker → pinned, etc.) | **Expansion** | `compute_feature_delta` output |
| 9 | **Threat trees** (full "if X then Y" implications, not just resolved/new lists) | **Expansion** | Per-move loop, BLUNDER class |
| 10 | **`evaluate_position_complexity`** wired into per-move loop | **Expansion** | Decides depth budget per move |
| 11 | **`find_critical_moments`** wired into per-move loop | **Expansion** | Top-3 critical, not top-3 worst-drop |

#### Why expand by these specific 7

- **5, 6** — closes the hallucination footgun in [aiResponseValidator.ts:60–86](../src/lib/aiResponseValidator.ts#L60-L86). Currently the validator (a) silently swallows invalid FENs at L60–63 and (b) appends a generic disclaimer instead of regenerating. Coaching surface that says "may be inaccurate, please verify" is a UX scar. Eval-mismatch is the third validator type that was declared but never implemented (`ValidationIssue.type` at L17). Fixing this is on the audit backlog and lands cleanly with Stage 3 because Stage 3 introduces structured cross-checks (Stockfish eval vs LLM claim) for free.
- **7** — addresses [MASTERMIND_FAILURE_MODES.md §10a-10b](MASTERMIND_FAILURE_MODES.md#10a-resolution-point-heuristic-misclassifies-a-tactical-position-as-quiescent): the heuristic-only resolution point misclassifies zwischenzug/deferred-recapture patterns ~20% of the time per the doc. Hybrid (heuristic by default, LLM tag for the ~20% low-confidence cases) trades a fractional token cost for a real prose-quality lift on the very hardest fixtures.
- **8** — semantic deltas. Today a "feature delta" is "outpost gained on e5". Adding piece-role tracking lets the LLM say "your knight, previously the only defender of d6, is now an attacker on e5 — but d6 is undefended." This is the kind of sentence Take Take Take generates; we don't today.
- **9** — `threats: { newThreats, resolvedThreats }` is a flat list in the current schema. A threat tree captures the implication: "if Black plays …Qxd4, then Rxd4 Bxd4 wins the rook for a bishop." This is the unit a coach explains, not the individual list elements.
- **10, 11** — already design-only in [MASTERMIND_TOOLS.md `engine_analyze`](MASTERMIND_TOOLS.md#engine_analyze). Wiring them in Phase 1 means the per-move loop spends Sonnet only on the moves that matter (top-3 critical, not top-3 worst-drop), and uses complexity to decide whether to elaborate or compress. Material cost saving and prose quality lift in the same change.

### 4.2 PR 1.A — Primitives + tests (~800 LOC)

**Branch:** `mastermind/stage-3-primitives`

**New files:**
- `src/lib/mastermind/featureDelta.ts` — exports `compute_feature_delta`, `find_resolution_point`, `compare_features`, `diffAnnotations`.
- `src/lib/mastermind/pieceRoles.ts` — exports `classifyPieceRoles(fen) → Map<Square, Role[]>`. Roles: `attacker`, `defender`, `pinned`, `pinning`, `overworked`, `bad-bishop`, `outpost`.
- `src/lib/mastermind/threatTree.ts` — exports `buildThreatTree(fen, depthBudget) → ThreatTree`. Recursive: for each opponent threat, what defense breaks it, and what new threat the defense creates.
- `src/lib/mastermind/lichessTablebase.ts` — exports `fetch_lichess_tablebase(fen)`. Thin proxy + 24h in-memory cache.
- `src/lib/mastermind/complexity.ts` — exports `evaluate_position_complexity(fen, multipv) → ComplexityScore`. Combines fan-out, eval spread, forcing-sequence presence.
- `src/lib/mastermind/criticalMoments.ts` — exports `find_critical_moments(positions) → CriticalMoment[]`. Wraps the per-move eval array.
- `src/lib/mastermind/__tests__/` — Vitest suite covering: empty-delta on identical FENs, symmetric piece trade, KRK tablebase, threat tree depth limit, complexity invariants.

**Pure functions only.** No network in PR 1.A except `fetch_lichess_tablebase`. No edits to `route.ts` yet — those land in PR 1.B.

**Acceptance gate:** all Vitest tests green; `npx tsc --noEmit` clean.

**Unit-test vs production gap (tech-lead 2026-05-11):** PR 1.B's adversarial metaphorical-prose tests verify validator **logic** against mocked parser output, not real Haiku classification quality under the cached system prompt. The parser-quality question — does real Haiku correctly classify "the queen is screaming at h7" as metaphorical at production traffic volumes? — is answered by PR 1.C's synthetic-tester sweep against a preview deploy. See [PR_1B_PLAN.md §13.1](PR_1B_PLAN.md) for the full split.

### 4.3 PR 1.B — Validator hardening (~400 LOC)

**Branch:** `mastermind/validator-eval-mismatch`

**Edits to [`aiResponseValidator.ts`](../src/lib/aiResponseValidator.ts):**
- L60–63: replace silent invalid-FEN catch with a typed sentinel `{type: "invalid_fen", fen, error}`. Surface upstream — do not swallow.
- L17: implement `eval_mismatch` validator. Walks the LLM response for eval claims (`"+1.2"`, `"−3.4"`, `"winning"`, `"slightly worse"`), cross-references against Stockfish eval at the cited move. **Disagreement > 150 cp → flagged** (per user 2026-05-11; tradeoff: stricter 50 cp would over-flag low-stakes verbal hedges like "slightly worse"; looser 200 cp lets through coaching-misleading claims).
- L71–78: replace footnote-append with **regenerate-on-error** path. If validator returns issues, re-call `callLLM` with a system-prompt amendment ("Your previous response contained these errors: …. Regenerate, addressing each."). Cap at one regenerate per turn to bound cost.
- New: `validateFeatureDeltaCitations(response, deltas)` — checks that every "X gained Y" / "X lost Y" sentence in the LLM response corresponds to an actual entry in the Stage 3 delta. False citation → flag.

**New files:**
- `src/lib/validation/__tests__/evalMismatch.test.ts` — Vitest. Fixtures: LLM claims "+2.0" when Stockfish says +0.4 (flag); LLM says "winning" when eval is +0.3 (flag with tolerance); LLM cites delta entry that exists (pass); LLM invents a delta entry (flag).

**Acceptance gate:** regenerate-on-error fires correctly on a known-bad fixture; idempotent on a known-good one.

### 4.4 PR 1.C — Wire into `enhanced-analysis` (~600 LOC)

**Branch:** `mastermind/stage-3-wire`

**Edits to [`route.ts`](../src/app/api/enhanced-analysis/route.ts):**

1. **L541 — promote single annotation to per-move array**: build a `Map<halfMoveIdx, PositionAnnotation>` covering every flagged move's `fenBefore`, `fenAfter`, and `fenAtResolution`.
2. **L551–574 — replace `sortedMistakes` with `criticalMoments`**: call `find_critical_moments` on the eval array. Top-3 by criticality (which weights eval drop + complexity + phase), not raw drop.
3. **Per-move loop (around L580–620)**: for each critical move, call (a) `compute_feature_delta`, (b) `classifyPieceRoles` on `fenAfter`, (c) `buildThreatTree` if classification = BLUNDER, (d) `fetch_lichess_tablebase` if piece count ≤ 7.
4. **L745–752 — extend `TOP MISTAKES` to `## Position changes`**: emit a block per move with delta, roles, threat tree, tablebase. Assert presence: if a move is in `TOP MISTAKES` but lacks a delta block, omit from the list (the mandatory-call-site contract).
5. **Complexity-aware depth budget**: for moves where `complexityScore < 0.3` (quiet positional moves), use `tier: "fast"` for the elaboration; flagship for the rest. Saves ~40% on the bill per the cost-projection spreadsheet (§9.4).
6. **Validator pipeline integration**: wire PR 1.B's regenerate-on-error path into the post-LLM step.

**Acceptance gate:**
- Re-run the 5-fixture coaching eval at [`audit/findings/agent-a-eval/`](../audit/findings/agent-a-eval/).
- Principle-citation avg ≥ 1.6 per move (was the original §1.4 acceptance).
- **Two new sub-metrics:** structural-claim grounding (did the LLM cite a feature that actually changed?) ≥ baseline + 0.5; eval-mismatch rate (LLM eval claims disagreeing with Stockfish > 100 cp) ≤ 2% (down from current ~12% per a manual pass).
- Synthetic-tester run (§9.1) on the 10 master-game PGNs × 5 personas shows no regression on coaching-quality score and a measured uplift on grounding metrics.

### 4.5 Phase 1 mandatory call-site matrix

| Tool | First consumer | Verification |
|---|---|---|
| `compute_feature_delta` | Per-move loop at route.ts:580 | Every critical move emits `## Position changes` block |
| `find_resolution_point` | `compute_feature_delta` internal | Vitest covers 3 quiescence cases |
| `fetch_lichess_tablebase` | Per-move loop at route.ts:600 | Endgame fixtures show grounded category + DTM/DTZ |
| `compare_features` | **Deferred to Phase 2** (agent loop few-shots). Tool ships in 1.A so it's battle-tested as a primitive. | n/a in Phase 1 |
| `classifyPieceRoles` | Per-move loop at route.ts:585 | Roles appear in `## Position changes` block |
| `buildThreatTree` | Per-move loop at route.ts:590 for BLUNDER class only | Tree structure appears for every blunder |
| `evaluate_position_complexity` | Per-move loop at route.ts:570 | Drives tier selection |
| `find_critical_moments` | Per-move loop at route.ts:551 | Top-3 by criticality, not raw drop |
| `validateFeatureDeltaCitations` | Validator pipeline post-LLM | Regenerate fires on synthetic false-citation fixture |

---

## 5. Phase 2 — Agent loop refactor

Phase 1 made the primitives load-bearing in production. Phase 2 wraps them in a Claude agent loop that the user actually talks to. Targets Sequencing step 5 in [FUTURE_IDEAS.md §1](../FUTURE_IDEAS.md#sequencing--not-a-near-term-build).

### 5.1 PR 2.A — Tool catalog + schema layer (~400 LOC)

**Branch:** `mastermind/tool-catalog`

**New files:**
- `src/lib/mastermind/tools/index.ts` — registry of all callable tools, conforming to the `MastermindTool<I, O>` schema from [MASTERMIND_TOOLS.md §Schema contract](MASTERMIND_TOOLS.md#schema-contract--applies-to-every-tool-below).
- `src/lib/mastermind/tools/registerTool.ts` — registration helper; enforces Zod input/output schemas.
- `src/lib/validation/schemas.ts` — **extend** existing AUDIT-PHASE-1.4 file with the Zod schemas for every Stage 3 tool input and output.

**First registered tools (the 17 ✅ wraps + Stage 3's 4 + the 7 from Phase 1):** 28 tools available on day 1.

**Validation discipline:** every tool's `invoke()` must `inputSchema.parse(input)` first. Bad inputs throw; the agent loop handles the throw as a tool-result error and decides next step.

### 5.2 PR 2.B — Anthropic SDK tools mode + SSE adapter (~600 LOC)

**Branch:** `mastermind/agent-loop-core`

**New files:**
- `src/lib/mastermind/agentLoop.ts` — the core orchestrator. Wraps `callLLM` with Anthropic's `tools` parameter. Streams tool calls, executes them, threads results back. Max 8 tool calls per turn (safety bound).
- `src/lib/mastermind/agentPrompt.ts` — composes the system prompt: existing `SYSTEM_PROMPT_TEMPLATE` from [`chessPrinciples.ts:172`](../src/lib/chessPrinciples.ts#L172) + the static-knowledge bundle (`MASTERMIND_INDEX.md` SUMMARY + STRENGTHS SUMMARY + USER_MODEL SUMMARY + TOOLS SUMMARY) + the tool catalog. **All cached** via `cacheSystem: true` — ~6k tokens that stay in the 5-min cache window.

**Edits to [`route.ts`](../src/app/api/enhanced-analysis/route.ts):**
- Behind a feature flag `MASTERMIND_AGENT_LOOP_ENABLED` (default false in prod, true in preview), route requests through `agentLoop()` instead of the single-shot `callLLM` path.
- Flag-on-merge pattern, same discipline as Phase 3 audit step 4a (`AUTH_ENFORCED`).

**SSE event types** (new — for tool-call narration):
```ts
type SseEvent =
  | { type: "tool_call_start", tool: string, args: unknown, visibility: "silent" | "narrate" }
  | { type: "tool_call_end", tool: string, result: unknown, latencyMs: number }
  | { type: "text_delta", text: string }
  | { type: "agent_done", traceId: string };
```

**Edits to [`AICoachChat.tsx`](../src/components/AICoachChat.tsx):**
- L2362 SSE consumer: handle the new event types.
- Render `narrate` tool calls as small "Claude is looking up Fischer-Spassky game 6…" bubbles. Silent calls do not render.

**Acceptance gate:** preview deploy answers each of the 10 master-game-prompt synthetic-tester sequences end-to-end without crashing or exceeding the 8-call bound.

### 5.3 PR 2.C — Show-user protocol (board overlays + position-for-solving) (~500 LOC)

**Branch:** `mastermind/show-user-protocol`

Implements the `show_user` verb-group tools from [MASTERMIND_TOOLS.md §show_user](MASTERMIND_TOOLS.md#show_user).

**New SSE event types:**
- `{ type: "board_with_arrows", fen, arrows: [{from, to, color}], highlights: [square] }`
- `{ type: "solve_position", fen, expectedSolutionUci, hints? }`

**New components:**
- `src/components/mastermind/BoardWithArrows.tsx` — overlay on existing `react-chessboard` primitives.
- `src/components/mastermind/SolvePositionBubble.tsx` — interactive board in a chat bubble; validates user moves against `expectedSolutionUci` via a new `/api/mastermind/solve-position` endpoint that resumes the agent loop with the result.

### 5.4 PR 2.D — Ask-user protocol + inspector panel (~400 LOC)

**Branch:** `mastermind/ask-user-and-inspector`

**Ask-user protocol** ([MASTERMIND_TOOLS.md §ask_user](MASTERMIND_TOOLS.md#ask_user)):
- SSE event: `{ type: "ask_user", question, expectedAnswer: "free-text" | "choice" | "yes-no", choices? }`
- New endpoint `/api/chats/{id}/agent-reply` — accepts the user's answer, validates, resumes the loop.

**Inspector panel** (innovation bet — not in the original spec, useful for debugging and for sophisticated users):
- New collapsible panel in `AICoachChat.tsx` showing the full tool-call trace for the current turn: each tool call's name, args, result, latency.
- Toggle hidden by default; `?inspector=1` query param or `Cmd+I` keybinding to show.
- Powers the synthetic-tester's per-turn introspection.

### 5.5 Phase 2 mandatory call-site matrix

| Tool | First consumer |
|---|---|
| `compare_features` | Agent prompt few-shots for positional-comparison questions |
| `present_position_for_solving` | "Drill me on knight movement" path (Phase 3 content provides the drills) |
| `show_board_with_arrows` | "Show me Fischer-Spassky game 6" path; agent emits arrows on the critical move |
| `ask_user_question` | "What were your candidate moves?" path inside `candidate_gap_analysis` |
| `request_user_to_explain` | Concept-mastery flow — agent asks user to explain a concept before marking `mark_concept_mastered` |

---

## 6. Phase 3 — Tier A content + tools

Phase 2 made the agent capable; Phase 3 gives it stuff to work with. Closes the seven content gaps in [MASTERMIND_TIER_A_GAPS.md](MASTERMIND_TIER_A_GAPS.md).

### 6.1 PR 3.A — GM games archive (dataset-sourced) (~300 LOC + dataset)

**Sourcing decision (user 2026-05-11):** no human prose authoring. Use existing public datasets so neither builder nor user writes 50 games × 200 words of original commentary.

**Primary source:** **Lichess Masters Database API** (`https://explorer.lichess.ovh/masters`). Free, public, queryable by FEN. Pull a curated ~500-game subset via a one-shot ingest script: top-100 games of each world champion era (Lasker, Capablanca, Alekhine, Botvinnik, Tal, Petrosian, Spassky, Fischer, Karpov, Kasparov, Kramnik, Anand, Carlsen) + 100 recent broadcast games (Carlsen 2024–2025 tournament play via Lichess broadcast API). Author + opponent + ECO + result are in the source records.

**Secondary source:** the 10 master-game PGNs already in [scripts/synthetic-tester/games/](../scripts/synthetic-tester/games/) — promoted from test fixtures to first-class GM-games entries.

**Annotation source (the part that would have been hand-authored):** **runtime computation via the Stage 3 pipeline.** When the agent surfaces a GM game, it runs the same `analyze_game` flow that's already wired in `/api/enhanced-analysis`, gets feature deltas + tablebase grounding + critical moments, and composes pedagogical commentary on the fly. No pre-written prose; the commentary is always fresh and persona-conditioned. Cached per (gameId, persona) tuple in [`responseCache.ts`](../src/lib/responseCache.ts)-style LRU to amortize the cost across users.

**Structured metadata** (theme tags, phase classification, pedagogy hints) is **derived, not authored** — computed from the game's feature-delta trace at ingest time. E.g., the `pedagogy: "exemplar-of-prophylaxis"` tag is set when the trace shows ≥3 instances of `prophylaxis_check` returning a high-cp opponent threat that the player addressed. Fully deterministic, fully reproducible.

**Path:** `data/gm-games/index.json` (manifest) + `data/gm-games/pgn/{gameId}.pgn` (one PGN per game). Total disk: ~3 MB for 500 games.

**Ingest script:** `scripts/build-gm-games-dataset.ts` — runs once, idempotent. Documented refresh cadence: monthly to pull new broadcast games.

**New tool: `lookup_gm_game(query) → GMGame | GMGame[]`**:
- Wraps a Lunr.js index over the manifest. Query can be a player name, year, opening (ECO), derived theme/pedagogy tag, or fuzzy natural-language search.
- First consumer: the agent prompt for "show me X game" / "find me a game where Y happens" requests.
- When the agent surfaces a result, it pipes the PGN through `analyze_game` to produce fresh commentary (cached).

### 6.2 PR 3.B — Piece-movement drills (~30 KB JSON + ~150 LOC)

**Content:** ~40 drills covering knight movement (1-piece, 2-piece, knight-and-king), bishop diagonals, mate-in-1 patterns, fork/pin/skewer fundamentals, basic checkmate patterns (Q+K vs K, R+K vs K).
- Format: JSON with `{fen, prompt, expectedSolutionUci, conceptTags, ratingHint}`.
- Path: `data/drills/`.

**New tool: `find_drill(concept | rating | weakness) → Drill[]`**.

### 6.3 PR 3.C — Endgame studies (~40 KB JSON + ~250 LOC)

**Content:** the canonical 30: Lucena, Philidor, Réti's KP-vs-K study, Vančura defense, Saavedra position, opposition theory, key squares, breakthrough patterns, Lasker's K+R+pawn vs K+R, …
- Path: `data/endgame-studies/`.

**New tool: `find_endgame_study(theme | fen) → EndgameStudy[]`**.

**Innovation bet:** **studies are tablebase-grounded**. Each study has a `tablebaseAudit` field auto-generated by running `fetch_lichess_tablebase` on every key position. If our prose disagrees with tablebase truth, the prose is wrong — surfaced as a CI gate on the studies dataset.

### 6.4 PR 3.D — Opening traps library (~30 KB JSON + ~150 LOC)

**Content:** ~60 famous traps grouped by opening — Englund Gambit trap, Légal mate, Fishing Pole, Lasker trap (in QGD), Noah's Ark (in Ruy López), etc. Each: starting FEN, trap move, refutation, narrative explanation.
- Path: `data/opening-traps/`.

**New tool: `find_opening_trap(opening | fen | theme) → OpeningTrap[]`**.

### 6.5 PR 3.E — `MastermindSession` lifecycle (~400 LOC)

Wires the `lifecycle` verb group from [MASTERMIND_TOOLS.md §lifecycle](MASTERMIND_TOOLS.md#lifecycle).

**New:**
- Firestore subdoc `users/{uid}/mastermind_sessions/{sessionId}` storing `{startedAt, goal, toolTrace[], conceptsIntroduced, conceptsMastered, summary?}`.
- Tools: `start_lesson_session`, `end_session_with_summary`, `recommend_next_topic`, `mark_concept_introduced`, `mark_concept_mastered`.
- First consumers: each maps to a specific agent-prompt few-shot — see [MASTERMIND_TOOLS.md §lifecycle](MASTERMIND_TOOLS.md#lifecycle).

### 6.6 Phase 3 acceptance gate

Synthetic-tester sequence: each of the 5 personas asks for a GM game lookup, a drill, an endgame, an opening trap, and starts a lesson session. All five resolve without falling back to live-fetch tools (which would mean the Tier A content was insufficient).

---

## 7. Phase 4 — Multi-perspective + persona

Differentiates Mastermind from a generic LLM coach. Two PRs.

### 7.1 PR 4.A — Chesstalker perspective (~300 LOC)

The [Tier 1 priority](../FUTURE_IDEAS.md#tier-1--high-fit-with-our-ai-coaching-positioning-near-term-candidates) from FUTURE_IDEAS — "Chesstalker perspective for self-analysis (2nd perspective)". Two distinct prompt templates threaded through `getSystemPrompt(analysisType)`:
- **Coach voice** (existing): explains, teaches, prescriptive. "Here you should have played …Nd5 because it controls the outpost."
- **Chesstalker voice** (new): narrates the player's POV. "You're looking at the position. You see the knight on f3 eyeing your kingside. You're worried about Bxh7 sacrifices…"

**Tool:** `synthesize_chesstalker_narrative(gamePgn, playerColor) → Narrative` — runs the Stage 3 pipeline but with the chesstalker prompt, returns a two-column rendering (coach left, chesstalker right) or a toggle.

### 7.2 PR 4.B — Persona conditioning extended (~250 LOC)

Today the user has a `coachTone` field in their profile. Extend to a richer persona:
- `voice`: warm / blunt / playful / professorial
- `style`: socratic / didactic / encouraging
- `strictness`: lenient / balanced / pedantic
- `focus`: principles / patterns / calculations / openings
- `language`: English / Hindi / Tamil / Kannada / Portuguese (per [PRIORITY] multi-language item from FUTURE_IDEAS)

**Innovation bet:** persona is a **first-class input to Stage 3**, not a final-pass voice filter. The complexity-aware depth budget (§4.4) and the threat-tree depth get persona-conditioned: a `confused_beginner` persona gets a depth-1 threat tree and skip-list of advanced concepts; `curious_advanced` gets full depth and edge-case nuance.

Synthetic-tester (§9.1) runs every fixture under all 5 personas; this PR's gate is that persona-fidelity scores diverge appropriately (a `confused_beginner` answer to "explain this Najdorf" should score lower on technical depth and higher on accessibility than a `curious_advanced` answer to the same).

---

## 8. Phase 5 — Innovation + distribution

Rolling. Not gated on prior phases.

### 8.1 PR 5.A — Reddit board-screenshot bot

The [best-validated organic acquisition pattern in chess SaaS](../FUTURE_IDEAS.md#tier-3--acquisition--engagement-features) (ChessVision.ai won "Best Chess Startup 2020" largely on this). New service: monitors r/chess for board screenshots, runs OCR (Lichess open-source `chessvision-ai-bot`-equivalent), runs Mastermind on the position, replies with a brief AI explanation + link to chessmasti.com.

### 8.2 PR 5.B — Lichess Studies export

The agent's analyses are valuable artifacts that the user wants to keep, share, and revisit. Export-to-Lichess-Studies turns a Mastermind session into a shareable, annotated study via the Lichess Studies API. Bonus: cross-platform proof-of-quality on Lichess (chess players already trust Lichess artifacts).

### 8.3 PR 5.C — Browser extension overlay

The [Tier 2 priority](../FUTURE_IDEAS.md#tier-2--larger-builds-that-strengthen-the-moat) — overlay Mastermind on Lichess pages. Reuses the entire `enhanced-analysis` route + agent loop; the extension is a thin client. Chrome MV3, Firefox WebExtension; Lichess first (chess.com is hostile to extensions).

### 8.4 PR 5.D — Coach Disagreement Highlights (innovation bet)

When Stockfish and the tablebase disagree (rare in normal play — happens at search-horizon edge cases), surface as a **teaching moment**: "the engine evaluates this as +2.5 but the tablebase says it's a draw. Here's why the engine can't see it from here…" This is the kind of insight no competitor ships because no competitor cross-checks. Cheap to add given Phase 1 already wires both.

### 8.5 PR 5.E — Adaptive cost-budget per user

User profile field `coachingCostBudget` (free tier vs paid). Free-tier users get fewer flagship calls per turn (≤2 tool calls before the agent must compose), paid users get up to 8. Same agent loop, parameterized budget. Foundation for the eventual paid-tier monetization without forcing a UX schism today.

---

## 9. Cross-cutting concerns

### 9.1 Eval harness — the synthetic-tester

The synthetic-tester recovered from stash today ([scripts/synthetic-tester/](../scripts/synthetic-tester/)) is the merge gate for every PR in Phases 1–4.

**Mechanics:**
- 10 master-game PGNs at [scripts/synthetic-tester/games/](../scripts/synthetic-tester/games/)
- 5 personas at [scripts/synthetic-tester/personas/](../scripts/synthetic-tester/personas/) (confused_beginner, curious_advanced, hinglish_learner, tilted_intermediate, trick_questioner)
- Runner at [scripts/synthetic-tester/run.ts](../scripts/synthetic-tester/run.ts) drives the Mastermind through a scripted sequence per persona × game; outputs CSV at [scripts/synthetic-tester/runs/](../scripts/synthetic-tester/runs/).

**New scoring rubric** (replaces ad-hoc per-fixture scoring):

| Metric | Target |
|---|---|
| Chess correctness (invented lines, pieces, evals — flagged by validator) | 0 violations per 50-turn run |
| Structural grounding (% of position claims that cite Stage 3 delta entries) | ≥ 85% |
| Persona fidelity (rubric-graded by a separate flagship Claude call) | ≥ 7/10 per persona |
| Tool-call efficiency (calls per turn) | ≤ 4 median |
| Token cost per turn | ≤ $0.03 flagship, ≤ $0.005 fast |

**Gate:** every PR runs the full 50-turn sweep on preview before merging. Regression on any metric blocks merge. Cost reported in PR description.

### 9.2 Observability — per-tool telemetry

**New:** every `MastermindTool.invoke` call logs `{tool, args (hashed for privacy), latencyMs, costUsd, errorClass?}` to Vercel Analytics. Surfaces:
- p50/p95/p99 latency per tool
- Daily cost per tool
- Error rate per tool
- Cache hit rate (`fetch_lichess_tablebase` 24h cache; `analyze_position` browser cache)

Build a `/admin/mastermind` dashboard (gated by `users.role === "admin"`) for inspection.

### 9.3 Prompt cache discipline

The Anthropic prompt cache has a 5-min TTL and is ~10× cheaper on hits.

**Discipline:**
- The agent system prompt + static-knowledge bundle (`MASTERMIND_INDEX.md` + 3 SUMMARY blocks + tool catalog) is ~6k tokens. **Always** sent via `cacheSystem: true`.
- Within a session (user keeps talking), every turn within 5 min of the last hits the cache. Cost per turn drops from ~$0.03 to ~$0.005.
- Encourage session-style usage in the UI (clear "Session 1 — analyzing your Najdorf game" framing) to maximize within-cache turns.

### 9.4 Cost model

**Canonical reading of "validation pipeline cost ≤ $0.01 / turn at p99"** (tech-lead, 2026-05-11):

The PR 1.B spec set a ceiling of "$0.01 per turn at p99 for the full validation pipeline (parse + check + up to 2 retries)." A literal reading is infeasible — a single Sonnet retry alone is ~$0.03, which busts the ceiling at p99 if retries fire.

**Interpretation A (canonical):** the ceiling applies to **validation overhead** — the cost the pipeline adds *on top of* the original LLM call. Regenerate replaces the original Sonnet output rather than adding to it; whether the call passed first time or after a retry, the user pays for Sonnet once. Under this reading, p99 validation overhead = 2 Haiku parses + telemetry ≈ $0.002. Cleanly under $0.01.

**Same-tier rule stays.** Retries call the same tier as the original (Sonnet → Sonnet, Haiku → Haiku). The cost-ceiling argument does not relax this rule because the regenerate is replacement, not addition.

**Total per-turn cost stays as projected below.** Validators don't add cost in the steady state; they redirect spend toward "useful Sonnet calls that pass validation." See [PR_1B_PLAN.md §10.3](PR_1B_PLAN.md) for the full discussion and the alternative (Interpretation B) the team considered and rejected.

Projected per-turn cost under the expanded scope:

| Component | Tokens | Cost |
|---|---|---|
| System + static (cached) | 6k cached | $0.0009 |
| Game context + user input | 4k | $0.012 |
| Tool calls (median 4 cheap, 0.5 expensive) | mixed | $0.008 |
| Output | 1k | $0.015 |
| **Per turn median** | — | **~$0.036** |
| **Per turn p95 (long agent loop)** | — | ~$0.12 |

At 50k MAU × 5 turns/user/month median = 250k turns/month × $0.036 = **$9k/month** Anthropic spend at flagship. With aggressive Haiku 4.5 demotion via complexity score (§4.4), expect 40% reduction = ~$5.5k/month. **This is the budget Phase 1 must hit.**

### 9.5 Security — prompt-injection hardening

Tool inputs are a new attack surface per [FUTURE_IDEAS open Q5](../FUTURE_IDEAS.md). Every tool input validated via Zod schema in [src/lib/validation/schemas.ts](../src/lib/validation/schemas.ts), continuing the AUDIT-PHASE-1.4 pattern.

**Additional discipline:**
- The agent's static-knowledge bundle is read-only context. **Never** evaluate user input as instructions to the agent. Existing Phase 1.4 hardening blocks `role: "system"` smuggling — verify the agent loop preserves it.
- Tablebase responses are trusted (Lichess API, no user input in path). Master DB responses are trusted. **Untrusted:** chess.com / Lichess user-profile fetches by username — sanitize the username before path-templating.

### 9.6 Failure handling

Every Phase 1+ tool's failure mode lives in [MASTERMIND_FAILURE_MODES.md](MASTERMIND_FAILURE_MODES.md). The new ones (§10a–10e in that doc) cover Stage 3 specifically. **No "swallow + warn" anti-pattern** ([§10e](MASTERMIND_FAILURE_MODES.md#10e-positionannotator-runs-on-an-invalid-fen)) — every failure surfaces a typed sentinel that the prompt-context builder reasons about explicitly.

---

## 10. Open design questions (with proposed defaults)

Resolve before the relevant PR ships.

| # | Question | Proposed default | When to revisit |
|---|---|---|---|
| 1 | Tool-call visibility — silent or narrate? | Per-tool, set in the catalog. `fetch_lichess_tablebase` silent; `lookup_gm_game` narrate. | After user testing in Phase 3 |
| 2 | Streaming + tool use simultaneously | Yes (Anthropic SDK supports). UI shows tool-call bubbles interleaved with streamed text. | If perf degrades |
| 3 | Resolution-point heuristic vs LLM tag | Hybrid (heuristic by default, LLM tag for low-confidence cases — §4.1 #7) | If prose quality bottlenecked |
| 4 | Cache key for `compute_feature_delta` | LRU keyed by `(fenBefore, fenAfter, fenAtResolution)` triple in [responseCache.ts](../src/lib/responseCache.ts) | If memory pressure |
| 5 | Tablebase rate limit | 24h in-memory cache; assume 30 req/min upstream; backoff = skip block + log | If hitting limits |
| 6 | Max tool calls per turn | 8 (Phase 2 default). Adjustable per persona / cost budget. | After Phase 2 dogfood |
| 7 | Cost-budget tier wiring | Phase 5.E. Until then: all users get 8 calls. | When monetization lands |
| 8 | Inspector panel visibility | Hidden by default, `?inspector=1` or `Cmd+I` to show. | Never default-on |
| 9 | Where does the agent loop live — `/api/enhanced-analysis` or new route? | **Existing route.** Feature flag `MASTERMIND_AGENT_LOOP_ENABLED`. Per FUTURE_IDEAS §1 architecture. | Not revisiting |
| 10 | Auth requirement for agent loop | Required (existing `requireAuth` on the route). Anonymous users hit the cheap single-shot path. | Not revisiting |
| 11 | What language is the agent prompt in for multi-lang users? | English (the model speaks every language fluently from one prompt). User-facing strings translated. | If quality dips |
| 12 | Streaming token-count delivery on OpenAI fallback | OpenAI is non-streaming today (§8 in FAILURE_MODES). Surface a small "loaded fallback" indicator. | If users complain |
| 13 | Chesstalker rendering — toggle or two-column? | Toggle on mobile (≤768px), two-column on desktop. | After Phase 4.A |
| 14 | Tier A content licensing — PGN provenance | Chess games are public domain; commentary/annotation prose is original. Document sources in `data/gm-games/PROVENANCE.md`. | Per release |
| 15 | `MastermindSession` retention | Indefinite for paid; 90 days for free tier. | When paid tier exists |

---

## 11. Per-PR merge contract

Every PR in this plan must satisfy **all** of:

1. **Branch hygiene**: branched off `main`, not a stacked branch (per [feedback_plan_deviations.md](../../memory/feedback_plan_deviations.md) — Phase 3 stacked-branch incident).
2. **TSC clean**: `npx tsc --noEmit` passes (CLAUDE.md gate).
3. **Tests added/updated**: every new tool has Vitest tests; every wired call site has an integration test in the synthetic-tester or `audit/findings/agent-a-eval/`.
4. **Synthetic-tester pass**: full 50-turn run on preview, no regression on §9.1 metrics. Output CSV attached to PR description.
5. **Mandatory call site**: every new tool declares its first consumer in the matrix at the end of its phase section. PR description quotes the relevant matrix row.
6. **Cost reported**: median + p95 cost per turn, with `cacheSystem: true` discipline verified.
7. **Failure mode documented**: every new failure path appended to [MASTERMIND_FAILURE_MODES.md](MASTERMIND_FAILURE_MODES.md) before merge.
8. **Feature flag where appropriate**: large structural changes (Phase 2.B, Phase 4.B) land behind a flag, default off in prod.
9. **CLAUDE.md updated if architecture changes**: e.g., the agent loop becomes a new mental-model item in §2.
10. **Co-authored commit message**: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` on AI-assisted commits.

**Auto-merge eligibility:** Phase 1 + 2 PRs are auto-merge when CI green and nothing weird (per [feedback_auto_merge_phase3.md](../../memory/feedback_auto_merge_phase3.md), extended). Phase 3 onward requires user review (content choices are scope-shaping).

**Scope-change rule:** technical-correctness deviations from this plan are OK with a PR-description note; scope changes (adding/removing tools, changing the phasing) require asking first per [feedback_plan_deviations.md](../../memory/feedback_plan_deviations.md).

### 11.1 Merge-history preservation (tech-lead 2026-05-11)

**Do not squash Phase 1 PRs into a single merge to main.** Three separate merges in order:

1. `mastermind/planning-docs` → main (build plan, recovered planning docs, synthetic-tester)
2. `mastermind/stage-3-primitives` → main (PR 1.A library)
3. `mastermind/stage-3-validators` → main (PR 1.B library, PR 1.C wiring + sweep)

**Rationale:** the audit trail for ISEF and for future debugging needs to show the decision points distinctly. A squashed merge collapses "what was planned" / "what was built" / "what was wired" into one blob, making it hard to trace why a particular choice was made. Three merges in order keep the boundaries legible:

- planning-docs answers *"why this shape?"*
- primitives answers *"what computes the deltas?"*
- validators+wiring answers *"how are they enforced and surfaced?"*

When PR 1.C ships, its merge to main collapses the validators branch + its dependencies-via-merge into a single linear sequence on main, which is the desired flat history. Each merge gets its own commit; nothing is squashed.

This rule extends to future Phase 1+ PR series unless a tech-lead override is recorded here.

---

## 12. Out of scope for this plan

For clarity. These appear in MASTERMIND_TOOLS.md or FUTURE_IDEAS.md but are not part of the Mastermind build:

- Native mobile app (Tier 2 FUTURE_IDEAS — separate workstream, possibly post-Phase 5).
- Visualization training (Tier 2 FUTURE_IDEAS — content product, not agent-shaped).
- Native game annotation + Lichess Studies *editing* (vs Phase 5.B's *export*).
- B2B academy pivot (FUTURE_IDEAS §B2B — parked).
- Anthropic-credit acquisition strategy (FUTURE_IDEAS §Anthropic API credit — separate ops thread).

---

## 13. Open questions — RESOLVED 2026-05-11

User answers captured verbatim. Plan body updated in-place to reflect each decision; this section is the audit trail.

| # | Question | Answer | Plan section updated |
|---|---|---|---|
| 1 | Phase 1 scope — all 7 expansions to original Stage 3 stay in? | **Yes — all 7 stay** | §4.1 |
| 2 | Synthetic-tester as the merge gate? | **Yes** | §9.1, §11 |
| 3 | `MASTERMIND_AGENT_LOOP_ENABLED` rollout posture? | **Flag-off-on-merge to prod** (Phase 3 audit pattern; safer; flag flips behind a verified preview deploy) | §5.2 |
| 4 | Naming: `mastermind/…` branch + `src/lib/mastermind/…` files + `/api/mastermind/…` routes? | **Yes** | (no change — was already the proposal) |
| 5 | Tier A content authoring — builder writes prose, or user authors? | **Neither — source from existing dataset (Lichess Masters DB + runtime Stage 3 commentary)** | §6.1 (pivoted to dataset-sourced + runtime-derived commentary) |
| 6 | Eval-mismatch threshold? | **150 cp** (between strict 50 and loose 200) | §4.3 |

PR 1.A can now start.
