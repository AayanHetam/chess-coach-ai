# Chess Masti — Summer 2026 plan

_Authored 2026-05-29. Covers June through August 2026._

## Why this doc exists

Six parallel workstreams compiled in the [2026-05-29 inventory](#current-state-2026-05-29) is at least two too many to run efficiently from a single head. This document picks a sequence, marks what's deferred and why, and sets the rules of engagement so we don't re-shard.

The single rule: **finish one thing before opening the next.**

## Mission and long-horizon goal

Chess Masti is accessible AI chess coaching. Mission framing: high-quality chess education at near-zero cost, originating from the founder's experience growing up in Mumbai. Product: [chessmasti.com](https://chessmasti.com).

- **18-month MAU target**: 50,000 by 2026-11-01 (per memory: from 2026-05-01 baseline).
- **Revenue posture**: zero revenue is fine for the next 18 months — credit-application-driven (Claude for Education being the active path; the OSS path REOPENED 2026-08-19 when the project restored AGPL-3.0 and went public).
- **Strategic moat**: UI craft + grounded coaching, not a chess engine. DecodeChess / Chessstalker / Lichess / Chess.com all work but look dated.

## Current state (2026-05-29)

### Just shipped (last 5 days, May 24–29)
- Dark-glass `/preview/analysis` redesign (PR #55) and full cutover wiring (PR #56 OPEN, ready for review)
- `savedEvalsAtom` persistence (PR #58, merged) — cross-page hydration now actually works
- Masters panel cursor desync fix (PR #57, merged)
- Mastermind Phase 1 (orchestrator foundation): Stage A + B + C Follow-up A/B + parallelization + cost-calc fix + orphan-promise cancellation (PRs #26–#28, #38)
- Chrome Extension MVP + Web Store prep: install pathway, listing copy, icons, /privacy disclosure, deep-link receive, auto-analyze handshake (PRs #37, #39, #45, #46, #48, #50)
- Coach insights + snippet permalinks + share infrastructure (PRs #29–#33, #40, #41, #43)
- Privacy disclosure audit re-applied (PR #52)
- Analysis-flow hardening: real-time streaming for game_review, cursor sync with loaded PGN, handleSend double-fire guard (PRs #34, #42, #47)

### Active right now
- **PR #56 cutover-gaps** — open, body up to date, every gap G1–G17 wired, only G3 visual smoke is deferred (wiring code-verified). Ready for merge.

### Paused but not abandoned
- CMIP-1.B/1.C/1.D (intern feedback portal) — 1.A shipped 2026-05-24, no PR since
- Mastermind Phase 2 (orchestrator UI workstream 2.F) — zero PRs, strongest strategic gap
- Mastermind Phase 3 (CMIP-2 + correlation) — blocked on CMIP-1 finish
- ~~Chrome Extension Web Store submission — code complete, admin step undone~~ **CORRECTION (2026-08-28): false when written.** The extension was published and public on the Chrome Web Store on **2026-05-26** — three days before this doc was authored. [Listing](https://chromewebstore.google.com/detail/analyze-with-chess-masti/fligcdcmibplmdbpggcjecpkclghdnpc).
- Landing v2 (WebGL chess landing) — built but parked in `_future/`; preview at `/preview/landing-v2`

## Summer 2026 commitments (in order)

The sequence below is one-at-a-time. Each step ships before the next opens. Estimated durations assume single-builder bandwidth with multi-CC-session help.

### June: Finish the cutover lap (≈1 week)
1. **Merge PR #56**, watch for prod regressions, hotfix anything that surfaces
2. **Cutover polish sprint** — these are visible to anyone reviewing the new surface:
   - Lc0DownloadBanner re-mount on `/preview/*` (lost when legacy chrome dropped)
   - AuthDialog redesign to match the dark-glass design OS
   - Settings entry in NavPill avatar dropdown
   - `EngineContinuation` / `MaiaContinuation` live PV widgets inline in insight bodies (currently points users to the Lines tab as fallback)
   - Coach personality picker on `/preview/analysis` (final missing field for enhanced-analysis parity)
3. **Cutover flip**: replace `/analysis` route with the new surface; archive legacy under `/_legacy/analysis` for a 30-day rollback window
4. **Bisect the Webpack hydration flake** that blocked G3 visual smoke. One sitting.

### June → July: Chrome Extension Web Store submission — ALREADY DONE when this plan was written
5. ~~**Submit the extension.**~~ **CORRECTION (2026-08-28): submitted and public since 2026-05-26** — the "biggest deferred lever" framing survived in the docs for three months after the lever had already been pulled. [Listing](https://chromewebstore.google.com/detail/analyze-with-chess-masti/fligcdcmibplmdbpggcjecpkclghdnpc) (~6 installs, zero ratings as of 2026-08-28). The remaining lever is **distribution, not admin**: the listing name "Analyze with Chess Masti" has no searchable keywords, and renaming requires a manifest version bump + Web Store re-review (name/summary come from `manifest.json`, not dashboard fields). The site install page's "review pending" dead state was fixed in PR #440; the listing URL is recorded in [extension/README.md](extension/README.md) (PR #441).

### July: Mastermind Phase 2 orchestrator (3–4 weeks)
6. **PR_2F_PLAN.md** — plan-first per Mastermind convention. Architecture/scope/cost questions → tech-lead; chess/coaching questions → Aayan. Pause for review before any code lands.
7. **2.F orchestrator UI** — the user-visible piece of the agentic coach. Tool-using Claude inside `enhanced-analysis`, with the orchestrator chain visible in the surface (which tools fired, which validators ran, why a claim is grounded). This is the strategic centerpiece — what makes Mastermind a real product, not architecture.
8. **Phase 2 follow-ups** as they emerge from the orchestrator build.

### August: CMIP-1 finish + Phase 3 unblock (≈3 weeks)
9. **CMIP-1.B** — flag write surface inside the intern experience
10. **CMIP-1.C** — ideal-response authoring
11. **CMIP-1.D** — admin dashboard for triage + export
12. **CMIP-2 / Phase 3** — correlation pass: link real coach replies to flag/ideal pairs; feed into Mastermind eval set

### Continuous (does not block sequence)
- **Claude for Education credit application** — fold once eligibility window opens

## Deferred until 2026-09 or later

Listed with rationale because skipping silently breeds cruft.

- **Landing v2 (WebGL chess landing)** — built, parked. Visible-from-outside but doesn't move the MAU number on its own. Ship after Phase 2.F lands so the funnel from landing → product → coach is end-to-end polished.
- **OpenAI fallback integration** — code exists in `llmProvider.ts`, `OPENAI_API_KEY` not configured. Anthropic uptime hasn't been a real problem. Wire when there's an actual outage to justify the second-provider operational cost.
- **The 30+ `*_SUMMARY.md` files at the repo root** — stale CC-session artifacts. One-pass cleanup sprint, deferred.
- **OSS strategic path** — UNBLOCKED 2026-08-19. The license posture changed, which was this entry's own condition for revisiting: AGPL-3.0 is OSI-approved, so eligibility is no longer a licensing question. The remaining gate is the 5k-star threshold (repo is at 0 on day one), so Education is still the nearer path.
- **Coach personality picker as a full picker UI** — minimal `personalityId="default"` threading is enough for prompt-quality parity; full picker waits.

## Operational rules

These are the constraints that make this plan executable.

- **One workstream in flight at a time.** Two if one is purely admin (e.g., Chrome Store submission).
- **Plan-first on every Mastermind PR.** `MASTERMIND_CONTEXT/PR_NX_PLAN.md` before code. Pause for review.
- **Phase 3 PR auto-merge rule** (per memory): merge with `--merge` when CI is green and nothing weird; otherwise stop and surface.
- **Concurrent CC sessions cap**: 4. Files modified out from under each other is the baseline; never `git add -A`; new files in isolated directories are safe.
- **Branch hygiene**: every feature on its own branch. Force-pushes to `main` are forbidden.
- **Type-check is the quality gate**: `npx tsc --noEmit` clean before every PR (build and lint config ignore type errors, so tsc is the real check).
- **No tests yet** — adding Vitest + Playwright is Phase 3 of the audit, not a Q3 commitment.

## Open questions for Aayan (resolve before June work starts)

1. **Cutover flip date**: when does `/preview/analysis` replace `/analysis` as the canonical route? Soft proposal: end of June.
2. **Education credit application timing**: when does the credit window open? If August, July work plan adjusts.
3. **CMIP-1.B/1.C/1.D ordering**: ship 1.B alone first, or batch with 1.C? Tech-lead call.
4. **Landing v2 trigger**: what's the actual signal that says "now is the time to swap"? MAU number? Investor pitch deadline?

## Tracker

Mark each commitment as it ships. Re-read the doc the first week of each month and prune what no longer holds.

```
[ ] June 1-7   — PR #56 merge + cutover polish sprint
[ ] June 8-14  — Cutover flip + Webpack bisect
[x] June 15-30 — Chrome Web Store submission — DONE EARLY: published 2026-05-26, before this plan was authored (discovered 2026-08-28)
[ ] June 22-30 — PR_2F_PLAN.md draft + tech-lead review
[ ] July       — Mastermind Phase 2.F orchestrator
[ ] August     — CMIP-1.B → 1.C → 1.D → Phase 3 correlation
```

---

_Living document. Tracked at `chess-coach-ai/Chess masti 2026 summer plan.md`. Author: Aayan + Claude Code sessions. Next review: 2026-07-01._
