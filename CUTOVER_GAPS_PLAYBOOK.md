# Cutover gaps — implementation playbook

Companion to [CUTOVER_GAPS.md](./CUTOVER_GAPS.md). This doc breaks each gap into the specific code changes needed in `src/components/preview-analysis/AnalysisImpl.tsx` (and adjacent files). Working branch: `feat/cutover-gaps-tier-0-1`.

Per-gap entries follow a fixed shape:
- **Production source-of-truth**: the file/lines to read for the pattern
- **New-page wire-in**: the file/lines to touch
- **Smoke test**: one concrete action to verify after coding

---

## G1 — `/api/enhanced-analysis` context

**Production source**: `src/sections/analysis/panelHeader/analyzeButton.tsx:43–63` calls `engine.evaluateGame({...params, ...})`; the resulting `gameEval` flows through `gameEvalAtom`. `/api/chat` reuses the deep coach context via `contextId` cached by `storeAnalysisContext()` (`src/lib/analysisContextCache.ts`).

**Why we need it**: the new page does only raw Stockfish (`useEngine().evaluateGame(...)`), which gives position-level evals but never sets up the LLM context cache. Coach replies are ungrounded.

**Wire-in**:
1. After `enginePositions` is populated, fire a `POST /api/enhanced-analysis` with `{ pgn, gameEval, userRating }` to mint the contextId.
2. Store the returned contextId in component state.
3. Pass it as `contextId` to every `streamCoachReply` call. The route already supports this.

**Smoke**: load a game, watch the coach reply use precise position references — the kind only available through the deep context.

---

## G2 — Full move classification (`getMovesClassification`)

**Production source**: `src/lib/engine/helpers/moveClassification.ts:28–157`. The function signature is `getMovesClassification(positions: PositionEval[], moves: Move[], game: Chess): PositionEval[]` and it returns the same array with `moveClassification` populated per position.

**Why we need it**: the new page has a 5-class `classifyMove` that misses Brilliant, Great, Forced, Miss, Opening. Demo loses the brilliancy badge on `24.Rxd4‼`.

**Wire-in**:
1. `import { getMovesClassification } from "@/lib/engine/helpers/moveClassification"` near the existing `getPositionWinPercentage` import.
2. After `enginePositions` lands, run the classifier: `const classified = getMovesClassification(enginePositions, allMoves, loadedGame);`
3. Replace AnalysisImpl's `MoveLabel` enum with the full `MoveClassification` enum.
4. Update `CLASSIFICATION_COLORS` / `CLASSIFICATION_GLYPHS` to cover all 11 classes. Map missing ones from chess.com icons or invent.
5. `MovesListPanel`'s `Cell` component reads `classifications[ply]` from the new array.

**Smoke**: Kasparov demo board on ply 47 (`24.Rxd4`) — should now show the Brilliant tag.

---

## G3 — `/api/mistake-puzzles` + `ContextualPuzzleRecommendations` mount

**Production source**: `src/components/ContextualPuzzleRecommendations.tsx:24–168`. Props: `fen`, `movePlayed`, `correctMove`, `evalBefore`, `evalAfter`, `tacticalMotifs`, `userRating?`. Mounted inline when the user navigates to a ply with a mistake/blunder.

**Wire-in**:
1. `import { ContextualPuzzleRecommendations } from "@/components/ContextualPuzzleRecommendations"`.
2. Compute mistake context when current ply has `moveClassification ∈ {Mistake, Blunder, Miss}`:
   - `movePlayed = allMoves[currentPly - 1].san`
   - `correctMove = enginePositions[currentPly - 1].lines[0].pv[0]` (UCI → SAN via chess.js)
   - `evalBefore = enginePositions[currentPly - 1].lines[0].cp` (or mate)
   - `evalAfter = enginePositions[currentPly].lines[0].cp`
   - `tacticalMotifs` = derive from FEN diff via `extractPuzzleMatchingCriteria()` if available
3. Mount `<ContextualPuzzleRecommendations ... />` inside the Coach panel below the chat input when mistake context is non-null.

**Smoke**: navigate to any "Mistake/Blunder" key moment — 3 inline puzzles should appear.

---

## G4 — Firestore game persistence (`useGameDatabase`)

**Production source**: `src/hooks/useGameDatabase.ts:27–100`. `useGameDatabase()` exposes `gameFromUrl`, `addGame`, `setGameEval`, etc. Save flow in `src/sections/analysis/panelToolbar/saveButton.tsx`.

**Wire-in**:
1. `const { addGame, setGameEval } = useGameDatabase();`
2. Surface a "Save game" button in the GameHeader, between "Load game" and the engine chip.
3. On click, call `addGame({ pgn: loadedGame.pgn(), eval: enginePositionsToGameEval(enginePositions), site: "ChessMasti.com", ... })`.
4. After enhanced-analysis returns, call `setGameEval(gameId, gameEval)` to persist the deep eval.
5. Gate on signed-in state (`useViewer().isLoggedIn`); show "Sign in to save" prompt otherwise.

**Smoke**: load a PGN, click Save, refresh the page, navigate to /play and confirm the game appears in the saved list.

---

## G5 — `[INSIGHT:...]` tag handling

**Production source**: `src/components/AICoachChat.tsx:2038–2047`. Regex: `/\[INSIGHT:([^\]]+)\]/g`. The captured payload is the headline for the shareable SVG card. When the coach reply contains an INSIGHT tag, it triggers state transitions (G6 below).

**Wire-in**:
1. Add `INSIGHT_TAG_RE = /\[INSIGHT:([^\]]+)\]/g` near the existing PRACTICE regex in AnalysisImpl.
2. `extractInsightTags(content): { stripped, insights }` mirrors `extractPracticeTags`.
3. CoachBubble: when an insight is present, render an extra badge under the bubble — title from the insight payload, "Save" CTA opens the existing CoachShareDialog with `data.explanation = insightContent`.

**Smoke**: send a "analyze move 24" message, watch the reply for `[INSIGHT:...]` (Claude usually includes one in deep replies), see the badge.

---

## G6 — `autoAnalyzeStateAtom` + `?autoAnalyze=1`

**Production source**: `src/sections/analysis/states.ts:87–93` + `src/pages/analysis.tsx:56–79`. State machine: `idle → pending → sent-awaiting-insights → done`.

**Wire-in**:
1. Add state to AnalysisImpl: `const [autoAnalyzeState, setAutoAnalyzeState] = useState<"idle"|"pending"|"sent-awaiting-insights"|"done">("idle")`.
2. Read `?autoAnalyze=1` from router.query alongside the other URL params; set state to `"pending"`.
3. When `enginePositions` lands AND state is `"pending"`, fire `handleSend("Analyze my game.")` and set state to `"sent-awaiting-insights"`.
4. In `streamCoachReply`'s onDelta watcher, when the accumulated content matches `INSIGHT_TAG_RE`, set state to `"done"` and unlock input.
5. Disable the chat input when state is `"pending"` or `"sent-awaiting-insights"`.

**Smoke**: visit `/preview/analysis?pgn=<X>&autoAnalyze=1` — chat fires automatically, input is locked until coach completes.

---

## G8 — Real Maia (`/api/maia-predict`)

**Production source**: `src/lib/engine/maiaServerService.ts` exports `getMaiaPrediction(fen, elo): Promise<{ move: string, ... }>`. Endpoint `/api/maia-predict?fen=...&elo=...`.

**Wire-in**:
1. Delete the hardcoded `MAIA_MOVES` table in AnalysisImpl.
2. Replace `findMaiaMove(ply, elo)` with an async fetch:
   ```ts
   const [maiaMove, setMaiaMove] = useState<Record<string, string>>({});
   useEffect(() => {
     if (!arrowToggles.maia) return;
     const key = `${currentFen}|${arrowToggles.maiaElo}`;
     if (maiaMove[key]) return;
     fetch(`/api/maia-predict?fen=${encodeURIComponent(currentFen)}&elo=${arrowToggles.maiaElo}`)
       .then((r) => r.json())
       .then((d) => setMaiaMove((m) => ({ ...m, [key]: d.move })));
   }, [currentFen, arrowToggles.maia, arrowToggles.maiaElo]);
   ```
3. Use `maiaMove[key]` in `displayShapes`.
4. Surface `MaiaStatusIndicator` + `Lc0DownloadBanner` in the GameHeader so users know if Maia is offline.

**Smoke**: load a non-Kasparov game, toggle Maia arrow on, see real human-like-move arrows (not theater).

---

## G7 — Full SeeHowLink (4 regex tiers + recommended/navigate)

**Production source**: `src/components/AICoachChat.tsx:1323–1353` (regex) and `:470–675` (ClickableMove component).

**Wire-in**:
1. Replace the single MOVE_REF_RE in CoachBubble with the 4-tier match cascade.
2. Add `isRecommended(contextBefore: string): boolean` that runs the production regex on the 60 chars before the move.
3. Style recommended (green) vs navigate (orange) differently.
4. On recommended click → enter exploration mode at that ply with auto-play of the suggested alternative.

**Smoke**: coach says "the best move was Nf3 instead of e4." — "Nf3" should be GREEN clickable, board enters exploration with Nf3 played.

---

## G12 — `FlagButton` for interns

**Production source**: `src/components/intern/FlagButton.tsx:44–129`. Renders conditional on `useViewer().isIntern === true` and `message.role === "assistant"`.

**Wire-in**:
1. `import { FlagButton } from "@/components/intern/FlagButton"`.
2. In CoachBubble, if `!isUser && useViewer().isIntern`, render the FlagButton with the message context.

**Smoke**: sign in as intern, see flag icon on each coach reply.

---

## G9 — `SurpriseAnalyzer` for key moments

**Production source**: `src/lib/engine/surpriseAnalyzer.ts:1–313`. Exports `runSurpriseAnalysis(positions, allMoves)` returning `GameSurpriseAnalysis: { moves[], overallAssessment, keyInsights[] }`.

**Wire-in**:
1. After `enginePositions` lands, call `runSurpriseAnalysis(enginePositions, allMoves)`.
2. Map the returned `moves[]` (with severity + explanation) into `KeyMoment[]` for the existing KeyMomentsRow.
3. Drop the hand-authored `KEY_MOMENTS` constant — it stays only as a fallback for the seed Kasparov demo.

**Smoke**: load any non-Kasparov game; the KeyMomentsRow now populates with real surprises.

---

## G11 / G14 / G15 — cross-surface consistency

**G11 — Spaced repetition**: on puzzle solve (`InlinePuzzleSolver.onSolved`), call `recordPuzzleSolve(puzzleId, solveTimeMs)` from `src/lib/spacedRepetition.ts`. Exclude recently-solved IDs in subsequent fetches via `excludeIds` param.

**G14 — Adaptive puzzles**: replace `fetchPuzzlesForTheme` with a 3-step chain:
1. If mistake context exists → `/api/mistake-puzzles`
2. Else if user signed in with history → `/api/adaptive-puzzles`
3. Else → `/api/similar-puzzles` (current path)

**G15 — savedEvalsAtom**: import `savedEvalsAtom` from `src/sections/analysis/states.ts`. Replace the local `enginePositions` cache with `useAtom(savedEvalsAtom)`. Key by `"${fen}|${engineName}|d${depth}|pv${multiPv}"` per production.

**Smoke**: solve a puzzle, refresh — the puzzle isn't offered again. Visit /play after analyzing a game — the eval already loaded.

---

## G13 / G16 / G17 — polish

**G13 — Color detection on imports**: in `loadNewGame`, when source is Lichess/Chess.com, call `extractImportedGameInfo(game, gameOrigin, username)` and `detectUserColor(...)`. Set `boardOrientation` from the result.

**G16 — Engine Lines panel**: add a 4th tab to the right-column TabStrip: "Lines". Display the top 3 PV lines from `enginePositions[currentPly].lines` with eval + moves.

**G17 — Validator pipeline**: unlocks automatically when G1 ships. Requires `getMastermindEnv().validatorsEnabled === true` server-side; no additional client work.

---

## Execution order

G1 → G2 → G3 → G4 → G5 → G6 → G8 → G7 → G12 → G9 → G11/G14/G15 → G13/G16. G17 is a freebie after G1.

Commits roughly one-per-gap. Type-check between gaps. Single PR.
