# Mastermind — current state (session pickup doc)

**Updated:** 2026-05-18, end of session.

**Read this first** when picking up Mastermind work in a new session, before opening the conversation transcript or the longer planning docs. Replaces its own contents at the end of every working session — historical state is in git history, not here.

---

## Current state

**Stage A SEALED** at commit `573eab5` on branch `mastermind/stage-3-validators`. All four originally-outstanding validators shipped (scoutCitation, userHistoryAggregates, userHistoryCitation, citationRate + `runValidationPipeline.dataSources` extension), plus the binary-equality preservation contract holds against PR 1.B's pre-A.9 behavior.

**Stage B planning REVISED** at commit `f4db14d` against the now-real four-validator surface. Revised plan lives at [`PR_1C_STAGE_B_PLAN.md`](PR_1C_STAGE_B_PLAN.md). Pre-Stage-A "paused" banner removed; §0 rewritten to document shipped surface; §3 wireValidators.ts spec rewritten for four real sources; §12.1+§12.2 decisions ratified; §12.3 new T11-T16 questions added.

**Stage B code has NOT started.** Five commits planned (`1.C.B.1` through `1.C.B.5`) per the revised §14 commit order.

**Stage C (synthetic-tester sweep) and PR 1.C merge are blocked on Stage B code completing.**

---

## Next action (literal next thing to do)

1. **Tech-lead reviews [PR_1C_STAGE_B_PLAN.md](PR_1C_STAGE_B_PLAN.md) §3** (revised wireValidators.ts spec — main architectural surface that changed post-Stage-A) and **§12.3 T11–T16** (six new architectural questions, all default-resolve in the implementation if no override).
2. **After sign-off (or silent acceptance of defaults), Claude begins commits `1.C.B.1` onward.** First commit is `wireValidators.ts` + tests per §3 + §10.1 of the revised plan.
3. **No re-planning needed** — Stage B is plan-approved as-revised. Plan-first applies during implementation per the Stage A pattern (surface deviations in commit message; pause if richer cross-check infrastructure than planned is needed).

If tech-lead overrides any §12.3 default, surface the override here + update the plan before code starts.

---

## Open decisions awaiting Aayan

**None pending.** Stage A.9 fully approved; Stage B plan revision is fully ratified on the chess-and-coaching side (Q1 RESOLVED + Q2–Q7 ratified). Aayan's role on Stage B is reviewing route-file diffs when commits `1.C.B.4` + `1.C.B.5` ship (live-traffic surface) and reviewing the Stage C sweep summary's per-claim-type firing-rate report (≥3-never-fire claim types surface for merge-or-not decision).

---

## Open decisions awaiting tech-lead

**One pause point active** — the §3 + §12.3 review described above. Six T11–T16 questions all default-resolve; tech-lead can sign off silently (defaults apply) or override any of:

- **T11** opponent identity for Scout fetch (default: parse PGN headers)
- **T12** Firestore games query bound (default: 200 most-recent)
- **T13** citationRate lifecycle position (default: post-pipeline, pre-forwardTelemetry)
- **T14** Scout cache strategy (default: trust scoutService's existing 10-min server-side cache)
- **T15** UserHistoryGame type coupling acceptable (default: yes)
- **T16** citation_rate_summary Sentry event level (default: info)

---

## Active branches

| Branch | HEAD | Status |
|---|---|---|
| `mastermind/stage-3-validators` | `f4db14d` | Local + pushed to origin. 32 commits ahead of origin/main. Stage A sealed; Stage B planned. Awaiting tech-lead review before Stage B code starts. |
| `docfix/jhamtani-marketing-claim` | `e2384f0` (pre-session-end) | Pushed to origin as PR #24. Ready to merge from GitHub UI — Aayan-driven, do not auto-merge. Four-page copy-edit removing the "298,000+ Jhamtani expert-commentary pairs" claim per the data audit. |
| `main` | `04b445f` | CMIP-1.D merged. Not relevant to Mastermind workstream. |

The `mastermind/stage-3-validators` working tree also carries untracked landing-v2 + supabase + CMIP artifacts (`FUTURE_LANDING_V2.md`, `MASTERMIND_CONTEXT/PR_LANDING_REDESIGN_PLAN.md`, `MASTERMIND_CONTEXT/landing-redesign/`, `public/models/`, `scripts/screenshot.mjs`, `src/components/landing/_future/`, `src/pages/preview/`, `supabase/`) that leaked from main during earlier worktree cycling. None are Mastermind-branch work; they're harmless in the working tree (not part of any commit). Will resurface on whichever branch is checked out next session.

---

## Promotion criteria status (preview → prod)

None fired yet — PR 1.C not yet merged. All five criteria from [PR_1C_STAGE_B_PLAN.md §7.4](PR_1C_STAGE_B_PLAN.md):

| # | Criterion | Status |
|---|---|---|
| 1 | PR 1.C merged to main | ⏸️ pending Stage B + Stage C |
| 2 | Synthetic-tester sweep all five gate metrics passing on preview | ⏸️ pending Stage C |
| 3 | Gate caught at least one real regression in subsequent CI run | ⏸️ pending post-merge |
| 4 | No `final_outcome=fallback_used` >1% over rolling 7-day preview window | ⏸️ pending post-merge |
| 5 | p95 turn latency in preview ≤ 1.5× prod baseline | ⏸️ pending post-merge |

When all five hold, a separate ops PR flips `MASTERMIND_VALIDATORS_ENABLED=true` in Production env. Estimated post-merge timing: 2–6 weeks per [PR_1C_PLAN.md §4.4](PR_1C_PLAN.md), depending on when criterion 3 fires.

---

## Recent decisions worth remembering

Calls made in the last working session that future-Aayan should know without re-reading the conversation:

- **Orchestrator framing approved.** [MASTERMIND_BUILD_PLAN.md](MASTERMIND_BUILD_PLAN.md) rewritten 2026-05-18: Mastermind is an orchestrator (Najdorf-prep bar — seven sources composed in one turn), not just an agent loop. Three-phase structure: Phase 1 Foundation (PR 1.C), Phase 2 Orchestrator (5–8 PRs including UI workstream 2.F), Phase 3 CMIP-2 + correlation. New Phase 2.F Mastermind Response UI is cut-LAST tier. Cost ratified as non-gating ($0.10 median / $0.25 p95 / ~$16k/month at 50k MAU).
- **CMIP redirection ratified.** CMIP-2 + correlation analysis becomes Phase 3 (after the orchestrator), NOT a gate on Phase 2. The original Phase-2-blocked-on-CMIP-data position is reversed.
- **Stage A reopened + sealed.** Original Stage A plan had nine commits but only five shipped; the four outstanding items were reopened per [PR_1C_PLAN.md §7.1](PR_1C_PLAN.md). All four shipped 2026-05-18 (commits A.6 through A.9). Stage A is now sealed for real.
- **Stage B absorbs all four validators** (revised plan, commit f4db14d). The pre-Stage-A "tighter scope" default was rejected; Stage B as-planned wires all four validators with independent failure tolerance.
- **T1–T10 architectural defaults all ratified** during the pre-Stage-A planning round. Carried forward unchanged into the revised plan.
- **scoutCitation Option A approved** — ship all 26 claim types (not the merged-to-20 alternative). Subset/merge would force parser ambiguity into cross-check logic, which ages badly.
- **C1 hybrid tolerance for hours_played_claim**: `Math.max(2, Math.round(0.05 * stated_value))`. Flat ±2 was too strict for large counts; pure 5% was too loose for small counts.
- **`feature_delta` opportunity counter deferred** to a post-CMIP follow-up per Aayan's C2 decision. Tracked in `cleanup_followups.md`. Stage C treats null perSource bucket as "not measured" + pass-by-default; hallucination ceiling still applies via PR 1.B validators.
- **Two extracted shared utilities** (`pgnHeaders.ts` + `fuzzyMatch.ts`) and one new utility (`timeControlClass.ts`) live at `src/lib/utils/`. Pattern matters: extract to utility module rather than re-inlining when a regex/matcher is needed in two places.
- **Per-claim-type firing-rate aggregation** required in Stage C sweep summary per Aayan's Stage A.6 follow-up. ≥3-never-fire claim types surface for review (not auto-merge); decision based on data, not guess.

---

## Cleanup followups (non-blocking, tracked separately)

See [`cleanup_followups.md`](cleanup_followups.md) for the active list. Current entries (2026-05-18):

1. `extractPgnHeaders` utility consolidation — `repertoireParser.ts` private copy not migrated to the shared utility.
2. Future expansion: move-sequence-based opening-repertoire validation — fire if Stage C surfaces ≥5% qualitative_commentary rate on move-prefix claims.
3. Cross-platform user-identifier reconciliation — fire post-PR-1.E.
4. `TimeControlClass` ↔ `ScoutTimeClass` type derivation — fire if any TimeClass value is added.
5. `feature_delta` opportunity counter — fire when CMIP-2 informs what coaches actually cite in feature_delta.
