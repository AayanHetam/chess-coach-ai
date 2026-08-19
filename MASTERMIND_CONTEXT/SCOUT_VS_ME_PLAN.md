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

### Status (2026-08-17)

| § | state |
|---|---|
| 1 Clock windows | built |
| 2 Format filter | built |
| 3 Head-to-head + trajectory | built |
| 4 "Customize vs me" | **not built** — the report UI is the remaining work |
| 5 Hole finder | built, tested, live-fired; **replaces** the coverage objective |

§5 was rewritten twice. The Maia coverage engine (`theoryLines.ts`, §"Live-fire
probe results") is still on the branch and still works, but it answers the wrong
question and is **not** what the report should lead with. Everything below marked
*superseded* is kept only because that code has not been removed yet.

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

## 5. The hole finder — the algorithm

> **Reframed 2026-08-15, and again 2026-08-17.** The original brief was coverage:
> ten Maia-driven lines spanning their repertoire. Aayan corrected it — the goal
> is not to learn their openings, it is to find *the hole they keep falling
> into* and build the line that gets there. He had done exactly this by hand
> with Stockfish and OpeningTree against a stronger opponent, found a gap in the
> Caro-Kann, and won against someone ~300 rating points above him.
>
> The second reframe came from the data, not from a person. See §5.6.

Two signals, because neither works alone.

### 5.1 The engine signal, and why it is not enough

The obvious model: find moves they repeat that Stockfish refutes.

```
engineEdge(m) = cp→score( CPLoss(m) )
```

Swept across all 77 decisions the test opponent repeats 30+ times in his Caro-Kann,
at depth 16, **his worst repeated inaccuracy is 44cp.** There is no blunder to
find. Strong club players do not hang pieces inside their own repertoire — they
walk into structures they cannot play, and an engine cannot see that, because it
evaluates the position rather than the person.

The engine signal stays in the model. It is just not the headline.

### 5.2 The results signal

Their own scoreline sees what the engine cannot.

```
resultsEdge(v) = b − ŝ(v)      b = their weighted score with this colour
                               ŝ = their score at v, shrunk toward b
```

### 5.3 One currency

Centipawns and score fractions are combined through Lichess's winning-chances
curve, rescaled to a score fraction:

```
cp→score(cp) = 1/(1 + e^(−0.004·cp)) − 0.5
```

which puts +150cp and a 15-point results drop both near 0.15 — close enough that
comparing them is meaningful.

```
Benefit(ℓ) = Reach(ℓ) × [ max(resultsEdge, engineEdge) − cp→score(Concession) ]
```

`max`, not a sum: the two are measurements of one quantity — how bad this is for
them — not two independent edges. `Reach` is the product of **their** move
probabilities along ℓ; your own moves are free, because you simply play them.
`Concession` is what your steering hands back, subtracted rather than capped, so
paying 30cp to reach a 20-point collapse is worth it and paying it for a 3-point
wobble is not.

### 5.4 Concession is measured between siblings

The cost of your move is the difference between the position it leaves and the
position the engine's move would have left — **both children of the same
parent**, searched to the same depth:

```
moveLoss = max(0, eval(after your move) − eval(after engine's move))
```

Parent-to-child comparison looks equivalent and is not. Two positions one ply
apart, searched to the same nominal depth, disagree by 20–40cp in the opening
from search instability alone. Measured that way, `2.d4` and `3.exd5` were billed
24–47cp — half the concession budget for ordinary developing moves. Between
siblings the bias is identical on both sides and cancels, and a move that *is*
the engine's choice scores exactly zero instead of merely near it.

### 5.5 Statistics on positions, not move orders

Everything above is measured on a **recency-weighted position index**, not on the
move tree. Two corrections, both forced by real data:

**Transpositions pool.** A move tree asks a separate question of every spelling
of the same idea. The c4 break against the test opponent's Caro appeared as 18 games
down one order and 31 down another; pooled by position it is one question at
n_eff 51. FEN keys drop the halfmove and fullmove counters, which never change an
evaluation.

**Games decay.** Weight `w = 0.5^(age / halfLife)`, half-life 365 days, anchored
at their most recent game rather than at today. He answered 1.e4 with c6 in
**58.6%** of all his games and in **96.3%** of his most recent 1,500. An
unweighted archive describes a player who no longer exists.

Sample size is then Kish's effective N, `(Σw)² / Σw²`, so recency weighting
cannot manufacture confidence it has not earned.

### 5.6 The correction, and why the second reframe happened

An early run reported: *"the Panov, 26.6% over 32 games against his 46.9%
baseline — Wilson-confirmed."* It was wrong, and it was wrong in the most
instructive way available.

That line's own **parent**, at 167 games, scores 49.1% — his baseline. The 32-game
sample was noise. The bug was not the Wilson interval, which was correct in
isolation; it was running it **1,617 times** and reporting the most extreme
survivor. At a 95% gate, ~80 of 1,617 lines clear by chance, so essentially every
headline would have been a mirage.

The screen therefore corrects for its own size:

- Positions below `minNeff` are not tested at all — they cannot fire except on a
  fluke, and each one added makes the correction harsher for lines that do have
  evidence.
- A position whose child carries ≥95% of its weight is one question, not two;
  collapsing forced continuations cut 229 nominal tests to 160 real ones.
- **Benjamini-Hochberg** at `q = 0.1`, not Bonferroni. This is a screen, not a
  confirmatory test. Over 160 nested, heavily correlated positions Bonferroni
  demanded p ≤ 6e-4 where the strongest available line offered 2.8e-3 — it
  rejects everything, always. BH controls the share of reported lines that are
  flukes, which is the guarantee a user actually wants.

A results edge is claimed **only** for positions the screen tested. Below that
floor nothing is protecting the line, and shrinkage alone still turns an
unscreened 7-game 4.5% sample into a 14-point "edge" — the same fluke-promotion
one layer down.

### 5.7 Three tiers, because most opponents have no hole

| tier | meaning |
|---|---|
| `confirmed` | Survived BH. A real, defensible weakness. |
| `signal` | Screened, below baseline, did not clear the bar. Real evidence, unproven. |
| `prep` | Not screened. Best available line; **not a claim about their play.** |

Power: at a 19-point deficit the gate needs n_eff ≈ 73. the test opponent's best line
has n_eff 51 — genuinely close, genuinely not proven. So `confirmedWeakness:
false` is the *normal* outcome against a solid opponent, not a failure, and the
UI must not dress the prep tier up as a discovery.

### 5.8 Where the evaluations come from

There is no server-side engine in this codebase — evals are computed client-side
and passed in. So the hole finder runs in the browser, and ~110 WASM searches is
not a thing anyone will wait for.

Every position it looks at is an opening position inside sixteen plies, which is
exactly the set Lichess's cloud holds deeply. Probed against the real endpoint,
on the 120 most-reached positions of a real opponent's archive:

    hit at depth >= 20   90.8%
    404 miss              0.0%
    latency               p50 198ms, p90 247ms
    cloud depth           min 38, median 57, max 70

So cloud-first is not an optimisation, it is the design. Two constraints follow:

  - **Rate limiting is real.** 11 of 120 requests errored at 60ms spacing.
    Modest concurrency with backoff, not a serial hammer and not a fan-out.
  - **`LineEval.cp` is White-relative** — the local engine's UCI output is
    negated for Black to move in `parseResults`, and Lichess is White-relative
    already. The hole finder wants side-to-move-relative. Getting this backwards
    throws nothing: concessions simply invert and the output stays plausible.
    `cpForSideToMove` owns the conversion and is tested for asymmetry.

A miss returns null, which drops the candidate rather than ranking it. A neutral
stand-in would read as "this move costs nothing" and let bad steering through.

---

## Feasibility constraints found while scoping

*Constraints 1, 2 and 4 apply to the Maia coverage engine only — the hole
finder does not call Maia at all, so it has no fail-closed path to get wrong and
runs on the anonymous scout path. Constraint 3 still binds.*

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

## Open question for Aayan — *superseded*

The 10-line budget, `τ = 0.90`, and `D = 14` are the tunable knobs. They are all
one-line constants. Worth a look at real output before they are fixed.


---

## Live-fire probe results (2026-08-14) — *superseded, see §5*

These numbers describe the Maia coverage engine, whose objective was replaced.
The engine-latency findings below still hold and still constrain §4.

Probed the real Maia service at the configured `MAIA_API_URL`, request shape
matching what the client sends (`{fen, rating, opponent_rating}`).

**Service health.** Up, warm, and fast: `GET /` 200 in 0.48s, `/predict` 0.44-0.52s
per call warm, ~2.4s on the first call. No cold-start problem observed, so the
latency risk flagged in §3 does not materialise on the Maia side.

**Response shape.** Returns **SAN**, not UCI (the resolver tries SAN first, so
this is the fast path). Always 5 moves: `humanLikeMove` + 4 `alternativeMoves`.

**Probabilities do NOT sum to 1** — measured 0.669, 0.712, 0.885, 0.909 across
four positions. Roughly 10-33% of the real distribution is in the unreturned
tail. This drove two corrections:

  - Maia's output is no longer renormalised. Scaling a top-5 to 1.0 asserts
    they always play a top-5 move and inflates every reach figure downstream.
  - τ is applied to the *known* mass (`cumulative / Σp`), so branching responds
    to the opponent's unpredictability rather than the model's reticence.
    Testing raw cumulative against τ = 0.70 would have driven nearly every node
    to the Kmax cap.

**End-to-end, against the live service:**

    LITE         1.2-1.6s   6 Maia calls   3 lines   Σ R = 0.302   7 engine calls (6 unique)
    RECOMMENDED  1.5s      11 Maia calls   6 lines   Σ R = 0.175  16 engine calls (11 unique)
    HARDCORE     2.2-2.4s  17 Maia calls  10 lines   Σ R = 0.154  29 engine calls (17 unique)

**The bottleneck is Stockfish, not Maia — the opposite of the assumption in §3.**
Maia costs ~17 calls at 0.5s, and memoisation collapses ~29 engine requests to
17 unique positions. But those 17 run in browser WASM at depth 20, which is
seconds each in an opening position where the best move is usually obvious.
Before the UI ships, `engineDepth` should be reconsidered — depth 12-14 is
near-identical in the opening at a fraction of the cost — and progress should
be reported against *engine* calls, not Maia calls.

**Repetition bug found by this probe.** With a shuffling engine stand-in the
search produced `1.Na3 Nf6 2.Nb1 Ng8 3.Na3 Nf6…` — prep that teaches nothing.
Lines now carry the set of positions they have visited and refuse to revisit
one. A real engine would rarely shuffle, but prep that can walk in circles is
a defect regardless of how it is triggered.

**Open question — coverage optics.** Σ R lands at 0.15-0.30 against live Maia,
because per-node known mass is ~0.7 and compounds with depth (0.7³ ≈ 0.34).
That number is *honest* but reads as a failing grade for prep that is fine.
Do not ship "covers 15% of their play". Options: report coverage conditional on
the model's known mass, report in-book depth instead, or report coverage at the
first branch point only. Needs a product call before the UI lands.
