# Chess Masti AI — Audit Backlog (Phase 2 → Phase 3 plan)

> Branch `audit/full-sweep-20260423`. Phase 2 fanned out 4 sub-agents (Sonnet) over four scopes — A correctness+AI quality, B frontend (static-only this pass), C backend integrity & security, D repo hygiene & ops — plus a graphify AST-only knowledge-graph pass for independent corroboration. This file consolidates their findings into a single prioritized backlog. **No code changes have been made beyond Phase 1.4 hardening.** Phase 3 starts here, gated on your approval of this plan.

## Counts

| Priority | Count | Scope |
|---|---:|---|
| **P0** | **2** | Security + correctness — must fix before any further feature work |
| **P1** | **17** | Quality gaps — fix before next release |
| **P2** | **20** | Polish + hygiene — fix opportunistically |
| **Total** | **39** | (collapsed from 47 raw findings; 8 cross-agent duplicates merged) |

Per-agent raw findings (full detail, not duplicated here):
- [audit/findings/agent-a.md](audit/findings/agent-a.md) — 7 findings + 5-fixture coaching eval
- [audit/findings/agent-b.md](audit/findings/agent-b.md) — 16 findings (static-only)
- [audit/findings/agent-c.md](audit/findings/agent-c.md) — 8 findings + 31-route auth triage
- [audit/findings/agent-d.md](audit/findings/agent-d.md) — 16 findings + docs/ reorganization plan

---

## P0 — security / correctness / broken

### [P0-1] All 31 API routes are unauthenticated; LLM-calling routes are open token sinks
**Source:** Agent C (C1+C2), corroborated by Phase 1.5 §10.4
**Files:** no `src/middleware.ts`; [src/app/api/enhanced-analysis/route.ts](src/app/api/enhanced-analysis/route.ts), [src/app/api/chat/route.ts](src/app/api/chat/route.ts), [src/app/api/classify-intent/route.ts](src/app/api/classify-intent/route.ts), [src/app/api/feedback/route.ts](src/app/api/feedback/route.ts), [src/app/api/scout/route.ts](src/app/api/scout/route.ts), [src/app/api/maia-predict/route.ts](src/app/api/maia-predict/route.ts)
**Repro:** `curl -X POST https://chessmasti.com/api/enhanced-analysis -H 'Content-Type: application/json' -d '{"fen":"…"}'` returns a full Claude Sonnet 4 response. No credentials, no rate limit. Anyone with the URL drains the project's Anthropic budget.
**Fix:** ship in two correlated changes Phase 3 (one PR each, both with regression tests):
1. Add `firebase-admin` SDK; implement `verifyFirebaseToken(request)` server helper reading `Authorization: Bearer <idToken>`; gate the six high-sensitivity routes (enhanced-analysis, chat, classify-intent, feedback, scout, maia-predict).
2. Add `@upstash/ratelimit` + Upstash Redis; rate-limit the LLM routes per the per-route table in [agent-c.md §C2](audit/findings/agent-c.md). Local-dev fallback: in-memory `lru-cache` counter when no Redis URL.

Lichess game-action routes (`/api/lichess/game/[gameId]/{move,abort,resign,draw,stream}`) are already cookie-gated and Lichess enforces game ownership upstream — leave them alone.
**Blast:** high (financial security; no data exfil)
**Test:** unauthenticated POST → 401; 12th request in 60s → 429 with `Retry-After`. Phase 1.4 hardening's TODO comment in [src/app/api/enhanced-analysis/route.ts:869](src/app/api/enhanced-analysis/route.ts#L869) gets retired here.

### [P0-2] Viewport meta blocks pinch-to-zoom — WCAG 1.4.4 violation, every mobile user
**Source:** Agent B (B2 P0, also B1 P1)
**File:** [src/pages/_app.tsx:59](src/pages/_app.tsx#L59)
**Repro:** Open any page on mobile or DevTools mobile emulator; pinch-zoom does nothing.
**Fix:** Remove `maximum-scale=1.0, user-scalable=no` from the viewport meta tag. The board and chat are already responsive; this restriction is unnecessary. One-line change.
**Blast:** high (every mobile user; legal/compliance risk)
**Test:** Playwright e2e — assert viewport `content` does not contain `user-scalable=no`. Add to the regression suite from D5.

---

## P1 — quality gaps

### Security / backend (Agent C)

#### [P1-1] `health/anthropic` permanently 502s — wrong model ID
**File:** [src/app/api/health/anthropic/route.ts:71](src/app/api/health/anthropic/route.ts#L71)
**Repro:** `GET /api/health/anthropic` returns `502 {"error":"model: claude-haiku-4-20250514"}`. That model doesn't exist; [src/lib/llmProvider.ts:74](src/lib/llmProvider.ts#L74) uses the correct ID.
**Fix:** rename `"claude-haiku-4-20250514"` → `"claude-haiku-4-5-20251001"`. One character.
**Blast:** low (diagnostic only) — but it's been falsely alerting "Anthropic broken" since the rename
**Test:** `GET /api/health/anthropic` → 200.

#### [P1-2] Dead client-side LLM path — latent credential leak + prompt-injection vector
**Source:** Agent C (C5a) + Agent D (D2) + **graphify confirmation** (showed up as god node #5, degree=19, despite being unreachable at runtime — independent corroboration that this code is load-bearing in the dependency graph even though dead)
**Files:** [src/lib/enhancedOpenAIService.ts](src/lib/enhancedOpenAIService.ts) (989 lines), [src/hooks/useEnhancedFenTracker.ts:88](src/hooks/useEnhancedFenTracker.ts#L88), [src/components/EnhancedAnalysisPanel.tsx](src/components/EnhancedAnalysisPanel.tsx)
**Repro:** `EnhancedAnalysisPanel` is never mounted in any page or section (grep confirms zero call sites). But the path remains bundled. If any future caller passes `openAIApiKey={process.env.NEXT_PUBLIC_OPENAI_API_KEY}` to it, the OpenAI key ships in the client bundle. The class also has a `systemPromptOverride` field that bypasses Phase 1.4's hardening (it doesn't go through the `callLLM` funnel).
**Fix:** delete the entire tree (`enhancedOpenAIService.ts` + `EnhancedAnalysisPanel.tsx` + the AI portion of `useEnhancedFenTracker.ts`). Inline the one type re-export (`ChessAnalysisRequest` used by [src/lib/prompts/userPrompts.ts:7](src/lib/prompts/userPrompts.ts#L7)) as a local interface. ~1150 lines deleted, ~5 lines touched.
**Blast:** low currently, high if activated. Confirm with `grep -r "EnhancedOpenAIService"` returns 0 hits before merge.
**Test:** post-deletion grep + `tsc --noEmit` clean.

### Correctness (Agent A)

#### [P1-3] Move-replay errors silently swallowed across 5 sites — produces wrong AI analysis without any signal
**Files:** [src/app/api/enhanced-analysis/route.ts:314,619,961,1010](src/app/api/enhanced-analysis/route.ts), [src/lib/chessprinciples/moveByMoveAnalyzer.ts:125](src/lib/chessprinciples/moveByMoveAnalyzer.ts#L125)
**Repro:** Pattern is `try { game.move(m); } catch { break; }`. Any malformed SAN move silently truncates the replay; downstream callers (`validateAIResponse`, `getFenAtHalfMove`, `buildGameContext`) get a wrong FEN and produce wrong analysis without any error to the user.
**Fix:** log a warning (never silently break); return an error sentinel or throw so callers can surface "game data corrupted" instead of producing wrong output.
**Blast:** med — affects any game with a malformed PGN
**Test:** unit — `gameHistory` with one bad SAN in the middle → analyzer returns error or partial result with warning, not silent wrong result.

#### [P1-4] System prompt instructs "Trust Stockfish over principles" — directly contradicts product brief
**File:** [src/lib/chessPrinciples.ts:187](src/lib/chessPrinciples.ts#L187)
**Repro:** `SYSTEM_PROMPT_TEMPLATE` line: "Trust Stockfish evaluations over general principles when they conflict." The product is a *principles-based* coach, not an engine. Agent A's eval scored discipline 1.4/2.0 across the 5-fixture run, and traced two of the three drift cases to this instruction.
**Fix:** replace with: "Use Stockfish evaluations to confirm principle violations and identify the biggest mistakes; explain mistakes through principles, not raw centipawn scores." Bump `PROMPT_VERSION` from "2.0" → "2.1".
**Blast:** med — shapes coaching across all five call paths through `callLLM`
**Test:** re-run Agent A's 5-fixture eval (`audit/findings/agent-a-eval/`) on the new prompt; assert principle-citation avg ≥ 1.6 AND discipline avg ≥ 1.7. Phase 3 should NOT ship the prompt change without this A/B.

#### [P1-5] AI hallucinates concrete forced lines in endgames
**Source:** Agent A eval, fixture #4 (K+P endgame)
**File:** prompt template at [src/lib/chessPrinciples.ts](src/lib/chessPrinciples.ts); few-shot examples missing for endgame fixtures
**Repro:** Fixture 4 (`8/8/8/4k3/8/8/4P3/4K3 w - - 0 1`) produced "1.Kd1 Kd4 2.e4 pawn advances" — but after `2.e4+ Kxe4` the pawn is captured. Forced-line endgame analysis is highest-risk for hallucination.
**Fix:** add 3-5 endgame few-shot examples to wherever fewShotExamples are kept (find: `selectExamples` + `formatExamplesForPrompt` in `enhanced-analysis/route.ts`). Each example shows a correct king-activation sequence.
**Blast:** med — directly affects coaching trustworthiness in endgames
**Test:** re-run eval on fixture 4; assert hallucination = 0.

#### [P1-6] 50-move-rule draw not handled in `setGameHeaders`
**File:** [src/lib/chess.ts:90-115](src/lib/chess.ts#L90-L115)
**Repro:** `setGameHeaders` checks `isInsufficientMaterial`, `isStalemate`, `isThreefoldRepetition` but never `isDrawByFiftyMoves()`. Saved PGN missing Result/Termination headers for that draw type.
**Fix:** add the branch. Mirror existing draw branches.
**Blast:** low (PGN metadata only)
**Test:** unit — chess.js position at 50-move threshold → assert headers set.

#### [P1-7] `formatUciPv` Chess960 castling fragility
**File:** [src/lib/chess.ts:359-388](src/lib/chess.ts#L359-L388)
**Repro:** Castling-flag boolean reset after first translation; if Chess960 mode is ever enabled, second `e1h1` king move in a PV is silently passed through and chess.js rejects it.
**Fix:** add a comment noting "standard chess only" or replace the boolean approach with a per-call legality check.
**Blast:** low (standard chess unaffected)
**Test:** unit — feed two `e1h1` PV entries; assert only the first is translated.

### Frontend / a11y / perf (Agent B)

#### [P1-8] No `aria-live` region — chess moves and AI coach responses are silent for screen readers
**Files:** [src/components/AICoachChat.tsx](src/components/AICoachChat.tsx) (entire), [src/components/board/index.tsx](src/components/board/index.tsx) (entire)
**Repro:** Grep `aria-live` repo-wide → 0 hits. Screen reader users get no audio feedback when moves are played or coach responds. Core interaction loop is inaccessible.
**Fix:** add `<div aria-live="polite" aria-atomic="false" className="sr-only" ref={announcerRef}>` and update with last-played-move SAN / coach message on each state change.
**Blast:** high (entire screen-reader UX)
**Test:** axe + manual NVDA/VoiceOver. *Static-only, dynamic verification pending — would confirm via axe rule.*

#### [P1-9] Chessboard has zero keyboard interaction
**File:** [src/components/board/index.tsx](src/components/board/index.tsx)
**Repro:** No `onKeyDown`, no `tabIndex` on squares, no `role="grid"` on the board wrapper. Keyboard-only users cannot play or navigate moves.
**Fix:** wrap board in `<div tabIndex={0} role="application" aria-label="Chess board">` with `onKeyDown` handler implementing arrow-key square navigation + Enter/Space for piece pick-up and drop. Non-trivial — ~1 day of design + impl.
**Blast:** high (entire board inaccessible to keyboard users)
**Test:** Playwright keyboard navigation e2e. *Static-only.*

#### [P1-10] No skip-to-main-content link
**Files:** [src/pages/_document.tsx](src/pages/_document.tsx), [src/pages/_app.tsx](src/pages/_app.tsx)
**Repro:** Keyboard users must traverse the entire NavBar before reaching content. No skip link.
**Fix:** add visually-hidden skip link as first child of `<body>` in `_document.tsx`, targeting `id="main-content"` on `<main>` in `Layout`.
**Blast:** med (every page, every keyboard user)
**Test:** Playwright — first focusable element is the skip link.

#### [P1-11] `prefers-reduced-motion` respected nowhere — animations forced on users with vestibular disorders
**Files:** [src/components/board/index.tsx:412](src/components/board/index.tsx#L412), [src/components/board/evaluationBar.tsx:72,107](src/components/board/evaluationBar.tsx), plus 6 more (full list in [agent-b.md §B2](audit/findings/agent-b.md))
**Repro:** All `animationDuration` props are hardcoded; no `useReducedMotion` hook or `@media (prefers-reduced-motion: reduce)` block exists.
**Fix:** create `useReducedMotion` hook (or `window.matchMedia('(prefers-reduced-motion: reduce)')`); pass `0` as duration when reduced.
**Blast:** med
**Test:** Playwright with `--force-prefers-reduced-motion`. *Static-only.*

#### [P1-12] `recharts` eagerly imported in 4 pages — wastes ~150–200 kB on each first load
**Files:** [src/sections/analysis/panelBody/graphTab/index.tsx:11](src/sections/analysis/panelBody/graphTab/index.tsx#L11), [src/sections/practice/PuzzleStats.tsx:15](src/sections/practice/PuzzleStats.tsx#L15), [src/pages/profile.tsx:29](src/pages/profile.tsx#L29), [src/pages/site-stats.tsx:35](src/pages/site-stats.tsx#L35)
**Repro:** Recharts (~220 kB) statically imported; appears in `/analysis` (638 kB First Load), `/practice` (503 kB), `/profile` (456 kB), `/site-stats` (448 kB).
**Fix:** wrap recharts-consuming components in `next/dynamic({ ssr: false })`. The graph tab is togglable; stats are below the fold.
**Blast:** high (4 pages, ~150–200 kB savings each)
**Test:** build output diff — recharts no longer in any static chunk.

#### [P1-13] `react-chessboard` + `chess.js` in shared `_app` chunk — non-chess pages pay
**Files:** [src/pages/_app.tsx](src/pages/_app.tsx), [src/components/landing/DailyPuzzle.tsx:10-11](src/components/landing/DailyPuzzle.tsx)
**Repro:** `pages/_app` shared chunk is 250 kB. `DailyPuzzle` imports react-chessboard + chess.js at top level and renders on landing. Pages that have nothing to do with chess (`/feedback`, `/courses`, `/profile`) pay for them.
**Fix:** dynamically import `DailyPuzzle` in [src/pages/index.tsx](src/pages/index.tsx) with `next/dynamic`.
**Blast:** high (~100–150 kB off non-chess pages)
**Test:** build output diff.

#### [P1-14] `@mui/x-data-grid` may be in shared chunk — needs confirmation
**File:** [src/pages/database.tsx:15-21](src/pages/database.tsx)
**Repro:** `/database` page chunk is 113 kB but DataGrid is ~180 kB; suggests it's leaking into the shared bundle via barrel imports. Confirm with `@next/bundle-analyzer`.
**Fix:** ensure `database.tsx` import stays page-local; if leaked, wrap in `next/dynamic`.
**Blast:** high if confirmed in shared chunk
**Test:** bundle analyzer output. *Static-only — bundle analyzer install needed.*

#### [P1-15] Hardcoded `window.innerWidth < 1200` magic number duplicated across 6 files
**Files:** [src/sections/analysis/board/index.tsx:32](src/sections/analysis/board/index.tsx#L32), [src/sections/practice/PuzzleRush.tsx:124](src/sections/practice/PuzzleRush.tsx#L124), and 4 more (full list in [agent-b.md §B1](audit/findings/agent-b.md))
**Repro:** Six files independently compare against `1200` instead of `theme.breakpoints.values.lg`.
**Fix:** create shared `useBoardSize()` hook reading the theme breakpoint; remove duplicates.
**Blast:** med (visual mis-sizing on resize edge if theme is ever adjusted)
**Test:** RTL unit on the hook.

### Repo hygiene (Agent D)

#### [P1-16] Build / lint quality gates all bypassed — three independent silencers
**Files:** [next.config.ts:11-15](next.config.ts#L11-L15), [package.json:31](package.json#L31), [.eslintrc.json:22](.eslintrc.json#L22)
**Repro:** `typescript.ignoreBuildErrors: true` + `eslint.ignoreDuringBuilds: true` + `SKIP_ENV_VALIDATION=true` + `.eslintrc.json` `ignorePatterns: ["**/*"]`. `npm run build` and `npm run lint` are no-ops as quality gates. Phase 1.5 baseline showed `tsc --noEmit` passes clean today, so the bypasses currently hide nothing — it's free to remove them.
**Fix:** (a) drop `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` from `next.config.ts`. (b) replace `.eslintrc.json` `ignorePatterns: ["**/*"]` with `["node_modules", ".next", "out", "Chesskit/**", "cdk/**"]`. (c) drop `SKIP_ENV_VALIDATION=true` *after* P1-17 (env validator) is wired.
**Blast:** low (zero violations today per baseline)
**Test:** `tsc --noEmit && npm run lint` exit 0 in CI.

#### [P1-17] No runtime env-var validator — startup doesn't fail fast on missing `ANTHROPIC_API_KEY`
**File:** absent; [package.json:31](package.json#L31) implies one was planned (`SKIP_ENV_VALIDATION=true` is the t3-env escape hatch)
**Repro:** Drop `ANTHROPIC_API_KEY` from `.env.local`, start server — boots cleanly, then 500s on first `/api/enhanced-analysis` hit.
**Fix:** add `src/env.ts` with `@t3-oss/env-nextjs` (or raw Zod) validating server + client env at startup; import in `_app.tsx`. Drop `SKIP_ENV_VALIDATION=true` from build.
**Blast:** low (additive)
**Test:** unset `ANTHROPIC_API_KEY` → `npm run dev` exits non-zero.

#### [P1-18] `.env.example` missing 13 keys the running app uses
**File:** [.env.example](.env.example) vs Phase 1.5 readiness §10.2 + Agent D D4
**Repro:** Fresh `cp .env.example .env.local` doesn't yield a working app: `NEO4J_URI/USERNAME/PASSWORD`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_LICHESS_CLIENT_ID`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `ANTHROPIC_BASE_URL`, `CRON_SECRET`, `LC0_PATH`, `LOG_LEVEL`, `NEXT_PUBLIC_RETRIEVAL_V2`, `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` are all referenced in code but absent from `.env.example`.
**Fix:** rewrite `.env.example` per the canonical proposal in [agent-d.md §D4](audit/findings/agent-d.md). Group by REQUIRED / OPTIONAL.
**Blast:** low (docs only)
**Test:** new dev can run app from `.env.example` template alone.

#### [P1-19] README internal inconsistency — citations section claims OpenAI is primary
**File:** [README.md:72](README.md#L72) vs [README.md:201-207](README.md#L201-L207)
**Repro:** "Tech Stack" says "AI Brain: Anthropic Claude". "Citations & Acknowledgments" still lists OpenAI as primary. `llmProvider.ts` confirms Claude primary.
**Fix:** swap order in Citations; update §74 ("Deployment: AWS with CDK" → "Vercel"; CDK is a secondary deploy target).
**Blast:** zero (docs)
**Test:** read it.

---

## P2 — polish + hygiene

### Correctness / AI quality (Agent A)

#### [P2-1] `aiResponseValidator` only checks final-position FEN, not per-move
**File:** [src/lib/aiResponseValidator.ts:38-86](src/lib/aiResponseValidator.ts#L38-L86), [src/app/api/enhanced-analysis/route.ts:1017-1018](src/app/api/enhanced-analysis/route.ts#L1017-L1018)
**Fix:** for piece-on-square claims with parseable move-number context, replay `moveHistory` and validate against the intermediate FEN. Or document the limitation and suppress mid-game piece claims.
**Blast:** med (false-positive validation footnotes can censor valid analysis)

#### [P2-2] `moveByMoveAnalyzer` rebuilds position from scratch O(n²)
**File:** [src/lib/chessprinciples/moveByMoveAnalyzer.ts:47-50](src/lib/chessprinciples/moveByMoveAnalyzer.ts#L47-L50)
**Fix:** maintain a single running `Chess` instance; snapshot FEN per move. ~1600 redundant `chess.move()` calls per 40-move game.
**Blast:** low (latency only)

#### [P2-3] `PROMPT_VERSION` not stamped on `callLLM` calls
**Source:** Agent A A3
**Files:** [src/lib/llmProvider.ts:240-246](src/lib/llmProvider.ts#L240-L246), [src/app/api/enhanced-analysis/route.ts:1036-1047](src/app/api/enhanced-analysis/route.ts#L1036-L1047)
**Fix:** import `PROMPT_VERSION` from `src/lib/prompts/systemPrompts`; add to log payload, `analysisContext`, and API response body. Required for meaningful before/after eval comparisons in Phase 3 (P1-4).
**Blast:** low (additive)

### Backend / security (Agent C)

#### [P2-4] Missing standard security headers in `next.config.ts`
**File:** [next.config.ts](next.config.ts)
**Fix:** add `X-Frame-Options`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`. The `netlify.toml` has them but is vestigial (Vercel is live). One block in the global headers.

#### [P2-5] `NEXT_PUBLIC_RETRIEVAL_V2` used as server-only feature flag
**File:** [src/app/api/similar-puzzles/route.ts:49](src/app/api/similar-puzzles/route.ts#L49)
**Fix:** rename to `RETRIEVAL_V2` (drop `NEXT_PUBLIC_` prefix); same in `.env.local`.

#### [P2-6] `/api/lichess/game/[gameId]/move` lacks UCI format validation
**File:** [src/app/api/lichess/game/[gameId]/move/route.ts:26-31](src/app/api/lichess/game/[gameId]/move/route.ts#L26-L31)
**Fix:** add `if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) return 400` before forwarding.

#### [P2-7] `keep-maia-alive` is an open relay when `CRON_SECRET` unset
**File:** [src/app/api/keep-maia-alive/route.ts:21-25](src/app/api/keep-maia-alive/route.ts#L21-L25)
**Fix:** fail-closed when `CRON_SECRET` is missing — return 503, not silently allow.

### Frontend (Agent B — full list in [agent-b.md](audit/findings/agent-b.md))

- **[P2-8]** `react-syntax-highlighter` eagerly loaded inside `AICoachChat` — make lazy via React.lazy
- **[P2-9]** Production `console.log` calls in hot render paths (coachTab, graphTab, useBoardGameSync) — remove or NODE_ENV-gate
- **[P2-10]** Auth dialog close button missing `aria-label`
- **[P2-11]** Chat text input has no visible label or `aria-label`
- **[P2-12]** Move classification icons have non-descriptive `alt="move-icon"` (should be the actual classification name)
- **[P2-13]** `useScreenSize` hook uses fragile `querySelector('.MuiGrid2-root')` — refactor to ref
- **[P2-14]** Both `boardAtom` and `gameAtom` subscribed in `CoachTab` — consolidate to derived Jotai atom

### Repo hygiene (Agent D — full lists in [agent-d.md](audit/findings/agent-d.md))

- **[P2-15]** Delete `next.config.js` (silently dead per Phase 1.5)
- **[P2-16]** Delete `netlify.toml` SPA redirect (latent P0 if Netlify ever activated; safe now since Vercel is live)
- **[P2-17]** Remove `@types/chess.js@0.10.1` (chess.js 1.x ships its own types)
- **[P2-18]** Delete `temp_Lc0DownloadBanner.tsx`, `temp_MaiaStatusIndicator.tsx`, `temp_maia-status.ts` (root-level scratch)
- **[P2-19]** Delete or move 25 root scratch scripts (`test-*.js`, `check-*.mjs`, `query-*.mjs`)
- **[P2-20]** Delete `src/lib/engine/{testRealEngine,testSurpriseAnalyzer}.ts` after Agent A's eval is locked in (their loss is fine if they're not regression tests)
- **[P2-21]** Reorganize 56 root `.md` files into `docs/{architecture,integrations,ops,historical,research}/` per the table in [agent-d.md §D3](audit/findings/agent-d.md)
- **[P2-22]** Decide `data/chess-commentary/` (second nested git repo) — vendor only what's used + delete, or proper submodule
- **[P2-23]** Decide `Chesskit/` (first nested git repo, dirty) — proper submodule or vendor-and-delete

---

## Cross-agent merges (already collapsed in counts above)

| Topic | Agent overlap | Merged into |
|---|---|---|
| `enhancedOpenAIService` legacy path | C (security framing) + D (hygiene framing) + Graphify (god-node corroboration) | P1-2, security framing wins |
| `health/anthropic` model ID | A (static notes) + C (P1) + Phase 1.5 §10.4 | P1-1 |
| Auth + rate limit on LLM routes | C (two P1s) + Phase 1.5 §10.4 + AUDIT_NOTES §6.3 | P0-1, promoted to P0 |
| `SYSTEM_PROMPT_TEMPLATE` "Trust Stockfish" | A (P2) + product-brief framing | P1-4, promoted to P1 |
| `PROMPT_VERSION` not stamped | A (A3) + C (C8 notes) | P2-3 |
| Move-replay swallowing | A (cross-route) | P1-3 |
| Viewport `user-scalable=no` | B (B1 + B2) | P0-2 |
| Three deploy targets | D (D1) + Phase 1 §6.5 | P2-16 |
| Build silence (TS+ESLint+ENV bypass) | D (D1) + Phase 1 §6.2 + Phase 1.5 §9.1 | P1-16 |
| `.env.example` drift | D (D4) + Phase 1.5 §10.4 | P1-18 |

## Graphify-derived intel (free, scaffolding artifact)

The AST-only knowledge-graph pass earned its keep with two pieces of independent evidence:

1. **`EnhancedOpenAIService` god-node confirmation.** Showed up at degree 19 in the dependency graph (#5 by raw degree, #2 by class-degree), confirming Agent C+D's claim that despite being unreachable at runtime, the path is load-bearing in the static dependency graph. Strengthens P1-2.
2. **AST-resolution gap on `src/sections/analysis/panelBody/**`.** The whole analysis-UI surface — including the AI coach tab, evaluation graph, classification panel — appeared as 8+ disconnected singleton components in the graph. Cause: tree-sitter-typescript can't resolve `@/`-aliased TSX dynamic imports. Not a code defect, but a signal that this surface is **opaque to static refactoring tools** — anything that tries to "find all callers of X" or "rename Y across files" by static analysis will under-count there. File this as ambient context for any future automated refactoring effort; no Phase 3 action required.

The graph and its inputs are gitignored under `graphify-out/`. `.graphifyignore` is committed so a future re-run is one `/graphify` invocation away. Graphify CLI install is local (`uv tool install graphifyy`), not a project dependency.

---

## Phase 3 execution order

Order is by dependency, not priority — some P0/P1 work needs scaffolding (test runner, env validator) to land safely:

1. **Test scaffolding first.** `npm i -D vitest @playwright/test @axe-core/playwright axe-core`. Land Vitest config + the smallest possible test (D5 proposes the Phase 1.4 systemPrompt-rejection regression — perfect first test). Add minimal `.github/workflows/ci.yml` running `tsc --noEmit` + `vitest run`. **Without this, every subsequent fix ships untested.**
2. **P1-16 build gates.** Drop the three bypasses + fix `.eslintrc.json`. tsc + lint pass clean today; this just stops them from silently regressing tomorrow.
3. **P1-17 env validator.** Then drop `SKIP_ENV_VALIDATION=true` from build.
4. **P0-1 auth + rate limit.** Two PRs, both with regression tests. This is the highest-financial-risk item.
5. **P0-2 viewport fix.** One-line; can ship anytime after step 1.
6. **P1-1 health/anthropic model ID.** One-character fix, ship immediately after step 1.
7. **P1-2 delete legacy `enhancedOpenAIService` tree.** After Agent A's eval is locked in (per Agent D's note — A's coaching eval runs against `callLLM`, not the legacy path, so this should be safe). Confirm with one final `grep -r "EnhancedOpenAIService"` before merge.
8. **P1-4 prompt change + P1-5 endgame few-shots.** Re-run Agent A's 5-fixture eval BOTH before and after — only ship if discipline AND principle scores improve.
9. **P1-3 move-replay error surfacing.** Touches 5 sites; bundle as one PR.
10. **P1-8 / P1-9 / P1-10 / P1-11 a11y.** Group as one a11y sweep; install Playwright browsers and `@axe-core/playwright` first; add automated axe scan to CI.
11. **P1-12 / P1-13 / P1-14 perf.** Wrap recharts + react-chessboard + DataGrid in `next/dynamic`; verify with bundle analyzer; add a CI check that flags shared-chunk size regression.
12. **All P2s.** Run them in batches, opportunistically; the P2 docs reorg + scratch-script cleanup can run as a single unrelated cleanup PR.

---

## What was deferred and why

- **Full Sonnet-based AI coaching eval** — Phase 2 ran a 5-fixture Haiku eval to surface obvious failures cheaply. Phase 3 step 8 above is the proper before/after Sonnet eval gated on the prompt change.
- **Dynamic frontend audit (Lighthouse / axe / breakpoint screenshots)** — gated on Phase 3 step 1 tooling install. Findings labeled "static-only" above will be re-confirmed in Phase 4 polish sweep.
- **`Chesskit/` and `data/chess-commentary/` git-state decisions** — owner-level decisions, not Phase 3 unilateral. P2-22 / P2-23 surface them, defer the call.
- **CLAUDE.md changes from `graphify claude install`** — already reverted (commit `2e87035`); the graph was scaffolding, not a deliverable.

---

## What "done" looks like (per the original audit prompt)

| Goal | Current | Phase 3 target |
|---|---|---|
| Zero P0 findings open | 2 open | 0 |
| Lighthouse ≥ 90 (Perf/A11y/BP/SEO) on top 3 routes | not measured | measured + ≥ 90 |
| Zero axe critical/serious violations | not measured | 0 |
| AI eval ≥ 90% factual correctness | 100% (n=5 mini eval) | sustained on n≥30 |
| AI eval zero hallucinated lines | 1/5 hallucinated (endgame) | 0 |
| AI eval tone consistency ≥ 85% | 100% (2.0/2.0 avg) | sustained |
| All chess edge-case tests pass | no test harness | harness + 100% pass |
| CI green on the new branch | no CI | CI exists + green |
