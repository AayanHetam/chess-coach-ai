# Agent A — Correctness & AI quality findings
Generated: 2026-04-23. Model: sonnet sub-agent. Eval calls: claude-haiku-4-5-20251001.

---

## A1. Chess rule correctness

### [P1] 50-move-rule draw not handled in `setGameHeaders`
File: `src/lib/chess.ts:90-115`
Reproduction: After a game ends via the 50-move rule, `setGameHeaders` checks `isInsufficientMaterial`, `isStalemate`, and `isThreefoldRepetition` but never calls `game.isDrawByFiftyMoves()`. Saved PGN will have no Result/Termination header for this draw type.
Proposed fix: Add an `if (game.isDrawByFiftyMoves())` branch mirroring the existing stalemate/threefold branches, setting `Result: "1/2-1/2"` and `Termination: "Draw by fifty-move rule"`.
Blast radius: low — only affects PGN metadata, not gameplay.
Test: unit — construct a chess.js position at the 50-move threshold, call `setGameHeaders`, assert Result and Termination headers are set.

### [P1] Swallowed move-replay errors mask corrupt game state in multiple routes
Files: `src/app/api/enhanced-analysis/route.ts:314,619,961,1010`, `src/lib/chessprinciples/moveByMoveAnalyzer.ts:125`
Reproduction: Move replay loops use `try { game.move(m); } catch { break; }` — any illegal or unknown SAN move silently truncates the replay, leaving `game` in a mid-sequence state. Downstream callers (`validateAIResponse`, `getFenAtHalfMove`, `buildGameContext`) receive a wrong FEN without any indication that replay failed. Similarly, `moveByMoveAnalyzer.ts:125` calls `chess.move(move)` without a try/catch — one bad move from `gameHistory` causes the entire analyzer to throw, silently falling to the outer catch at line 127 which returns an empty analysis array.
Proposed fix: Log a warning on `catch` (never silently break) and return an error sentinel or throw; callers can then surface a user-facing "game data corrupted" message instead of producing wrong analysis.
Blast radius: med — affects analysis quality for any game with a malformed PGN or SAN history.
Test: unit — pass a gameHistory array with one bad SAN in the middle; assert the analyzer returns an error or a partial result with a warning, not a silently wrong result.

### [P1] `formatUciPv` castling-flag reset means Chess960 king moves misidentified as castling
File: `src/lib/chess.ts:359-388`
Reproduction: `formatUciPv` translates Chess960 UCI castling (`e1h1` → `e1g1`) by checking a `canWhiteCastleKingSide` flag that is set to `false` after the first translation. If Stockfish is ever configured in Chess960 mode, any subsequent `e1h1` king move in the PV (e.g., a non-castling king move after castling rights were already consumed) is silently passed through as `e1h1`, which `chess.js` will reject with an illegal-move error.
Proposed fix: Parse castling from the FEN on every call (already done) — the guard is correct for standard chess but the boolean approach is fragile; replace with a direct `chess.js` legality check or at minimum add a comment that this is standard-chess-only.
Blast radius: low in standard chess (one-time castling), higher if Chess960 mode is ever enabled.
Test: unit — feed a PV with two `e1h1` entries into `formatUciPv` and assert only the first is translated when castling rights are present.

### [P2] `aiResponseValidator` validates only the FINAL position FEN, not per-move FEN
File: `src/lib/aiResponseValidator.ts:38-86`, `src/app/api/enhanced-analysis/route.ts:1017-1018`
Reproduction: `validateAIResponse(rawAnalysis, validationFen, moveHistory)` is called with `validationFen = game.fen()` — the terminal board state. When the AI's text references pieces on squares valid for an earlier position (e.g., "the knight on e5 at move 10"), the validator checks those claims against the final FEN and generates false-positive "wrong piece on square" errors. The `moveHistory` parameter is accepted but never used inside the validator to build intermediate FENs.
Proposed fix: For piece-on-square claims that include a move-number context (regex-parseable), replay `moveHistory` to that half-move and validate against the intermediate FEN; or document clearly that the validator only covers the final position and suppress mid-game piece claims.
Blast radius: med — wrong validation scores can censor valid analysis (appending incorrect `⚠️` footnotes) or pass hallucinated claims about early positions.
Test: unit — construct a game where a piece exists on e5 at move 10 but not in the final position; assert the validator does not flag a correct mid-game reference.

### [P2] `moveByMoveAnalyzer` rebuilds position from scratch for every half-move (O(n²) Chess replays)
File: `src/lib/chessprinciples/moveByMoveAnalyzer.ts:47-50`
Reproduction: Inside the `for (let i …)` loop, a fresh `positionBefore = new Chess()` is created and all `j < i` moves are replayed from the start, yielding O(n²) `chess.move()` calls. For a 40-move game this is ~1600 move executions per analysis request.
Proposed fix: Maintain a single running `Chess` instance alongside the outer loop; snapshot the FEN after each move instead of replaying from scratch.
Blast radius: low for short games; latency impact grows quadratically for games over ~30 moves. No correctness impact.
Test: benchmark — assert analysis of a 40-move game completes in under 100 ms.

### [P2] System prompt instructs "Trust Stockfish over principles" — contradicts product brief
File: `src/lib/chessPrinciples.ts:187`
Reproduction: `SYSTEM_PROMPT_TEMPLATE` line "Trust Stockfish evaluations over general principles when they conflict." The product brief states principles-based coaching, not engine-line coaching. This instruction actively suppresses principle-citation when Stockfish disagrees.
Proposed fix: Replace with "Use Stockfish evaluations to confirm principle violations and identify the biggest mistakes; explain mistakes through principles, not raw centipawn scores."
Blast radius: med — directly shapes coaching quality across all five call paths.
Test: eval — run A2 eval with and without this change; assert principle-citation score improves.

---

## A2. AI coaching eval

Raw outputs saved under `audit/findings/agent-a-eval/`.

**Critical infrastructure finding (Run 1):** When FEN is passed only in the system context (not in the user message body), the model returns "no position provided" for fixtures 3–5. The production `enhanced-analysis` route avoids this because `buildGameContext` always appends position details to the user message. Any caller that bypasses `buildGameContext` (e.g., ad-hoc scripts, the `/api/chat` fallback path) will reproduce this silently.

**Scored results (Run 2 — FEN embedded in user message, mirroring route behavior):**

| # | Fixture | Correct | Principle | Halluc | Tone | Disc. | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Englund Gambit | 1 | 2 | 0 | 2 | 1 | Good principle citation; suggests Qd4 which is non-standard; discipline docked for recommending specific move order |
| 2 | Italian Game | 1 | 2 | 0 | 2 | 2 | Excellent: names f7 weakness, castling-before-attack principle, development sequence |
| 3 | Knight fork | 1 | 1 | 0 | 2 | 1 | Correctly recommends d4; vaguely claims "Nd5 available" which is not a one-move jump; principle not named (fork pattern) |
| 4 | K+P endgame | 1 | 2 | 1 | 2 | 2 | Correct opposition concept; **hallucination**: "1.Kd1 Kd4 2.e4 pawn advances" — after 2.e4+ Kxe4 the pawn is captured; winning plan (1.Ke2) not mentioned |
| 5 | Equal middlegame | 1 | 1 | 0 | 2 | 1 | Mis-names opening ("Closed Sicilian" for Italian/Giuoco); d5 control correct; over-states Bc4→f7 tension |

**Aggregate (n=5):**
- Factual correct: 5/5 = 100%
- Hallucination rate: 1/5 = 20%
- Tone avg: 2.0 / 2.0
- Principle citation avg: 1.6 / 2.0
- Discipline (principles vs engine lines) avg: 1.4 / 2.0

**Top 3 actionable patterns:**

1. **Hallucination in forced-line endgames (P1):** Fixture 4 produced a concrete but wrong king-and-pawn variation. Endgame forced lines are highest-risk for hallucination. Recommend adding endgame position few-shot examples to `src/lib/prompts/fewShotExamples.ts` (or equivalent) showing correct king-activation lines.

2. **Discipline score dragged down by "Stockfish over principles" instruction (P1):** The system prompt (`chessPrinciples.ts:187`) explicitly tells the model to trust engine evals over principles. Fixtures 1 and 3 both drifted toward move-order suggestions rather than principle explanation. This is the highest-leverage single-line fix to improve coaching quality.

3. **Opening name / position ID hallucination (P2):** Fixture 5 was mis-identified as "Closed Sicilian" (it is an Italian/Giuoco Piano). The model should not name the opening unless it is highly confident; a prompt guardrail ("only name the opening if you can identify it from the first 4 moves") would reduce this.

---

## A3. PROMPT_VERSION logging

Status: **not-stamped**.

`PROMPT_VERSION = "2.0"` is defined only in `src/lib/prompts/systemPrompts.ts:22`. It is not imported or referenced anywhere else in the codebase — not in `callLLM()`, not in the `log.info` calls in `llmProvider.ts`, not in the `analysisContext` stored by `enhanced-analysis/route.ts`.

**Recommended insertion points:**
1. `src/lib/llmProvider.ts:240-246` — the `log.info("LLM call succeeded via Anthropic", {...})` block. Import `PROMPT_VERSION` from `@/lib/prompts/systemPrompts` and add `promptVersion: PROMPT_VERSION` to the log payload.
2. `src/app/api/enhanced-analysis/route.ts:1036-1047` — `storeAnalysisContext(...)` call. Add `promptVersion: PROMPT_VERSION` to the stored context so cached follow-up chats know which prompt version served the original analysis.
3. The API response body (`gameAnalysis` object, route.ts:1056-1067) — include `promptVersion` so Phase 3 before/after eval scripts can correlate responses to the prompt version that produced them without reading server logs.

---

## Static-only / dynamic-pending

- **`isSimplePieceRecapture` (chess.ts:179-192):** checks `game.get(moves[0].to)` before the first move is applied. This is semantically fragile (relies on the captured piece still being on the square before replay) but appears correct for standard recapture detection. Needs a dynamic unit test to confirm edge cases (e.g., en-passant recapture where the captured pawn is not on `moves[1].to`).
- **`validatePrincipleViolation` standard-move allowlist (moveValidation.ts:129-146):** hardcoded list of "obviously safe" opening moves (e4, d4, Nf3 …). Not exhaustive; a position where e.g. c5 creates a doubled pawn would be silently allowed. Needs a parametric unit test over the allowlist.
- **Chess960 castling correctness:** `formatUciPv` is only tested for standard chess. If Chess960 is ever enabled (stockfish supports it), a full regression pass is needed.

---

## Notes for consolidation

- **Agent C:** The finding that `/api/chat` fallback path accepts client `role: "system"` messages (lines 130-134 of chat/route.ts) is a security issue. Also, `validateAIResponse` is wired to the fast path but the fallback path (line 163) returns raw `fbResult.content` without any validation — inconsistent hallucination guard coverage.
- **Agent D:** The `SYSTEM_PROMPT_TEMPLATE` "Trust Stockfish" instruction (chessPrinciples.ts:187) is a product/quality decision that should be documented in a prompt changelog alongside the `PROMPT_VERSION` bump.
- **Agent B:** Fixture 4 hallucination (wrong king-pawn line) would be caught by a golden-output regression test. If Agent B sets up a Vitest harness, Agent A's 5 fixtures make natural seed cases.
