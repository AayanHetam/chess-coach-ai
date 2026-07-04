# Chess Masti — Status

Snapshot of every workstream as of **2026-06-21**.

This is the "what is actually in flight" doc. The roadmap lives in [Chess masti 2026 summer plan.md](Chess%20masti%202026%20summer%20plan.md). The strategic direction lives in [FUTURE_IDEAS.md](FUTURE_IDEAS.md). This file tracks state.

Update cadence: weekly, or after any PR that opens/closes a workstream.

---

## TL;DR

| Workstream | Phase | Status | Owner-of-record |
|---|---|---|---|
| Tactical grounding (model accuracy) | Stage 9 + async-grounding v2 SHIPPED | ✅ Validators live — #136 merged 2026-06-06, #154 (async-grounding) merged 2026-06-13 | Aayan |
| AI Puzzle Coach | PR-PC-1 shipped, PR-PC-2 next | **Live in `/preview/puzzles`**, plan-locked beyond | Aayan |
| AEO (Answer Engine Optimization) | Foundation + content shipping continuously | **Active continuous** | Aayan |
| CMIP (Intern Feedback Portal) | 1.A shipped; 1.B/1.C/1.D paused | **Paused**, restart targeted August 2026 | Aayan |
| Mastermind Phase 2.F (orchestrator UI) | Plan drafted | **Plan-review hold**, build starts ~Sep 2026 | Aayan + tech-lead |
| Mastermind Phase 3 (correlation) | Blocked on CMIP-1 finish | Not started | — |
| Cutover (`/preview/analysis` → `/analysis`) | **SHIPPED 2026-06-04 (PR #141)** | ✅ **Done & live** — `/analysis` is canonical (AnalysisImpl), `/preview/analysis` 308-redirects | Aayan |
| AI Opening Coach | Idea, no plan doc yet | **Future** | — |
| Personalized opening repertoire quiz | Idea | **Future** | — |
| Chrome Extension Web Store | Code done, admin step pending | **Paused**, half-day task | Aayan |
| Landing v2 (WebGL) | Built, parked in `_future/` | **Deferred to post-2.F** | — |

---

## Active workstreams

### Tactical Grounding — model accuracy
**This is the #1 priority for shipping better coach prose.** Goal: cut tactical hallucinations 40-60%.

- Eight-stage program, plan: [MASTERMIND_CONTEXT/PR_TACTICAL_DETECTOR_PLAN.md](MASTERMIND_CONTEXT/PR_TACTICAL_DETECTOR_PLAN.md).
- **Stages 1–8 shipped to `main`** (PR #121, 2026-06-01, commit `1820640`). Includes `src/lib/tactics/`, `src/lib/grounding/`, motif grounding validator, voter, prompt v3.1, streaming-branch validator wiring.
- **Stage 9 SHIPPED**: claim-class validators (`userVisibility`, `positionalClaim`, `mateInN`, `materialWin`) live on `main` — **PR #136 merged 2026-06-06**, code at `src/lib/mastermind/validators/*.ts` + tests.
- **Async-grounding v2 SHIPPED**: **PR #154 merged 2026-06-13** ("arm claim validators at all route sites"); `streamingStage9.ts` wires enforcement on the streaming path. See memory `project_stage9_validators_open` for the deferred items (M2 invariant + retry-gating).
- Known design tension: Stage 7 (Lc0 trigger/upgrade ranges don't overlap; upgrade path unreachable; veto path is what fires). Not blocking but documented.

### AI Puzzle Coach
A coaching layer over the puzzle surface — no competitor has this.

- Five-PR plan: [MASTERMIND_CONTEXT/PUZZLE_COACH_PLAN.md](MASTERMIND_CONTEXT/PUZZLE_COACH_PLAN.md) (drafted 2026-05-30).
  - **PR-PC-1 shipped**: PR #130 — interactive multi-turn coach at [/preview/puzzles](https://chessmasti.com/preview/puzzles). Big-board takeover.
  - Nav fix shipped (PR #132): Practice nav now points at `/preview/puzzles`.
  - **PR-PC-2 next** (target Sep 2026): voice unification + validator post-filter.
  - PR-PC-3: cold-start rating quiz.
  - PR-PC-4: SRS end-to-end.
  - PR-PC-5: weakness-driven daily queue.
- Plan PR open: **PR #110** (`docs/puzzle-coach-plan`) — review/merge pending.
- Recent infra fixes for the puzzle data path (puzzle CSV in `/public/` + fs-first / fetch-fallback loader): PRs #137, #138, commit `35ed3f7`. Important context: Vercel build hangs on >5MB static JSON imports — we use `fs.readFileSync` + `outputFileTracingIncludes` instead. Don't undo that.
- Craft bar: mirror `/preview/move-reveal` (ember reveal, glass, staggered prose).

### AEO (Answer Engine Optimization)
Own the "free AI chess coach" query in Google + ChatGPT + Perplexity + Gemini + Bing Copilot.

- Plan: [AEO_GROWTH_PLAN.md](AEO_GROWTH_PLAN.md). Scorecard: [AEO_SCORECARD.md](AEO_SCORECARD.md).
- **PR0 (measurement) through PR10 (cleanup) all shipped.** Highlights from the last few weeks:
  - HowTo schema + section anchors on `/how-it-works` (#128)
  - `@id` graph + `isPartOf` on `/faq` and `/vs`, `LearningResource` on `/best-free-ai-chess-coach` (#129)
  - Port of `/faq` `/how-it-works` `/architecture` `/vs` to Obsidian-Glass `aeoUi.tsx` (#131)
  - Public share-game review + scout report pages with OG cards (#133)
  - Wire `/analysis` Share-game button + migrate scout URL to `/share/scout/[id]` (#135)
  - June URL gaps: `/lichess-opponent-scout` + `/mistake-based-chess-puzzles` (#140)
- **Continuous workstream.** Branches still in the tree from in-progress AEO work include `feat/aeo-share-artifacts`, `feat/aeo-share-followups`, `feat/aeo-refactor-content-pages-to-aeoUi`, `feat/aeo-pr*` series. Most have already merged; remaining branches are landed-and-uncleaned.
- Reminder: JSON-LD must be plain `<script>`, never `next/script` — App Router defers `<Script>`, SSR HTML lacks the JSON-LD, crawlers see nothing (bit us on 21 AEO pages in PR #142).
- Adjacent: launch page says "10,000+ MAU" but the real number is ~100. Marketing-page-only fib — never extrapolate the 10k number to Anthropic, technical, or factual contexts.

### Cutover — `/preview/analysis` → `/analysis`
Replace the legacy analysis surface with the dark-glass design-OS surface.

**Status: ✅ SHIPPED & LIVE (2026-06-04, PR #141, commit `285bf9e`).** Verified on `main` (== `origin/main`) on 2026-06-21:
- `src/pages/analysis.tsx` is the canonical surface — a thin `next/dynamic` shell loading `AnalysisImpl` with `ssr: false` (keeps Vercel build from hanging on the ~8.4k-line file; stays SSR-able for `?insightId=` OG meta).
- `src/pages/preview/analysis.tsx` is a permanent **308 redirect** to `/analysis`, forwarding the query string verbatim (deep links + share permalinks keep resolving). Kept (not deleted) 30+ days for the Chrome extension + cached share-card URLs.
- Internal route refs already point at `/analysis` (e.g. `NavPill.tsx:39`).

**PR #61 is CLOSED, not pending** — it was the earlier flip attempt, superseded by **PR #141** which landed the cutover a different way. The `cutover/analysis-flip` and `cutover/analysis-flip-v2` branches are now stale historical artifacts (100+ commits behind main); ignore them.

**The desync crash + the whole polish sprint are also done** (audited 2026-06-21 — all 6 items already on `main`):

| Item | Status | Evidence |
|---|---|---|
| Master Games desync crash | ✅ Fixed | commit `ae4cf45` (replay on `displayFen`; panel mounted `fen={displayFen}`) |
| AuthDialog redesign | ✅ Shipped | commit `68099d1` — full dark-glass rebuild |
| NavPill Settings entry | ✅ Present | `NavPill.tsx:326` → ProfileDialog |
| Coach personality picker | ✅ Wired e2e | `AnalysisImpl.tsx` 6485 (localStorage state) / 8294–8297 (mount) / 3158–3260 (6-voice glass popover) |
| `Lc0DownloadBanner` on `/preview/*` | ✅ Mounted | `AnalysisImpl.tsx:8132` |
| Inline `EngineContinuation` / `MaiaContinuation` | ✅ Built (+ pill fallback) | `InsightContinuationInline` `AnalysisImpl.tsx:4278` |

Stale-comment note: `AnalysisImpl.tsx:679-680` still says "the new page hasn't surfaced the personality picker yet" — **wrong/stale** (the picker shipped); clean up on next touch.

**#136 is NOT a cutover dependency.** The Stage 9 validators run inside the `/api/enhanced-analysis` route, not the page — so the route flip and validator enforcement are independent. (An earlier version of this doc wrongly coupled them.) #136 remains its own open accuracy workstream; see the Tactical Grounding section.

Round-1 + Round-2 smoke findings already resolved (G7 / G4 / G11 / G13 fixed same-day 2026-05-29 in commits `80df7eb` / `b31db0e` / `d5abc3e` / `bec3a52`).

---

## Paused workstreams

### CMIP — Intern Feedback Portal
The upstream feeder for the Mastermind eval dataset. Interns flag bad coach responses and author ideal replies. Target: 1,200 paired (bad, ideal) examples by end of August 2026.

- Plan: [MASTERMIND_CONTEXT/PR_CMIP_1_PLAN.md](MASTERMIND_CONTEXT/PR_CMIP_1_PLAN.md). Supabase-backed. 4 PRs: CMIP-1.A → 1.D.
- **CMIP-1.A shipped 2026-05-24.** No PR since.
- Paused branches in the tree:
  - `cmip/auth-and-chrome`
  - `cmip/flag-capture`
  - `cmip/intern-dashboard`
  - `cmip/admin-dashboard-and-export`
- **Restart target**: August 2026 per summer plan.
- Phase relationship: CMIP is a **Phase 3 input**, not a Phase 2 gate. Mastermind Phase 2.F is not blocked by CMIP.

### Mastermind Phase 2 — Orchestrator UI (workstream 2.F)
The user-visible piece of the agentic coach: tool-using Claude inside `enhanced-analysis` with the orchestrator chain visible in the surface (which tools fired, which validators ran, why a claim is grounded). This is the strategic centerpiece — what makes Mastermind a real product, not architecture.

- Plan: [MASTERMIND_CONTEXT/PR_2F_PLAN.md](MASTERMIND_CONTEXT/PR_2F_PLAN.md) (drafted 2026-05-30). Surfaces the **$3.84M/yr at 1M MAU cost question** that needs tech-lead review.
- 7 open questions awaiting review.
- **Build start target**: July → realistically September 2026.

### Mastermind Phase 3 — CMIP-2 + correlation
Link real coach replies to flag/ideal pairs from CMIP and feed into the Mastermind eval set. **Blocked on CMIP-1 finish.**

### Chrome Extension — Web Store submission
"**Analyze with Chess Masti**" — Manifest v3 extension. Adds an orange "Analyze" button to Lichess + Chess.com game pages, extracts the PGN, opens `chessmasti.com/analysis` with the game pre-loaded.

- Code lives at [extension/](extension/) (manifest, content scripts for Lichess + Chess.com, icons). Web Store submission copy ready at [extension/STORE_LISTING.md](extension/STORE_LISTING.md). Roadmap at [extension/ROADMAP.md](extension/ROADMAP.md).
- Install + deep-link landing page on the site: [src/app/extension/page.tsx](src/app/extension/page.tsx).
- **Shipped infra** (May 2026, all merged): install pathway, listing copy, icons, `/privacy` disclosure, deep-link receive, auto-analyze handshake (PRs #37, #39, #45, #46, #48, #50). Privacy disclosure re-audit (PR #52).
- **What's left**: pure admin step — submit the Web Store form, attach privacy + listing copy, await review. Estimated **half a day**.
- **Why it matters strategically**: the install pathway is currently the easiest user-acquisition lever in the next 90 days — Lichess and Chess.com users are already mid-game, one click delivers them to our coach with their game loaded. This is the biggest deferred-lever risk in the whole roadmap. Pure admin task — do not let this be blocked behind code work. Summer plan target: submit end of June 2026.
- Loadable locally as unpacked extension from `chrome://extensions` → Developer mode → Load unpacked → select `extension/`.

### Landing v2 (WebGL chess landing)
Igloo-style 3D landing page built but parked in `_future/`. Preview lives at `/preview/landing-v2`. Roadmap: [FUTURE_LANDING_V2.md](FUTURE_LANDING_V2.md). Ship target: after Phase 2.F lands.

---

## Future workstreams (no plan doc yet)

These are committed strategic directions with no code or PR yet. Each needs a plan doc before implementation.

### AI Opening Coach
Walk a user through their actual opening repertoire from real games. Flag transposition errors and theory gaps against a studies corpus. Explain the **plans** at each branch (not just the moves).

- Heavily reliant on the `Icannos/chess_studies` dataset.
- Reuses existing opening-explorer code: [src/lib/repertoireParser.ts](src/lib/repertoireParser.ts), the chess.com / lichess import paths, and the 3-tier opening-explorer fallback.
- Plan-doc-first per the Mastermind workflow. **No plan doc yet.**
- Adjacent and distinct from the diagnostic "Personal opening tree from your games" — the opening tree is *diagnostic* (where you score W/D/L), the opening coach is *prescriptive* (what to play and why).

### Personalized opening repertoire builder
Cold-start onboarding quiz: ~5–10 questions (color preference, time control, aggression vs solidity, study budget, current rating) → recommended repertoire with concrete opening choices for White and both Black responses to 1.e4 and 1.d4.

- Solves the cold-start problem flagged in the Tier 1 competitor-gap list.
- Lives at `/onboarding/repertoire`.
- Writes into the existing `favoriteOpenings` field that the system prompt already reads.

### Structured personalized improvement plan
"What should I work on this week/month" — generated from game history, rating trend, detected weakness clusters. **Likely a Mastermind tool (`generate_study_plan`)** rather than a standalone UI once the agent loop ships.

---

## Open PRs (snapshot)

Ground-truth open PRs as of **2026-06-21** (`gh pr list --state open`):

| # | Updated | Title | Note |
|---|---|---|---|
| 147 | 2026-06-06 | feat(masters): in-panel move history + ↑↓ keyboard nav | Feature; check vs current masters panel |
| 146 | 2026-06-06 | docs(stage9): async-grounding v2 plan | Likely **obsolete** — #154 already implemented it |
| 110 | 2026-05-31 | docs: PUZZLE_COACH_PLAN.md | Plan doc |
| 105 | 2026-05-31 | fix(preview): force dark mode on `/preview/*` | Stale; verify still needed |
| 85 | 2026-05-30 | chore(docs): handoff 2026-05-30 | Stale handoff |
| 59 | 2026-05-30 | docs(mastermind): state-of-things briefing | Stale |

**Recently merged:** #186 (turn-1 timeout fix + Sonnet effort pin, 2026-06-22, squash `32e0610`).
**Already merged (were listed as "open" in the stale snapshot):** #136 (Stage 9 validators, 2026-06-06), #61 → superseded by #141 (cutover, 2026-06-04).

Refresh with `gh pr list --repo AayanHetam/chess-coach-ai --state open`.

---

## Known gotchas (rules of the road)

These have cost us real time. Read once.

- **Vercel build hangs on >5MB static JSON imports.** Diagnostic: the "Linting and checking validity of types" hang is actually chunk serialization. Fix: `fs.readFileSync` + `outputFileTracingIncludes`. Cost 6h on PR #53 before finding it.
- **Vercel preview builds don't fire on `feat/*` branches** in this project. Setting-level suppression in the Vercel project config. Not the Firebase block (which only affects auth flows on built previews). If you need a preview, push the branch and force one in the Vercel UI.
- **Lichess explorer is hard-401-blocked from all networks including Vercel.** Production source chain for master games: curated → Lichess (always fails) → chessdb.cn. Don't waste cycles "fixing" the 401.
- **JSON-LD must be plain `<script>`, never `next/script`** in App Router pages — `<Script>` defers, SSR HTML lacks the JSON-LD, crawlers see nothing.
- **`gh` defaults to upstream.** Always pass `--repo AayanHetam/chess-coach-ai`.
- **`Inspirit_project` root is not a git repo.** `cd chess-coach-ai/` for all git ops.
- **For parse/load errors, dump the input before speculating.** First catch should log the failing input. Saved a deploy cycle 4 → 1 on the snippet-dialog bug chain.
- **OpenAI fallback exists in code but is not configured.** `OPENAI_API_KEY` is not in prod env. Treat Anthropic as the sole live provider for any external copy / claim.
- **Never frame anything as "open-source" / "OSS" / "community-driven" in external copy.** The OSS path is off (CC-BY-NC license blocker, confirmed 2026-05-10).
