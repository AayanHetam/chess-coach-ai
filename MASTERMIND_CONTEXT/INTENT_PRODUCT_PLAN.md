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

### Regime verdict (measured 2026-08-20 — settled, do not relitigate without a re-measured corpus)

The 835-ply corpus was re-probed at depths 13 and 14 and the module's
verdicts diffed against the depth-16 baseline (`scripts/intent/`,
determinism-controlled; the canonical d16 baseline is the current-main
apply of the d16 probes — 0 diffs vs the #355 tip):

| regime | native cost | verdict fidelity |
|---|---|---|
| d16 | 577 ms/search, ~7 searches/ply ≈ 4 s per carded ply | reference |
| d14 | 555 ms/search — **only ~4% cheaper** | 445/835 plies drift; loses 3 long mates and 16 prophylaxis credits **including the founder-ruled Re1 (63.8% share anchor)** |
| d13 | 99 ms/search — 5.8× cheaper | 465/835 drift; loses 6 long mates (in 9–17) and the same Re1 credit; 33 purpose flips |

Card-level rulings (the WORTH/NOISE five, Nh7, Qxg3+, Rhxg2+) survive at
every depth — the depth-fragile facts are long-horizon: deep mates and
marginal endgame prophylaxis. But a ruled credit is a ruled credit:
**depth 16 is the only regime that preserves the calibration, and d14's
near-identical cost means there is no cheaper regime worth having.**

### Design (follows from the verdict)

Tier-1 probes run **client-side at full depth 16, in the background, AFTER
the review renders** — for shadow purposes nothing needs to block:

1. The review response already names its carded plies, so the client probes
   exactly those — no superset heuristic, no waste.
2. Cost is invisible: ~4 s/ply native ⇒ est. 8–25 s/ply in client WASM,
   spent while the user reads their review.
3. The client POSTs the probes to a follow-up endpoint; the server re-derives
   Tier-1 intent facts (probes are untrusted input — the module already
   fails closed on malformed data) and writes an **upgraded shadow row**
   (`tier_counts.tier1` goes non-zero).
4. Schema: a `nullMoveProbes` payload keyed by ply, zod-validated,
   size-capped, joined to the original review by contractId.

The depth question bites again only at I-3, where Tier-1 facts must exist
*before* prose renders. Options then: precompute on a prior visit, stream
intent sections late, or let first-render prose stay Tier-0. Decide at I-3
with shadow data in hand.

### Amendment (2026-08-23): the ENGINE BUILD is part of the regime too

The client's engine is **Stockfish 17 Lite single-thread** — a smaller NNUE
than the native SF 17.1 that measured the calibration corpus. Depth was
never the whole regime; the instrument is. Two consequences, found before
any I-2 code was written:

1. **The "client computes d16 probes" design is UNPROVEN until a
   lite-engine corpus re-probe shows the calibrated verdicts survive the
   NNUE swap.** The d13/d14 experiment proved verdicts are sensitive to
   measurement quality; an engine-build swap could plausibly drift more
   than a depth step. This experiment (re-probe the corpus with the site's
   own WASM engine stack, headless) is now the I-2 gate.
2. **The same caveat retroactively applies to Tier 0 in production**: prod
   `gameEval` is lite-engine, while the corpus's Tier-0 inputs were
   native. The shadow rows now accumulating are lite-measured facts judged
   by native-calibrated thresholds — exactly the drift the shadow exists
   to reveal, and the lite re-probe experiment validates (or corrects)
   both tiers at once.

Server-side native probes were considered and priced honestly: the free
Render instance is 0.1 CPU / 512 MB — the 577 ms/search native cost
becomes minutes per ply there, so "regime-exact on the server" is a PAID
decision (~1 CPU instance), not a free architecture. It stays on the table
only if the lite experiment fails.

### Lite-fidelity experiment: MEASURED (2026-08-23) — the answer that reshapes I-2

The full 835-ply corpus was re-probed with the PRODUCTION engine
(`stockfish-17-lite-single`, headless Chromium, byte-identical recipe to the
native sweep — see `scripts/intent/probe-corpus-lite.mjs`; refactor proven
byte-exact, lite proven deterministic). The rebuilt native corpus reproduces
every founder ruling — the reconstruction from public archives is validated.
The lite instrument does NOT:

- 457/835 plies drift; 47 purpose flips; prophylaxis presence churns ±60.
- **Two rulings break.** The Ra1 WORTH card dies (at d16-lite on a tempo
  knife-edge, 146cp vs the 150 bar; with d20-lite Tier-1 probes its threat is
  found but the weather gate kills it at −3cp vs the −100 bar). The ruled Re1
  prophylaxis credit dies because lite's null-move search ranks a DIFFERENT
  threat first (d5, not h6) at every depth tried — h6 survives only as the
  MultiPV-2 alternative, which the module deliberately does not evaluate.
- Deeper lite probes (d20) do NOT recover instrument disagreement — they
  only clear knife-edges. The NNUE sees different chess on these positions,
  deterministically.

Consequences, in order of force:

1. **Native server probes are incoherent, not just costly.** Tier 0 is the
   client's gameEval — lite forever. Mixing native Tier-1 into lite Tier-0
   is exactly the cross-regime subtraction the module refuses elsewhere.
2. **A consistent lite recalibration EXISTS for everything except Re1.**
   On the production instrument the ruled weather measurements are Ra1
   −3cp (WORTH ⇒ needs bar ≥ −3) and fxg5 +75cp (NOISE ⇒ needs bar < 75):
   any bar in [−3, 75) — e.g. 0 — keeps both rulings. The tempo bar has an
   analogous window if Tier-1 stays at d16-lite.
3. **Re1 is recoverable only by a module extension** — evaluating the top-2
   null-world threats instead of only the first. That is a new criterion,
   i.e. chess judgment: FOUNDER'S CALL, with his own Re1 ruling as the
   ground truth arguing for it.

**Decision pending (founder):** accept measured Tier-1 recall loss on
Re1-class stories, or rule on the top-2-threats extension. Either way the
recalibrated thresholds get their own INTENT_CALIBRATION values derived from
lite-measured ruled quantities (full-corpus d20-lite sweep in progress to
firm every window), and a new fingerprint separates the populations.

First shadow-traffic readings (2026-08-22/23, 6 rows): cost/trap/material
families firing on real games, 5–10 plies carded per review, capture fires
on every contract rebuild (dedupe by `contract_id` when querying), and
`build_ms` 3.5–7 s — of which intent is **36–47 ms per 10 carded plies**
(measured in isolation; the rest is the contract builder's pre-existing
profile, tracked separately). Referee-telemetry asymmetry observed in the
same window: filed as issue #397 for the contract workstream.

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
