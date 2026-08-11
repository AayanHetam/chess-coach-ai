# Program-first restructure — from "AI coach" to a chess learning plan

Direction set by Aayan, 2026-08-10:

> "Really what we are doing here is restructuring from purely an AI coach to a
> full Chess learning PLAN. We should take the spotlight off the coach and onto
> the program with daily reminders and tasks built to help people learn chess
> faster."

This doc is the audit of what already exists, the one strategic distinction that
shapes the whole thing, and the ordered execution plan.

---

## 1. The distinction that matters: front door vs. product

Do **not** retire "AI chess coach" as a market position. Two different jobs:

| Job | Owns | Language |
|---|---|---|
| **Acquisition** — get strangers here | ~20 AEO pages in `src/app/` (`free-ai-chess-coach`, `ai-chess-coach-for-kids`, `stockfish-ai-chess-coach`, `decodechess-alternative`, …), sitewide metadata, landing SEO | "AI chess coach" — keep |
| **Retention** — make them come back | `/plan`, the daily session, reminders, streaks | "Your plan / your program" — this is the pivot |

`AEO_GROWTH_PLAN.md`'s north star is literally *"Chess Masti AI = the free AI
chess coach"*, and the whole page corpus targets those queries. That's an asset
built on real search demand; nobody searches "chess learning plan app" at
volume. Burning it buys nothing.

**The argument for the pivot is the MAU math, not the positioning.** The goal is
1M *monthly active* users by June 2027 ([[project_business_goals]]). A coach is a
tool you summon; a plan is a thing that summons you. Reminders are the mechanism
that turns a visitor into an *active* user. So this is the retention engine the
target requires, and it should be judged on return-rate, not on brand feel.

Corollary for scope: **change the in-app experience and the post-signup surface;
leave the marketing/SEO layer alone** until there's evidence to move it.

Timing note: `AEO_GROWTH_PLAN.md` sets an Aug 31 2026 checkpoint that's supposed
to decide whether search carries the next quarter. It depends on Google Search
Console impressions — and there is **no `google-site-verification` tag anywhere**
in the app, so that checkpoint is currently unmeasurable. The decision will be
made on judgment regardless; shifting effort to retention stands on its own.

---

## 2. What already exists (audited 2026-08-10)

Far more is built than the UI suggests. **The program is real but unreachable,
and it doesn't remember you.**

### Real and working
- **`/plan`** (`src/pages/plan.tsx`, 549 lines) — a genuine program home: welcome
  header, rating + streak tiles, resume card, placement prompt, a 7-cell "Your
  week" grid, "Today's training", concept lesson, goals, curriculum map. Its copy
  is *already* program-language — **zero coach framing on this page.**
- **`SessionRunner`** (`src/components/curriculum/SessionRunner.tsx`) — end-to-end
  daily session: builds the session, fetches puzzles live with a 4-step fallback
  ladder, grades, updates rating, writes SRS cards, bumps the streak.
- **Curriculum libraries** (`src/lib/curriculum/`) — 12-unit `syllabus.ts`,
  `mastery.ts`, `dailyPlan.ts`, `weekPlan.ts`, per-theme SM-2 in
  `puzzleThemeSrs.ts`, `streak.ts`, `resume.ts`, `playToLearn.ts`. Unit-tested.
- **Every line of reminder code** — `vercel.json` cron declaration,
  `/api/send-reminders` (VAPID push with 404/410 pruning, email fallback,
  20h-active skip, `CRON_SECRET` guard), `src/lib/server/webpush.ts`,
  `src/lib/pushClient.ts`, a real `public/sw.js`, Resend wrapper, HMAC one-click
  unsubscribe. `web-push` and `resend` are installed dependencies.

### The five gaps that make it not-a-program

**G1 — The program is unreachable.** `/plan` appears in **zero** navigation.
`NavPill` lists Play, Analyze, Practice, Learn, Scout. `AppDrawer` omits it too.
The homepage (2451 lines) contains **no link to `/plan` or `/onboarding`** and its
hero CTA is "Analyze a game". Post-login lands on `/`. A returning user has to
type the URL from memory.

**G2 — Progress is device-local and losable.** Streak, per-theme SRS cards,
puzzle stats and resume all live in `localStorage` via jotai. Firestore holds only
mirrors and config. Clear your cache and your "program" is gone; sign in on your
phone and it never existed. **For a coach that's a shrug; for a program it's
fatal.**

**G3 — The streak lies.** `bumpStreak` is called in exactly one place —
`SessionRunner`. Solving 50 puzzles on `/puzzles` does not advance your streak.
The single most important habit metric ignores the main training surface.

**G4 — There are no daily tasks, and nothing records completion.** "Today's
training" is *one sentence* plus a button. No task rows, no checkboxes, no
"3 of 5 done". `goals.puzzlesPerDay` is set in `GoalsCard` and then only ever
rendered as static text — nothing counts against it. The week grid shows planned
effort and **cannot** show a completed day, because completion is never stored
anywhere. There is also no persisted multi-day schedule: days 1–6 are an SRS
due-date projection recomputed on every page load, so "your week" silently
rewrites itself as stats change.

**G5 — Reminders send nothing.** All the code, none of the config:
- **No VAPID keys in any env file.** This also *hides the push opt-in switch
  entirely* (`GoalsCard` renders it only when `pushConfigured()`), so no user can
  ever create a subscription even if they want to.
- **Resend domain unverified** — every email send throws; the route still returns
  200 by design, so failures are invisible.
- **`CRON_SECRET` unset** — the endpoint is publicly callable where it's missing.
- **Nobody is opted in.** `reminderPrefs.enabled` is never defaulted true at
  signup or in onboarding; the only writer is a switch buried in the third card
  on a page nothing links to. The cron's query returns ~0 users.
- `vercel.json` declares **3 crons**; Vercel Hobby caps at 2 — needs checking
  against the actual plan.
- `reminderPrefs.hour` and `users.timezone` exist and are **never read** — the
  cron fires at a fixed 14:00 UTC for everyone.

---

## 3. Execution plan, ordered by leverage

### Tier 0 — Make the program reachable *(pure wiring; highest ratio)*
Nothing here needs new systems. It is the difference between a feature nobody
finds and the product's home.
1. Add **Plan** as the **first** item in `NavPill` and `AppDrawer`.
2. Post-login → `/plan` (Google callback default `returnTo`; `AuthDialog` has no
   redirect at all today).
3. Homepage: **"Start your plan"** as primary CTA, keep "Analyze a game" as
   secondary — the analysis path is the AEO conversion route and must survive.
4. `public/sw.js` opens `/learn` → point it at `/plan` (saves a redirect hop).
5. Render or delete `NavPill`'s `badge` prop — declared, passed by two callers,
   never rendered.

### Tier 1 — Make the program remember you *(correctness)*
6. Server-persist streak, SRS cards and stats; keep localStorage as cache, not
   source of truth. Fixes **G2** — without this, "your 30-day plan" is a claim
   the product can't keep.
7. Bump the streak from **every** training surface (`/puzzles`, placement,
   analysis-driven practice), not just `SessionRunner`. Fixes **G3**.

### Tier 2 — Daily tasks with completion *(the product change asked for)*
8. Turn "Today's training" into a real **task list** — discrete rows, each
   completable, with persisted per-day completion state.
9. Count against `goals.puzzlesPerDay`: "3 of 5 done today".
10. Week grid renders **completed / missed / today / upcoming** instead of only
    planned effort.

### Tier 3 — Make reminders actually arrive
**Founder-gated ops (Aayan only — I can't do these):**
- Generate VAPID keypair, set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`
  in Vercel. *This one unblocks the push opt-in UI as well as delivery.*
- Verify `chessmasti.com` DNS in Resend.
- Set `CRON_SECRET` in Vercel.
- Confirm the Vercel plan allows 3 cron jobs.

**Code:**
11. Ask for reminder consent **in onboarding**, and default
    `reminderPrefs.enabled` true at signup.
12. Honour `reminderPrefs.hour` + `users.timezone` instead of a fixed 14:00 UTC —
    both fields already exist and are ignored.
13. A test for `/api/send-reminders` — there is none, and it's now a load-bearing
    retention path.

### Tier 4 — In-app naming *(last, and narrow)*
Change coach framing **inside the app only**: `/puzzles` `<title>Puzzle Coach`,
`/practice`'s "with the AI coach", `/profile`'s "Your coaching profile".
**Leave `src/app/layout.tsx` metadata, the AEO pages, and the landing hero
alone** — that's the front door (§1).

---

## 4. Sequencing recommendation

Tier 0 first and on its own: it is a few hours of wiring, it is reversible, and
it changes the product's centre of gravity more than anything else on this list.
Tier 1 next, because Tier 2's completion state is worthless if it evaporates with
the browser cache. Tier 3's code can land in parallel but stays dark until the
four ops items are done.

Do **not** start Tier 4 until Tiers 0–2 are live — renaming things before the
program is reachable would remove the coach framing without putting anything in
its place.
