# Chess Masti AI — notes for future Claude

Orientation for anyone (human or agent) picking up this codebase cold. Terse and load-bearing on purpose. For the fuller audit picture, see [AUDIT_NOTES.md](AUDIT_NOTES.md).

## What this is

Next.js 15 app (`chess-coach-ai/`, deploys to Vercel as **chessmasti.com**). Two tightly coupled surfaces: the AI coaching model and the web UI that wraps it. Chess rules via `chess.js`, board via `react-chessboard`, analysis via `stockfish.js` (WASM, in-browser Web Worker). Mixed Pages Router (`src/pages/*.tsx`) + App Router (`src/app/api/*` for route handlers, `src/app/layout.tsx`).

## AI architecture (the one mental model that matters)

Every server-side LLM call funnels through [`callLLM()`](src/lib/llmProvider.ts) in [src/lib/llmProvider.ts:216](src/lib/llmProvider.ts#L216). Anthropic Claude (Sonnet 4 flagship / Haiku 4.5 fast) is primary, OpenAI (gpt-4o / gpt-4o-mini) is the fallback. Any 4xx/5xx/network error on Anthropic triggers an immediate retry on OpenAI so a single user request is never dropped.

Callers use a `tier` (`"flagship" | "fast"`) — never a model name. Keep it that way.

Callsites (as of 2026-05-30):
- [src/app/api/enhanced-analysis/route.ts](src/app/api/enhanced-analysis/route.ts) — main deep analysis (`flagship`). ~2031 lines; do not refactor lightly. Embeds the Mastermind validator pipeline (`runValidationPipeline`) behind the `MASTERMIND_VALIDATORS_ENABLED` env flag.
- [src/app/api/chat/route.ts](src/app/api/chat/route.ts) — follow-up chat (`fast` → Haiku 4.5). Uses a server-cached context keyed by `contextId` from the prior analysis call. Note: this path serves most user turns after move 1 with Haiku + a cached system prompt + a `buildCompactGameContext()` summary, so quality differs materially from the flagship turn-1 path.
- [src/app/api/classify-intent/route.ts](src/app/api/classify-intent/route.ts) — exists but not currently wired into AnalysisImpl.
- [src/app/api/health/llm/route.ts](src/app/api/health/llm/route.ts) — 1-token probe, both providers.
- [src/lib/concept/conceptLLMTagger.ts](src/lib/concept/conceptLLMTagger.ts) — server-side concept classification.
- [src/lib/mastermind/categorization/categoryClassifier.ts](src/lib/mastermind/categorization/categoryClassifier.ts) — Haiku-tier intent classifier that picks the per-category timeout + retry budget for the validator pipeline.

**The legacy client-side AI service path is gone.** `src/lib/enhancedOpenAIService.ts` (989 lines), `src/hooks/useEnhancedFenTracker.ts` (337 lines), and `src/components/EnhancedAnalysisPanel.tsx` (294 lines) were all deleted in commit ca75f92 on 2026-04-25 ("Phase 0 of the coach-prompt restoration"). There is now only one AI path: `callLLM()`. If you see references to those files in older notes, treat them as stale.

System prompt body: [src/lib/prompts/coachChatPrompt.ts](src/lib/prompts/coachChatPrompt.ts) exports `getCoachChatSystemPrompt({ personalityId, userRating, username, playerColorName, coachingPrefs, ... })` — a ~455-line typed builder that composes the base coach manifesto with per-personality (`coachPersonalities.ts`) and per-prefs (`renderCoachingPrefs`) overrides. **Prompt version at [src/lib/prompts/coachChatPrompt.ts:22](src/lib/prompts/coachChatPrompt.ts#L22) is `"3.0"` (bumped from the deleted `"2.0"` template). Per-`analysisType` branching (`game_review` / `opening_analysis` / `endgame_analysis` etc.) is gone in 3.0; classification happens in the route via `categoryClassifier`, not in the prompt.**

## Rules that bit us in the audit

1. **CI now gates PRs on tsc + vitest.** [.github/workflows/ci.yml](.github/workflows/ci.yml) runs `npm ci → npx tsc --noEmit → npm test` on every PR and on push to main / audit/*. The Vitest suite is 36 files / 652 tests (predominantly Mastermind validators, categorization, prompt builders, and llmProvider). `next.config.ts` no longer suppresses type errors, and [.eslintrc.json](.eslintrc.json)'s `ignorePatterns` is selective (only `node_modules`, `.next`, `Chesskit`, etc.) so `next lint` is now real too. **Keep `npx tsc --noEmit` clean** — there are still 32 `as any` / `@ts-ignore` escapes scattered through `src/`, so the type checker is the last line of defense against a lot of brittle code paths.
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
- **Intern mode (CMIP)**: at sign-in (Google OAuth + email/password), the auth callbacks check the email against the Supabase `intern_allowlist` table via [src/lib/intern/allowlist.ts](src/lib/intern/allowlist.ts) and stamp `isIntern: boolean` into the `cm_session` JWT claim. Flipping the allowlist takes effect on next sign-in. The browser reads `isIntern` from `/api/auth/me` via [useAuth](src/contexts/AuthContext.tsx) / [useViewer](src/hooks/useViewer.ts); intern-only UI (header EmployeePill, InternalNavLinks, InternalHomeCard, `/intern` dashboard, blue theme swap) is gated on this flag. See [MASTERMIND_CONTEXT/PR_CMIP_1_PLAN.md](MASTERMIND_CONTEXT/PR_CMIP_1_PLAN.md) for the broader plan.

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
| Supabase (CMIP intern portal) | ✅ live; needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Read-only allowlist check at sign-in only (CMIP-1.A) |
| Product access | ✅ all Chess Masti coaching features are free |

Before hitting an endpoint that depends on a service listed as ❌ or ⚠️, sanity-check via `/api/health/llm` or `/api/maia-status` rather than assuming.

**Health probe coverage:** [`/api/health/llm`](src/app/api/health/llm/route.ts) probes Anthropic + OpenAI (1-token call, both providers). [`/api/health/anthropic`](src/app/api/health/anthropic/route.ts) is the Anthropic-only probe — historically returned 502 because of a stale model ID; the fix to use the canonical `claude-haiku-4-5-20251001` is in flight on `fix/health-anthropic-model-id`. There is no uptime monitor polling either endpoint yet, so silent provider outages won't page anyone.

## Persistence layers (four of them, know which one you're touching)

- **Firebase Firestore** — user accounts, saved games, openings repertoire. See [src/lib/firebase.ts](src/lib/firebase.ts), [src/lib/firestore*.ts](src/lib/).
- **IndexedDB** (via `idb`) — client-side puzzle progress, spaced-repetition state. See [src/lib/spacedRepetition.ts](src/lib/spacedRepetition.ts), [src/lib/repetitTraining.ts](src/lib/repetitTraining.ts).
- **Neo4j** — puzzle graph DB for similarity / theme queries. See [src/lib/neo4j.ts](src/lib/neo4j.ts). Optional for some puzzle paths (see table above).
- **Supabase (Postgres)** — CMIP intern feedback portal data only. Server-side, service-role key, never exposed to browser. Tables: `intern_allowlist` (added CMIP-1.A); `intern_flags` and submissions land in CMIP-1.B / 1.C. See [src/lib/intern/supabase.ts](src/lib/intern/supabase.ts), [supabase/migrations/](supabase/migrations/).

## Things not to do

- Don't mass-edit before planning. Do the read-then-write discipline.
- Don't add features, retries, fallbacks, or telemetry beyond what's asked.
- Don't regenerate this file with `/init` — it's hand-curated from the audit. If something's stale, fix the specific line.
- Don't invent chess lines. Chess correctness is non-negotiable. Legal-move, draw, and mate detection bugs are always P0.
- Don't strip the "masti" (fun) tone. Per the product brief, it's a deliberate choice.

## Tests & CI

**Vitest is wired and enforced by CI as of 2026-05-28.** `npm test` runs 36 files / 652 tests in ~3s. [.github/workflows/ci.yml](.github/workflows/ci.yml) runs `tsc --noEmit` + the suite on every PR and on push to `main` / `audit/*`. Playwright is in `devDependencies` but no `playwright.config` exists yet — e2e is still on the eyeball.

Coverage is uneven on purpose: Mastermind validators, the category classifier, `getCoachChatSystemPrompt` (snapshotted per personality), and `llmProvider` fallback have deep tests; insight parsing, Firestore CRUD, the opening-explorer 3-tier fallback, the Maia integration, and SSE stream consumption have **none**. If you're touching one of the uncovered areas, write the test alongside the change — `chessmasti.com` is now small enough that "the next PR" is also the regression you'll have to debug.

The 30+ `test-*.js` files at the repo root are pre-vitest ad-hoc scripts. They aren't wired to `npm test` and don't run in CI. Treat them as dead code unless someone explicitly references one.

The synthetic-tester / eval harness lives in [scripts/synthetic-tester/](scripts/synthetic-tester/) with the Agent A baseline frozen at [audit/findings/agent-a-eval/](audit/findings/agent-a-eval/) (5 fixtures, 20% hallucination rate on Haiku 4.5). It does not run in CI; run it manually before shipping prompt changes.
