# Plan: Replace `/analysis` with `/preview/analysis`

**STATUS — CUTOVER COMPLETE** as of `b99a827` on `feat/design-motion-foundation`.
- `/analysis` now serves the dark-glass redesign.
- `/preview/analysis` still serves the same content (alias during rollout).
- `/legacy/analysis` parks the old Jotai + react-chessboard page as the escape hatch.

Branch baseline: `feat/design-motion-foundation` @ `b99a827`
Goal: production cutover where `chessmasti.com/analysis` serves the redesign with **zero functional regression** versus today's page.

---

## Status of Neo4j (the asked question, answered)

- **Local**: `.env.local` already has `NEO4J_URI` / `NEO4J_USERNAME` / `NEO4J_PASSWORD`. Verified — `/api/similar-puzzles` returned real Lichess puzzles in our smoke test.
- **Production (Vercel)**: same three env vars must be set in Project → Settings → Environment Variables. If `/analysis` works in prod today (it does), these are already set. **Action: confirm before cutover, do not assume.**
- **No code change needed to plug Neo4j in** — the routes already use it. The preview redesign just needs to call those routes, which it already does (`/api/similar-puzzles` is wired in commit `a8e4ef8`).

What IS missing — 3 Neo4j-touching routes don't guard with `isNeo4jConfigured()` and will 500 (not 503) if env vars vanish. Backfill is one-line per route. Not blocking, but should ship in Phase 0.

---

## Feature-parity gaps between `/preview/analysis` and `/analysis`

Audited via `src/pages/analysis.tsx`, `src/components/AICoachChat.tsx`, `src/sections/analysis/*`. Categorised by replaceability:

### Present in both ✅
- Real Stockfish eval (commit `580bb12`)
- Real `/api/similar-puzzles` puzzle fetch (`a8e4ef8`)
- `/api/opening-explorer` 3-tier chain (curated → Lichess → chessdb.cn)
- Coach streaming via `/api/chat?stream=1`
- 3-puzzle drill with "Move to big board" + "Return to game" (`c8b2890` + `16239dc`)
- `[PRACTICE:theme:displayName]` tag parsing

### Missing in preview ❌
1. **Game ingestion** — production has `?pgn=`, `?fen=`, `?lichessReview=1`, `?insightId=`, `?autoAnalyze=1`, plus a `LoadGameDialog` (Lichess/Chess.com import + paste). Preview only loads a hardcoded Kasparov-Topalov demo.
2. **Firestore game save/load** — `useGameDatabase` writes analyzed games. Preview has nothing.
3. **Engine settings UI** — `EngineSettingsButton` (depth, multiPV, variant). Preview is fixed at Stockfish17Lite depth=12, multiPv=1.
4. **Per-FEN analysis cache** — `savedEvalsAtom` keyed by `fen|engine|d{depth}|pv{multiPv}` in `useCurrentPosition`. Preview re-runs on each load.
5. **AICoachChat full feature surface**:
   - `SeeHowLink` — `"23.Rxd4"` in chat is clickable, jumps the board
   - `PracticePuzzleButton` — inline render of 3 puzzles in the chat bubble (we replaced this with our drill flow, which is the design intent — confirm with you)
   - `ContextualPuzzleRecommendations` (mistake-based) mount
   - `[INSIGHT:...]` tag handling
6. **Move classification overlay** — `MoveClassification` (blunder/mistake/inaccuracy/best/brilliant) computed via `getMovesClassification()` and rendered on a full move list. Preview has no move list at all, just a pill-shaped MoveNavigator.
7. **AnalysisSnippetDialog** — share single message or transcript, persist to Firestore via `/api/insights`, screenshot export via `copyPngToClipboard`.
8. **Mobile-responsive panel overlay** — production flips the right panel to fullscreen on narrow viewports.
9. **Error boundaries** — production wraps board, coach, sections. Preview has none.
10. **Sentry context** — `setSentryContext("loadedGame", ...)` fires on PGN load.

---

## Phased plan (PR-sized chunks)

### Phase 0 — Safety net (no user-facing changes)
- Add `/api/health/neo4j` calling `verifyConnection()`. Used as a Vercel smoke check before cutover.
- Backfill `isNeo4jConfigured()` guards on `/api/adaptive-puzzles`, `/api/similar-puzzles`, `/api/commentary-by-fen` — return 503 on absent env, not 500.
- Confirm Vercel env vars present (Neo4j + Anthropic). Document in a one-page checklist alongside this plan.
- Unlock Vercel preview Deployment Protection on `feat/design-motion-foundation` (per `project_vercel_preview_builds_missing.md`) so we can demo before cutover.

**Exit:** Vercel preview URL serves `/preview/analysis` with real Neo4j puzzles; health endpoint green.

### Phase 1 — Game ingestion
- Port `LoadGameDialog` from `src/sections/loadGame/` into the preview surface (re-wrap in the dark-glass theme; do not modify the production component).
- Wire `?pgn=`, `?fen=`, `?lichessReview=1`, `?insightId=`, `?autoAnalyze=1` handlers using the same patterns as `src/pages/analysis.tsx` lines 56–199.
- Keep the Kasparov-Topalov as a **fallback** when no game-source param is present, so the demo experience for first-time visitors stays.
- Wire `useGameDatabase().addGame()` so analyzed games persist to Firestore.

**Risk:** `useGameDatabase` is auth-gated. Preview currently assumes guest. Match production behavior (write only if signed in).

### Phase 2 — Analysis engine + cache
- Lift `savedEvalsAtom` and the cache key from `useCurrentPosition` into `/preview/analysis`. No need to rewrite — import and reuse.
- Add `EngineSettingsButton` (re-themed) so users can change depth / multiPv. Default to current preview values (12, 1) for parity with the demo.
- Persist user's last engine settings via the same Jotai atoms production uses.

**Risk:** depth ≥ 18 may overrun Vercel's 60s function timeout on long games. Cap UI at depth 16 (production also defaults to 14). Not a regression — production has the same constraint.

### Phase 3 — Coach feature parity
- Port `SeeHowLink` regex parser + click-to-jump from `AICoachChat.tsx` (~lines 348–399) into our `CoachBubble`.
- Decide: keep our `CoachPuzzleCard` + drill UX **or** swap in production's inline `InlinePuzzleSet`. Recommendation: **keep the drill** (it's the new design's signature interaction). Production's `PracticePuzzleButton` becomes redundant under our model.
- Add `ContextualPuzzleRecommendations` (the mistake-driven path that fires from move classification, not from `[PRACTICE:]` tags).
- Add `AnalysisSnippetDialog` (share + export). Mostly a port; uses existing `/api/insights` endpoint.
- Remove the hardcoded "Stockfish-grounded · Engine-validated" badge unless we actually wire engine validation per coach reply (production doesn't — it's a preview-only flourish that misrepresents).

### Phase 4 — Move classification + move list
- Compute classifications via `getMovesClassification()` in `src/lib/engine/helpers/moveClassification.ts` once Stockfish completes.
- Render classification icons on `KeyMomentsRow` (already partly there with hand-authored moments — replace with real ones).
- Add a **scrollable, multi-column move list** below or to the side of the board. Mirror production's `MovesPanel` but in dark-glass theme.
- Click a move → jump to that ply (already supported via `setCurrentPly`).

### Phase 5 — Mobile + safety
- Wrap each section in an `ErrorBoundary` (port from production).
- Add Sentry context calls on PGN load + on first analysis completion.
- Mobile layout: stack board → drill banner → key moments → eval arc → move list → coach. Right-panel-as-overlay (production's pattern) is heavier; consider keeping the simpler stack for first cutover.

### Phase 6 — Cutover
- Move `src/pages/preview/analysis.tsx` → `src/pages/analysis.tsx`. Old file → `src/pages/_legacy_analysis.tsx` (route disabled, kept as escape hatch for one release cycle).
- Update `src/sections/layout/index.tsx` `isBareLayout` to recognise `/analysis` as bare-layout (no production NavBar) — the redesign brings its own chrome.
- Update `NavPill` + `AppDrawer` Preview↔Production toggle map (it should now go to `/play`, not `/preview/play`).
- Smoke-test against three real games: a Lichess paste, a Chess.com import, and the `?lichessReview=1` localStorage bridge.
- Update `handoff.md` + memory to reflect cutover.

---

## What's explicitly NOT in scope here
- Mastermind agentic coach (separate plan series — see `MASTERMIND_CONTEXT/`)
- CMIP intern feedback portal (separate plan series — see `PR_CMIP_1_PLAN.md`)
- Maia microservice wiring for the ELO slider (currently mocked; the table is fine for demo, can be a follow-up)
- New features beyond what `/analysis` already does. **Parity first, then innovation.**

---

## Risk register
1. **4 concurrent Claude Code sessions** edit this repo. `AICoachChat.tsx` may move under us. Mitigation: **never modify** the production component; copy patterns into the preview file.
2. **chessground v9.2.1 drag bug** — already worked around via `syncTick` (commit `16239dc`).
3. **Lichess masters endpoint blocked** — already worked around via 3-tier `/api/opening-explorer` chain.
4. **Phase 3 audit not done** — `/api/chat` still rejects `role:"system"` from clients (hardening per `AUDIT-PHASE-1.4`). Preview already routes context via the user turn. ✓
5. **Auth-gated game persistence** — guests can analyze but not save. Production matches. Surface a sign-in CTA in the share dialog only.

---

## Effort estimate (sessions, not days)
- Phase 0: 1 session
- Phase 1: 2 sessions
- Phase 2: 1 session
- Phase 3: 2 sessions
- Phase 4: 2 sessions
- Phase 5: 1 session
- Phase 6: 1 session

**Total: ~10 sessions** for full cutover with zero regression.

If you want to ship faster with one accepted regression (lose Firestore save until a follow-up), Phase 1 collapses by half — ~8 sessions.

---

## Decisions (resolved 2026-05-28)

1. **Puzzles**: keep the inline 3-puzzle solver (port `InlinePuzzleSet`) **AND** the "Move to big board" expand button per puzzle. Users get both flows.
2. **Right-column tabs** (NEW ARCHITECTURE — replaces the takeover modal swap):
   - Tab 1 — **Coach** (default): the chat panel
   - Tab 2 — **Masters**: live master-DB browser (was the takeover-modal content)
   - Tab 3 — **Moves**: full PGN move list with classification badges, click-to-jump, and a per-move "Ask coach about this move" button that switches back to Coach + auto-sends a contextual question.
   The OpeningExplorer mini-panel under Coach goes away (Masters tab supersedes it). The "Takeover" button on OpeningExplorer also goes away (tabs replace it).
3. **Share / export**: included in Phase 3 (port `AnalysisSnippetDialog`).
4. **Ship as one big PR** — no phased rollout.
5. **Soft cutover** — old `/analysis` parks at `/legacy/analysis` for one release cycle as an escape hatch; removed after metrics are green.
