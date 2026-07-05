# /preview Gap Analysis

**Question answered:** _"what are we missing in /preview — what do we need to fix or build?"_ (asked 2026-06-22, unanswered until now).

**Method:** every route under `src/pages/preview/` was enumerated and its code read in full (not guessed); every `/preview` reference in nav/layout code was traced. Trivial gaps (≤ ~20 lines: dead links, wrong targets, stale copy) are fixed in this same branch and marked **DONE** below. Non-trivial gaps (anything touching a canonical surface, redirect config, or parity work) are written up as ready-to-run objective proposals in the final section — **no** canonical page, redirect config, robots/sitemap, or dependency was touched here.

**Date:** 2026-07-04. **Branch:** `loop/obj-OBJ-05-preview-gap-analysis`.

---

## TL;DR — the one finding that matters

The sitewide **brand logo points at a `/preview/*` URL**. On _every_ production surface that mounts the glass nav (`/play`, `/analysis`, `/puzzles`, `/openings`, `/scout`, `/profile`), clicking the Chess Masti logo navigates to `/preview/launch` — a 2,633-line landing **redesign** that was never promoted to `/`. The canonical marketing home (`/` = `src/pages/index.tsx`, the `Landing*` component stack) is unreachable from the logo. This is a real product gap, not cosmetic: it means `/preview/launch` is load-bearing production chrome living behind a "preview" URL, and it's the reason `/preview/launch` cannot simply be deleted. Fixing it is a canonical-surface decision (promote `launch` to `/`, or repoint the logo) → **BUILD proposal P1** below.

The other headline: `/preview/{openings,profile,play,scout}` are **static design mocks** (zero data-fetching, zero auth, hardcoded content) that have since diverged from their larger, functional canonical pages. They are stale drafts kept alive only because they're crawlable and linked from within other preview mocks → **proposal P2**.

Everything else is healthy. The only trivial fix needed was `/preview/practice` (see below).

---

## Route-by-route (all 11 under `src/pages/preview/`)

Enumerated from the directory — 11 `.tsx` files, none omitted.

### 1. `analysis.tsx` (35 lines) — **KEEP**
- **Purpose:** legacy alias for the analysis surface that used to live here.
- **Canonical counterpart:** `/analysis` (`src/pages/analysis.tsx` → dynamically imports `@/components/preview-analysis/AnalysisImpl`). The dark-glass impl was promoted out of preview on 2026-06-04.
- **Current state (read):** pure `getServerSideProps` **308 permanent redirect** to `/analysis`, preserving the query string verbatim (`?gameId=`, `?insightId=`, `?pgn=`, `?autoAnalyze=1`, `?lichessReview`). Renders `null`. Comment documents the 30-day retention rationale (Chrome extension + share-card URLs still target the old path).
- **Verdict:** **KEEP.** Correct, intentional, well-documented redirect. No gap.

### 2. `practice.tsx` (24 lines) — **FIX — DONE (this branch)**
- **Purpose:** retire the old chessground marketing demo (an unwired solve loop); forward to the real puzzle surface.
- **Canonical counterpart:** `/puzzles`.
- **Current state (read):** client-side `router.replace(...)`. **Gap found:** it redirected to `/preview/puzzles` — the _preview alias_ — leaving the user parked on a `/preview/*` URL even though the canonical `/puzzles` renders the identical component. Every other nav surface already links canonical `/puzzles` (see `NavPill` NAV_LINKS below), so this was the lone inconsistency.
- **Fix applied:** `router.replace("/preview/puzzles")` → `router.replace("/puzzles")`, comment updated. 2 lines. ✅
- **Verdict:** **FIX — DONE.**

### 3. `learn.tsx` (3 lines) — **KEEP**
- **Purpose:** staging alias so the real learning dashboard can be exercised in production under a `/preview/*` URL.
- **Canonical counterpart:** `/learn` (`src/pages/learn.tsx`, exists).
- **Current state (read):** `export { default } from "../learn";` — renders the identical canonical component. Zero divergence possible.
- **Verdict:** **KEEP.** Harmless thin re-export. No gap.

### 4. `onboarding.tsx` (3 lines) — **KEEP**
- **Purpose:** staging alias for the onboarding quiz funnel.
- **Canonical counterpart:** `/onboarding` (exists).
- **Current state (read):** `export { default } from "../onboarding";`. Note: `OnboardingNudge.tsx:14` lists `/preview/onboarding` in `SUPPRESSED_PREFIXES`, so the nudge correctly stays hidden on both the canonical and staging URL.
- **Verdict:** **KEEP.** Thin re-export, correctly integrated with the nudge suppression list. No gap.

### 5. `placement.tsx` (3 lines) — **KEEP**
- **Purpose:** staging alias for the placement test.
- **Canonical counterpart:** `/placement` (exists).
- **Current state (read):** `export { default } from "../placement";`.
- **Verdict:** **KEEP.** Thin re-export. No gap.

### 6. `openings.tsx` (432 lines) — **RETIRE (non-trivial → proposal P2)**
- **Purpose:** early dark-glass design mock of a "Learn openings" surface.
- **Canonical counterpart:** `/openings` (`src/pages/openings.tsx`, ~1,092 lines — a **separate, larger, functional** implementation).
- **Current state (read):** static mock. **Zero** `fetch`/`useEffect`/`/api/`/`useAuth`. Hardcoded repertoire copy, `GradientBackdrop` + `NavPill` chrome, `RevealOnScroll` animation. Two internal CTAs link `/preview/analysis` (308→/analysis, fine) and `/preview/practice` (→/puzzles after this branch's fix, fine). It is a visual draft, not a working page.
- **Verdict:** **RETIRE** (redirect to `/openings` or delete). Non-trivial because the canonical `/openings` is out of scope and parity between mock and canonical is unverified. Proposal P2.

### 7. `profile.tsx` (659 lines) — **RETIRE (non-trivial → proposal P2)**
- **Purpose:** dark-glass design mock of a profile dashboard (framer-motion, recharts-style number tickers, achievement cards).
- **Canonical counterpart:** `/profile` (`src/pages/profile.tsx`, ~922 lines — separate, functional, auth-wired).
- **Current state (read):** static mock. **Zero** data-fetching/auth. `NumberTicker`, `BorderBeam`, hardcoded stats (rating, streak, trophies). No CTAs out. Pure eye-candy.
- **Verdict:** **RETIRE.** Proposal P2.

### 8. `play.tsx` (776 lines) — **RETIRE (non-trivial → proposal P2)**
- **Purpose:** dark-glass design mock of a "Play" hub (bot ladder, online modes).
- **Canonical counterpart:** `/play` (`src/pages/play.tsx`, ~118 lines — thin, but the _real_ surface; wires Lichess/Chess.com sections).
- **Current state (read):** static mock. **Zero** data-fetching. One CTA → `/preview/analysis` (fine). Hardcoded bot cards + mode tiles. Note the canonical `/play` is _smaller_ than this mock — the mock is a richer visual that was never wired up.
- **Verdict:** **RETIRE** — or, if the design is wanted, it's really a **BUILD** ("wire the play mock into a real hub"). Either way non-trivial. Proposal P2.

### 9. `scout.tsx` (829 lines) — **RETIRE (non-trivial → proposal P2)**
- **Purpose:** dark-glass design mock of the opponent-scouting surface (search box, weakness cards, trend arrows).
- **Canonical counterpart:** `/scout` (`src/pages/scout.tsx`, ~1,378 lines — separate, larger, functional).
- **Current state (read):** static mock. **Zero** data-fetching/auth. A `TextField` search box with no handler, hardcoded scouting report. No CTAs out.
- **Verdict:** **RETIRE.** Proposal P2.

### 10. `puzzles.tsx` (1,828 lines) — **KEEP (flag inverted-source architecture → proposal P3)**
- **Purpose:** the **real, canonical** Puzzle Coach implementation — ELO-wired, multi-turn coach chat, 100k-CSV puzzle feed, resume-last-puzzle.
- **Canonical counterpart:** `/puzzles` **re-exports THIS file** (`src/pages/puzzles.tsx` = `export { default } from "./preview/puzzles";`). The source of truth lives at the preview path and the canonical path is the alias — the inverse of every other promoted surface.
- **Current state (read):** genuinely functional; consumed by `/api/puzzle-feed`, `PuzzleCoachPanel`, `PuzzleBoardSurface`, `boardTheme`, `PuzzleCoachMiniboard`, etc. Many components carry `/preview/puzzles` in their doc comments as the canonical name.
- **Verdict:** **KEEP** the behavior — it works and is shipped. But the **inverted source location is a latent trap**: a future "delete the preview mocks" sweep could delete the one preview file that is actually canonical. Flag → proposal P3 (move the impl to `src/pages/puzzles.tsx` and make `/preview/puzzles` the 3-line alias, matching every other surface). Non-trivial (touches the canonical `/puzzles` route + component doc comments).

### 11. `launch.tsx` (2,633 lines) — **KEEP as impl; the logo target is the gap → proposal P1**
- **Purpose:** a full landing-page **redesign** (interactive Chessground hero board, feature grid, comparison, CTAs).
- **Canonical counterpart:** `/` (`src/pages/index.tsx`, ~139 lines — the current live marketing home built from `Landing*` components: `LandingHero`, `LandingFeatures`, `DailyPuzzle`, `LandingComparison`, `LandingTestimonials`, `LandingFooter`, …). `launch.tsx` and `index.tsx` are **entirely separate implementations** — the redesign was never cut over to `/`.
- **Current state (read):** functional standalone landing; imports `chess.js` + a dynamic `ChessgroundBoard`, self-hosts its own `ThemeProvider`. It is **load-bearing**: the sitewide brand logo links here (see nav refs below), so real users land on `/preview/launch` daily.
- **Verdict:** **KEEP** the implementation (it's live chrome), but the fact that production's primary logo target is a `/preview/*` URL — while the canonical `/` runs a different, older landing — is the top gap. Fixing it is a canonical-surface cutover decision. Proposal P1.

---

## Nav / layout references to `/preview/*` (traced across the codebase)

Every `/preview` reference outside `src/pages/preview/` was grepped and classified. Doc comments are noted but not gaps.

| Location | Reference | Assessment |
|---|---|---|
| `NavPill.tsx:123` | brand logo `href="/preview/launch"` | **GAP (P1).** NavPill mounts on all glass surfaces → sitewide logo → preview URL. |
| `NavPill.tsx:40–46` | `NAV_LINKS` → `/play`, `/analysis`, `/puzzles`, `/openings`, `/scout` | ✅ all canonical. Practice correctly points at `/puzzles`. Good. |
| `AppDrawer.tsx:40–46` | `NAV_ITEMS` dual map `preview`↔`production` per surface | ✅ intentional. Drawer shows a preview/production toggle. |
| `AppDrawer.tsx:58` | `isPreview = currentPath.startsWith("/preview")` | ✅ drives the toggle highlight. |
| `AppDrawer.tsx:337` | drawer logo `href={activeItem?.preview ?? "/preview/launch"}` | **GAP (P1).** Same launch-behind-preview issue as the NavPill logo. |
| `sections/layout/index.tsx:84` | `isPreviewRoute = pathname.startsWith("/preview")` → full-bleed, no legacy chrome | ✅ correct; prevents double-stacked headers. |
| `sections/layout/index.tsx:98–107` | `isGlassRoute` allowlist (`/play`, `/profile`, `/analysis`, `/plan`, `/openings`, `/scout`, `/practice`, `/puzzles`, …) | ✅ explicit allowlist for promoted surfaces. Comment warns not to broaden. |
| `AnalysisImpl.tsx:1070`, `:8422` | logo `href="/preview/launch"` (two more instances inside the analysis surface) | **GAP (P1).** Same finding; the logo also points at `/preview/launch` from `/analysis`. |
| `AnalysisImpl.tsx:6810` | `router.replace("/preview/analysis", …, { shallow: true })` after ingesting a Lichess-review PGN | **Minor gap.** Cleans the URL to the _preview alias_ (which then 308s on a real navigation) instead of canonical `/analysis`. Shallow replace so no redirect fires, but it re-parks the canonical page's URL as `/preview/analysis`. Non-trivial (edits the canonical analysis component) → proposal P4. |
| `OnboardingNudge.tsx:14` | `SUPPRESSED_PREFIXES` includes `/preview/onboarding` | ✅ correct suppression. |
| `app/robots.ts` | does **not** disallow `/preview/*` (all preview routes crawlable) | Gap, but robots is not nav/layout and editing it is redirect/crawl config → **out of scope**, proposal P5. |
| `app/sitemap.ts` | excludes `/preview/*` | ✅ good — preview routes aren't advertised in the sitemap. |
| Doc-comment-only refs (`CoachShareDialog.tsx`, `PuzzleCoach*.tsx`, `boardTheme.ts`, `theme/chessMasti.ts`, `AuthDialog.tsx`, `engine/worker.ts`, `puzzle-feed/*`, `generateSuggestions.ts`) | mention `/preview/*` in comments only | ✅ no runtime effect; stale-ish naming, not gaps. |

---

## Summary table

| Route | Verdict | Action |
|---|---|---|
| `analysis.tsx` | KEEP | none — correct 308 |
| `practice.tsx` | FIX | ✅ **DONE** — retargeted to `/puzzles` |
| `learn.tsx` | KEEP | none — thin re-export |
| `onboarding.tsx` | KEEP | none — thin re-export |
| `placement.tsx` | KEEP | none — thin re-export |
| `openings.tsx` | RETIRE | proposal P2 |
| `profile.tsx` | RETIRE | proposal P2 |
| `play.tsx` | RETIRE / BUILD | proposal P2 |
| `scout.tsx` | RETIRE | proposal P2 |
| `puzzles.tsx` | KEEP | flag inverted source → proposal P3 |
| `launch.tsx` | KEEP | logo-target cutover → proposal P1 |
| logo → `/preview/launch` (NavPill/AppDrawer/AnalysisImpl) | GAP | proposal P1 |
| `AnalysisImpl.tsx:6810` URL cleanup → preview alias | GAP | proposal P4 |
| `robots.ts` crawls `/preview/*` | GAP | proposal P5 |

**Trivial fixes applied in this branch: 1** (`practice.tsx`). Every other gap is non-trivial (touches a canonical surface, redirect/crawl config, or parity work) and is a proposal below, per objective scope.

---

## Objective proposals (non-trivial gaps — ready to paste into the loop queue)

### P1 — Stop the sitewide logo from pointing at a `/preview/*` URL
> **Objective:** The Chess Masti brand logo navigates to the canonical marketing home (`/`) from every surface, and the `/preview/launch` landing redesign is either promoted to `/` or explicitly retained as a staging alias — no production logo points at a `/preview/*` URL.
>
> **Acceptance criteria:**
> - Decide and document: is `/preview/launch` the new `/`, or is `index.tsx` canonical? Record the decision in the PR.
> - If promoting `launch`: move its impl to the canonical home path and make `/preview/launch` a thin alias/redirect; `/` renders the redesign.
> - If keeping `index.tsx`: repoint `NavPill.tsx:123`, `AppDrawer.tsx:337`, and `AnalysisImpl.tsx:1070` + `:8422` from `/preview/launch` to `/`.
> - No logged-in or logged-out user reaches a `/preview/*` URL by clicking the logo on any surface.
> - `tsc --noEmit` clean, `npm test` green, build succeeds.
>
> **Why:** `/preview/launch` is load-bearing production chrome hiding behind a "preview" URL; the canonical `/` landing is unreachable from the logo. This blocks retiring the `/preview` namespace and confuses crawlers about the canonical home.

### P2 — Retire (or wire up) the four static `/preview` design mocks
> **Objective:** The stale static design mocks `/preview/{openings,profile,play,scout}` are resolved — each is either redirected to its functional canonical counterpart or deleted — so no crawlable, unwired mock UI ships in production.
>
> **Acceptance criteria:**
> - For each of the four routes, verify the canonical page (`/openings`, `/profile`, `/play`, `/scout`) covers the mock's intent; note any design worth porting.
> - Replace each mock with a redirect to its canonical route **or** delete it; update any inbound preview→preview links (e.g. `openings.tsx` CTAs).
> - Special case `/play`: the canonical `/play` (~118 lines) is thinner than the mock (~776 lines) — decide whether to port the richer design (BUILD) or drop it.
> - No route removed while still linked from live nav; grep for inbound references first.
> - `tsc` clean, tests green, build succeeds.
>
> **Why:** ~2,700 lines of hardcoded, unwired mock UI is crawlable (`robots.ts` allows `/preview/*`) and diverged from the real pages — a maintenance and SEO-duplication liability.

### P3 — Un-invert the Puzzle Coach source location
> **Objective:** The canonical Puzzle Coach implementation lives at `src/pages/puzzles.tsx` and `/preview/puzzles` is the thin alias — matching every other promoted surface — so a future "delete the preview mocks" sweep can't accidentally delete the real page.
>
> **Acceptance criteria:**
> - Move the 1,828-line impl from `src/pages/preview/puzzles.tsx` to `src/pages/puzzles.tsx`; make `preview/puzzles.tsx` the 3-line `export { default } from "../puzzles";`.
> - Update the component doc comments that name `/preview/puzzles` as canonical (`PuzzleCoachPanel`, `boardTheme`, `PuzzleBoardSurface`, `PuzzleCoachMiniboard`, `puzzle-feed`).
> - No behavior change; `/puzzles` and `/preview/puzzles` render identically before and after.
> - `tsc` clean, tests green, build succeeds.
>
> **Why:** the source-of-truth living at the preview path (with canonical re-exporting it) is the inverse of every other surface and a latent deletion trap.

### P4 — Canonicalize the Lichess-review URL cleanup in AnalysisImpl
> **Objective:** After ingesting a Lichess-review PGN, the analysis surface cleans its URL to the canonical `/analysis` rather than the `/preview/analysis` alias.
>
> **Acceptance criteria:**
> - `AnalysisImpl.tsx:6810` `router.replace(...)` targets `/analysis` (preserving shallow behavior).
> - Deep-link and refresh behavior unchanged; no redirect loop.
> - `tsc` clean, tests green.
>
> **Why:** small, but it re-parks the canonical page's visible URL under `/preview/analysis`, contradicting the 2026-06-04 cutover.

### P5 — Disallow `/preview/*` in robots.ts (or intentionally allow, documented)
> **Objective:** Crawlers are given an explicit, documented policy for `/preview/*` — either `Disallow: /preview/` in `robots.ts` (recommended: these are staging/mock URLs) or an inline comment recording the deliberate decision to keep them crawlable.
>
> **Acceptance criteria:**
> - `src/app/robots.ts` either disallows `/preview/*` or carries a comment explaining why it's intentionally crawlable.
> - Sitemap continues to exclude preview (already the case).
> - No canonical route accidentally disallowed.
>
> **Why:** `/preview/*` mock/staging routes are currently fully crawlable, risking duplicate-content signals against their canonical counterparts.

---

## Scope note

Per the objective: the only behavior change in this branch is the single trivial `practice.tsx` fix. Canonical (non-preview) surfaces, redirect/robots/sitemap config, and dependencies were not touched. All non-trivial gaps above are proposals only.
