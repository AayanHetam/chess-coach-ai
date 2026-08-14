# Scout — "Customize vs me" + personalized theory lines

Plan doc. Written 2026-08-13, after PR #313 (dossier redesign + rating-anchored
strength) shipped to prod.

Directive from Aayan: make `/scout` cooler, more fun, more functional. Four
accepted workstreams, plus a fifth that is the centrepiece:

1. Clock windows — when they're beatable
2. Format filter — scope the dossier to the format you're about to play
3. Head-to-head odds + rating trajectory
4. **"Customize vs me"** — an over-the-top head-to-head report
5. **Personalized theory lines** — the hard part

Hard constraint, stated explicitly: **100% machine algorithm, 0% AI.** No LLM
anywhere in this feature. Stockfish + Maia-2 + the opponent's own game history,
combined by a stated equation.

---

## 1. Clock windows

Every `ScoutGame` already carries `date` (ms, absolute) — from `end_time` on
Chess.com and the equivalent on Lichess. Nothing currently reads it except the
span calculation.

Derive, per hour-of-day and per weekday: games played, score %, and timeout
rate. Surface the live read — "right now, they score 41%".

**Timezone note:** we do not know the opponent's local timezone and must not
pretend to. But we do not need it: you play someone at a specific *absolute*
instant, so their score at that absolute hour is directly actionable. Label the
axis in the viewer's local time (which is the same instant), never in an
inferred opponent-local time.

Guard: require a minimum sample per bucket (n ≥ 8) before showing a rate, or a
single 3 AM game reads as "0% at 3 AM".

## 2. Format filter

`ScoutGame.timeClass` is populated. Re-run `computeAnalytics` over the filtered
subset so the entire dossier re-reads for the format you're about to play. A
blitz scouting report should not be diluted by their rapid games.

Note the interaction with §5: the theory lines must be generated from the same
filtered subset, and Maia should be queried at their rating *in that format*.

## 3. Head-to-head odds + rating trajectory

Elo expected score, deterministic:

    E = 1 / (1 + 10^((R_them − R_you) / 400))

Rating trajectory replaces the crude form blocks in `PsychologyPanel` with a
real sparkline over per-game ratings (`whiteRating`/`blackRating` are on every
game), with the already-computed peak/floor as markers.

## 4. "Customize vs me"

Signed-in users have a rating on their profile, so the button does not need to
ask for it. Compares your strength profile against theirs dimension by
dimension, as White and as Black separately, and feeds §5.

---

## 5. Personalized theory lines — the algorithm

Generate ~10 lines where **you play the engine move and they play their move**,
branching only where their behaviour is genuinely uncertain.

### 5.1 Their move distribution at a node

Blend their actual history with Maia, weighted by how much history exists.
`n(v)` = their games reaching position `v`; `e(m|v)` = empirical frequency from
the opening tree; `μ(m|v)` = Maia-2 probability at their rating.

    w(v)   = n(v) / (n(v) + k)                k = 5
    P(m|v) = w(v)·e(m|v) + (1 − w(v))·μ(m|v)

`k = 5` encodes the "only lines seen 5+ times" instruction as the half-weight
point rather than a hard cutoff: at `n = 5` history and Maia weigh equally, at
`n = 0` it is pure Maia, by `n = 20` history dominates (`w = 0.8`). A cliff at
exactly 5 would make a line seen 4 times vanish and one seen 6 times dominate,
which is not a real distinction in this data.

### 5.2 Branch count at a node

Sort by `P` descending. Take the smallest prefix clearing the coverage
threshold, capped:

    c(v) = min( Kmax, min{ c : Σᵢ₌₁ᶜ pᵢ ≥ τ } )      τ = 0.90, Kmax = 3

Reproduces both stated rules from one threshold:
- top move 0.92 → `c = 1`, no split
- 0.50 / 0.40 → 0.50 < 0.90, +0.40 → 0.90 ≥ 0.90 → `c = 2`, split

### 5.3 Budget allocation

Line reach probability:

    R(ℓ) = Π P(move_ℓ(v) | v)     over their nodes v on ℓ

Best-first expansion: repeatedly expand the frontier leaf with the largest
`R(ℓ)`; splitting into `c` children costs `c − 1` from the budget.

Terminate on: `N = 10` lines, depth `D = 14` plies, or `R(ℓ) < ε = 0.02`.

Maximising `Σ R(ℓ)` under a cardinality constraint is monotone submodular, so
greedy is within `1 − 1/e` of optimal — and, more usefully, is legible to
anyone reading the code.

### 5.4 Your moves

Stockfish best move at fixed depth. No branching — one recommendation per
position.

### 5.5 Output stat

`Σ R(ℓ)` over the chosen lines = "this prep covers 78% of what they actually
play". Falls straight out of the math; display it.

---

## Feasibility constraints found while scoping

1. **Maia returns top-5 only.** `/api/maia-predict` proxies
   `{humanLikeMove, confidence, alternativeMoves[]}`. Cumulative mass will not
   reach 1.0 — renormalize over returned moves and treat the unreturned tail as
   "other", never branching into it. `src/lib/grounding/maia.ts` already
   documents this bound and handles the absent-move case; reuse that logic.

2. **`maiaServerService` has a heuristic fallback that is NOT Maia.** It scores
   moves with hand-written heuristics when the service is unreachable. Shipping
   invented opening theory is far worse than shipping none, so this path must
   **fail closed**: if Maia is unavailable, show "prep unavailable", never
   silently synthesize lines. Same failure shape as the consent gap in
   `feedback_audit_every_write_path` — make the condition required at the
   producer, not checked at one caller.

3. **Latency.** 10 lines × 14 plies ≈ 60 opponent nodes ⇒ ~60 Maia round-trips
   plus ~60 Stockfish evals. Maia is Render-hosted with cold starts (hence
   `/api/keep-maia-alive`). Required: memoize by FEN (positions recur heavily
   across lines — this is the single biggest win), server-side cache, hard wall
   clock budget, and a real progress UI rather than a spinner.

4. **`/api/maia-predict` requires a session.** Consistent with the feature being
   for signed-in users, but it means the theory engine cannot run on the
   anonymous scout path. Gate the button on auth.

## Build order

§1–3 are self-contained and depend on nothing external — build and ship first.
§4 then §5, with §5 behind a flag until the fail-closed path and the latency
budget are both proven against the live service.

## Open question for Aayan

The 10-line budget, `τ = 0.90`, and `D = 14` are the tunable knobs. They are all
one-line constants. Worth a look at real output before they are fixed.
