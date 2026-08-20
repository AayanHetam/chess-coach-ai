# INTENT_PRODUCT_PLAN.md — taking the intent module to users

**Authored:** 2026-08-19/20, at the start of the product phase ("let's make
this product perfect"). **Status:** I-1 shipped and armed; I-2 next.

The intent module (`src/lib/intent/`) answers *what was this move FOR* from
engine measurements — every fact is a subtraction between the world where the
move was played and the world where it wasn't. Its thresholds
(`INTENT_CALIBRATION`) were calibrated against founder rulings on real
positions across five PR generations (#315→#355); the calibration story and
its discipline (fail-first tests, mutation testing, ply-by-ply corpus diffs)
are documented in the git history of those PRs and in
[scripts/intent/README.md](../scripts/intent/README.md).

This plan is the staged path from *calibrated and dark* to *user-visible and
referee-checked*. Each stage is independently shippable, independently
measurable, and reversible by env flag.

---

## What a four-reader recon established (2026-08-19, pre-I-1)

1. **Arming was a no-op.** `INTENT_FACTS_ENABLED` had exactly one reader and
   one attach point (`builder.ts` → `contract.intent`), and
   `serializeForVerbalizer` strips the field — byte-identity is test-pinned.
   No telemetry writer, no referee check, no UI component read it. Flipping
   the flag spent CPU and discarded the result.
2. **Tier 0 only at serving time.** The serving path has `gameEval` (client
   multi-PV lines) and the move list — enough for mate / material / escape /
   cost / unaddressed-forced-mate. The null-move world (threat identity,
   prophylaxis attribution, trap credit, the five-gate threat procedure)
   needs probes the serving path does not have.
3. **Rendering is a real project, not an un-strip.** The verbalizer charter
   enumerates citable fact ids; `resolveFactId` rejects unknown families; the
   output referee's license pools are field-enumerated (intent's
   mover-relative centipawns would fire `eval_display`, its SANs are
   unlicensed). A new fact block means charter + citations + referee pools +
   re-running the arming gates (persona / citation / fabrication /
   false-intervention) before any user sees a rendered intent sentence.
4. **Episode collapsing existed nowhere** — and per-ply counts overstate
   (the 34-"surviving-mates"-that-were-7-episodes lesson). Any consumer
   quoting numbers needs the collapse.

## Stage I-1 — observability foundation (SHIPPED, PR #386; armed 2026-08-19)

- `isIntentFactsEnabled` parses via the shared `parseBoolEnv` (the untrimmed
  `=== "true"` match was the exact `"true\n"` incident class that once
  silently disarmed a prod flag).
- `intentProbesFromGameEval` takes `onlyPlies`: expensive per-ply work runs
  for carded plies only (475ms → ~tens of ms on a 55-ply game). Skipped plies
  still advance the board and the capture context — a carded ply's recapture
  facts depend on the uncarded capture before it (mutation-proven).
- `src/lib/intent/episodes.ts`: the ply→episode collapse, built once. Same
  mover + same family key collapses; an analysed same-mover ply *without*
  the fact breaks the run; un-analysed gaps bridge. `IntentSummary` carries
  `mover`.
- `intent_outcomes` (tracking warehouse): one content-free aggregate row per
  reviewed game — ply counts AND episode counts per family, mover/tier/
  purpose distributions, `build_ms` — stamped with the `INTENT_CALIBRATION`
  fingerprint. Consent-gated, fail-closed, `after()`-scheduled. Wired at the
  contract build **both serving branches share**, so it structurally cannot
  repeat the CI-6 armed-path-lost-its-telemetry failure.
- Query kit: end of [supabase-tracking/QUERIES.sql](../supabase-tracking/QUERIES.sql).

**Read before I-2 sizing:** a week of `episode_counts` mix, the ply-vs-episode
inflation ratio, `build_ms` p95, and the purpose distribution on real traffic.

## Stage I-2 — Tier 1 in shadow (NEXT)

Goal: the calibrated crown jewels — prophylaxis credit, the five-gate
unaddressed-threat procedure, trap attribution — light up in the shadow rows.

Design intent: **the client computes the null-move probes**, matching the
architecture (the server never runs an engine) and the calibration regime
(depth 16, single-thread, MultiPV 3, warm table — see
[scripts/intent/README.md](../scripts/intent/README.md); regime fidelity is
non-negotiable per the measurement-regimes rule, or the thresholds must be
re-derived on a re-measured corpus).

Open questions to settle before code (in order):

1. **Regime-fidelity experiment (offline, decides everything else).** Re-run
   the corpus probes at candidate cheaper regimes (e.g. depth 13/14) and
   measure how many calibrated verdicts flip vs depth 16. If a cheaper
   regime agrees on ~all corpus rulings, the client budget question relaxes;
   if not, depth 16 it is.
2. **Ply selection.** The client doesn't know which plies the server will
   card. Proposal: client probes a superset — top-K eval-drop plies of the
   user's colour (K≈6) — and the server uses what matches its carding,
   ignoring the rest. Misses degrade to Tier 0, never to wrong claims.
3. **UX budget.** ~1.26s/position × K on the client, after gameEval and
   before the review request. Options: overlap with the gameEval pass,
   lower K, accept latency, or probe lazily and let the FIRST review stay
   Tier 0 with a Tier-1 follow-up. Decide with the regime experiment's
   numbers in hand.
4. **Schema.** `nullMoveProbes` rides the existing request body next to
   `gameEval`, zod-validated, size-capped, and — like gameEval — treated as
   untrusted client input (the intent module already fails closed on
   malformed probe data).

Shadow first, exactly like I-1: Tier-1 facts flow into `intent_outcomes`
(`tier_counts.tier1` goes non-zero), nothing renders.

## Stage I-3 — render behind the referee

Un-strip `intent` for the verbalizer (accepting the prompt-cache/snapshot
re-pin), add a `<P>.intent` citation family to the charter and
`resolveFactId`, widen the referee license pools for intent's vocabulary
(mover-relative cp, threat SANs, trap/mate wording), then **re-run the
CI-4/CI-5 arming gate battery** — persona, citation validity, fabrication
rate, false-intervention — before any user sees a sentence. The founder rules
on RENDERED PROSE samples (the worth-saying bar applies to words, not facts;
"worth saying" is derivable but the words carrying it are new surface).

## Stage I-4 — the card surface

Grammar tag + parser + a section on the dark-glass insight cards. One product
decision is explicitly the founder's: today's selection **never cards good
moves**, so prophylaxis-credit cards ("h5 shut that plan down") require a
deliberate selection change — a new card class, not a tweak.

---

## Standing rules for every stage

- Facts only from measurements; silence over guessing; drop on positive
  evidence only. Never re-litigate a founder ruling without new ground truth.
- Every behavior change: fail-first test → mutation pass → ply-by-ply corpus
  diff (`scripts/intent/`) → quartet (tsc, vitest, build, both Playwright
  projects) → CI → deploy-verify.
- Quote episodes, never plies. Split by mover. Group telemetry by
  `intent_fingerprint`.
- Served bytes stay identical until I-3 deliberately changes them, and the
  byte-identity test is retired only in that PR, consciously.
