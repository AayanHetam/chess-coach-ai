# Cutover gap audit — `/analysis` → `/preview/analysis`

**Status as of 2026-05-29:** the redesign is live at `chessmasti.com/preview/analysis`. The cutover (replacing production `/analysis`) is blocked by major feature gaps. The new page (`src/components/preview-analysis/AnalysisImpl.tsx`) is a fresh implementation that re-derived basic Stockfish + chat + simplified puzzles but skipped the production pipeline. **Verified by grep — zero references to any production feature module in `AnalysisImpl.tsx`** for the 20 features below.

This doc is the cutover-readiness checklist. Each item names the production source-of-truth, the gap in the new page, and what wiring is required.

---

## TIER 0 — Hard cutover blockers (user-visible regressions)

### G1. Deep engine analysis pipeline — `/api/enhanced-analysis`
- **Production**: `src/app/api/enhanced-analysis/route.ts` (1082 lines). Calls `callLLM()` (tier="flagship") with deep context, runs `annotatePosition()` for position classification, stores the result keyed by `contextId` via `storeAnalysisContext()` (`src/lib/analysisContextCache.ts`). Subsequent `/api/chat` calls reuse the same context.
- **New page**: only does raw Stockfish via `useEngine(Stockfish17Lite)` at depth 12. No call to `/api/enhanced-analysis`. No `contextId`. No position annotation.
- **Effect**: Coach replies aren't grounded in deep analysis. The "Analyze my game" flow that produces `[INSIGHT:...]` cards is broken.
- **Wire-in**: call `/api/enhanced-analysis` on game-load + game-change, store the returned `contextId`, pass it as the `contextId` param to `/api/chat` calls.

### G2. Move classification — `getMovesClassification`
- **Production**: `src/lib/engine/helpers/moveClassification.ts:28-157`. Eleven classes: Brilliant, Great, Best, Excellent, Good, Okay, Opening, Inaccuracy, Mistake, Blunder, Miss, Forced. Brilliant detection via `isBrilliantMove()` (sacrifice + win% advantage), Great via outcome change, Miss via opponent-blundered + failed-to-capitalize.
- **New page**: home-grown `classifyMove()` (5 classes only: best/good/inaccuracy/mistake/blunder via chess.com win% thresholds). No Brilliant, Great, Forced, Miss, Opening.
- **Effect**: Demo loses the "brilliancy" badges. The whole point of `24.Rxd4‼` in the Kasparov seed message is the Brilliant detection — the new page can never label it as such.
- **Wire-in**: replace `classifyMove()` with `getMovesClassification(positions, allMoves)` from `@/lib/engine/helpers/moveClassification`. Update `MoveLabel` enum + colors + glyphs accordingly.

### G3. Mistake-driven puzzle recommendations — `/api/mistake-puzzles` + `ContextualPuzzleRecommendations`
- **Production**: `ContextualPuzzleRecommendations` (`src/components/ContextualPuzzleRecommendations.tsx:64-280`) POSTs `/api/mistake-puzzles` with `{fen, movePlayed, correctMove, evalBefore, evalAfter, tacticalMotifs}`. Returns puzzles matching the user's *specific mistake*. Mounted inline in coach chat whenever a mistake is detected.
- **New page**: only calls `/api/similar-puzzles` (theme-only). No mistake context, no tactical motif extraction, no inline mistake-driven puzzles.
- **Effect**: The single best UX feature on `/analysis` — "you just blundered, here are 3 puzzles for that exact pattern" — does not exist in the new page.
- **Wire-in**: port `ContextualPuzzleRecommendations` into the coach panel. Wire `extractPuzzleMatchingCriteria()` + `analyzeMissedOpportunity()` from `src/lib/mistakeToPuzzleMapper.ts`. Mount when the user navigates to a ply where `moveClassification ∈ {Mistake, Blunder, Miss}`.

### G4. Game persistence — `useGameDatabase` + Firestore sync
- **Production**: `src/hooks/useGameDatabase.ts:27-100`. Saves analyzed games to IndexedDB ("games" store) and syncs to Firestore via `addCloudGame()` / `updateCloudGameEval()` (`src/lib/firestoreGames.ts`). On login, `getCloudGames()` pulls cloud games into local IDB and dedupes by `firestoreId`. SaveButton at `src/sections/analysis/panelToolbar/saveButton.tsx`.
- **New page**: no save button, no IndexedDB, no Firestore. Games are throwaway.
- **Effect**: Users can analyze a game but can't keep it. After-PR-merge regression: the user's existing saved-games library at `/analysis` keeps working, but anything loaded into `/preview/analysis` evaporates on close.
- **Wire-in**: import `useGameDatabase()`, surface a Save button in the GameHeader near "Load game". Sync the analyzed PGN + `gameEval` (after `/api/enhanced-analysis` populates it).

### G5. AI Coach `[INSIGHT:...]` tag handling
- **Production**: `AICoachChat.tsx:2038-2047` parses `[INSIGHT:...]` from coach replies, locks chat input until received (gates the auto-analyze state machine `autoAnalyzeStateAtom: pending → sent-awaiting-insights → done`), and feeds the insight content into `buildAnalysisSnippetSvg()` for the shareable SVG card.
- **New page**: only handles `[PRACTICE:theme:displayName]` tags. No `[INSIGHT:...]` parsing.
- **Effect**: The coach card / shareable insight generation is broken. The auto-analyze input lock that prevents spam during long replies is broken.
- **Wire-in**: copy the `[INSIGHT:...]` regex + parser from `AICoachChat.tsx`. Add a coach-bubble overlay that renders the insight card when present.

### G6. Auto-analyze flow — `autoAnalyzeStateAtom`
- **Production**: `src/sections/analysis/states.ts:87-93` + `src/pages/analysis.tsx:56-79`. State machine: `idle → pending → sent-awaiting-insights → done`. Triggered by `?autoAnalyze=1` URL param (the Chess Masti browser extension sets this). Locks input until coach replies with `[INSIGHT:...]`.
- **New page**: not wired. `?autoAnalyze=1` is ignored.
- **Effect**: The browser extension's "Analyze with Chess Masti" button breaks against `/preview/analysis` (and will break against `/analysis` after cutover unless this is fixed).
- **Wire-in**: lift `autoAnalyzeStateAtom` from production (or recreate the state machine), gate the chat input on `pending` / `sent-awaiting-insights`, fire the "analyze my game" message on `?autoAnalyze=1`.

### G6b. Insight permalink hydration — `preloadedInsightAtom`
- **Production**: `analysis.tsx:131-172`. `?insightId=` fetches `/api/insights/{id}`, populates `preloadedInsightAtom`. AICoachChat seeds messages from it on mount so the recipient sees the exact saved explanation without a fresh LLM call.
- **New page**: partial — has a fetch on `?insightId=` in `loadNewGame` flow but doesn't seed messages identically.
- **Wire-in**: match production hydration shape (preserve fen, coachContent, kind: "single"|"transcript", transcript array).

---

## TIER 1 — High-impact gaps (degraded UX, not regressions)

### G7. SeeHowLink — full four-tier regex
- **Production**: `AICoachChat.tsx:1323-1353`. Four priority-ordered regexes match move references: "Move 3 (Nxd4)", "Move 3: Nxd4", "24.Rxd4" / "23...Nf6", "move 3 (w|b): Nxd4". Plus "recommended" detection via context: `/best\s*(was|move|is)|should\s*have\s*(played|been)|instead\s*(of|,|:)|better\s*(was|move|is|alternative)|recommended|correct\s*move|improvement/`. Green span (recommended → enter exploration mode) vs blue span (navigate).
- **New page**: only the third tier regex (`24.Rxd4` / `23...Nf6`). No "recommended vs navigate" distinction.
- **Wire-in**: copy the four-tier parser + the `isRecommended` heuristic. Wire the green/exploration vs blue/navigate branches.

### G8. Maia microservice — real ELO-based predictions
- **Production**: `/api/maia-status` + `/api/maia-predict`. `MaiaStatusIndicator` shows health badge. `Lc0DownloadBanner` (`src/components/Lc0DownloadBanner.tsx:27-107`) surfaces a collapsible alert if Maia not configured. WASM + microservice orchestration in `maiaEngine.ts`, `maiaService.ts`, `maiaDownloader.ts`.
- **New page**: ELO slider exists but moves are from a **hardcoded `MAIA_MOVES` table** in `AnalysisImpl.tsx`. No `/api/maia-predict` call, no status indicator, no download banner.
- **Effect**: The "what would a 1100/1500/1800/2200-rated player play here?" UX is theater. Demo only works for the Kasparov-Topalov plies that happen to be in the hardcoded table.
- **Wire-in**: replace `findMaiaMove()` with a fetch to `/api/maia-predict?fen=...&elo=...`. Surface `MaiaStatusIndicator` + `Lc0DownloadBanner` if applicable.

### G9. SurpriseAnalyzer — surprising-move flags
- **Production**: `src/lib/engine/surpriseAnalyzer.ts:1-313`. Compares low-depth (human-like) vs high-depth (engine) evals to flag "surprising" moves. Severity (minor/moderate/major) + explanation (tactical/positional/defensive/development). Returns `GameSurpriseAnalysis: { moves[], overallAssessment, keyInsights[] }`.
- **New page**: not used.
- **Effect**: The "key moments" row on the new page is **hand-authored** for the Kasparov demo. For any user-loaded game, the row is empty.
- **Wire-in**: call `SurpriseAnalyzer` on engine completion. Map the returned moves to `KeyMoment[]` for the existing row UI.

### G10. Practice deep-link integration — `/practice?theme=<X>`
- **Production**: `/practice?theme=<THEME>` preloads theme-filtered puzzles into `practicePuzzlesAtom`. The coach's `[PRACTICE:theme:displayName]` tags surface a button that navigates here.
- **New page**: the `[PRACTICE:...]` tag opens an inline puzzle widget, but there's no "Go to full practice mode" exit.
- **Wire-in**: add a secondary action on the puzzle pack: "Open in Practice →" that navigates to `/practice?theme=<X>`.

### G11. Spaced repetition
- **Production**: `src/lib/spacedRepetition.ts:1-132`. IndexedDB store `puzzle-progress`. Leitner-algorithm interval scheduling. `createTrainingSet()` (`src/lib/repetitTraining.ts`) batches puzzles for practice mode.
- **New page**: not wired. Solved puzzles aren't tracked.
- **Effect**: User can solve the same puzzle in two consecutive sessions. The retention-driving "solve schedule" UX is gone.
- **Wire-in**: on puzzle solve (inline or drill), call into `spacedRepetition.ts` to record progress. Use the result to exclude recently-solved puzzles from future packs.

### G12. CMIP intern flag system — `FlagButton`
- **Production**: `FlagButton` (`src/components/intern/FlagButton.tsx:44-129`) renders on each assistant message **only when `useViewer().isIntern === true`**. POSTs `/api/intern/flag` with `{ contextId, chatHistory, flaggedMessageIndex, flagCategory, whyWrong, idealResponse }`. Feeds the CMIP eval-data pipeline.
- **New page**: not surfaced.
- **Effect**: Interns hitting `/preview/analysis` can't flag bad responses. The eval-data feeder for Mastermind (per memory `project_cmip_feedback_portal.md`) is broken here.
- **Wire-in**: import `FlagButton`, render on each coach message conditional on `useViewer().isIntern`.

---

## TIER 2 — Polish / behavioral parity

### G13. Color detection on imported games
- **Production**: `extractImportedGameInfo()` + `detectUserColor()` (`src/lib/smartColorDetection.ts`). Parses White/Black headers, matches against the last-searched username (stored in localStorage), infers the user's color. Sets `boardOrientation` accordingly.
- **New page**: defaults to white orientation regardless of who the user is.
- **Wire-in**: call after `loadNewGame()`, when the source is Lichess/Chess.com import.

### G14. Adaptive puzzles — `/api/adaptive-puzzles`
- **Production**: per-user "struggled themes" via Neo4j (`STRUGGLED_WITH` edges). Recommends themed puzzles based on what the user has been getting wrong.
- **New page**: not used.
- **Wire-in**: replace `fetchPuzzlesForTheme` with a fallback chain — `/api/mistake-puzzles` (when mistake context exists) → `/api/adaptive-puzzles` (signed-in users with history) → `/api/similar-puzzles` (theme-only fallback).

### G15. Saved evals atom integration
- **Production**: `savedEvalsAtom` (Jotai, in-memory) is the cache that prevents re-analysis on navigation. Keyed by `"${fen}|${engineName}|d${depth}|pv${multiPv}"`. The cache is **shared across all components** that use `useCurrentPosition`.
- **New page**: uses **sessionStorage** keyed by `djb2(pgn) + depth + engineName`. Not Jotai. Not shared with the rest of the app.
- **Effect**: Inside the new page, the cache works. But navigating to any other production surface (`/play`, `/practice`) doesn't see these evals, and vice versa. After cutover, this becomes a regression.
- **Wire-in**: switch to `savedEvalsAtom`. Keep the sessionStorage write as a session-persistence layer if desired.

### G16. UnifiedSections / panels — Engine Lines, Stats, Game Info
- **Production**: `UnifiedSections` (`src/sections/analysis/panelBody/unifiedSections.tsx`) togglable sections: Graph, Engine Lines (PV display), Stats, Game Info, Moves.
- **New page**: no Engine Lines display. PV-1 / PV-2 / PV-3 are not surfaced. Stats (accuracy %, estimated Elo) not shown.
- **Wire-in**: add these as tab content or accordion sections — at minimum Engine Lines is a high-value engine-savvy-user feature.

### G17. Validator pipeline (Mastermind Stage B)
- **Production**: `/api/enhanced-analysis` runs the Mastermind validator pipeline when `getMastermindEnv().validatorsEnabled === true` (`src/app/api/enhanced-analysis/route.ts:23-49`). Validates coach output against engine ground truth.
- **New page**: no validation pass. Coach can hallucinate lines.
- **Wire-in**: this is gated on the broader `/api/enhanced-analysis` wiring (G1). Same fix unlocks this.

---

## TIER 3 — Verified working in new page (carry over as-is)

| Feature | Status |
|---|---|
| Real Stockfish eval (basic) | ✅ via `useEngine` |
| `/api/chat?stream=1` SSE streaming | ✅ |
| `[PRACTICE:theme:displayName]` tag parsing | ✅ |
| `/api/similar-puzzles` fetch | ✅ |
| Inline puzzle solver (mini board) | ✅ |
| Drill flow (Move to big board, 3-puzzle drill, return to game) | ✅ |
| Game ingestion: `?pgn=`, `?fen=`, `?lichessReview=1`, `?insightId=` | ✅ partial — `?autoAnalyze=1` not wired (see G6) |
| LoadGameDialog (Paste / Lichess / Chess.com) | ✅ |
| Engine settings popover (depth + variant) | ✅ |
| CoachShareDialog | ✅ |
| Error boundaries on board + tabs | ✅ |
| Sentry context on game load | ✅ |
| Master DB 3-tier resolver (`/api/opening-explorer`) | ✅ |
| TabStrip (Coach / Masters / Moves) | ✅ |
| MovesListPanel (click-to-jump, Ask coach about move) | ✅ partial — classifications use simplified `classifyMove`, see G2 |
| Stockfish worker `/engines/...` absolute path resolution | ✅ |
| `/api/health/neo4j` health probe | ✅ |
| `outputFileTracingIncludes` for master-tree.json | ✅ |

---

## Recommended cutover sequencing

The TIER 0 list is the cutover blocker. The TIER 1 list is "fix before declaring victory." TIER 2 is polish.

Minimum viable cutover order:
1. **G1** (enhanced-analysis context) — unlocks G5, G6, G17 dependencies.
2. **G2** (full move classification) — replaces simplified `classifyMove` with `getMovesClassification`. ~1 hour, surgical.
3. **G3** (mistake-driven puzzles + ContextualPuzzleRecommendations mount) — the single biggest UX win.
4. **G4** (Firestore game persistence via `useGameDatabase`) — closes the "users lose their games" regression.
5. **G5 + G6** (INSIGHT tags + auto-analyze flow) — restores the extension trigger + share-card pipeline.
6. **G8** (real Maia wiring) — replaces the hardcoded MAIA_MOVES table.
7. **G7** (full SeeHowLink) — clickable move parity.
8. **G12** (FlagButton) — restores CMIP eval-data feeder.
9. **G9** (SurpriseAnalyzer) — real key-moments for user-loaded games.
10. **G11** (spaced repetition) + **G14** (adaptive puzzles) + **G15** (savedEvalsAtom) — cross-surface consistency.

After this list, cutover is safe. Until then, `/preview/analysis` is a beautiful demo with a fraction of `/analysis`'s real capability.
