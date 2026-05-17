# PR_CMIP_1_PLAN.md — CMIP Intern Feedback Portal

The build plan for the **ChessMasti Internship Program (CMIP) Feedback Portal** — an internal-only surface that turns every CMIP intern into a structured source of bad-response examples for the Mastermind eval set. Reads as a self-contained brief.

**Authored:** 2026-05-17. **Status:** planning. **Plan-first** per [feedback_mastermind_plan_first.md](../../memory/feedback_mastermind_plan_first.md) — pausing for review before any code.

**Scope posture:** quality + intern-experience first. This is the upstream feeder for Mastermind eval data; the data this surface collects is load-bearing for Phase 1.C's eval gate and every Phase onward.

**Relationship to Mastermind plan:** parallel workstream. Does *not* sit inside the Phase 1–5 build (§3 of [MASTERMIND_BUILD_PLAN.md](MASTERMIND_BUILD_PLAN.md)). Numbered `CMIP-1.x` so it can't be confused with Phase 1.

---

## 0. How to use this doc

- **First-time builder:** read sections 1, 2, 3. Then read the PR section you're about to ship (§5) in full.
- **Returning builder:** jump to the PR section. The mandatory call-site matrix at §10 is the merge contract.
- **Glossary:**
  - **CMIP** — Chess Masti Internship Program. The cohort the user (Aayan) manages.
  - **Intern** — a logged-in user whose email is in the CMIP allowlist.
  - **Flag** — the act of capturing a bad model response *as it happens*, mid-chat. Captures context only — no authored "better response" yet.
  - **Submission** — a flagged item that an intern has subsequently authored a "better response" for and submitted. Submissions are what count toward the 10/week quota.
  - **Employee chrome** — the site-wide visual reskin that activates when `isIntern === true`. Header, footer, welcome text, nav, accent color.

---

## 1. North star and quality bar

**What the portal does.** When a CMIP intern dogfoods chessmasti.com (analyzing their own games, asking the coach questions), they can click a **Flag** button on any model response that's bad — hallucinated, off-topic, confidently-wrong, tonally off. That click captures the full session context (chat history, game PGN, FEN at flag-time, model response, prompt version, model tier) and pushes it to Supabase. Later — on their own time, in any browser session — they visit `/intern` and write the **better response** for each flagged item. Once submitted, that pair (bad response + ideal response + full context) becomes a row in the Mastermind eval dataset.

**Why this is strategically important.** Three reasons:

1. **Phase 1.C's eval gate is starving.** The synthetic-tester (§9.1 of MASTERMIND_BUILD_PLAN.md) uses 10 master-game PGNs × 5 personas — that's 50 turn-pairs of *generated* fixtures. Real-world bad responses from real games are richer signal. Targeted: 10 interns × 10 submissions/week × 12 weeks = **1,200 paired (bad, ideal) examples** by August. That's a real eval set.
2. **Mastermind training data.** Every (bad, ideal) pair is a few-shot example, a DPO/preference-tuning pair, or a regression-test fixture. We don't have to choose now — having the pairs unblocks every option.
3. **Intern engagement.** Interns currently have no structured contribution path. A site that says *"Welcome, Chess Masti Team Member"* and shows them their own impact every week is materially more retentive than a Notion-based feedback channel.

**Quality bar — what "done" looks like:**

| Dimension | Target | How measured |
|---|---|---|
| Flag-to-capture latency | < 2 s from click to "captured" toast | Browser timing |
| Submission flow length | < 90 s p50 for an intern to author one ideal response | Self-report + dashboard timestamps |
| Data completeness | 100% of submissions have non-empty chat history, PGN, model response, ideal response | Supabase NOT NULL + CHECK constraints |
| Intern weekly throughput | 10 submissions/intern/week median by week 4 | Dashboard quota tracker + admin view |
| Intern sentiment | "I felt valued and like an employee" — informal pulse with the cohort at week 2 | Direct Aayan ↔ intern conversation |
| Privacy | Only the intern's own dogfooded sessions can be flagged. Customer sessions are out of scope. | Auth check on `/api/intern/flag` |

**The intern-experience thesis.** Per user direction 2026-05-17: *"They will be exponentially more incentivized if it produces a specific intern-tailored experience for them. The entire website (all of it) should be as if it is an employee of the company looking at a product they are helping build."* This is not cosmetic. The competitive moat is UI craft (per [project_ui_as_moat.md](../../memory/project_ui_as_moat.md)) and the same applies internally: a portal that looks like a real internal product makes interns behave like real employees.

---

## 2. Mental model — the two intern surfaces

There are exactly **two surfaces**, deliberately decoupled.

### 2.1 Surface A — Capture (in-chat, while dogfooding)

The intern is using chessmasti.com normally. They're analyzing a game, asking the coach a question, getting back model responses. On every model response bubble in [`AICoachChat.tsx`](../src/components/AICoachChat.tsx), they see a small **🚩 Flag** button (only visible when `isIntern === true`).

Click → modal opens with a single dropdown ("Why is this flag-worthy?" — **Bad / Inaccurate / Incomplete**) and an optional one-line note. Submit → POST to `/api/intern/flag` with the auto-captured payload. Modal closes, toast says *"Flagged — author the better response in your dashboard whenever."* Categories resolved 2026-05-17; expandable later in admin without a schema change.

**Why a modal and not just one-click:** the *category* is high-signal for downstream sorting and costs the intern 2 seconds. Asking for the ideal response in the moment is too expensive — it would suppress flagging.

**What gets auto-captured:**

- `chat_history`: the full message array for this chat session (system prompt redacted; user + assistant messages preserved). Sourced from the server-side cached context keyed by `contextId` per CLAUDE.md §AI architecture.
- `game_pgn`: the game being analyzed, if any (sourced from chat session state).
- `fen_at_flag`: the current FEN at the moment of flagging.
- `flagged_message`: the specific assistant message the intern flagged (id + content + tier + prompt version).
- `intern_email`, `intern_uid`: from `cm_session` cookie.
- `flag_category` (Bad / Inaccurate / Incomplete), `flag_note`: from the modal.
- `flagged_at`, `chat_session_id`.

### 2.2 Surface B — Author + submit (on the dashboard, on their own time)

The intern visits `/intern/submissions`. Sees a list of their flagged items split by status: **Pending** (flagged, no ideal response yet) and **Submitted**. Top of page: a quota widget — *"6 of 10 this week. Streak: 3 weeks."*

Click into a pending item → `/intern/submissions/[id]`. Page shows:
- The game on a non-interactive board at `fen_at_flag` (using existing `react-chessboard`).
- The chat history rendered as bubbles (read-only).
- The flagged message highlighted in red.
- A large textarea: *"What should the model have said instead? Write the ideal response."*
- Submit button → POST `/api/intern/submit`. On submit, the row moves from Pending to Submitted.

**Why decoupled:** flagging happens in-the-moment when the bad response is fresh; authoring the ideal response is craft work that benefits from time and unhurried thought. Forcing both at once gets sloppy ideal responses. Decoupling is core to data quality.

### 2.3 What gets captured but is *not* the ideal response

The full chat session at flag-time is captured even if the intern never submits. These "pending forever" flags still surface as a row in the dataset with `ideal_response: null` — useful as an "off-policy" signal (places the model went wrong, even if we don't know the right answer). Targeted: > 60% pending-to-submitted conversion. Low conversion means the modal threshold is too low or the dashboard UX is broken.

---

## 3. The "Employee experience" — site-wide reskin

The directive is: *the entire chessmasti.com experience changes when an intern is logged in.* Not just the `/intern` routes. The reskin is the retention mechanism.

### 3.1 Detection

A single piece of state, `isIntern: boolean`, derived once at session-creation time and stored in the `cm_session` JWT claim (per CLAUDE.md §Auth model). Exposed to React via a `useViewer()` hook that returns `{user, isIntern}`. Every reskinned component reads from this hook.

`isIntern` is `true` iff the user's email appears in the `intern_allowlist` Supabase table. Defined at OAuth callback time, not at every page load — flipping the allowlist requires the intern to sign out and back in. Acceptable tradeoff for simplicity.

### 3.2 What changes when `isIntern === true`

| Surface | Customer view (today) | Employee view (this PR) |
|---|---|---|
| Header — left | "ChessMasti" logo | "ChessMasti" logo + **`EMPLOYEE` pill** in deep blue |
| Header — right | "Sign in" or avatar + name | Avatar + **"Welcome back, [first name] · Chess Masti Team"** |
| Header — nav | Public links (Home / Analyze / Pricing) | Public links + **internal links** (My Submissions / Quota / Tools) |
| Homepage hero (`/`) | Marketing copy | **Internal landing card**: "You're logged in as an employee. 6 of 10 submissions this week. [Continue dogfooding →] [Author pending submissions →]" |
| Footer | Standard copy | Standard copy + **`Internal build · v{gitSha.slice(0,7)} · You're seeing what customers don't.`** |
| **Brand color — site-wide** | **Brand orange** | **Deep blue across every surface — buttons, links, headings, chat bubbles, board move-highlight accents, focus rings.** The intern's *whole* chessmasti.com is blue-themed. Customer view unchanged. |
| AICoachChat | Standard | Standard + **`EMPLOYEE MODE` pill** in chat header + 🚩 Flag buttons on every assistant message |
| Profile dialog | Standard (4 tabs) | **Standard — untouched.** Resolved 2026-05-17: all intern-only UI lives at `/intern`. No customer-product impact. |
| 404 page | Standard | Standard + signed-off: *"— from the team you're on"* |

**Theming mechanism (technical):** the existing MUI [`ThemeRegistry.tsx`](../src/components/ThemeRegistry.tsx) already sets `primary.main: "#1976d2"` (blue!), so MUI-themed components flip to blue *for free*. The "brand orange" the user sees on the public marketing surfaces comes from non-MUI styling (inline hex, CSS classes, or component-local color). CMIP-1.A includes a grep pass over `src/**/*.tsx` for any hardcoded orange brand color and replaces with a CSS-variable lookup that switches on `<html data-viewer="intern">`. This is the only honest way to deliver "the entire site is blue" without a partial reskin that leaves orange islands.

**Not in this plan to resolve:** the orange-to-blue swap audit (which specific hexes, which components) — that lives in the CMIP-1.A PR description as a verified-completeness checklist.

The visual language: **professional, slightly more dense than the public site, with a different accent color** to signal "this is internal." The public site is playful (per CLAUDE.md *"Don't strip the masti tone"*); the employee experience is warmer-but-more-considered. Tonally: addressed as a colleague, not a customer.

Reference: the design language in [design-inspiration/atlaseducation/](../../design-inspiration/atlaseducation/) leans clean-and-internal already — pull from there.

### 3.2a Naming clash to avoid

There is **already** a public-facing `src/app/internship/` route (the CMIP *recruitment* page — `page.tsx`, `apply/`, `InternshipFooter.tsx`, `InternshipNav.tsx`). That route stays customer-facing and unchanged. The new internal portal lives at **`/intern`** (no trailing `-ship`). The two are deliberately separate:
- **`/internship`** — public, marketing, "apply to join CMIP" — touched zero by this plan.
- **`/intern`** — internal, gated by `isIntern`, the dashboard for current CMIP members.

Both can coexist; the distinction is by URL and by access control.

### 3.3 What deliberately does NOT change

- **The chess analysis itself.** Same model, same prompts, same engine. Interns are dogfooding the *real* product; if their view diverged from customer reality, their feedback would be off-distribution.
- **URL structure.** No `intern.chessmasti.com` subdomain. Same domain, same routes. The reskin is presentational.
- **Pricing pages, signup flows.** Interns won't see them in normal use, but if they navigate there, the employee chrome persists. They see what a customer sees, framed for an employee.

### 3.4 Anti-goal: don't make it feel like an admin panel

Common failure mode: internal tools end up looking like phpMyAdmin. The CMIP portal must feel like a **premium consumer product that happens to be employees-only**, not like a back-office tool. Apply the same UI-craft bar as the customer-facing surface. This is the [project_ui_as_moat.md](../../memory/project_ui_as_moat.md) discipline applied internally.

---

## 4. Mental model of the current system (where this plugs in)

Builder must internalize before touching code:

### 4.1 Auth is already wired

Per CLAUDE.md §Auth model: signed JWT in `cm_session` httpOnly cookie, Google OAuth server-routed at [/api/auth/google/start](../src/app/api/auth/google/start) + `callback`, sign-key in `SESSION_SECRET`, sessions managed in [src/lib/auth/session.ts](../src/lib/auth/session.ts). We do **not** need to build OAuth — we add an allowlist check inside the callback.

### 4.2 Chat context is already server-cached

Per CLAUDE.md §AI architecture: `/api/chat` follow-up route uses a `contextId` keyed cache that holds the prior analysis context. The chat history we need to capture is already on the server — we don't need to round-trip it from the browser. The Flag handler reads from the same cache.

### 4.3 New persistence tier: Supabase

CLAUDE.md lists three persistence tiers (Firestore / IndexedDB / Neo4j). Supabase is **new** and is added deliberately as a separate tier for intern feedback data. Rationale:
- Firestore is for customer-facing user data; we don't want intern feedback rows in the customer collection.
- Supabase Postgres is queryable, exportable to JSONL via SQL, and has Row-Level Security if we ever expose intern-only Supabase reads from the browser (not in scope for v1).
- One added dependency (`@supabase/supabase-js`), one added env var pair (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). All Supabase access is server-side.

**Update CLAUDE.md §Persistence layers when CMIP-1.A merges** — adds a 4th tier.

### 4.4 The intern is a customer + something more

Interns have a regular `users/{uid}` doc in Firestore — they signed up like anyone. The intern-ness is a *cross-cut*, layered on top via the allowlist. They keep their saved games, profile, coachTone, everything. Do not fork the user model.

---

## 5. Phasing — 4 PRs

| PR | Branch | Scope | LOC | Unblocks |
|---|---|---|---|---|
| CMIP-1.A | `cmip/auth-and-chrome` | Allowlist + `isIntern` propagation + site-wide employee chrome | ~600 | 1.B and 1.C | ✅ merged 2026-05-17 (PR #20) |
| CMIP-1.B | `cmip/flag-capture` | Flag button + Supabase capture + **intern nav surface restriction** | ~550 | 1.C, eval feeder | |
| CMIP-1.C | `cmip/intern-dashboard` | `/intern` dashboard, submission authoring flow, **pacing-aware quota widget** | ~750 | Submitted-pair data | |
| CMIP-1.D | `cmip/admin-dashboard-and-export` | **Admin progress dashboard for all interns** + JSONL export for eval | ~500 | Phase 1.C synthetic-tester augmentation | scope expanded 2026-05-17 |

### 5.1 PR CMIP-1.A — Intern auth + site-wide chrome reskin (~600 LOC)

**Branch:** `cmip/auth-and-chrome`

**New files:**
- `src/lib/intern/allowlist.ts` — server-only. `isAllowlistedIntern(email): Promise<boolean>`. Reads from Supabase `intern_allowlist` table; in-memory cache with 5-min TTL.
- `src/lib/intern/supabase.ts` — server-side Supabase client. Service role key, never exposed to browser.
- `src/hooks/useViewer.ts` — replaces or wraps existing `useUser`-style hook. Returns `{user, isIntern, loading}`. Reads `isIntern` from `/api/users/me` payload (extended below).
- `src/components/intern/EmployeeChrome.tsx` — wraps `_app.tsx` or layout. Reads `useViewer()`; if `isIntern`, applies the chrome (top border accent, header pill, footer text). Renders children unchanged otherwise.
- `src/components/intern/EmployeePill.tsx` — the `EMPLOYEE` badge for the header.
- `src/components/intern/InternalNavLinks.tsx` — nav items that only render when `isIntern`.
- `src/components/intern/InternalHomeCard.tsx` — the homepage hero replacement for interns.
- `src/pages/intern/index.tsx` — landing page placeholder. v1.A ships with just *"You're an intern. Submissions and quota land in CMIP-1.C."* — enough to verify routing.

**Edits:**
- `src/app/api/auth/google/callback/route.ts` — after session is created, call `isAllowlistedIntern(email)` and embed `isIntern: boolean` in the JWT claim.
- `src/app/api/auth/signin/route.ts` (email/password) — same allowlist check, same claim.
- `src/lib/auth/session.ts` — extend `Session` type with `isIntern: boolean`.
- `src/app/api/users/me/route.ts` — return `isIntern` in payload.
- `src/app/layout.tsx` (App Router) and `src/pages/_app.tsx` (Pages Router) — wrap content in `<EmployeeChrome>`. Both routers because the codebase mixes them per CLAUDE.md.
- `src/components/Header.tsx` (or equivalent — verify path during build) — conditionally render `<EmployeePill>` and `<InternalNavLinks>`.
- `src/pages/index.tsx` — conditionally render `<InternalHomeCard>` above the public hero when `isIntern`.
- The profile dialog is **not** modified (resolved 2026-05-17 — no customer-product impact).
- `CLAUDE.md` — add Supabase to the persistence layers table; add a §Intern Mode subsection under §Auth model.

**Supabase setup (one-time):**
- New project on Supabase (or reuse existing if one exists). Service role key + URL into `.env.local`.
- Migration file at `supabase/migrations/0001_intern_allowlist.sql`:
  ```sql
  create table intern_allowlist (
    email text primary key,
    full_name text,
    added_at timestamptz not null default now(),
    cohort text not null default 'cmip-2026'
  );
  ```
  (`full_name` nullable for v1; can be backfilled later.)
- **Seed values (resolved 2026-05-17):**
  ```sql
  insert into intern_allowlist (email) values
    ('jadhavpushkar196@gmail.com'),
    ('akshajshriv10@gmail.com'),
    ('s-annapureddyp@bsd405.org');
  ```
  More interns added later by direct SQL or by a CMIP-1.D-follow-up admin UI.

**Admin role setup (resolved 2026-05-17):** Aayan's CM email is **aayanhetamsaria4@gmail.com** (not kapilhetamsaria@gmail.com — that's a Claude-only address). For CMIP-1.D's admin export pages to be reachable, the Firestore `users/{uid}` doc for aayanhetamsaria4@gmail.com needs `role: "admin"`. This is a one-time write Aayan does via the existing Firestore admin path before CMIP-1.D ships (not a CMIP-1.A blocker).

**Acceptance gate:**
- A non-allowlisted user signs in → no employee chrome visible anywhere on chessmasti.com. Site looks exactly as it does today.
- An allowlisted user signs in → EMPLOYEE pill in header, internal home card on `/`, top accent border, footer text, `/intern` landing page reachable.
- `npx tsc --noEmit` clean.
- Manually verified on dev: removing email from `intern_allowlist`, signing out, signing back in → chrome reverts to customer.

### 5.2 PR CMIP-1.B — Flag-response capture + intern nav surface restriction (~550 LOC)

**Branch:** `cmip/flag-capture`

**New files:**
- `src/components/intern/FlagButton.tsx` — small button (icon + "Flag") rendered next to assistant message bubbles. Hidden unless `isIntern`.
- `src/components/intern/FlagModal.tsx` — modal with category dropdown + optional note + submit. On submit, gathers context (see below) and POSTs.
- `src/app/api/intern/flag/route.ts` — handler. Requires intern session. Reads `contextId` from request, fetches cached chat context server-side, normalizes payload, inserts into Supabase `intern_flags`.
- `src/lib/intern/captureContext.ts` — server-only. Given `contextId` + `flaggedMessageId`, returns the full normalized capture payload (chat history, PGN, FEN at flag, message content + metadata).

**Edits:**
- `src/components/AICoachChat.tsx` — for each assistant message, render `<FlagButton>` (which itself no-ops when not intern).
- `src/sections/layout/NavMenu.tsx` — **surface restriction (resolved 2026-05-17)**: when `useViewer().isIntern === true`, the hamburger nav shows ONLY `Home`, `Play`, `Analysis`. The other 7 items (Practice, Openings, Scout, Database, Player Feedback, Site Stats, Profile) are filtered out. `/profile` remains reachable via the UserMenu avatar dropdown (account-settings access kept; nav clutter removed). Customer view unchanged.
- `src/lib/auth/requireAuth.ts` (or wherever route guards live) — add `requireIntern()` variant.

**Supabase migration `20260517190000_intern_flags.sql`:**
```sql
create table intern_flags (
  id uuid primary key default gen_random_uuid(),
  intern_email text not null references intern_allowlist(email),
  intern_uid text not null,
  chat_session_id text,                  -- nullable, see schema notes in migration
  flagged_message_id text not null,
  flagged_message_content text not null,
  flagged_message_index integer not null,
  flagged_message_tier text,             -- nullable, see schema notes
  prompt_version text not null,
  chat_history jsonb not null,
  game_pgn text,                         -- nullable: not all chats analyze a game
  fen_at_flag text,
  flag_category text not null check (flag_category in ('bad','inaccurate','incomplete')),
  why_wrong text not null check (length(why_wrong) >= 30),       -- merged in 2026-05-17
  ideal_response text not null check (length(ideal_response) >= 50),  -- merged in 2026-05-17
  flagged_at timestamptz not null default now()
);
create index on intern_flags (intern_email, flagged_at desc);
```

**Capture-and-author merge (resolved 2026-05-17 mid-CMIP-1.B build):** the original plan decoupled "flag now, author the ideal response later on the dashboard" (CMIP-1.C). User pushed back during manual testing: flagging without explanation produces useless rows, and authoring while the bad response is fresh produces better data. So `why_wrong` (≥30 chars) and `ideal_response` (≥50 chars) are now captured **in the same modal as the flag**, both required. CMIP-1.C is correspondingly simpler — it becomes a viewer + quota dashboard, not an author surface. The "pending vs. submitted" tab split goes away; every flag IS a submission.

**Acceptance gate:**
- Intern flags a response → row appears in `intern_flags` within 2 s of click.
- All fields populated (NOT NULL respected). Chat history JSON parses cleanly.
- Non-intern sees no Flag button anywhere.
- Direct call to `/api/intern/flag` from a non-intern session → 403.
- One Vitest unit test on `captureContext.ts` (mocked cache) + one Playwright integration test (flag from preview deploy).

### 5.3 PR CMIP-1.C — Intern dashboard (~700 LOC)

**Branch:** `cmip/intern-dashboard`

**New files:**
- `src/pages/intern/submissions/index.tsx` — list view. Pending + Submitted tabs. Quota widget on top.
- `src/pages/intern/submissions/[id].tsx` — authoring view. Board + chat history + flagged-message highlight + ideal-response textarea + submit.
- `src/components/intern/QuotaWidget.tsx` — pacing-aware: shows "6 of 10 this week · 🟢 On track · Streak: 3 weeks" or "3 of 10 · 🟡 2 behind pace" or "Pre-program · 2 submitted (ahead of schedule)" depending on `programStartMs` and `delta`. Reads from `/api/intern/quota`.
- `src/components/intern/FlaggedMessageReplay.tsx` — read-only chat-history renderer that highlights `flagged_message_id` in red.
- `src/app/api/intern/quota/route.ts` — returns `PacingResult` for the logged-in intern: `{ submittedThisWeek, target, status: "pre-program" | "on-track" | "behind" | "ahead", delta, streakWeeks, programStartMs, weekStartMs }`.
- `src/app/api/intern/submissions/list/route.ts` — returns intern's flags split by `pending` vs `submitted`.
- `src/app/api/intern/submissions/[id]/route.ts` — single submission detail (GET) + submit ideal response (POST).

**Edits:**
- `src/pages/intern/index.tsx` — replace placeholder with real landing: quota widget + "Continue dogfooding" CTA + "Author pending submissions" CTA.

**Supabase migration for CMIP-1.C:** **NOT NEEDED.** The original plan added `ideal_response` and `submitted_at` columns as a phase-2 alter. With the capture-and-author merge in CMIP-1.B, those columns already exist as `ideal_response` (NOT NULL) and `flagged_at` (which is now also effectively the submitted_at). No additional schema work in 1.C.

**Quota + pacing calculation (refined 2026-05-17):**

- **Timezone**: `America/Los_Angeles` (PT). All ISO week boundaries computed in PT.
- **Program start date**: **2026-06-30** (Tuesday). Before this date, pacing is disabled — status is always `Pre-program — anything is ahead of schedule`.
- **"This week"**: current Mon 00:00 → Sun 23:59 PT.
- **Submissions count**: rows where `submitted_at` falls in this week's window AND `intern_email` matches.
- **Target**: hardcoded 10 (per intern per week) for v1; configurable per-intern in `intern_allowlist` as a follow-up.
- **Pacing (only after 2026-06-30)**:
  ```
  fractionThroughWeek = (nowMs − weekStartMs) / weekDurationMs   // 0 → 1
  expected = fractionThroughWeek × target                         // 0 → 10
  delta    = actual − expected
  ```
- **Status pill** (only computed when on/after 2026-06-30):
  - `🟢 On track` — `|delta| < 2`
  - `🟡 Behind` — `delta ≤ −2` (shown as "N behind pace")
  - `🔵 Ahead` — `delta ≥ +2` (shown as "N ahead — strong week")
- **Pre-program label** (when `now < 2026-06-30 PT`): `Pre-program · X submitted (any work counts as ahead)`. No red/yellow ever surfaces before start date.
- **Streak**: consecutive prior weeks (in PT) where the intern hit ≥ 10 submissions. Resets to 0 on any < 10 week. Weeks before 2026-06-30 don't count toward streak.

**Where pacing logic lives:**
- `src/lib/intern/pacing.ts` (server-only) — pure function `computePacing({ submittedThisWeek, target, nowMs, weekStartMs, weekDurationMs, programStartMs }) → PacingResult`. Easy to unit test; no React or Supabase coupling.
- The `/api/intern/quota` endpoint calls into it; the intern's `<QuotaWidget>` consumes its output as JSON.

**Acceptance gate:**
- Intern flags 3 responses on Surface A, then opens dashboard → sees 3 in Pending, 0 in Submitted.
- Authors and submits 1 → that row moves to Submitted, quota widget shows "1 of 10 this week".
- Non-intern hitting `/intern/*` or `/api/intern/*` → 403.
- Mobile rendering of the authoring view is usable (chat history scrollable, textarea ≥ 8 lines).
- 1 Playwright integration test covering flag → author → submit → appears in submitted list.

### 5.4 PR CMIP-1.D — Admin progress dashboard + JSONL export (~500 LOC)

**Scope expanded 2026-05-17.** Originally an export-only follow-up; user explicitly asked for visibility into all interns' progress, "even the ones to be added." Dashboard is now the primary surface; export is a secondary capability on the same page.

**Branch:** `cmip/admin-dashboard-and-export`

**New files:**
- `src/pages/admin/intern-data/index.tsx` — admin-only page (gated by `user.role === "admin"` for `aayanhetamsaria4@gmail.com`). Two sections:
  1. **Roster + progress table** (primary). One row per intern, **auto-discovered from `intern_allowlist`** so any intern added via `scripts/intern/add-to-allowlist.mjs` shows up on next page load without code changes. Columns: name (or email if no display name), this-week submissions vs target with status pill (`🟢 / 🟡 / 🔵 / Pre-program`), streak, all-time submissions, conversion (flags → submitted), last activity. Sortable. Default sort: status (`🟡 Behind` first, then `🟢`, then `🔵`, then `Pre-program`) so attention goes where it's needed.
  2. **Export panel**. One button: "Download submissions as JSONL." Same schema as before. Includes a toggle to include/exclude `intern_email` attribution.
- `src/pages/admin/intern-data/[email].tsx` — per-intern detail. Last 8 weeks bar chart of submissions, recent pending (unsubmitted) flags list, and a "send nudge" placeholder (CMIP-1.D.1 follow-up).
- `src/app/api/admin/intern-data/roster/route.ts` — returns the full roster + per-intern progress (joins `intern_allowlist` LEFT with aggregated `intern_flags` data). Admin-only.
- `src/app/api/admin/intern-data/detail/[email]/route.ts` — per-intern detail data.
- `src/app/api/admin/intern-data/export/route.ts` — streams JSONL of submitted rows. Schema:
  ```jsonc
  {
    "schema_version": "1.0.0",
    "submission_id": "uuid",
    "submitted_at": "2026-05-17T18:32:11Z",
    "context": { "chat_history": [...], "game_pgn": "...", "fen_at_flag": "..." },
    "bad_response": { "content": "...", "tier": "flagship", "prompt_version": "2.0" },
    "ideal_response": "...",
    "flag_metadata": { "category": "bad", "note": "..." }
    // intern_email omitted by default; include via ?include_attribution=1
  }
  ```
- `scripts/intern/export-submissions.mjs` — CLI variant for local export → file.

**Edits:**
- Existing admin pattern: confirm `users/{uid}.role === "admin"` is set for `aayanhetamsaria4@gmail.com` (one-time Firestore write) before this PR ships.

**Roster query (Supabase, simplified):**
```sql
select
  a.email,
  a.cohort,
  count(f.id)            filter (where f.flagged_at  >= week_start) as flags_this_week,
  count(f.id)            filter (where f.submitted_at >= week_start) as submitted_this_week,
  count(f.id)            filter (where f.submitted_at is not null)   as submitted_all_time,
  count(f.id)                                                        as flags_all_time,
  max(coalesce(f.submitted_at, f.flagged_at))                        as last_activity
from intern_allowlist a
left join intern_flags f on f.intern_email = a.email
group by a.email, a.cohort
order by a.email;
```
Pacing status + streak are computed in JS (using `computePacing` from CMIP-1.C's `src/lib/intern/pacing.ts`) so business logic stays in one place. Streak is computed via a second query that buckets `submitted_at` into ISO weeks.

**Privacy posture:**
- Aayan-only. No intern can ever reach `/admin/intern-data/*` (route guard checks `users.role === "admin"`).
- Interns can NOT see each other's stats. The personal `<QuotaWidget>` on `/intern` shows only the logged-in intern's own numbers (matches plan §8 Q5).

**Acceptance gate:**
- Aayan signs in → `/admin/intern-data` shows the 3 cohort interns + any test entries. All show `Pre-program` status today (before 2026-06-30).
- Add a new intern via `add-to-allowlist.mjs` → refresh page → new intern appears with `0 of 10 · Pre-program`.
- Non-admin (including interns themselves) hitting `/admin/intern-data` → 403.
- JSONL export returns valid newline-delimited JSON.
- All-time + this-week counts match a hand-counted spot check on a fresh seed.

---

## 6. Auth model & privacy

### 6.1 Allowlist mechanics

- Source of truth: `intern_allowlist` table in Supabase.
- Managed by Aayan via direct SQL (v1) or `/admin/intern-data/allowlist` UI (v1.1, follow-up — not in this plan).
- Allowlist check happens at session-creation time only. Sessions are JWT-signed and don't re-check. Implication: removing an intern from the allowlist takes effect on their next sign-in.
- Cohort field allows future cohorts (`cmip-2027`, etc.) without breaking current data.

### 6.2 Privacy posture

- **Interns can only flag their own sessions.** The flag endpoint reads the `cm_session` cookie's `uid` and only accepts flags for chat sessions owned by that uid. Customer sessions are inaccessible. This is the entire privacy story for v1.
- **`intern_email` is captured.** Interns are not anonymous to Aayan. This is appropriate for an employment-style relationship and is implied by the weekly-quota model.
- **Export omits `intern_email` by default.** Downstream eval consumers (the synthetic-tester, eventually a Mastermind few-shot loader) get the (bad, ideal) pair without attribution. Attribution available via `?include_attribution=1` for legitimate auditing.

### 6.3 What goes in the JWT vs. what doesn't

- JWT claim: `isIntern: boolean` only. No PII beyond what's already in the session.
- Cohort, full_name, allowlist metadata: fetched server-side when needed. Not in cookie.

---

## 7. Supabase schema summary

Single migration sequence in `supabase/migrations/`:

```
0001_intern_allowlist.sql  -- CMIP-1.A
0002_intern_flags.sql      -- CMIP-1.B
0003_intern_submissions.sql -- CMIP-1.C (alters flags, adds index)
```

Three indexes total: `intern_allowlist.email` (pk), `intern_flags(intern_email, flagged_at desc)`, `intern_flags(intern_email, submitted_at) where submitted_at is not null`.

At 10 interns × 10 submissions × 52 weeks = 5,200 rows/year. No partitioning needed.

---

## 8. Open design questions (with proposed defaults)

Resolve before the relevant PR ships.

| # | Question | Proposed default | When to revisit |
|---|---|---|---|
| 1 | Allowlist source: env var vs. Supabase table | **Supabase table** (managed without redeploy) | When cohort count > 50 |
| 2 | Weekly quota — hard block at 10 or soft display? | **Soft display** (no blocking). Pressure is the relationship with Aayan, not UI gating | After 4 weeks of data |
| 3 | Can interns flag *each other's* sessions? | **No** — only their own. Privacy + scope | When customer-feedback workstream lands |
| 4 | Customer feedback — do customers ever flag? | **Out of scope.** Separate workstream | Post-CMIP-1.D |
| 5 | Internal leaderboard — shown to interns? | **Yes, but private** (each intern sees rank but not others' names by default; opt-in to public). Engagement bet | After week 4 vibe-check |
| 6 | Schema versioning | Major bump on shape change; minor on additive | At v1.1 |
| 7 | "Better response" length cap | **No cap.** Soft target: 50–500 words | If we see >2k word essays |
| 8 | Flag categories — what's the list? | **Resolved 2026-05-17: Bad / Inaccurate / Incomplete.** Expandable in admin | After 200 flags |
| 9 | Should the employee chrome show on mobile? | **Yes** — same chrome, responsive | If layout breaks |
| 10 | Top accent color for "internal" indicator | **Resolved 2026-05-17: deep blue, applied site-wide (whole intern view is blue-themed, not just accent).** | After design review |
| 11 | Pending-forever flags — auto-archive after N weeks? | **No** — let them accumulate. The intern's own dashboard handles the noise via the Pending tab | If a backlog exceeds 100 |
| 12 | Notify intern when a new week resets the quota? | **No notification.** The dashboard is where they look | If retention dips |
| 13 | Export — pull or push to Mastermind eval? | **Pull (endpoint).** Push (write to `/audit/findings/`) is a CMIP-1.D follow-up | When 1.C synthetic-tester wants live data |
| 14 | Profile dialog 5th tab — call it "Internal" or something warmer? | **Resolved 2026-05-17: no 5th tab.** All intern UI lives at `/intern`; the consumer profile dialog is untouched. | n/a |

---

## 9. Cross-cutting concerns

### 9.1 Cost model

Storage: ~5,200 rows × ~30 KB/row (chat history is the bulk) = ~150 MB/year. Supabase free tier (500 MB) covers v1. No concerns.

Compute: the flag endpoint is a thin write. The export endpoint is a streamed read. No LLM calls in this entire workstream — it's pure data plumbing. **Mastermind eval costs are downstream, not in this PR.**

### 9.2 Observability

- Vercel Analytics on `/api/intern/flag` and `/api/intern/submissions/[id]` (latency p50/p95).
- A weekly cron (CMIP-1.D follow-up — not in v1) that posts a Slack/email summary: `{total flags this week, total submissions, per-intern breakdown, conversion rate}` to Aayan.

### 9.3 Security

- All `/api/intern/*` endpoints require `requireIntern()` server-side. Browser checks (`isIntern` in `useViewer`) are UX-only, never security.
- Supabase service role key is server-only. Never shipped to browser.
- The flag endpoint sanitizes `flag_note` (max 500 chars, no HTML). The ideal_response field allows markdown-style line breaks but no executable content (rendered with `react-markdown`, no `rehype-raw`).

### 9.4 Failure handling

- Flag endpoint fails → toast: "Couldn't capture — try again. Your context is preserved in chat." No data loss because the intern can re-flag from the same message.
- Supabase down → flag and submit endpoints return 503. Customer-facing site is unaffected (Supabase is not on the customer hot path).
- Cached context for an old `contextId` is missing → flag endpoint returns 422 "Session expired; please flag a fresher response." Annoying but rare (server cache TTL is long).

### 9.5 What this does NOT do

Per CLAUDE.md §Things not to do (*"Don't add features, retries, fallbacks, or telemetry beyond what's asked"*):

- No retry queue. A failed flag is a re-click.
- No optimistic UI on submit. Wait for the 200, show the toast.
- No client-side caching of submissions list. Server is authoritative; refetch on focus.
- No "draft" state for ideal responses. The textarea is ephemeral until submit; refresh = lost. v1 tradeoff. Revisit if interns complain.

---

## 10. Mandatory call-site matrix

Per [MASTERMIND_TOOLS.md `Mandatory call sites`](MASTERMIND_TOOLS.md#mandatory-call-sites--the-anti-built-but-never-called-contract) — every new endpoint and table has a designated first consumer. No "built but never called."

| New thing | First consumer | Ships in |
|---|---|---|
| `intern_allowlist` table | `isAllowlistedIntern()` in `/api/auth/google/callback` | CMIP-1.A |
| `isIntern` JWT claim | `useViewer()` → `<EmployeeChrome>` | CMIP-1.A |
| `<EmployeeChrome>` | Wraps `_app.tsx` + `layout.tsx` | CMIP-1.A |
| `<EmployeePill>` | Rendered in `Header.tsx` when `isIntern` | CMIP-1.A |
| `/intern/index.tsx` | Linked from `<InternalHomeCard>` and header nav | CMIP-1.A |
| `intern_flags` table | `POST /api/intern/flag` writes; `/intern/submissions` reads | CMIP-1.B |
| `<FlagButton>` | Rendered on every assistant message in `AICoachChat.tsx` | CMIP-1.B |
| `/intern/submissions` | Linked from `<InternalNavLinks>` + landing card CTA | CMIP-1.C |
| Quota widget | `/intern/index.tsx` landing + `/intern/submissions` list | CMIP-1.C |
| Export endpoint | `scripts/export-intern-submissions.ts` CLI; future Mastermind synthetic-tester augmentation | CMIP-1.D |

---

## 11. Per-PR merge contract

Same shape as MASTERMIND_BUILD_PLAN.md §11, adapted:

1. **Branch hygiene**: branched off `main`. Not stacked.
2. **TSC clean**: `npx tsc --noEmit` passes.
3. **Tests**: every new endpoint has at least one Vitest unit test; CMIP-1.B and 1.C each have one Playwright integration test on preview.
4. **Migration applied**: Supabase migration runs cleanly on a fresh DB and on the existing DB (idempotent).
5. **Manual verification**: PR description includes screenshots of (a) employee chrome on `/`, (b) the relevant intern flow, (c) Supabase row(s) created.
6. **Mandatory call site declared**: PR description quotes the relevant row from §10.
7. **CLAUDE.md updated**: when CMIP-1.A merges, Supabase tier added to §Persistence layers; §Auth model gets an §Intern Mode subsection.
8. **Failure mode documented**: any new failure path added to a section in this plan (§9.4) or to MASTERMIND_FAILURE_MODES.md if it touches the agent path.
9. **Co-authored commit message**: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` on AI-assisted commits.

**Auto-merge eligibility:** per [feedback_auto_merge_phase3.md](../../memory/feedback_auto_merge_phase3.md), CMIP-1.A and CMIP-1.B may auto-merge with `--merge` when CI is green and nothing weird (these are pure plumbing). **CMIP-1.C and CMIP-1.D require user review** — UX choices (chrome accent color, dashboard layout, quota framing) are scope-shaping and Aayan-owned per [feedback_mastermind_plan_first.md](../../memory/feedback_mastermind_plan_first.md).

**Scope-change rule:** technical deviations OK with a PR-description note. Scope changes (new flag categories beyond the 5 listed, changes to the chrome surfaces in §3.2, expansion to customer feedback) require asking first.

---

## 12. Out of scope for this plan

For clarity:

- **Customer feedback.** Customers flagging bad responses is a separate workstream. Different privacy story, different incentive design.
- **Admin allowlist UI.** v1 manages allowlist via direct SQL. UI is a CMIP-1.D follow-up.
- **Intern-to-intern collaboration.** No commenting on each other's submissions. No paired authoring.
- **Live tuning.** The export endpoint produces data; what we do with that data (fine-tune, few-shot, regression test) is downstream and unscoped here.
- **Multi-cohort allowlist with permissions.** v1 = one cohort, equal permissions.
- **i18n of the employee chrome.** English only for v1.
- **Public attribution.** No "Submissions powered by [Intern Name]" anywhere customer-visible. CMIP is an internal program, framed accordingly.
- **OSS framing of the program.** Per [feedback_no_open_source_framing.md](../../memory/feedback_no_open_source_framing.md), nothing in this portal's copy or external-facing surface uses "open source" / "community-driven" language. The CMIP is presented as an internship program.

---

## 13. Open questions — RESOLVED 2026-05-17

User answers captured verbatim. Plan body updated in-place to reflect each decision; this section is the audit trail.

| # | Question | Answer | Plan section updated |
|---|---|---|---|
| A | Cohort emails — who's currently in CMIP? | **jadhavpushkar196@gmail.com, akshajshriv10@gmail.com, s-annapureddyp@bsd405.org** (more added later) | §5.1 seed values |
| B | Accent color | **"Deep blue works (make the entire site Blue themed instead of Orange)."** Full theme reskin, not just an accent border. Customer view unchanged. | §3.2 row "Brand color — site-wide" |
| C | Flag categories | **"all Bad/innacurate/incomplete responses"** → three categories: **Bad / Inaccurate / Incomplete** | §2.1, §5.2 schema |
| D | Admin email | **aayanhetamsaria4@gmail.com** is the CM admin (kapilhetamsaria@gmail.com is for Claude only, not CM). Firestore `users/{uid}.role = "admin"` to be set before CMIP-1.D. | §5.1 admin role setup |
| E | Supabase — existing or fresh? | **Fresh project under a new "Chess Masti" Supabase org** (Aayan creates the org during CMIP-1.A setup; needs no prior infra) | §5.1 Supabase setup |
| F | Profile dialog 5th tab? | **"Keep everything at /intern, we don't need to impact the consumer product itself."** No 5th tab. Profile dialog untouched. | §3.2, §5.1 |

CMIP-1.A is unblocked.

**One pre-CMIP-1.A action Aayan owns:** create the "Chess Masti" Supabase org and a fresh project inside it, then share `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` so they can land in the dev `.env.local`. Everything else is in-PR work.

---

## 13a. Round-2 scope refinements — RESOLVED 2026-05-17 (after CMIP-1.A merged)

After CMIP-1.A merged (PR #20), Aayan added three scope decisions that affect CMIP-1.B → 1.D. Captured here as the audit trail; the relevant phase sections (§5.2, §5.3, §5.4) already reflect them.

| # | Refinement | Answer | Section updated |
|---|---|---|---|
| G | Each intern should be able to see their own progress vs. expectations (ahead/behind) | **Yes — pacing-aware `<QuotaWidget>` in CMIP-1.C.** Linear pacing model: `expected = (elapsedFractionOfWeek) × 10`. Three-state pill (🟢 on-track / 🟡 behind / 🔵 ahead) at ±2 thresholds. | §5.3 |
| H | Aayan should see all interns' progress (including future ones) | **Yes — admin progress dashboard at `/admin/intern-data` in CMIP-1.D.** Auto-discovers interns from `intern_allowlist` (zero-config when new interns added). Sortable roster table + per-intern detail view. Scope expanded from export-only (~200 LOC) to full dashboard (~500 LOC). | §5.4 |
| I | Intern view should only surface `/`, `/play`, `/analysis` (everything else is noise) | **Yes — NavMenu filtered when `isIntern`.** Hide Practice, Openings, Scout, Database, Player Feedback, Site Stats, Profile. Keep `/profile` reachable via the UserMenu avatar dropdown for account settings. | §5.2 |
| J | Pacing timezone | **`America/Los_Angeles` (PT).** ISO weeks Mon→Sun in PT. | §5.3 |
| K | Program start date — pacing pressure activates when? | **2026-06-30 (Tuesday).** Before this date: status is always `Pre-program — any work counts as ahead`. No red/yellow ever surfaces. First officially tracked week is Mon 2026-06-29 → Sun 2026-07-05. Streaks don't accrue before program start. | §5.3 |

**Why move admin progress out of "follow-up" and into CMIP-1.D first-class scope:** export endpoints are useless without the dashboard answering "who needs nudging?" first. Aayan explicitly framed this as a need: "I should be able to access the progress of all interns (even the ones to be added)." The auto-discover-from-allowlist design means CMIP-1.D never needs to be touched again as interns are added to the program.
