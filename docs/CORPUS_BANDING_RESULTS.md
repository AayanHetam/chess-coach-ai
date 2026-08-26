# Rating-banded corpus: what was built and what it measures

Built 2026-08-26 from the CC0 Lichess standard-rated dump (2025-11), on the
233k-game sample Aayan approved rather than the full 29.4 GB month. The full
run remains available and is a one-command re-run; what it buys is depth at
ply 20-24, not accuracy at ply 4, and nothing here is limited by sample size.

## The finding

Every frequency on `/learn` used to come from Lichess Elite 2300+. Measured
per band on the same walk, against the same catalogue, with the same build
script, the answers to 1.e4 look like this:

| corpus | games | 1...e5 | 1...c5 | 1...d5 | 1...c6 |
|---|---:|---:|---:|---:|---:|
| new (under 800) | 59,255 | **62.6%** | 4.5% | 11.1% | 4.1% |
| beginner (800-1199) | 259,759 | 53.3% | 10.3% | 10.1% | 6.5% |
| improving (1200-1599) | 232,933 | 39.5% | 18.0% | 10.4% | 8.7% |
| club (1600-1999) | 120,326 | 26.9% | 26.6% | 8.9% | 10.9% |
| strong (2000+) | 27,961 | 20.1% | 35.0% | 5.3% | 12.3% |
| Elite 2300+ | 3,439,091 | 25.2% | **35.5%** | 3.5% | 11.5% |

A player under 800 meets 1...e5 **fourteen times** more often than the
Sicilian. The screen was ranking the Sicilian first, because at 2300+ it is
first. Both directions are monotone across all five bands, which is the part
that matters: a bug produces noise, not a gradient.

The same measurement on named openings, taken off the trees:

| corpus | London (both move orders) | Najdorf | London : Najdorf |
|---|---:|---:|---:|
| new | 2.39% | **0.000%** | — |
| beginner | 3.34% | 0.05% | 70 : 1 |
| improving | 3.01% | 0.21% | 15 : 1 |
| club | 2.68% | 0.62% | 4.3 : 1 |
| strong | 2.43% | 1.56% | 1.6 : 1 |
| Elite | 1.49% | 2.45% | **0.6 : 1** |

The Najdorf occurs **zero times** in 59,149 games by players under 800. It
needs ten accurate moves to reach, so this is close to true by construction —
which is exactly why it is a good control. A banding that did not show it
would not be measuring what it claims to.

## Split

`scripts/split-pgn-by-band.mjs`, one pass over the dump:

```
read     1,296,900 games
kept       700,234  (54.0%)
new         59,255   beginner 259,759   improving 232,933
club       120,326   strong    27,961
```

Both players must be inside the band, at blitz or rapid, with ratings
converted onto the common (chess.com) scale first.

## Build parameters, and why they are uniform

```
node scripts/openings/build-banded-maps.mjs <bandsDir> <band>
  --plies=14 --min-games=3 --moves-per-slot=10
```

The same three numbers for every band, on purpose. Tuning per band would make
every difference between two band maps ambiguous between "these players
differ" and "these builds differ", which is the one question the data exists
to answer.

**`--moves-per-slot=10`, not the Elite build's 6.** A display decision, and it
turns out to be calibrated on how concentrated the corpus is. At
`1.e4 e6 2.Bc4`:

| corpus | distinct replies | replies to reach 80% | to reach 90% |
|---|---:|---:|---:|
| Elite | 9 | **1** | 1 |
| club | 13 | 2 | 5 |
| new | 21 | **7** | 10 |

Six replies would not have shown *less* at sub-800; it would have shown six
replies and a `replyCoverage` of 0.71 while claiming to describe the position.
Ten is the smallest cap clearing the build guard on every band, measured by
sweeping 6 and 10 across all five.

## Three bugs this exposed

**1. The reply-sum guard rejected healthy data.** It summed shares *after*
rounding each to 4dp and compared against a flat `1.0001`. A position where
the shown replies genuinely are all of the play sums to exactly 1.000000 before
rounding and 1.000200 after, so it failed. It never fired on Elite because no
slot there has six or fewer distinct replies; it fired immediately on a banded
corpus, where thin positions are normal. The tolerance is now the rounding
budget the build itself spends, `rows × 5e-5`.

**2. Derived slots the corpus cannot describe.** `1.e4 e5 2.Nc3 Bc5 3.Na4
Bxf2+` is reached by nobody under 800 — 3.Na4 is only played by people who
then go wrong differently — so the slot had no measured replies and the build
failed on a dead end. A gap whose child position has no play is not a decision
anybody faces; it is now skipped at creation and **counted in the build
output**, never silently: six such slots in `new`, two in `beginner`, and zero
in `improving`, `club`, `strong` and Elite.

**3. `--band=` on already-split input would have silently kept nothing.** The
split writes a minimal PGN — `[Result]` and movetext — so the rating headers
`--band=` reads are gone. Passing it there drops every game and reads as "this
band has no data". `--band-label=` stamps the band without filtering, and the
two are mutually exclusive.

## The control that proves the changes are inert

With default flags the build reproduces the shipped Elite map **byte-for-byte**
across all 131 slots and every transposition. The only difference is the two
new `meta` fields:

```
body identical: true
meta new: … "band":null,"bandScale":null …
```

So the rounding tolerance, the parameterised cap, and the undescribable-slot
skip provably changed nothing about the Elite derivation. Any difference
between a band map and the Elite map is a fact about the players.

## What is banded and what is not

| surface | corpus |
|---|---|
| `/learn` bracket, shares, coverage | **banded**, per the reader's band |
| `/api/repertoire?band=` | **banded**, cached per band |
| Opening courses and the course trainer | still Elite — courses are generated from the 24-ply Elite tree |
| `/api/opening-explorer` | still Elite |

The trainer's "Frequencies from" row keeps naming Elite for that reason. The
two are allowed to differ; what is not allowed is one screen claiming the band
because a different screen earned it.

## Artifacts

Committed: `src/data/repertoire-map.{new,beginner,improving,club,strong}.json`,
~1.1 MB total, one read per request, traced in `next.config.js`.

Not committed: the per-band PGNs and trees (154 MB and ~230 MB). They are build
inputs; nothing at runtime reads a tree.
