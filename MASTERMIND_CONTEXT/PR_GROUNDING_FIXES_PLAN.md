# PR_GROUNDING_FIXES — 5 verified bugs in the AI coaching path

Surgical edits only. No refactors. Each fix names the exact block.

## Fix 1 — Hallucinated source claims in coach system prompt
**File:** `src/lib/prompts/coachChatPrompt.ts:211-253`
**Change:** Remove the two prompt blocks that declare access to data that is never injected:
- Lines 211-229 ("GAMEKNOT COMMENTARY DATASET — PRIMARY SOURCE FOR EXPLANATIONS"). No commentary is ever assembled into the request body (verified by grep across `src/app/api/enhanced-analysis/route.ts` and `src/lib/`).
- Lines 231-253 ("TACTICAL PATTERN RECOGNITION (Based on FULL Lichess Chess Puzzles Dataset)"). The block fabricates puzzle IDs ("#12345"), counts ("over 50,000 puzzles"), and rating bands ("1500-1800") that have no grounding in any injected payload.
**Why:** The prompt explicitly tells the LLM these are PRIMARY sources, so the model invents quotes and stats to satisfy the instruction. Per memory note "OpenAI fallback coded but not operationally integrated" / Jhamtani deferred — both source claims are pure prompt hallucination fuel. Removal preserves the existing real grounding paths (Stockfish, motif detector, voter `groundingContext`, intelligence layer). Snapshot test will need updating.

## Fix 2 — Streaming branches bypass motif grounding validator
**Files:**
- `src/components/AICoachChat.tsx:2492` — `requestData.stream = true` (hardcoded; all live traffic streams).
- `src/app/api/enhanced-analysis/route.ts` — the non-streaming flag-on branch already runs `validateMotifGrounding` at lines 2035-2054, but neither streaming branch does:
  - flag-on streaming (the `validatorsEnabled && streamRequested` branch, lines 1429-1817) — runs the full Mastermind pipeline + chess.js validator, but NO motif grounding check.
  - flag-off streaming (lines 1820-1963) — runs only the chess.js validator.
  - flag-on game_review fallback inside flag-on streaming (lines 1484-1604) — same lack.
**Change:** Add the same `detectMotifs` + `validateMotifGrounding` call (log-only, matches non-streaming behaviour) after the full text is available server-side, in each streaming branch. Runs after the stream content is fully received so the user does not see latency.
- For flag-on streaming branches, use `prep.moveCtx.fenBefore` / `prep.moveCtx.moveSan` (already computed in scope).
- For flag-off streaming branch, recompute via the same approach `prep` uses: take the last move from `moveHistory`, compute `fenBefore` via `getFenAtHalfMove(moveHistory, moveHistory.length - 1)`. Skip when no moves.
**Why:** ALL user traffic streams. Today the motif grounding check exists but only fires on the non-streaming non-fallback path — i.e. never in production. Re-uses the existing helper with same semantics (log-only in v1).

## Fix 3 — ChessDB queried on wrong FEN for top mistakes
**File:** `src/app/api/enhanced-analysis/route.ts:556`
**Change:** `queryChessdb(m.fenAfter)` → `queryChessdb(m.fenBefore)`.
**Why:** Voter at line 583 combines motifs from `m.fenBefore` with stockfish eval from `evalBefore`. ChessDB was being asked about the POST-mistake position while the voter built confidence around the PRE-mistake position. The voter's `compileVoterResult` consumes `chessdbResult` as if it described the same position the motifs describe — mismatched FENs give misaligned grounding. Note: the lower "intelligence layer" block at line 689-694 ALSO queries chessdb on `fenAfterMove` and feeds it to a voter built around `m.fenBefore` motifs — same bug; fixing both.

## Fix 4 — topMistakes slice does not filter by user color (regression)
**Files:**
- `src/app/api/enhanced-analysis/route.ts:548-551` (the `topMistakes` slice in `buildGameContext`)
- `src/app/api/enhanced-analysis/route.ts:860-862` (the equivalent `top = mistakes.slice(0, 12)` in `buildCompactGameContext`)
**Change:** Before slicing, filter `mistakes` by `playerColor` (the function-arg in both `buildGameContext` and `buildCompactGameContext`). `mistakes` stores color as the string `"White"` / `"Black"`; `playerColor` is `"w"`/`"b"`. Filter expression: `mistakes.filter(m => (playerColor === "w" ? m.color === "White" : m.color === "Black"))`.
**Why (regression note):** Previously documented in `USER_SPECIFIC_MISTAKE_FILTERING_SUMMARY.md`. The prompt body already says "ONLY pick the PLAYER's critical mistakes" but we hand the model BOTH colors' mistakes, so opponent blunders leak into the top-mistakes block and confuse the player-perspective rule. This re-introduces the prior bug.

## Fix 5 — Eval perspective mismatch in voter math + comment
**Files:**
- `src/lib/grounding/voter.ts:28-31` — comment says "side-to-move positive".
- `src/lib/grounding/voter.ts:101-107` — `sfStrong = (sfCp ?? 0) >= 150`, `cdbWin && (sfCp ?? 0) >= 100`, `(sfCp ?? 0) >= 200` all treat sfCp as side-to-move-positive.
**Trace:** `parseResults.ts:49-55` flips sign when Black to move → `gameEval.positions[i].lines[0].cp` is in **White's perspective**. Route at `route.ts:587` and `route.ts:701` passes that value as `stockfishEvalCp`. Voter computes `material_win` confidence on the assumption that "+150" means "good for the side I care about". For a Black-mover position where Black has a +1.5 advantage, cp = -150 in White's perspective — voter would compute `sfStrong = false`, missing material_win HIGH. This is a real (not just latent) bug for any Black mistake.
**Change:**
- Update the comment at line 28 to say "White's perspective" matching the actual value (and similarly the mate comment at line 30 — verify or update).
- Change `sfStrong = (sfCp ?? 0) >= 150` → `sfStrong = Math.abs(sfCp ?? 0) >= 150`.
- Change `cdbWin && (sfCp ?? 0) >= 100` → `cdbWin && Math.abs(sfCp ?? 0) >= 100`.
- Change `(sfCp ?? 0) >= 200` → `Math.abs(sfCp ?? 0) >= 200`.
- `positional_plan` already uses `Math.abs(sfCp ?? 0)`, so no change there.
- `lc0AgreesWithSf` already symmetric (checks both directions), so no change.
**Why:** Confidence labels should describe "is there a clear material edge in this position?" not "is the side-to-move winning?" — the call site asks the latent question of the position regardless of mover. Voter tests use `stockfishEvalCp: 200` with positive numbers; switching to `Math.abs` preserves their pass status.

## Out-of-scope notes (surfaced, not fixed)
- The snapshot file `src/lib/prompts/__tests__/__snapshots__/coachChatPrompt.test.ts.snap` will diverge from Fix 1 — must be regenerated with `npm test -- -u` and reviewed before commit.
- Two locations in route.ts (line 556 and line 694) query chessdb on the wrong FEN — Fix 3 addresses both.
- The Mastermind validator pipeline (flag-on streaming + non-streaming) has its OWN motif grounding integration via `prep.moveCtx` — Fix 2 keeps that intact and adds the missing log-only post-LLM check to the streaming branches.
