# Chess Masti AI — notes for future Claude

Orientation for anyone (human or agent) picking up this codebase cold. Terse and load-bearing on purpose. For the fuller audit picture, see [AUDIT_NOTES.md](AUDIT_NOTES.md).

## What this is

Next.js 15 app (`chess-coach-ai/`, deploys to Vercel as **chessmasti.com**). Two tightly coupled surfaces: the AI coaching model and the web UI that wraps it. Chess rules via `chess.js`, board via `react-chessboard`, analysis via `stockfish.js` (WASM, in-browser Web Worker). Mixed Pages Router (`src/pages/*.tsx`) + App Router (`src/app/api/*` for route handlers, `src/app/layout.tsx`).

## AI architecture (the one mental model that matters)

Every server-side LLM call funnels through [`callLLM()`](src/lib/llmProvider.ts) in [src/lib/llmProvider.ts:216](src/lib/llmProvider.ts#L216). Anthropic Claude (Sonnet 4 flagship / Haiku 4.5 fast) is primary, OpenAI (gpt-4o / gpt-4o-mini) is the fallback. Any 4xx/5xx/network error on Anthropic triggers an immediate retry on OpenAI so a single user request is never dropped.

Callers use a `tier` (`"flagship" | "fast"`) — never a model name. Keep it that way.

Callsites (as of 2026-04-23):
- [src/app/api/enhanced-analysis/route.ts](src/app/api/enhanced-analysis/route.ts) — main deep analysis (`flagship`). 1082 lines; do not refactor lightly.
- [src/app/api/chat/route.ts](src/app/api/chat/route.ts) — follow-up chat (`fast`). Uses a server-cached context keyed by `contextId` from the prior analysis call.
- [src/app/api/classify-intent/route.ts](src/app/api/classify-intent/route.ts)
- [src/app/api/health/llm/route.ts](src/app/api/health/llm/route.ts) — 1-token probe, both providers.
- [src/lib/concept/conceptLLMTagger.ts](src/lib/concept/conceptLLMTagger.ts) — server-side concept classification.

**The legacy path still exists.** [src/lib/enhancedOpenAIService.ts](src/lib/enhancedOpenAIService.ts) (989 lines) is an older AI service class, instantiated **client-side** in [src/hooks/useEnhancedFenTracker.ts:88](src/hooks/useEnhancedFenTracker.ts#L88) and referenced by [src/components/EnhancedAnalysisPanel.tsx](src/components/EnhancedAnalysisPanel.tsx). It's parallel to, not replaced by, `callLLM()`. Be aware of which path you're modifying.

System prompt body: [src/lib/chessPrinciples.ts:172](src/lib/chessPrinciples.ts#L172) exports `SYSTEM_PROMPT_TEMPLATE` (one grandmaster-coach prompt) and `getSystemPrompt(analysisType)` at :234 which composes it with per-type instructions. Re-exported from [src/lib/prompts/](src/lib/prompts/). **Prompt version at [src/lib/prompts/systemPrompts.ts:22](src/lib/prompts/systemPrompts.ts#L22) (`PROMPT_VERSION = "2.0"`) — log it with every coaching call so before/after evals can be compared. Adding this logging is on the audit backlog if you see it missing.**

## Rules that bit us in the audit

1. **`npm run build` and `npm run lint` are not quality gates.** [next.config.ts](next.config.ts) sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`; [.eslintrc.json](.eslintrc.json) has `"ignorePatterns": ["**/*"]` so `next lint` lints zero files. **Use `npx tsc --noEmit` as the pre-commit check.** Today it runs clean (0 errors) — keep it that way.
2. **Two `next.config` files exist.** `next.config.ts` wins, `next.config.js` is silently dead. The `.js` file contains worker-loader / `asyncWebAssembly` / stockfish.js babel-loader config — none of it is needed (Next 15 + default webpack handle WASM fine; `/engines/stockfish-16/*.wasm` serves as `application/wasm` at 200). Delete `next.config.js` when you're tidying.
3. **Never accept a client-supplied system prompt or `role: "system"` message.** There was a P0 prompt-injection hole on `/api/enhanced-analysis` and `/api/chat` — Phase 1.4 of the audit stripped it. The proper Phase 3 fix (auth + rate-limit + server-side prompt allowlist) lands with a regression test. See the `AUDIT-PHASE-1.4` comments in [src/lib/validation/schemas.ts](src/lib/validation/schemas.ts) and [src/app/api/enhanced-analysis/route.ts](src/app/api/enhanced-analysis/route.ts).
4. **`Chesskit/` is out of scope.** Vendored nested git repo, currently dirty, quarantined in `.claude/settings.json`. Do not read, edit, or clean it.
5. **Temporary dev-server bind.** `npm run dev` binds to `127.0.0.1` (audit hardening). Use `npm run dev:lan` for LAN access. The choice to keep this binding long-term is a Phase 5 decision.

## Auth model (post-school-WiFi migration, 2026-04-28)

**Auth and Firestore reads no longer hit Firebase from the browser.** This was forced by school-network filters that block `*.firebaseapp.com` and `firestore.googleapis.com`. Everything routes through chessmasti.com server-side. Mental model:

- **Sessions**: signed JWT in an httpOnly cookie (`cm_session`). Sign-key in `SESSION_SECRET`. See [src/lib/auth/session.ts](src/lib/auth/session.ts).
- **Email/password auth**: bcrypt-hashed `passwordHash` field on the user doc. Endpoints under [src/app/api/auth/](src/app/api/auth/) — `signup`, `signin`, `signout`, `me`, `password`, `forgot-password`, `reset-password`.
- **Google OAuth**: server-routed via [src/app/api/auth/google/start](src/app/api/auth/google/start) + `callback`. The redirect_uri is chessmasti.com — never `*.firebaseapp.com`. Account-links by email so the existing 50 Firebase Auth users keep their UID and saved games when they sign in via Google for the first time.
- **Firestore reads**: server-side via Firebase Admin SDK ([src/lib/server/firebaseAdmin.ts](src/lib/server/firebaseAdmin.ts)). Browser calls `/api/users/me`, `/api/games`, etc. — never `firestore.googleapis.com` directly.
- **Personalization**: `users/{uid}` doc carries `coachTone`, `playingStyle`, `studyGoals`, `favoriteOpenings`, `boardTheme`, `pieceSet`, etc. The 4-tab ProfileDialog edits them. [/api/enhanced-analysis](src/app/api/enhanced-analysis/route.ts) reads the session cookie and threads prefs into `getCoachChatSystemPrompt`.

**Things still using Firebase from the browser** (intentionally, since their domain isn't `firebaseapp.com`-blocked):
- `firebase/app` + `firebase/analytics` in [src/lib/firebase.ts](src/lib/firebase.ts).

**Stubbed but not deleted** (compile-only — TODO is to proxy through API):
- [src/lib/visitorTracker.ts](src/lib/visitorTracker.ts) — all reads return empty, writes are no-ops. /site-stats page renders blank until a `/api/visits` proxy lands.
- [src/lib/auth/getAuthHeader.ts](src/lib/auth/getAuthHeader.ts) — returns `{}` (cookies travel automatically; no Bearer header needed).

## Runtime readiness (as of 2026-04-28, localhost)

| Service | Status |
|---|---|
| Anthropic API | ✅ live (Sonnet 4 + Haiku 4.5) |
| OpenAI fallback | ❌ **not configured locally** — single-provider mode; Anthropic 5xx has no fallback |
| Maia microservice (`MAIA_API_URL`) | ✅ live, model loaded |
| Stockfish WASM | ✅ serves at `/engines/*` |
| Auth (cookie session + email/password) | ✅ live; needs `SESSION_SECRET`, Firebase Admin creds |
| Google OAuth (server-routed) | ✅ wired; needs `GOOGLE_OAUTH_CLIENT_ID/SECRET` |
| Resend (password reset emails) | ⚠️ wired; deliveries fail until `chessmasti.com` is verified in Resend (DNS records) |
| Lichess OAuth | ⚠️ configured, flows not exercised recently |
| Neo4j | ⚠️ env keys (`NEO4J_URI/USERNAME/PASSWORD`) not in `.env.local`, but `/api/chess-puzzles-dataset command:random` returns real data — some puzzle queries use a non-Neo4j store |

Before hitting an endpoint that depends on a service listed as ❌ or ⚠️, sanity-check via `/api/health/llm` or `/api/maia-status` rather than assuming.

**Known bug in diagnostics:** [src/app/api/health/anthropic/route.ts:71](src/app/api/health/anthropic/route.ts#L71) hardcodes `claude-haiku-4-20250514`, which is not a real model ID. Endpoint returns 502 permanently. Not used for live traffic; fix is a one-line rename to `claude-haiku-4-5-20251001`.

## Persistence layers (three of them, know which one you're touching)

- **Firebase Firestore** — user accounts, saved games, openings repertoire. See [src/lib/firebase.ts](src/lib/firebase.ts), [src/lib/firestore*.ts](src/lib/).
- **IndexedDB** (via `idb`) — client-side puzzle progress, spaced-repetition state. See [src/lib/spacedRepetition.ts](src/lib/spacedRepetition.ts), [src/lib/repetitTraining.ts](src/lib/repetitTraining.ts).
- **Neo4j** — puzzle graph DB for similarity / theme queries. See [src/lib/neo4j.ts](src/lib/neo4j.ts). Optional for some puzzle paths (see table above).

## Things not to do

- Don't mass-edit before planning. Do the read-then-write discipline.
- Don't add features, retries, fallbacks, or telemetry beyond what's asked.
- Don't regenerate this file with `/init` — it's hand-curated from the audit. If something's stale, fix the specific line.
- Don't invent chess lines. Chess correctness is non-negotiable. Legal-move, draw, and mate detection bugs are always P0.
- Don't strip the "masti" (fun) tone. Per the product brief, it's a deliberate choice.

## Tests & CI

**There is no test harness and no CI** as of 2026-04-23. The 30+ `test-*.js` files at the repo root are ad-hoc scripts, not a suite. Phase 3 of the audit adds Vitest + Playwright Test + a GitHub Actions workflow running `tsc --noEmit` and the new suites. Until then, regressions are on the eyeball.
