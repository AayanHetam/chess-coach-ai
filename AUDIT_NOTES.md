# Chess Masti AI — Phase 1 Orientation Notes

> Read-only orientation pass. All paths are relative to `chess-coach-ai/` (the project root). No source files modified.
> Branch: still on `main` (audit branch not yet created — see "Open questions" at end).

## 1. Stack Map

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15.5.12** (mixed Pages + App Router) | `src/pages/*.tsx` for page routes, `src/app/api/*` for API routes, `src/app/layout.tsx` for the App-Router root layout. Mixed routing is supported but a known footgun. |
| Language | TypeScript 5.7.2, React 18.3.1 | Strict mode unknown — see `tsconfig` (not yet read) |
| UI | **MUI v7** (`@mui/material`, `@mui/lab` beta, `@mui/x-data-grid`) + Emotion + Roboto + Iconify | `react-markdown` + `remark-gfm` + `react-syntax-highlighter` for chat rendering |
| Chess logic | **chess.js 1.3.1** | `@types/chess.js 0.10.1` is unused — chess.js ships its own types since 1.x; old `@types` package is deprecated and may produce wrong types. |
| Board | **react-chessboard 4.7.3** | |
| Engines | **stockfish.js 10.0.2** (WASM, in-browser via Web Worker), **Maia** (separate Python FastAPI microservice in `maia-service/`), **Lc0** (download-on-demand, see `Lc0DownloadBanner`) | `src/lib/engine/` has stockfish11/16/16_1/17 variants — version selection is configurable |
| State | **Jotai 2.11** + `@tanstack/react-query 5.75` | Atoms in `src/atoms/` and `src/sections/*/states.ts` |
| Storage | **Firebase** (auth + Firestore games/openings/users), **IndexedDB** via `idb` (puzzle progress), **Neo4j** (puzzle graph DB — separate service) | Three separate persistence layers |
| AI | Unified provider in `src/lib/llmProvider.ts`. **Primary: Anthropic Claude Sonnet 4 (`claude-sonnet-4-20250514`) / Haiku 4.5 (`claude-haiku-4-5-20251001`)**. Fallback: **OpenAI gpt-4o / gpt-4o-mini**. README section "Tech Stack" calls Claude primary; "Citations" section calls OpenAI primary — README is internally inconsistent. | Newer Sonnet versions exist (4.5, 4.6) — model pinned to May 2025 release. Worth flagging. |
| Observability | **Sentry** (`@sentry/nextjs 8`, `sentry.client.config.ts`), **Vercel Analytics** | |
| Hosting | **Vercel** (active — `.vercel/project.json` exists) + **AWS CDK** stack in `cdk/` (per `package.json` deploy script) + **Netlify** config (`netlify.toml`) — three deploy targets present, unclear which is current |
| Auth | Firebase Auth (Google provider per `.env.example`). Lichess OAuth for live-play features. | |

## 2. Route / Component Tree

### Pages (`src/pages/`)
14 page-router pages. Top-level mounted components per page (best-effort from imports — full traversal in Phase 2):

| Route | File | Notable mounts |
|---|---|---|
| `/` | `index.tsx` | `LandingHero`, `LandingFeatures`, `LandingHowItWorks`, `LandingComparison`, `LandingTestimonials`, `LandingAbout`, `LandingCTA`, `LandingFooter`, `DailyPuzzle`, `LandingNav` |
| `/analysis` | `analysis.tsx` | `sections/analysis/board`, `panelHeader`, `panelBody/{analysisTab,classificationTab,coachTab,graphTab,movesCoachTab,unifiedSections}`, `panelToolbar` |
| `/play` | `play.tsx` | `sections/play/{StockfishPlay,board,gameInProgress,gameRecap,gameSettings,undoMoveButton}`, `chesscom/ChessComPlay`, `lichess/LichessLivePlay` |
| `/practice` | `practice.tsx` | `sections/practice/{PatternTraining,PracticeBoard,PuzzleCoachExplanation,PuzzleInfo,PuzzleList,PuzzleRush,PuzzleStats}`, `components/AICoachChat` |
| `/scout` | `scout.tsx` | `components/scout/*` (15 components — `ScoutLanding`, `AnalyzingModal`, `ProfileCard`, `CollisionPanel`, `NoveltyPanel`, `PreGameChecklist`, `PsychologyPanel`, `RivalsPanel`, `ShareCardDialog`, `StalkerScoreCard`, `TargetedPrep`, `TreeExplorer`, `TwinBotDialog`, `TwinBotGame`) |
| `/openings` | `openings.tsx` | `sections/openings/RepertoireImport` |
| `/courses` | `courses.tsx` | `components/CourseLibrary` |
| `/database` | `database.tsx` | (TBD — needs Phase 2 read) |
| `/feedback` | `feedback.tsx` | `sections/feedback/{PlayerFeedbackForm,PlayerFeedbackResults}` |
| `/profile` | `profile.tsx` | `components/auth/ProfileDialog`, `UserMenu` |
| `/repetit-training` | `repetit-training.tsx` | spaced-repetition trainer (uses `lib/repetitTraining.ts`) |
| `/site-stats` | `site-stats.tsx` | (TBD) |
| `/_app.tsx`, `/_document.tsx` | | App shell, Theme/Sentry wrappers |

### App-Router API routes (`src/app/api/`) — 22 endpoints

```
adaptive-puzzles      chess-puzzles            classify-intent       courses/[id]
chess-puzzles-dataset commentary-by-fen        enhanced-analysis     feedback
health/anthropic      health/llm               install-lc0           keep-maia-alive
lichess/auth          lichess/callback         lichess/disconnect    lichess/events/stream
lichess/game/[gameId]/{abort,draw,move,resign,stream}
lichess/seek          maia-predict             maia-status           mistake-puzzles
retrieval-telemetry   scout                    similar-puzzles       chat
chesscom/ongoing
```

Auth: **none of these routes appear to enforce a server-side session check** (not yet exhaustively grepped — Phase 2 security agent will confirm). Public-facing endpoints that proxy LLM calls are an immediate cost-control concern (see §6).

## 3. AI Coaching Invocation Map

Single funnel: every LLM call goes through `callLLM()` in `src/lib/llmProvider.ts:216`. That function tries Anthropic → falls back to OpenAI on any 4xx/5xx/network error.

| Caller | File | Tier | System prompt source | Notes |
|---|---|---|---|---|
| Main analysis | `src/app/api/enhanced-analysis/route.ts:983` | `flagship` | **Client-supplied `systemPrompt` from request body**, falls through to a hard-coded fallback | 1082-line route. Caches responses. Stores `analysisContext` keyed by `contextId` for follow-ups. |
| Follow-up chat | `src/app/api/chat/route.ts:91` (fast path) and `:144` (fallback) | `fast` | Cached system prompt from prior analysis (fast path); client-supplied `messages[role=system]` (fallback) | Joins multiple system messages with `\n\n` |
| Intent classifier | `src/app/api/classify-intent/route.ts:151` | (read in Phase 2) | (read in Phase 2) | |
| Concept tagger | `src/lib/concept/conceptLLMTagger.ts:76` | (read in Phase 2) | (read in Phase 2) | Server-side concept classification |
| Health probe | `src/app/api/health/llm/route.ts:31` | both | minimal | Not user-facing |

Other AI surfaces (do not call `callLLM` directly — verify in Phase 2):
- `src/lib/enhancedOpenAIService.ts` — 989-line legacy service file. Likely older, possibly orphaned, possibly still wired. Needs explicit dead-code check.
- `src/components/AICoachChat.tsx` — primary in-product chat UI; calls the API endpoints above.
- `src/components/AICoachInsights.tsx` — DecodeChess-style carousel (per recent commit).

System prompt body: `src/lib/chessPrinciples.ts:172` — `SYSTEM_PROMPT_TEMPLATE` (a single grandmaster-coach prompt) plus `getSystemPrompt(analysisType)` at line 234 which composes the base with type-specific instructions. `src/lib/prompts/index.ts` re-exports these. There is no separate "principles-based, not engine-line" guardrail — the coaching tone is governed by this one template plus per-route inline strings.

Prompt versioning: `src/lib/prompts/systemPrompts.ts:22` exports `PROMPT_VERSION = "2.0"`. Not currently logged with calls (worth confirming in Phase 2).

## 4. Test Coverage & CI

**No automated test harness.**
- `find . -name "*.test.*" -o -name "*.spec.*"` (excluding node_modules, .next, Chesskit) → **0 files**.
- 30+ `test-*.js` / `test-*.mjs` scripts at repo root are ad-hoc one-off scripts (e.g., `test-aicoach-fix.js`, `test-clickable-moves.js`, `test-engine-debug.js`). No runner. Not invoked by `npm run lint` or any other script.
- `package.json` defines no `test` script.

**No CI config.**
- No `.github/workflows`, no `.gitlab-ci.yml`, no `.circleci/`, no top-level `*.yml` (only `netlify.toml`).
- `npm run lint` is `next lint && tsc --noEmit`, but **`.eslintrc.json` has `"ignorePatterns": ["**/*"]` — so `next lint` lints zero files.** `tsc --noEmit` does run.
- `npm run build` is `SKIP_ENV_VALIDATION=true next build`, and `next.config.ts` sets `eslint.ignoreDuringBuilds: true` AND `typescript.ignoreBuildErrors: true`. **The build will succeed regardless of TS or ESLint errors.** This means we cannot use `npm run build` as a quality gate during Phase 3 without changing config first.

## 5. Design Doc Index (filenames only)

54 root-level `.md` files + 3 in `docs/research/`. Skim-only — read on demand in later phases.

**Architecture / system docs** (likely most useful for sub-agents):
- `NEO4J_ARCHITECTURE.md`, `NEO4J_DATA_LOADING_COMPLETE.md` — puzzle graph DB
- `LICHESS_INTEGRATION.md`, `LICHESS_LIVE_PLAY_SUMMARY.md`, `LICHESS_PUZZLE_SCALING_PLAN.md`, `LICHESS_DATASET_INTEGRATION.md`, `LICHESS_THEME_EXTRACTION_STRATEGY.md`, `LICHESS_SUBMISSION.md`
- `MAIA_SETUP.md`, `OPENAI_INTEGRATION_STATUS.md`, `REAL_ENGINE_INTEGRATION.md`
- `PRINCIPLE_ANALYSIS_APPROACH.md`, `ENHANCED_PRINCIPLES_SUMMARY.md`, `EVALUATION_BASED_MISTAKE_DETECTION_SUMMARY.md`, `RELATIVE_THRESHOLD_SYSTEM_SUMMARY.md`, `USER_SPECIFIC_MISTAKE_FILTERING_SUMMARY.md`
- `PUZZLE_SYSTEM_STATUS.md`, `MISTAKE_DETECTION_LOGIC_FIX_SUMMARY.md`, `MISTAKE_SORTING_FIX_SUMMARY.md`
- `docs/research/{ab-pilot-design,internal-data-probe,concept-similarity-rationale}.md`

**Roadmap / status / planning**:
- `FEATURE_ROADMAP.md`, `NEXT_STEPS.md`, `FINAL_STATUS.md`, `MENTOR_RECOMMENDATIONS_COMPLETE.md`, `THEME_MAPPING_ISSUE.md`, `Chess_Masti_AI_Quality_Improvement_Plan.docx` (binary)

**"FIX_SUMMARY" / "CLEANUP_SUMMARY" docs** (15 files) — historical change logs. **Likely stale.** Review-on-demand only:
- `AICOACH_FIX_SUMMARY.md`, `ANALYSIS_SIMPLIFICATION_SUMMARY.md`, `CLEANUP_SUMMARY.md`, `CLICKABLE_MOVES_FIX_SUMMARY.md`, `COMPREHENSIVE_CLEANUP_SUMMARY.md`, `DUPLICATE_LINKS_FIX_SUMMARY.md`, `FINAL_CLEANUP_VERIFICATION.md`, `FINAL_SIMPLIFICATION_SUMMARY.md`, `HALLUCINATION_FIX_SUMMARY.md`, `IMPLEMENTATION_SUMMARY.md`, `INTEGRATION_SUMMARY.md`, `PHASE_ANALYSIS_REMOVAL_SUMMARY.md`, `PHASE_BALANCED_ANALYSIS_FIX_SUMMARY.md`, `PNG_ERROR_FIX_SUMMARY.md`, `UI_SIMPLIFICATION_SUMMARY.md`

**Deploy / ops**:
- `DEPLOY.md`, `DEPLOYMENT_GUIDE.md`, `QUICK_DEPLOY.md`, `MIGRATION.md`, `CODE_PROTECTION_GUIDE.md`, `TESTER_GUIDE.md`

**Marketing / contributor / legal**:
- `README.md`, `README_COMPLETE.md`, `CONTRIBUTING.md`, `COPYING.md`, `COVER_LETTER_DRAFT.md`, `PROMO_DRAFTS.md`, `QUICK_REFERENCE.md`, `ENHANCED_FEATURES.md`, `PRACTICE_FEATURE_PROMPT.md`

The Phase 2 sub-agents will be told: *"don't read these unless you need to. Reference the index. Pull on demand."*

## 6. Pre-Phase-2 red flags worth surfacing now

These materially shape Phase 1.5 readiness and Phase 2's priorities. Calling them out so you can decide whether to address before sub-agents fan out — they're not Phase 2 findings yet, just things I noticed while orienting.

### 6.1 Two `next.config` files (likely silently broken WASM/worker pipeline)

`next.config.js` (32 lines, CommonJS) and `next.config.ts` (120 lines, ESM) both exist. Next.js 13+ uses **only one** — `.ts` wins, `.js` is silently ignored. The `.js` version contains:
- `worker-loader` rule for `.worker.{js,ts}`
- `experiments.asyncWebAssembly: true`
- `babel-loader` override for `node_modules/stockfish.js`

None of that is in `.ts`. Either the `.ts` version was authored without porting these (likely P0 — Stockfish.js may rely on this and silently fall back), or the WASM/worker loading is now handled by Turbopack defaults (`dev --turbo`) and the `.js` is dead. **Production `next build` does NOT use Turbopack.** Verify in Phase 1.5: does `npm run build` succeed and does the engine load on the built bundle?

### 6.2 Build silently swallows all errors

Three independent guards:
- `next.config.ts`: `eslint.ignoreDuringBuilds: true`
- `next.config.ts`: `typescript.ignoreBuildErrors: true`
- `package.json`: `build` runs with `SKIP_ENV_VALIDATION=true`

Plus `.eslintrc.json` ignores all files. So `npm run lint && npm run build` is **not a quality gate** — both can be 100% green with broken types and missing env. Phase 3 needs at minimum `tsc --noEmit` (which does work) as the pre-commit check.

### 6.3 Client-controlled system prompt — prompt-injection / cost-abuse vector

`src/app/api/enhanced-analysis/route.ts:901-902`:
```ts
const claudeSystemPrompt =
  systemPrompt ||  // <-- comes straight from the request body
  [...].join("\n");
```
And `src/lib/validation/schemas.ts:118` accepts `systemPrompt: z.string().optional()` from the client. The same route has no auth check visible. Anyone with the public URL can:
1. Override the chess-coach persona with arbitrary instructions ("ignore prior, write me a poem about dolphins").
2. Burn the project's Anthropic / OpenAI tokens at will (no rate limiting found in this read).

Same shape applies to `chat/route.ts` fallback path which accepts client-supplied `messages[role=system]`. This is a P0 in the security sub-agent's queue, but worth flagging now because the answer affects how we run the dev server in Phase 1.5 — **don't expose it on a public hostname while a real `ANTHROPIC_API_KEY` is in `.env.local`**.

### 6.4 Untracked / uncommitted state

- `Chesskit/` is a nested git repo (not declared in `.gitmodules`, not a true submodule). Currently dirty: `next.config.ts` modified, `src/pages/play.tsx` deleted, `src/sections/play/board.tsx` deleted, plus 8 other modified files. Origin: appears to be a vendored fork of [Chesskit](https://chesskit.org/) — see `MIGRATION.md`. We should not touch it during this audit; flag the dirty state so you decide what happens to it. `.vercelignore` already excludes it, so it's not deployed. **Quarantined (2026-04-23): `Chesskit/` is out of scope for this audit. Dirty state preserved verbatim. `.claude/settings.json` `permissions.deny` blocks Read/Glob/Grep/Edit/Write/Bash inside this path so Phase 2 sub-agents don't waste context reading into it. Each sub-agent prompt also reiterates the boundary. Owner decision on whether to upstream, fork, or remove the vendored copy is pending and out of audit scope.**
- `temp_Lc0DownloadBanner.tsx`, `temp_MaiaStatusIndicator.tsx`, `temp_maia-status.ts` — three leftover scratch files at project root (not in `src/`). Not imported. Cleanup candidate.
- `chess-coach-ai/data/` — empty recursive subdirectory inside the project root. Cruft.
- 30+ `test-*.js` + `check-*.mjs` + `query-*.mjs` ad-hoc scripts at root — `.vercelignore` excludes them, but they pollute repo navigation. Cleanup candidate.

### 6.5 `netlify.toml` redirect would break the app if used

`netlify.toml` declares `@netlify/plugin-nextjs` (good) but also `[[redirects]] from = "/*" to = "/index.html" status = 200`. That's an SPA fallback that bypasses Next.js entirely. If Netlify is ever the active host (it's not currently — Vercel is), every server route and API route would 404 to a non-existent `index.html`. Either delete the redirect, delete `netlify.toml`, or commit to one host.

### 6.6 README internal inconsistency

README §"Tech Stack" says "AI Brain: Anthropic Claude". README §"Citations & Acknowledgments" says "OpenAI GPT Models — used for move explanations… Anthropic Claude (Optional) — Alternative AI model". `llmProvider.ts` matches the first version (Claude primary, OpenAI fallback). Citations section is stale.

### 6.7 No CLAUDE.md at the project root

No `CLAUDE.md` exists at `chess-coach-ai/`. Per your direction this falls into the "< 50 lines / placeholder" branch, so the call is whether to (a) run `/init` fresh now, (b) skip and have me draft a CLAUDE.md from this AUDIT_NOTES content, or (c) defer to after Phase 2 when the picture is sharper. See "Open questions" below.

## 7. Phase 1.5 — Runtime readiness items I can already prefill

Before Phase 1.5 actually runs, these are likely-known-true:
- ✅ `npm run dev` exists (`next dev --turbo`). Whether it boots cleanly with the current `.env.local` is unverified.
- ❓ Required env per `.env.example`: Firebase (6 keys), `ANTHROPIC_API_KEY`, optionally `OPENAI_API_KEY`, `MAIA_API_URL`, `NEXT_PUBLIC_SITE_URL`. `.env.local` exists (1645 bytes) — assumed populated, but I have not read it.
- ❓ Playwright not in `package.json`. Will need install.
- ❓ axe-core not in `package.json`. Will need install (or `@axe-core/playwright`).
- ❓ Lighthouse — would run via `npx lighthouse` (no local install).
- ❓ Maia microservice (`maia-service/`) — separate Python service. Likely not running locally. AI eval suite for positions that exercise Maia-routing won't work without it.
- ❓ Neo4j — required for puzzle endpoints. Likely not running locally. Several routes will 500 without it.
- ❓ Firebase — auth/user/games persistence. May work in "live remote" mode if `.env.local` points at a real project; will fail otherwise.
- ❓ Stockfish.js — runs in browser, no infra needed, but see §6.1.

## 8. Decisions log (resolved)

The Phase 1 open questions, with the calls made before Phase 1.5 begins:

1. **Audit branch:** created `audit/full-sweep-20260423`. AUDIT_NOTES.md committed first (`audit: phase 1 orientation`). Subsequent phase commits go on this branch, squash/rebase decision deferred to Phase 5.
2. **CLAUDE.md:** Skip `/init` entirely. Draft from this orientation, but **after Phase 1.5**, not before — runtime readiness will tell us which services actually run locally and which env vars are real, so the file doesn't lie about runnability. Front-loaded contents will be: the single LLM funnel (`llmProvider.ts`), the `PROMPT_VERSION` location, the "build doesn't catch errors, use `tsc --noEmit`" rule, and the list of services that aren't running locally so future Claude stops trying to hit dead endpoints.
3. **§6.3 (client-supplied systemPrompt):** fixed minimally as Phase 1.4 hardening — schema strip + dev-server localhost bind, two commits. Proper Phase 3 P0 fix (auth + rate limit + prompt allowlist) deferred so it can ship with a regression test through the normal P0 flow. §6.1 and §6.2 left untouched at code level pending the baseline (see §9 — both demoted from "P0 risk" to "documentation cleanup" by the baseline result).
4. **`Chesskit/` dirty state:** leave alone, do not stash or touch. Quarantined from sub-agent reads via deny rules in `.claude/settings.json`. See §6.4 (updated).
5. **Phase 2 sub-agent count:** consolidated 7 → 4. Final shape: **A — Correctness & AI quality** (chess rules + AI eval, shared fixtures); **B — Frontend quality** (UI/UX + a11y + perf, one Playwright session); **C — Backend integrity & security** (auth + routes + prompt injection + IDOR); **D — Repo hygiene & ops** (dual configs, build silence, netlify redirect, dead `enhancedOpenAIService.ts`, scratch scripts, README inconsistency, deploy targets).
6. **Add to Agent A scope:** stamp `PROMPT_VERSION` on every logged response so before/after coaching-eval comparisons in Phase 3 are meaningful.

## 9. Pre-Phase-1.5 baseline (post Phase 1.4 mitigations)

Captured on `audit/full-sweep-20260423` after the strip + bind commits, before Phase 1.5 dynamic checks.

### 9.1 `tsc --noEmit`

```
exit 0
0 type errors
```

The Phase 1.4 strip did not introduce any TypeScript errors. More notably: the project actually type-checks cleanly today, despite `next.config.ts` setting `typescript.ignoreBuildErrors: true`. The build-time bypass is currently unnecessary — turning it back on would be a free quality gate. **Demote §6.2 from "build silently swallows errors" to "build *would* swallow errors if any existed; configure it to fail-fast and you lose nothing."**

### 9.2 `SKIP_ENV_VALIDATION=true npx next build`

```
exit 0
✓ Generating static pages (34/34)
3 webpack warnings (non-blocking)
```

All 3 warnings are the well-known `Critical dependency: the request of a dependency is an expression` from OpenTelemetry's dynamic `require()`, propagated through `@sentry/nextjs` → `src/lib/logging/sentryIntegration.ts`. Not a project bug. Sentry/Next docs say to ignore.

**Build inventory** (matches and slightly extends Phase 1's count — build is authoritative):

- 31 API routes built (vs my Phase 1 count of 22 — I missed `/api/lichess/*` sub-routes when counting from the directory tree).
- 14 page routes, all statically prerendered (`○ Static`) except `/_app` and `/_document`. `/404` auto-generated.
- Largest First Load JS by page (Phase 2 frontend agent will care):
  | Route | Page chunk | First Load JS |
  |---|---|---|
  | `/analysis` | 24.6 kB | **638 kB** |
  | `/database` | **113 kB** | 575 kB |
  | `/scout` | 29.6 kB | 524 kB |
  | `/play` | 12.2 kB | 524 kB |
  | `/practice` | 21.8 kB | 503 kB |
  | `/profile` | 11.7 kB | 456 kB |
  | `/site-stats` | 6.19 kB | 448 kB |
  | `/openings` | 22 kB | 403 kB |
  | `/` (landing) | 11.4 kB | **388 kB** |
- `pages/_app` shared chunk is **250 kB** alone — likely MUI + react-chessboard + chess.js + jotai + react-query all eagerly loaded. That's the perf lever.

### 9.3 §6.1 verdict (engine pipeline)

Production `next build` succeeded with the `next.config.js` ignored — Stockfish.js is bundled by Next 15's default webpack handling, no custom `worker-loader` / `experiments.asyncWebAssembly` required. **`next.config.js` is dead code.** Whether the engine actually loads at runtime is still unverified — that's the Phase 1.5 dev-server smoke test.

§6.1 is therefore **not P0** at the build level. Pending Phase 1.5: if the in-browser engine works on the dev server, §6.1 becomes a P2 cleanup (delete `next.config.js`). If the engine fails to load or throws WASM errors, §6.1 stays P0 — the absent worker-loader/babel-loader config will need to be ported into `next.config.ts`.

Files: `/tmp/tsc_baseline.log`, `/tmp/build_baseline.log` (full output, not committed).

## 10. Phase 1.5 — Runtime readiness report

Dev server brought up clean (`Ready in 4.6s`), bound to 127.0.0.1:3000 (Phase 1.4 hardening). All probes below ran against that local server and were stopped before this report was written. No background processes left running.

### 10.1 Tooling status (gates Phase 2 dynamic checks)

| Tool | Status | Action needed |
|---|---|---|
| Node 22.16, npm 10.9 | ✅ Installed | none |
| Playwright | ⚠️ Available via `npx` (1.59.1), but **no browsers installed** and not in `package.json` | `npx playwright install chromium` (~150 MB) and pin in devDeps |
| Lighthouse | ❌ Not installed (`npx -y lighthouse` would fetch ~10 MB on first use) | `npm i -D lighthouse` or accept `npx -y` per-run cost |
| `@axe-core/playwright` | ❌ Not in `node_modules` | `npm i -D @axe-core/playwright axe-core` |
| Google Chrome | ✅ Installed at `/Applications/Google Chrome.app/...` (drivable by Lighthouse via `--chrome-path`) | none |
| **Test framework** (Jest / Vitest / Playwright Test) | ❌ **None installed** | Phase 3 needs one or there's nothing to run regression tests in. Recommend Vitest + Playwright Test. |
| CI runner | ❌ No `.github/workflows`, etc. | Phase 3 deliverable: at minimum a workflow that runs `tsc --noEmit` + the new test runner. |

### 10.2 Service / env readiness

`.env.local` is populated. Visible keys (no values logged):

| Service | Status | Notes |
|---|---|---|
| **Anthropic** | ✅ Live | `/api/health/llm` → `livePath: anthropic`, Haiku 4.5 probe 934 ms, 25 in / 5 out tokens. |
| **OpenAI fallback** | ❌ Not configured | No `OPENAI_API_KEY` in `.env.local`. Single-provider mode locally — if Anthropic 5xx's during eval, no fallback, eval breaks. **For Phase 2 Agent A, set `OPENAI_API_KEY` or accept the single-point-of-failure risk.** |
| **Maia microservice** | ✅ Live | `/api/maia-status` → `maiaServiceReachable: true, maiaModelLoaded: true`. Maia-routed flows work locally — this corrects my Phase 1 assumption. |
| **Stockfish (in-browser)** | ✅ Loads | `/engines/stockfish-16/stockfish-nnue-16.wasm` → 200, 6 ms, 708 KB, `application/wasm`. **§6.1 confirmed P2 docs cleanup, not P0** — `next.config.js` is dead, engine works without it. |
| **Lichess OAuth** | ⚠️ Configured (`NEXT_PUBLIC_LICHESS_CLIENT_ID` set) | Live-play / OAuth flows reachable but not exercised by Phase 1.5. Phase 2 Agent C should treat as "configured, untested." |
| **Firebase** | ⚠️ All 6 NEXT_PUBLIC_FIREBASE_* keys set | Auth/Firestore reachable in principle. No test account seeded — Phase 2 Agent A AI eval can run without auth (endpoints are public — see §6.3) but anything testing logged-in flows needs a seeded user. |
| **Neo4j puzzle DB** | ✅ Effectively works | `NEO4J_URI`/`USERNAME`/`PASSWORD` are NOT in `.env.local`, but `/api/chess-puzzles-dataset` `command:random` returned 3 real puzzles (1042–1747 rating, themed). Architectural note for Agent A/C: at least some puzzle queries don't go through Neo4j — likely a JSON fixture under `data/` or `Openings/`. The full puzzle architecture is more layered than `NEO4J_ARCHITECTURE.md` suggests; needs Agent C to map. |
| **Anthropic API key fallback path** | n/a | Phase 1.4 strip means clients can't override system prompts. Tested: schema rejects `systemPrompt` and `role: "system"` per the new validation. |

### 10.3 Endpoint reachability sample

| Endpoint | Result | Notes |
|---|---|---|
| `GET /` | 200, 2.9 s | First-hit Turbopack compile cost. |
| `GET /analysis` | 200, 2.4 s | First-hit compile. |
| `GET /play` | 200, 340 ms | Warm. |
| `GET /scout` | 200, 332 ms | Warm. |
| `GET /practice` | 200, 440 ms | Warm. |
| `GET /api/health/llm` | 200, ~1 s | Single-provider live (Anthropic). |
| `GET /api/health/anthropic` | **502, "model: claude-haiku-4-20250514"** | **NEW P1 finding** — endpoint hardcodes a Haiku model ID that doesn't exist in Anthropic's catalog. `llmProvider.ts` uses `claude-haiku-4-5-20251001` (correct). The diagnostic endpoint has been falsely reporting "Anthropic broken" since the rename. Drop-in fix: one-line model rename in `src/app/api/health/anthropic/route.ts:71`. |
| `GET /api/maia-status` | 200 | Service & model loaded. |
| `POST /api/chess-puzzles` | 200 | Returns empty themes for the start position — graceful degradation, no Neo4j crash. |
| `POST /api/chess-puzzles-dataset {command:"random",limit:3}` | 200, 3 puzzles | Live data. |
| `POST /api/adaptive-puzzles` (no `userId`) | 400 | Zod validation rejects missing `userId`. Endpoint reachable. |
| `POST /api/classify-intent` (with `message` field) | 400 | Zod expects `userMessage` not `message`. Endpoint reachable. |
| `GET /engines/stockfish-16/stockfish-nnue-16.wasm` | 200, `application/wasm`, 708 KB, 6 ms | Engine loads. |

### 10.4 New findings surfaced by the runtime check

These weren't in §6 — they only appeared once the server was up. Calling them out so they enter Phase 2's queue with the right priority:

- **NEW P1 — `health/anthropic` is permanently broken.** Hardcoded `claude-haiku-4-20250514`, doesn't exist. Trivial fix; promoted into Agent C's deliverable.
- **NEW P2 — `enhancedOpenAIService.ts` is NOT dead code.** I assumed orphaned in §3; actually imported by `EnhancedAnalysisPanel.tsx`, `useEnhancedFenTracker.ts`, and `lib/prompts/userPrompts.ts`. The codebase has **two parallel AI paths**: the modern `callLLM`-based server-side path AND an older `EnhancedOpenAIService` class that gets instantiated **client-side** in a hook with `openAIApiKey` (`useEnhancedFenTracker.ts:88`). If that key is `NEXT_PUBLIC_*`-prefixed, it's bundled into the client — that's a credential leak. If it's not prefixed, the hook is silently never reaching the server-required env var. Either way it's a P0/P1 — Agent C should resolve.
- **NEW P1 — Zero auth middleware on any of the 31 API routes.** No `src/middleware.ts`. No `getServerSession`/`verifyIdToken`/`withAuth`. Combined with §6.3, this means every API route is wide open. Promotes the §6.3 finding from "enhanced-analysis is exposed" to "**all 31 routes are exposed.**" Agent C scope.
- **NEW P2 — Zero rate limiting** anywhere except where Lichess upstream forces it. Even with the Phase 1.4 strip, anyone can flood the LLM endpoints with valid-shape requests. Agent C scope.
- **NEW P2 — `.env.example` and `.env.local` schemas have drifted.** `.env.example` is missing 7 keys that the running app uses (`ANALYSIS_INTERVAL`, `ENABLE_AI_ANALYSIS`, `ENABLE_ENHANCED_FEN_TRACKING`, `MAX_POSITIONS_TO_TRACK`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_LICHESS_CLIENT_ID`, the Neo4j trio if those are needed elsewhere). New developers can't `cp .env.example .env.local` and have a working app. Agent D scope.

### 10.5 Phase 2 readiness verdict per agent

| Agent | Can run dynamic checks? | Degradations |
|---|---|---|
| **A — Correctness & AI quality** | ✅ Yes, with caveats. Live Claude Sonnet 4 + Haiku 4.5. Real puzzle fixtures available via `/api/chess-puzzles-dataset`. | No OpenAI fallback configured; Anthropic 5xx kills the eval. Recommend setting `OPENAI_API_KEY` before running. Coaching-eval calls cost real $$$ — set a hard budget. |
| **B — Frontend quality** | ⚠️ Partially. Pages render. Need to install Playwright browsers (`npx playwright install chromium`) and `@axe-core/playwright` + Lighthouse before the dynamic portions. **Static (visual code review, contrast pass against tokens, focus-state grep) can run now.** | Block on the install. |
| **C — Backend integrity & security** | ✅ Yes. All API surface reachable; auth/rate-limit findings already partially mapped. | None. |
| **D — Repo hygiene & ops** | ✅ Yes. Static-only by design. | None. |

### 10.6 Asks before you green-light Phase 2

1. **Install the dynamic-check tooling?** Approve `npm i -D @axe-core/playwright axe-core lighthouse vitest @playwright/test` and `npx playwright install chromium` (~150–200 MB). Without these, Agent B is static-only and Phase 3 has no test runner.
2. **Set `OPENAI_API_KEY` in `.env.local`?** So Agent A's coaching eval has a fallback if Anthropic 5xx's mid-run.
3. **Budget for Agent A's eval?** A baseline + post-prompt-change re-run on a 30-position suite at flagship tier is roughly 30 × 2 calls × ~3K tokens ≈ ~$2–4 in Claude Sonnet 4 cost. Cheap. Just confirming the order of magnitude is fine.
4. **Confirm consolidated 4-agent split** from §8.5 still stands now that the readiness picture is sharper.

I'll wait here. On your approval I'll: install tooling (1), then draft `CLAUDE.md` (per §8.2 — post-1.5, pre-2), then spawn the 4 agents and consolidate to `PLAN.md`. PLAN.md is the next user-facing deliverable.
