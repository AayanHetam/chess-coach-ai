# MASTERMIND_TOOLS.md

## SUMMARY

Tool inventory for the Mastermind agent, organized by **coaching verb** rather than by data source. Ten verb groups: `read_user_state`, `ask_user`, `show_user`, `fetch_external`, `generate`, `compare`, `engine_analyze`, `log_writeback`, `lifecycle`, and `repertoire`. Each entry lists what the tool wraps (or `STATUS: design-only`), input/output schema, cost tag (`cheap` / `medium` / `expensive`), side effects (`read` / `write` / `blocking`), failure mode, and fallback. The schema contract section up front fixes the common shape every tool implementation must follow so the agent can reason about cost and trust uniformly. Of the ~56 tools surveyed, **17 wrap shipped code today**, **6 are partial wraps** (the underlying primitive exists but lacks a clean entry point), and **33 are design-only** — listed verbatim with a one-line "what would need to be built" so this file doubles as the Mastermind backlog. Per the 2026-05-08 update (Reddit-thread audit on Take Take Take / Nova Chess move-explanation parity), every design-only tool entered from now on must declare a **first consumer in shipped code** before its PR is allowed to merge — see "Mandatory call sites" below for the anti-"built but never called" contract; four Stage 3 grounding tools are the first entries. Two operations are explicitly **not tools**: `classify_intent` (it's the router *above* the agent loop, not a tool inside it) and `tts_speak` (UI-layer concern at the chat-bubble surface). The "already-shipped wrappers" callout at the end names the six tools whose implementation is fully ready today: `share_card_render`, `twin_bot_match`, `retrieval_telemetry`, `accuracy_score`, `keep_maia_alive`, `opponent_scout`.

---

## Schema contract — applies to every tool below

Every tool implementation must conform to the same shape so the agent can reason about cost, trust, and side effects without per-tool special cases.

```ts
interface MastermindTool<I, O> {
  name: string;
  verb: "read_user_state" | "ask_user" | "show_user" | "fetch_external"
      | "generate" | "compare" | "engine_analyze" | "log_writeback"
      | "lifecycle" | "repertoire";
  cost: "cheap" | "medium" | "expensive";  // see below
  sideEffects: { read: boolean; write: boolean; blocking: boolean };
  visibility: "silent" | "narrate";
  inputSchema: ZodSchema<I>;   // server-side validation, see src/lib/validation/schemas.ts
  outputSchema: ZodSchema<O>;
  failureMode: string;          // human-readable; references MASTERMIND_FAILURE_MODES.md
  fallback: string | null;      // named alternative when this tool fails
  invoke(input: I): Promise<O>;
}
```

### Cost tags

- **cheap** — local CPU only, no network. Examples: `chess.js` board ops, FEN parsing, regex over a string, single localStorage / Firestore read of a small doc.
- **medium** — single network round-trip or a Stockfish/Maia call up to ~2 seconds. Examples: a Neo4j `MATCH` query, a Lichess REST hit, a Stockfish depth-12 search.
- **expensive** — any Anthropic / OpenAI call, deep Stockfish (depth ≥20), or multi-stage pipeline. Examples: `analyze_game` (5–15s flagship Sonnet call), `tag_concepts` (LLM tagger), `generate_annotated_pgn` (multi-call).

### Visibility

The agent picks `silent` when the tool is mid-thought ("looking up the position…") and `narrate` when surfacing the call to the user is the point ("Let me check Fischer-Spassky 1972 game 6…"). Default `silent`. The flag is per-tool, not per-call, so the inventory pre-decides what users see.

### Validation discipline

Tool inputs are a prompt-injection surface (FUTURE_IDEAS.md open-question #5). Every tool listed below must validate its input via a Zod schema in [src/lib/validation/schemas.ts](../src/lib/validation/schemas.ts), continuing the AUDIT-PHASE-1.4 pattern.

---

## read_user_state

| Tool | Status | Cost | Side effects | Fail mode → fallback |
|---|---|---|---|---|
| `get_user_profile` | ✅ wraps [firestoreUsers.ts:54-60](../src/lib/firestoreUsers.ts#L54-L60) (GET `/api/auth/me`) | cheap | read | 401 if anonymous → return `null`, agent uses defaults from coach prompt |
| `get_user_games` | ✅ wraps [firestoreGames.ts:28-33](../src/lib/firestoreGames.ts#L28-L33) (GET `/api/games`) | cheap | read | Empty list if no games → agent skips weakness-from-games path |
| `get_user_chat_history` | ✅ wraps [firestoreChats.ts:43-57](../src/lib/firestoreChats.ts#L43-L57) (GET `/api/chats`, `/api/chats/{id}`) | cheap | read | 401 if anonymous → empty list |
| `get_weakness_profile` | 🟡 partial — type at [weaknessProfile.ts:7-13](../src/lib/weaknessProfile.ts#L7-L13); **localStorage-only**, no server endpoint exists. Agent must request client to upload the blob | cheap | read | Blob not uploaded → return `null`, agent falls back to per-game analysis |
| `get_repertoire` | ✅ wraps [repertoireParser.ts:84-119](../src/lib/repertoireParser.ts#L84-L119) for parsing + [src/data/repertoires.ts](../src/data/repertoires.ts) for built-ins | cheap | read | User-imported repertoire persistence not identified in current code (see USER_MODEL caveats) — agent treats as ephemeral |
| `get_srs_state` | 🟡 partial — type at [`@/types/openings.ts:69-88`](../src/types/openings.ts#L69-L88); persistence at [spacedRepetition.ts:105-108](../src/lib/spacedRepetition.ts#L105-L108) (jotai+localStorage); **no server endpoint** | cheap | read | Blob not uploaded → return empty map |
| `get_repetit_history` | 🟡 partial — types at [repetitTraining.ts:18-64](../src/lib/repetitTraining.ts#L18-L64); three localStorage keys at [repetitTraining.ts:68-72](../src/lib/repetitTraining.ts#L68-L72); **no server endpoint** | cheap | read | Blob not uploaded → return empty stats |
| `get_session_history` | ⚪ STATUS: design-only — no agent-session concept exists yet. **Build:** define a `MastermindSession` Firestore subdoc keyed by `(uid, sessionId)` storing tool-call trace, mark_concept events, and end-of-session summary. | cheap | read | n/a |

---

## ask_user

All tools in this group depend on an agent-UI protocol that does not exist yet. The current chat surface ([AICoachChat.tsx](../src/components/AICoachChat.tsx) per CLAUDE.md) renders streamed text and inline puzzles in chat bubbles, but has no schema for "agent emits a structured prompt the UI must answer back." Until that protocol ships, all entries below are design-only.

| Tool | Status |
|---|---|
| `ask_user_question` | ⚪ STATUS: design-only. **Build:** SSE event type `{type: "ask_user", question, expectedAnswer: "free-text" \| "choice", choices?}`; UI renders a prompt bubble; reply posts to a new `/api/chats/{id}/agent-reply` endpoint that resumes the loop. |
| `request_user_to_explain` | ⚪ STATUS: design-only. **Build:** specialization of `ask_user_question` with `expectedAnswer: "free-text"` and a coaching-grade rubric prompt for evaluating the explanation server-side. |
| `confirm_understanding` | ⚪ STATUS: design-only. **Build:** specialization with `expectedAnswer: "yes-no"` and a brief follow-up `request_user_to_explain` if the user says yes. |

---

## show_user

The current UI surface is the chat bubble. Inline puzzle rendering already works (per architectural constraint "Inline puzzles render in chat bubbles, not as separate routes"); board-with-arrows and position-for-solving need a richer protocol.

| Tool | Status | Cost | Side effects | Fail mode → fallback |
|---|---|---|---|---|
| `present_position_for_solving` | ⚪ STATUS: design-only. **Build:** SSE event `{type: "solve_position", fen, expected_solution_uci, hints?}`; UI renders an interactive board; user moves are validated against `expected_solution_uci` server-side; result feeds back into the agent loop. | medium | write | n/a |
| `show_board_with_arrows` | ⚪ STATUS: design-only. **Build:** SSE event `{type: "board_with_arrows", fen, arrows: [{from, to, color}], highlights: [square]}`; reuse [react-chessboard](../package.json) overlay primitives. | cheap | write | n/a |
| `share_card_render` | ✅ wraps [shareCard.ts:42-67](../src/lib/shareCard.ts#L42-L67) — builds a 720×1024 SVG from `ShareCardData`. | medium | write (returns PNG via canvas) | Bad input → SVG renders with placeholder values; canvas error → fall back to JSON summary |

---

## fetch_external

| Tool | Status | Cost | Side effects | Fail mode → fallback |
|---|---|---|---|---|
| `fetch_chesscom_user_games` | ✅ wraps [api/chesscom/ongoing/](../src/app/api/chesscom/ongoing/) (only chess.com route shipped today is `ongoing`; broader user-game fetch is a thin extension via the public chess.com API) | medium | read | chess.com 5xx → return empty list; rate-limit → backoff and retry once |
| `fetch_lichess_user_games` | ✅ wraps [api/lichess/current-games/](../src/app/api/lichess/current-games/) and [api/lichess/game/](../src/app/api/lichess/game/) | medium | read | Lichess 5xx → empty list |
| `fetch_lichess_master_db` | ⚪ STATUS: design-only. **Build:** thin proxy to `https://explorer.lichess.ovh/masters?fen=…`; no auth needed; cache responses for 24h since master DB rarely changes. | medium | read | n/a |
| `fetch_lichess_tablebase` | ⚪ STATUS: design-only — **Stage 3 grounding** per [FUTURE_IDEAS.md §1](../FUTURE_IDEAS.md). **Build:** thin proxy to `https://tablebase.lichess.ovh/standard?fen=…` for ≤7-piece endgames; returns `{category: "win" \| "draw" \| "loss" \| "blessed-loss" \| "cursed-win", dtm?, dtz?, moves[]}`. Cache responses for 24h (positions don't change). **Mandatory first consumer:** the per-move loop in [enhanced-analysis/route.ts:705-757](../src/app/api/enhanced-analysis/route.ts#L705-L757) — when the move's resulting FEN has ≤7 pieces (excluding kings), `fetch_lichess_tablebase` is called and `category` + `dtm`/`dtz` are appended to the prompt context. This grounds endgame claims that today are LLM-unverified prose. Failure modes (rate limit, network, position rejected) at MASTERMIND_FAILURE_MODES.md §11. | medium | read | Lichess 5xx → skip the tablebase block, fall back to LLM-only endgame prose with a "engine evaluation only" disclaimer in the prompt context |
| `fetch_lichess_opening_explorer` | ⚪ STATUS: design-only. **Build:** thin proxy to `https://explorer.lichess.ovh/lichess?fen=…&speeds=…&ratings=…`. | medium | read | n/a |
| `fetch_lichess_player_profile` | ⚪ STATUS: design-only. **Build:** GET `https://lichess.org/api/user/{username}` for rating, country, recent perf — useful for opponent prep. | medium | read | n/a |
| `fetch_chesscom_player_profile` | ⚪ STATUS: design-only. **Build:** GET `https://api.chess.com/pub/player/{username}` and `/stats` for the same data. | medium | read | n/a |

---

## generate

| Tool | Status | Cost | Side effects | Fail mode → fallback |
|---|---|---|---|---|
| `tag_concepts` | ✅ wraps [conceptLLMTagger.ts](../src/lib/concept/conceptLLMTagger.ts) — LLM-backed concept classifier; complements deterministic [conceptDetector.ts](../src/lib/concept/conceptDetector.ts). | expensive | read | LLM error → fall back to `conceptDetector.detectConcepts()` |
| `mistake_to_puzzle` | ✅ wraps [mistakeToPuzzleMapper.ts](../src/lib/mistakeToPuzzleMapper.ts) — given a mistake position, returns puzzles drilling the same theme. | medium | read | Neo4j unconfigured → falls back to theme-only retrieval (see `find_similar_puzzles`) |
| `compose_drill_for_weakness` | 🟡 partial — combines [weaknessProfile.ts:261-269](../src/lib/weaknessProfile.ts#L261-L269) (`mapWeaknessesToPuzzleThemes`) with `mistake_to_puzzle`. Wrapper layer not extracted into its own callable yet. **Build:** server endpoint `/api/drill-from-weakness` that consumes uploaded weakness blob and returns a `RepetitTrainingSet`-shaped response. | medium | read | Empty weakness profile → return generic mate-in-2 puzzle pack |
| `generate_puzzle_from_user_mistake` | 🟡 partial — `mistake_to_puzzle` returns existing Lichess puzzles drilling the same theme, but does not synthesize *new* puzzles from the user's exact position. **Build:** Stockfish-driven puzzle synthesizer that finds the critical-moment subsequence around the mistake and packages it as a `ChessPuzzle`. | expensive | read | Synthesis fails → fall back to theme-matched lookup |
| `synthesize_quiz_question` | ⚪ STATUS: design-only. **Build:** LLM-backed generator that takes a position + concept and emits `{question, expectedAnswer, rubric}`; pairs with `request_user_to_explain` from the `ask_user` group. | expensive | read | n/a |
| `generate_annotated_pgn` | ⚪ STATUS: design-only. **Build:** for a PGN, run `analyze_game` to get the structured eval per move, then call the flagship LLM with the 5-category prompt to emit `{...PGN, comments: [...]}` with NAGs and prose annotations. | expensive | read | n/a |

---

## compare

All design-only — the underlying engine analysis exists, but the comparison-as-a-tool wrappers do not.

| Tool | Status |
|---|---|
| `compare_to_master_treatment` | ⚪ STATUS: design-only. **Build:** chain `fetch_lichess_master_db` (anchor FEN) + `analyze_position` on the master continuation, then prompt the LLM to diff the user's plan vs the master plan in 3 sentences. |
| `compare_to_past_self` | ⚪ STATUS: design-only. **Build:** read two timestamped `WeaknessProfile` snapshots (requires per-snapshot persistence, currently absent — `WeaknessProfile` is overwritten in place at [weaknessProfile.ts:89-94](../src/lib/weaknessProfile.ts#L89-L94)) and emit a structured diff over `topWeaknesses` and `phaseAccuracy`. |
| `diff_repertoire` | ⚪ STATUS: design-only. **Build:** structural diff between two `OpeningRepertoire` instances over `lines[].moves`; surface added/removed/changed lines and ECO drift. |
| `progress_diff` | ⚪ STATUS: design-only. **Build:** delta over `UserPuzzleStats` between two timestamps (also requires snapshotting that is currently absent). |
| `compare_features` | ⚪ STATUS: design-only — **Stage 3 grounding** per [FUTURE_IDEAS.md §1](../FUTURE_IDEAS.md). Cross-listed in `engine_analyze` for the underlying primitive. **Build:** thin wrapper over `compute_feature_delta` exposed to the agent loop without the resolution-point step (caller supplies both FENs). **Mandatory first consumer:** the Mastermind agent prompt's positional-comparison few-shots ("why was that move bad?" / "what does this trade get me?" / "compare these two candidate moves") — the agent must call this before composing prose; without it, the agent falls back to single-FEN reasoning, which is the failure mode the Reddit-thread audit (2026-05-08) flagged. |

---

## engine_analyze

| Tool | Status | Cost | Side effects | Fail mode → fallback |
|---|---|---|---|---|
| `analyze_position` | ✅ wraps [engine/stockfish17.ts:5-23](../src/lib/engine/stockfish17.ts#L5-L23) via [engine/uciEngine.ts](../src/lib/engine/uciEngine.ts); WASM in browser, single-thread fallback at [engine/shared.ts:7-13](../src/lib/engine/shared.ts#L7-L13). | medium | blocking | WASM unsupported → return engine-unavailable error; agent uses Maia or skips tactical assertions |
| `analyze_position_multipv` | 🟡 partial — UCI supports `MultiPV` but no dedicated wrapper sets the option, parses `info multipv N`, and returns the top-N PVs. **Build:** thin extension of `analyze_position` that sets `setoption name MultiPV value N` and aggregates `info multipv` lines into an array. | medium | blocking | Same as `analyze_position` |
| `predict_human_move` | ✅ wraps [api/maia-predict/route.ts:38-69](../src/app/api/maia-predict/route.ts#L38-L69) (HF Spaces proxy). | medium | read | `MAIA_API_URL` unset → 503 with `fallback: true`; agent uses Stockfish at low depth |
| `analyze_game` | ✅ wraps [api/enhanced-analysis/route.ts](../src/app/api/enhanced-analysis/route.ts) — flagship Sonnet path with validator post-processing at [enhanced-analysis/route.ts:1272,1388](../src/app/api/enhanced-analysis/route.ts#L1272-L1388). | expensive | blocking | Anthropic 5xx → OpenAI fallback if `OPENAI_API_KEY` set ([llmProvider.ts:99-101,193-211](../src/lib/llmProvider.ts#L99-L211)) |
| `accuracy_score` | ✅ wraps [accuracy/index.ts:35-44](../src/lib/accuracy/index.ts#L35-L44) (`computeAccuracy`). Lichess-derived formula at [accuracy/index.ts:185-191](../src/lib/accuracy/index.ts#L185-L191). | cheap | read | Empty positions → returns `{white: 100, black: 100}` |
| `score_phase_accuracy` | ✅ wraps [phaseAccuracy.ts](../src/lib/phaseAccuracy.ts) (also exposed at [accuracy/index.ts:46-96](../src/lib/accuracy/index.ts#L46-L96) as `computePhaseAccuracy`). Phase classifier at [accuracy/index.ts:106-125](../src/lib/accuracy/index.ts#L106-L125). | cheap | read | Length-mismatch → throws `computePhaseAccuracy` precondition |
| `find_critical_moments` | ⚪ STATUS: design-only. **Build:** scan a game's per-move evals for `|Δwin%| > 20` (or per-rating threshold), return `{moveNumber, fen, evalDrop, classification}` for each. The data is already produced by `analyze_game`; this is a structured-extraction wrapper. |
| `evaluate_position_complexity` | ⚪ STATUS: design-only. **Build:** combine fan-out (legal-move count), eval spread (top-1 vs top-3 cp), and presence of forcing sequences into a single `complexityScore`; useful for "should I think longer here?" coaching. |
| `prophylaxis_check` | ⚪ STATUS: design-only. **Build:** for the side to move, run `analyze_position_multipv` *for the opponent* on the resulting position and return any moves that gain ≥75 cp — i.e., what the opponent threatens that the user must address. |
| `candidate_gap_analysis` | ⚪ STATUS: design-only. **Build:** ask the user (via `ask_user`) for their candidate moves at a critical position, then diff their candidates against the engine's top-3; surface what they didn't even consider. |
| `branch_point_analysis` | ⚪ STATUS: design-only. **Build:** find moves in a game where the user's choice and the engine's choice would lead to qualitatively different middlegame structures (IQP vs no IQP, opposite-side vs same-side castling). Depends on the position-type-classifier from MASTERMIND_TIER_A_GAPS.md. |
| `compute_feature_delta` | ⚪ STATUS: design-only — **Stage 3 grounding** per [FUTURE_IDEAS.md §1](../FUTURE_IDEAS.md). **Build:** extend [positionAnnotator.ts](../src/lib/positionAnnotator.ts) with a `diffAnnotations(before, after) → PositionFeatureDelta` function returning per-feature changes (material, pawn structure, king safety, piece activity, hanging pieces, threats) between two annotated positions. Pure CPU; cheap. **Schema:** input `{fenBefore, fenAfter, fenAtResolution?}`, output `PositionFeatureDelta` per [FUTURE_IDEAS.md §1 Stage 3](../FUTURE_IDEAS.md). **Mandatory first consumer:** the per-move loop in [enhanced-analysis/route.ts:705-757](../src/app/api/enhanced-analysis/route.ts#L705-L757) — every move classified ≥INACCURACY threads the delta into the prompt context as a `## Position changes` block. Cost: cheap. |
| `find_resolution_point` | ⚪ STATUS: design-only — **Stage 3 grounding**. **Build:** walk the principal variation from a starting FEN until reaching a quiescent position: no pending captures, no checks, eval stable within 30cp of the line's terminal eval. Returns `{resolutionFen, plyOffset, reason: "quiescent" \| "forced-end" \| "depth-limit"}`. Pure chess.js + the PV from [engine/stockfish17.ts](../src/lib/engine/stockfish17.ts). **Mandatory first consumer:** `compute_feature_delta` calls this internally when the caller does not supply `fenAtResolution`. Heuristic-only in v1; failure mode documented at MASTERMIND_FAILURE_MODES.md §11. Cost: cheap. |
| `compare_features` | ⚪ STATUS: design-only — **Stage 3 grounding**, listed under `compare` verb group below as well. **Build:** thin wrapper exposing `compute_feature_delta` to the agent loop without the resolution-point step (caller supplies both FENs). **Mandatory first consumer:** the Mastermind agent's "why was that move bad?" / "what does this gain?" / "what does the trade get me?" prompt few-shots — agent must call this before composing positional-comparison prose. Cost: cheap. |

| Tool | Status | Cost | Side effects | Fail mode → fallback |
|---|---|---|---|---|
| `log_retrieval_event` | ✅ wraps [api/retrieval-telemetry/route.ts:19-39](../src/app/api/retrieval-telemetry/route.ts#L19-L39); accepts `{anchorFen, detectedConcepts, puzzleId?, clickedIndex?, event: "click" \| "solve" \| "skip", solvedNext?, userId?}`. Currently log-only — schema is stable for future fan-out. | cheap | write | 400 on schema fail → caller drops the event silently |
| `mark_concept_introduced` | ⚪ STATUS: design-only. **Build:** Firestore subdoc `users/{uid}/concept_progress/{conceptId}` with `{introducedAt, introducedInChat?, exposureCount}`; agent writes on first explanation of a concept. |
| `mark_concept_mastered` | ⚪ STATUS: design-only. **Build:** same subdoc with `{masteredAt, evidenceFen, evidenceMoveNumber}`; agent writes when the user solves N puzzles drilling the concept without errors, or successfully `request_user_to_explain`s it. |

---

## lifecycle

All design-only — there is no `MastermindSession` concept today; existing `ChatRecord` is closer to a thread than a structured lesson.

| Tool | Status |
|---|---|
| `start_lesson_session` | ⚪ STATUS: design-only. **Build:** create a `MastermindSession` Firestore doc with a stated goal (`{intent: "study Najdorf middlegames", target: "30 min"}`); subsequent tool calls are tagged with the session id. |
| `end_session_with_summary` | ⚪ STATUS: design-only. **Build:** flagship-LLM summary of tool-call trace and user interactions during the session, stored on the `MastermindSession` doc; surfaces as a chat-message recap. |
| `recommend_next_topic` | ⚪ STATUS: design-only. **Build:** combine `WeaknessProfile.topWeaknesses`, `UserPuzzleStats.recentAttempts` accuracy, and `concept_progress` exposure counts → recommend the lowest-coverage critical concept. |
| `diagnose_plateau` | ⚪ STATUS: design-only. **Build:** detect when `UserPuzzleStats.accuracy` has been within ±2% for 4+ weeks; cross-reference to `WeaknessProfile.patterns` to suggest a concrete unblock. |
| `calibrate_rating_with_quiz` | ⚪ STATUS: design-only. **Build:** serve a 5-puzzle adaptive sequence whose ratings span 800–2200, infer player rating from the highest reliably-solved bucket; writes back to `UserProfile.rating`. |
| `detect_play_style` | ⚪ STATUS: design-only. **Build:** over a user's last N games, compute aggressive-move ratio (already partly available via [chessprinciples/aggressiveMoveAnalyzer.ts](../src/lib/chessprinciples/aggressiveMoveAnalyzer.ts)); set `UserProfile.playingStyle` and surface a one-paragraph profile. |

---

## repertoire

| Tool | Status | Cost | Side effects | Fail mode → fallback |
|---|---|---|---|---|
| `lookup_user_repertoire` | ✅ wraps [repertoireParser.ts:84-119](../src/lib/repertoireParser.ts#L84-L119) for parse + [src/data/repertoires.ts](../src/data/repertoires.ts) for built-ins. | cheap | read | Empty PGN → returns `null` |
| `repertoire_gap_against_player` | 🟡 partial — [scoutService.ts:16-22](../src/lib/scoutService.ts#L16-L22) builds the opponent's tree; the diff-against-user-repertoire step is not wired into a single callable. **Build:** intersect the opponent's most-played child at each user-repertoire node and surface where the user's preparation ends before the opponent's. | medium | read | Opponent fewer than `minParentGames=3` — surface "insufficient data" |
| `find_repertoire_holes` | ⚪ STATUS: design-only. **Build:** for each `OpeningRepertoire.lines[]`, identify positions where the user has no continuation but the masters DB has ≥3 master games; surface as a prep-priority list. |
| `opening_novelty_detector` | ⚪ STATUS: design-only. **Build:** for a user's recent game, find the first move that diverges from both their own repertoire and the Lichess masters DB — flag as a novelty (good or bad). |
| `check_repertoire_coverage_against_pool` | ⚪ STATUS: design-only. **Build:** given a pool of recent opponents (last 20), compute what % of their first-N-move openings are covered by the user's repertoire. |

---

## Explicit non-tools

These are operations that look like tools but should not be exposed as agent-callable primitives.

### `classify_intent` — it's the router *above* the agent

Lives at [api/classify-intent/route.ts](../src/app/api/classify-intent/route.ts). Decides whether a user message even enters the agent loop (e.g. "explain this position" → enter loop; "what's 2+2" → polite refusal; "show me my profile" → direct route, no loop). Exposing it inside the loop creates an infinite-recursion risk and conflates two different decisions (should we *enter* a loop vs. what should we *do* in this turn). Keep it strictly above the loop, owned by the route handler at [enhanced-analysis/route.ts](../src/app/api/enhanced-analysis/route.ts) where the routing decision is made.

### `tts_speak` — UI-layer concern

Voice output is a render-time decoration of the chat bubble, not a coaching primitive. The agent should produce text the same way regardless of whether the user is reading or listening; the chat-bubble component decides whether to pipe through TTS. Surfacing it as a tool would let the model invoke voice in contexts the UI hasn't agreed to (accessibility settings, mobile speaker state) and would mix delivery concerns into the coaching plan. Per the architectural constraint that "inline puzzles render in chat bubbles, not as separate routes," voice is in the same UI-tier bucket.

---

## Already-shipped wrappers

The six tools below have working underlying code today and need only a thin wrapper to be agent-callable. Listed here as the floor for any single-tool prototype (FUTURE_IDEAS.md sequencing step #3).

| Tool | Wraps | Why it ships first |
|---|---|---|
| `share_card_render` | [shareCard.ts:42-67](../src/lib/shareCard.ts#L42-L67) | Self-contained, no external deps, returns a PNG-shaped artifact the chat surface can inline |
| `twin_bot_match` | [twinBot.ts:1-100](../src/lib/twinBot.ts#L1-L100) | The book-then-engine logic is in-process; takes an `OpeningTreeNode` (already built by `opponent_scout`) and a position |
| `retrieval_telemetry` | [api/retrieval-telemetry/route.ts:19-39](../src/app/api/retrieval-telemetry/route.ts#L19-L39) | Validated schema in place; already log-only on the server side |
| `accuracy_score` | [accuracy/index.ts:35-44](../src/lib/accuracy/index.ts#L35-L44) | Pure function over `PositionEval[]`, no IO |
| `keep_maia_alive` | [api/keep-maia-alive/route.ts:42-54](../src/app/api/keep-maia-alive/route.ts#L42-L54) | Cron-callable today; agent could fire-and-forget if it senses `maia-status` is degraded |
| `opponent_scout` | [scoutService.ts:16-22](../src/lib/scoutService.ts#L16-L22) + [api/scout/](../src/app/api/scout/) + [shareCard.ts](../src/lib/shareCard.ts) | End-to-end pipeline already wired; the agent layer is just orchestrating the existing route |

---

## Mandatory call sites — the anti-"built but never called" contract

A tool that ships without a designated first consumer becomes dead code. Per [FUTURE_IDEAS.md §1 Stage 3](../FUTURE_IDEAS.md), every new tool entered in this inventory from 2026-05-08 forward must declare a **first consumer in shipped code** before its PR is allowed to merge. The matrix below names the contract for each Stage 3 tool; entries are kept in lockstep with the per-tool descriptions above.

| Tool | First consumer (must land in same PR as the tool) | Acceptance test |
|---|---|---|
| `compute_feature_delta` | The per-move loop in [enhanced-analysis/route.ts:705-757](../src/app/api/enhanced-analysis/route.ts#L705-L757) — every move classified ≥INACCURACY threads the delta into the prompt context as a `## Position changes` block alongside the existing eval-drop narrative at lines 683-778. Prompt-context builder asserts the block exists for every flagged move, or the move is omitted from the LLM's "top mistakes" list. | Re-run the 5-fixture coaching eval at `audit/findings/agent-a-eval/`; principle-citation avg ≥ 1.6, structural-claim grounding ≥ baseline + 0.3 (new sub-metric: did the LLM cite a feature that actually changed?). |
| `find_resolution_point` | `compute_feature_delta` itself — calls this internally to pick `fenAtResolution` when the caller does not supply one. Falls back to "after the played move" only if PV has fewer than 2 plies. | Unit tests cover (a) quiescent stop on a tactical sequence, (b) forced-end stop on a mate sequence, (c) depth-limit stop on a quiet positional position. |
| `fetch_lichess_tablebase` | Same per-move loop in `enhanced-analysis/route.ts` — when the move's resulting FEN has ≤7 pieces (excluding kings), the tablebase response is appended to the prompt context. 24h cache layer prevents redundant calls on the same FEN. | Endgame fixtures in the coaching eval show grounded `category` (win/draw/loss) and `dtm`/`dtz` claims in the LLM output rather than principle-only prose. |
| `compare_features` | The Mastermind agent prompt's positional-comparison few-shots — "why was that move bad?", "what does this trade get me?", "compare these two candidate moves". The agent must reach for this tool before composing prose. **Note:** this consumer ships with the agent loop refactor (Sequencing step 5 in FUTURE_IDEAS.md §1), not Stage 3. The tool itself ships in Stage 3 (so it's battle-tested in production via `compute_feature_delta`); the agent consumer follows. |
| (any future tool) | Must declare a first consumer in this matrix before the PR is allowed to merge. If the consumer is "the Mastermind agent's prompt few-shots," that's acceptable only if the agent loop has shipped or is shipping in the same PR train. Speculative consumers ("a future surface might use this") do not satisfy the contract. |

**Why this matrix exists.** A 2026-05-08 audit against the Take Take Take / Nova Chess move-explanation pipeline (Reddit thread; novachess-guy's LinkedIn description) confirmed that we are at parity on Stockfish + feature extraction + LLM-as-translator, but missing **feature deltas at the resolution point of the variation** — the one thing that makes an explanation feel like a coach instead of a templated engine summary. The lesson generalizes: capabilities that are not load-bearing on day one tend to remain unintegrated indefinitely. The matrix forces a load-bearing answer to "who calls this on day one?" before any tool from this group enters the codebase.

---

## Coverage matrix (totals)

| Status | Count |
|---|---|
| ✅ wraps existing code | 17 |
| 🟡 partial — primitive exists, wrapper does not | 6 |
| ⚪ design-only | 33 |
| **Total surveyed** | **56** |

The two non-tool entries (`classify_intent`, `tts_speak`) are not counted; they are explicitly out of the inventory. The 2026-05-08 update added four design-only tools (`compute_feature_delta`, `find_resolution_point`, `compare_features`, plus the upgrade of `fetch_lichess_tablebase` from a generic stub to a mandatory-call-site spec) per [FUTURE_IDEAS.md §1 Stage 3](../FUTURE_IDEAS.md).

Cross-references for follow-up:
- Per-tool failure modes expanded in MASTERMIND_FAILURE_MODES.md
- Module wrappings duplicated in MASTERMIND_CODEBASE_MAP.md (per-module "wrapping tool(s)" column)
- Tier-A content gaps that block design-only `compare_to_master_treatment`, `branch_point_analysis`, etc. live in MASTERMIND_TIER_A_GAPS.md
