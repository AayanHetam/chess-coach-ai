# Agent B — Frontend quality findings (static-only)
Generated: 2026-04-23. Model: sonnet. Tooling: Playwright/axe/Lighthouse not installed — items needing them are labeled below.

---

## B1. UI/UX

### [P1] Viewport meta blocks user zoom — mobile accessibility regression
File: `src/pages/_app.tsx:59`
Reproduction: Open any page on a mobile device or DevTools mobile emulator; attempting to pinch-zoom produces no response.
Proposed fix: Remove `maximum-scale=1.0, user-scalable=no` entirely. The board and chat already use responsive sizing; this restriction is unnecessary and violates WCAG 1.4.4 (Resize text).
Blast radius: high — affects every page on every mobile device.
Test: Playwright e2e — assert `content` attribute of `<meta name="viewport">` does not contain `user-scalable=no`.

### [P1] Hardcoded magic-number breakpoint duplicated across 6 files (not using MUI theme)
File: `src/sections/analysis/board/index.tsx:32`, `src/sections/practice/PuzzleRush.tsx:124`, `src/sections/play/lichess/LichessLivePlay.tsx:106`, `src/sections/practice/PatternTraining.tsx:97`, `src/components/PracticeChessBoard.tsx:107`, `src/pages/openings.tsx:91`
Reproduction: Grep `window.innerWidth < 1200` — all six files independently compare against the hardcoded magic number 1200 (or 900) rather than using `theme.breakpoints.values.lg` (also 1200 in MUI default). If the theme breakpoint is ever adjusted, the board sizing diverges silently.
Proposed fix: Create a shared `useBoardSize()` hook that reads `theme.breakpoints.values.lg` via `useTheme()` and centralise the calculation; remove the six duplicates.
Blast radius: med — visual mis-sizing on resize edge, not a crash.
Test: RTL unit — verify `useBoardSize` returns expected sizes at mocked screen widths.

### [P1] `recharts` eagerly imported in `/analysis` page chunk
File: `src/sections/analysis/panelBody/graphTab/index.tsx:11`, `src/sections/analysis/panelBody/unifiedSections.tsx:6`
Reproduction: `GraphTab` is synchronously imported by `UnifiedSections`, which is synchronously imported by `analysis.tsx`. Recharts ships ~220 kB minified and contributes directly to the 638 kB First Load JS on `/analysis`. The graph is only visible when the user enables it from the section toggle.
Proposed fix: Convert `GraphTab` import in `unifiedSections.tsx` to `next/dynamic` with `{ ssr: false }`; the graph only renders after analysis runs anyway.
Blast radius: high — expected savings ~150–200 kB on `/analysis` first load.
Test: Build output check — `/analysis` page chunk should shrink after the change.

### [P2] `react-syntax-highlighter` eagerly loaded inside `AICoachChat`
File: `src/components/AICoachChat.tsx:24-25`
Reproduction: `AICoachChat` is dynamically loaded by `coachTab/index.tsx`, which is good. However, `SyntaxHighlighter` is imported at the top of `AICoachChat` rather than lazily. Since AI responses almost never contain code blocks, the highlighter (~60 kB) is parsed on every chat mount.
Proposed fix: Move the `SyntaxHighlighter` import inside the `code` renderer function and use `React.lazy` / `next/dynamic` so it only loads when a code block is actually in a response.
Blast radius: low — lazy-loaded behind the dynamic AICoachChat boundary already; marginal impact on `/analysis` first-interaction paint.
Test: Bundle analysis — verify SyntaxHighlighter chunk appears in a separate lazy chunk.

### [P2] Leftover production `console.log` calls in hot render paths
File: `src/sections/analysis/panelBody/coachTab/index.tsx:65-73`, `src/sections/analysis/panelBody/graphTab/index.tsx:43-52,101,199,213`, `src/sections/analysis/hooks/useBoardGameSync.ts:35,47,51,54,70,72,101,104,108,115`
Reproduction: Load `/analysis` and open DevTools console; each board move triggers multiple log statements including full PGN strings and evaluation data.
Proposed fix: Remove or gate behind a `process.env.NODE_ENV === 'development'` check. Serialising PGN and board history on every render has a measurable allocation cost in long games.
Blast radius: low — no user-visible regression; performance gain in long analysis sessions.
Test: RTL unit — assert `console.log` not called on re-render with a spy.

### [P2] Auth dialog close button missing `aria-label`; icon-only button
File: `src/components/auth/AuthDialog.tsx:91-100`
Reproduction: The X `IconButton` in the dialog header uses `<Icon icon="mdi:close" />` with no text and no `aria-label`. Screen readers will announce it as an unlabelled button.
Proposed fix: Add `aria-label="Close sign-in dialog"` to the `IconButton`.
Blast radius: low — affects only AuthDialog.
Test: axe automated scan of the dialog open state.
static-only, dynamic verification pending — would confirm via `@axe-core/playwright` rule `button-name`.

### [P2] `useScreenSize` hook uses `querySelector('.MuiGrid2-root')` — fragile DOM coupling
File: `src/hooks/useScreenSize.ts:19`
Reproduction: The hook locates a `ResizeObserver` target by querying the first `.MuiGrid2-root` element in the document, which will silently observe the wrong element if the DOM order changes or if a page doesn't include a Grid2. MUI's internal class names are also considered unstable.
Proposed fix: Expose a `ref` from the hook (or accept one as parameter) and attach `ResizeObserver` to that ref instead of a class-name query.
Blast radius: med — incorrect board sizing on affected pages if class changes.
Test: RTL unit with mocked `document.querySelector`.

---

## B2. Accessibility

### [P0] Viewport meta disables pinch-to-zoom — WCAG 1.4.4 violation
*(Also listed as B1 P1 — elevated to P0 here for a11y severity.)*
File: `src/pages/_app.tsx:59`
Reproduction: Any mobile user who needs to zoom in on text or board position cannot do so.
Proposed fix: Remove `maximum-scale=1.0, user-scalable=no`.
Blast radius: high.
Test: Playwright mobile emulation + axe `meta-viewport` rule.

### [P1] No `aria-live` region for chess move announcements or AI coach responses
File: `src/components/AICoachChat.tsx` (entire file), `src/components/board/index.tsx` (entire file)
Reproduction: Screen reader users receive no audible feedback when moves are played on the board or when the AI coach streams a new response. There is no `aria-live` region anywhere in the codebase (confirmed by grep).
Proposed fix: Add `<div aria-live="polite" aria-atomic="false" className="sr-only" ref={announcerRef}>` and update it with the last played move SAN / coach message on each state change.
Blast radius: high — core interaction loop is inaccessible to screen reader users.
Test: axe + manual screen reader test (NVDA/VoiceOver).
static-only, dynamic verification pending — would confirm via axe `aria-live` checks.

### [P1] Chessboard has no keyboard move interface
File: `src/components/board/index.tsx` (entire file)
Reproduction: `react-chessboard` 4.7.3 renders an SVG/div-based board. No `onKeyDown` handler is added to the board wrapper, no `tabIndex` is set on squares, and no keyboard-based piece selection/move sequence is implemented. The `<Chessboard>` component itself does not add `role="grid"` or square labels. Keyboard-only users cannot play or navigate moves.
Proposed fix: Wrap the board in a `<div tabIndex={0} role="application" aria-label="Chess board">` with a `onKeyDown` handler implementing arrow-key square selection and Enter/Space for piece pick-up and drop.
Blast radius: high — entire board interaction is keyboard-inaccessible.
Test: Playwright keyboard navigation e2e.
static-only, dynamic verification pending — would confirm via axe `keyboard` rule and manual tab-navigation test.

### [P1] No skip-to-main-content link
File: `src/pages/_document.tsx` (entire file), `src/pages/_app.tsx` (entire file)
Reproduction: Keyboard users tabbing into any page must traverse the full NavBar and all its links before reaching page content. No `<a href="#main-content">Skip to main content</a>` is present.
Proposed fix: Add a visually-hidden skip link as the first child of `<body>` (in `_document.tsx`) targeting `id="main-content"`, and add that `id` to the `<main>` element in `Layout`.
Blast radius: med — affects keyboard navigation on every page.
Test: Playwright e2e — assert first focusable element is the skip link.

### [P1] `prefers-reduced-motion` not respected anywhere
File: `src/components/board/index.tsx:412` (`animationDuration={200}`), `src/components/board/evaluationBar.tsx:72,107` (`transition: "height 1s"`), `src/sections/play/lichess/LichessLiveBoard.tsx:242`, `src/sections/practice/PatternTraining.tsx:464`, `src/sections/practice/PuzzleRush.tsx:749`, `src/components/PracticeChessBoard.tsx:534`, `src/components/landing/DailyPuzzle.tsx:458`, `src/pages/openings.tsx:768`
Reproduction: All `animationDuration` props are hardcoded integers. The eval bar has `transition: "height 1s"` with no media query guard. No `useReducedMotion` hook (from `framer-motion` or similar) or `@media (prefers-reduced-motion: reduce)` CSS block exists anywhere.
Proposed fix: Create a `useReducedMotion` hook (or use `window.matchMedia('(prefers-reduced-motion: reduce)')`); pass `0` as `animationDuration` when reduced motion is preferred; gate the eval bar transition similarly.
Blast radius: med — affects users with vestibular disorders.
Test: Playwright with `--force-prefers-reduced-motion` flag + axe.
static-only, dynamic verification pending — would confirm via browser emulation of reduced-motion preference.

### [P2] Chat text input has no visible `label` or `aria-label`
File: `src/components/AICoachChat.tsx:3017-3026`
Reproduction: The `<TextField>` for the chat input uses only a `placeholder` attribute. Placeholders disappear when text is entered and are not announced by all screen readers as labels.
Proposed fix: Add `label="Ask the coach"` prop or `inputProps={{ 'aria-label': 'Ask the chess coach a question' }}`.
Blast radius: low — one component.
Test: axe `label` rule on the chat panel.

### [P2] Move classification icons have non-descriptive `alt` text
File: `src/sections/analysis/panelBody/classificationTab/movesPanel/moveItem.tsx:111-116`
Reproduction: Classification icons are rendered as `<Image alt="move-icon" …>`. A screen reader user hears "move-icon" rather than "Blunder", "Best move", etc. The icon is the only classification indicator in the moves panel list.
Proposed fix: Set `alt={moveClassification ?? ""}` so the screen reader announces the actual classification name.
Blast radius: low — one component, but affects all moves in the game list.
Test: axe `image-alt` rule.

---

## B3. Performance

### [P1] 250 kB shared `_app` chunk — `react-chessboard` and `chess.js` loaded on all pages including landing
File: `src/pages/_app.tsx` (shared chunk), `src/components/landing/DailyPuzzle.tsx:10-11`
Reproduction: Per `AUDIT_NOTES.md §9.2`, the `pages/_app` shared chunk is 250 kB. `DailyPuzzle` imports `react-chessboard` and `chess.js` at the top level and is mounted on the landing page (`/`). Since these are page-level components (not dynamically imported), webpack includes them in the shared chunk available to all pages. `/` alone is 388 kB first load — 150+ kB is chess library overhead not needed by non-chess pages (`/feedback`, `/courses`, `/profile`).
Proposed fix: Dynamically import `DailyPuzzle` in `src/pages/index.tsx` with `next/dynamic`; this splits `react-chessboard` and `chess.js` into a separate lazy chunk loaded only on the landing page.
Blast radius: high — expected savings ~100–150 kB on non-chess pages (landing pre-puzzle, feedback, courses).
Test: Build output — compare `pages/_app` chunk size before/after.

### [P1] `@mui/x-data-grid` not isolated to `/database` — included in shared chunk
File: `src/pages/database.tsx:15-21`
Reproduction: `DataGrid` is imported at the top of `database.tsx`. The `/database` page chunk is 113 kB (per `AUDIT_NOTES.md §9.2`) but the DataGrid code itself (~180 kB in full) appears in the shared bundle. Confirm by checking whether `@mui/x-data-grid` appears in the `_app` shared chunk (likely via barrel import).
Proposed fix: Ensure `database.tsx` stays as a standalone page import; do not re-export DataGrid from any shared barrel. If it appears in `_app`, use `next/dynamic` for the entire database page grid section.
Blast radius: high — if confirmed in shared chunk, all other pages pay for DataGrid.
Test: Bundle analysis (`next build --debug` or `@next/bundle-analyzer`).
static-only, dynamic verification pending — would confirm via bundle analyzer output.

### [P1] `recharts` eagerly included in `/analysis`, `/practice`, `/profile`, `/site-stats`
File: `src/sections/analysis/panelBody/graphTab/index.tsx:11`, `src/sections/practice/PuzzleStats.tsx:15`, `src/pages/profile.tsx:29`, `src/pages/site-stats.tsx:35`
Reproduction: Recharts is statically imported in four locations. For `/analysis`, the graph component is togglable — it can be deferred. For `/practice`, `PuzzleStats` is one sub-tab. For `/profile`, stats are below the fold. None use `next/dynamic`.
Proposed fix: Wrap `recharts`-consuming components in `next/dynamic` with `{ ssr: false }` in each of the four call sites. Expected savings: ~150–200 kB deferred from initial parse for each affected page.
Blast radius: high — four pages affected.
Test: Build output — verify recharts no longer appears in any static chunk.

### [P2] Both `boardAtom` and `gameAtom` subscribed in `CoachTab` — double re-render on every move
File: `src/sections/analysis/panelBody/coachTab/index.tsx:21-23`
Reproduction: `CoachTab` calls `useAtomValue(boardAtom)` and `useAtomValue(gameAtom)` at the top level, then computes `unifiedGameData` with a `useMemo`. When a move is played, both atoms update sequentially, causing two renders before the memo stabilizes. Additionally, the `useBoardGameSync` hook in the same component also subscribes to both atoms, producing a third subscriber chain.
Proposed fix: Extract the board/game reconciliation into a derived Jotai atom (`atom((get) => { ... })`) so `CoachTab` has a single subscription to a stable derived value.
Blast radius: med — extra renders during move navigation cause brief UI jank; AICoachChat re-props on each board change.
Test: RTL unit with `renderCount` assertion.

### [P2] Debug `console.log` in `GraphTab.formatEvalToChartData` called per-position on every render
File: `src/sections/analysis/panelBody/graphTab/index.tsx:199,202,213`
Reproduction: `formatEvalToChartData` is called inside a `useMemo` but each call emits two `console.log` and one `console.warn`. For a 60-move game, this is 120+ log calls whenever `gameEvalAtom` changes. Serialising log arguments blocks the main thread.
Proposed fix: Remove the log statements (see also B1 P2 above).
Blast radius: low — perf degradation only during analysis; no user-visible regression.
Test: RTL unit — spy on `console.log` and assert call count is 0.

---

## Phase 2 → Phase 3 prerequisite

Confirm the install list needed for dynamic verification:

```
npm i -D @axe-core/playwright axe-core lighthouse @playwright/test
npx playwright install chromium
```

---

## Notes for consolidation

- The `user-scalable=no` viewport finding (B1-P1 / B2-P0) should be consolidated with Agent A if they exercised the board on mobile, and with Agent C for WCAG compliance reporting.
- The `recharts` and `react-chessboard` bundle findings (B3-P1) are independent of the `enhancedOpenAIService` client-side instantiation finding (Agent C's scope) but both contribute to the 638 kB `/analysis` First Load JS.
- Agent D should be aware that `src/pages/database.tsx:113 kB` chunk is a direct result of the `@mui/x-data-grid` import — if D is auditing dead imports, this is not dead code, just un-isolated code.
- The missing ARIA live region for AI coach responses (B2-P1) overlaps with Agent A's coaching-quality scope if they are evaluating response delivery fidelity.
