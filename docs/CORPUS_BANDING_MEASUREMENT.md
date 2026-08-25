# The corpus is measuring the wrong players — measured, on a real sample

Everything below was measured on 2026-08-25 against
`lichess_db_standard_rated_2025-11.pgn.zst` (CC0), and against the shipped
`src/data/master-tree.json`. Both trees were read by the same walker so the
comparison is like-for-like rather than two numbers from two methods.

## The sample

| | |
|---|---|
| Downloaded | first 400 MB of the month (HTTP range), **3.5 MB/s measured** |
| Decompressed | 3.0 GB, 7.5× ratio, 3.7 s |
| Games in the sample | 1,296,901 |
| Survived `--band=improving` + blitz/rapid | **232,933 (18.0%)** |
| Scan + parse | 5 m 22 s → **~4,030 games/s** |

## The inversion, and it reverses

Share of games reaching each position. Elite is the shipped corpus
(3,439,091 games, Lichess Elite 2500+ vs 2300+); Improving is this sample,
banded on the **common (chess.com) scale** as `platformRatings.ts` defines it.

| Line | Elite 2300+ | Improving band | Change |
|---|---|---|---|
| London System (both move orders) | 1.484% | **3.009%** | ×2.0 |
| Najdorf | 2.447% | **0.205%** | ÷12 |
| Scandinavian (1.e4 d5) | 1.646% | **6.419%** | ×3.9 |
| Italian (Giuoco Piano) | 0.844% | **1.684%** | ×2.0 |
| King's Indian | 1.307% | **0.374%** | ÷3.5 |

At elite the Najdorf is **1.65× the London**. In the improving band the London
is **14.7× the Najdorf**. The ratio moves by a factor of 24.

Two live consequences in the product today:

- A 900 is told the Najdorf is nearly twice as likely as the London. At their
  level it is a twelfth as likely.
- `/learn` tags the Scandinavian "less likely to occur" off a 1.6% elite share.
  In the improving band it is 6.4% — the most common line measured here.

## The scale trap, closed before any data was built

`BANDS` has floors of 800 / 1200 / 1600 / 2000 and those are **chess.com**
numbers: `platformRatings.ts` normalises everyone onto that scale and
`resolveUserRating` returns a number on it. The Lichess dumps carry **raw
Lichess Elo**. Converted through the same anchors:

| Band | Common-scale floor | Raw Lichess floor |
|---|---|---|
| new | 0 | 0 |
| beginner | 800 | 1040 |
| improving | 1200 | 1543 |
| club | 1600 | 1875 |
| strong | 2000 | 2175 |

Bucketing raw Lichess Elo against the common floors would file a Lichess 1200 —
a `beginner` — under `improving`, a whole band out and 343 Elo adrift at that
boundary. The tree would build, the shares would sum to one, and every
frequency in the product would be measuring a population its own label
misnames. `scripts/openings/lib/bands.mjs` converts at bucket time and
`src/lib/repertoire/__tests__/corpusBands.test.ts` pins it to `BANDS` and to
`normalizeRating`, because the build script cannot import them.

Games are kept only when **both** players are in the band. A 1200 against a
2100 is not what either band's play looks like — one side is out of their depth
and the other is not being tested — and counting it would import the stronger
player's repertoire into the weaker player's frequencies.

## The split, and why the corpus is cut once rather than aggregated four ways

Four bands means either four passes over a 29 GB download, or one pass holding
four position trees in memory. The second is the obvious answer and it is the
wrong one: `process-master-pgn.mjs` is a working, load-bearing build script
whose singleton sweeps and memory ceiling are per-tree state, and rewriting it
to run four of everything risks the corpus every number in the product rests
on, for an optimisation.

So `scripts/split-pgn-by-band.mjs` reads the expensive input once and writes one
small PGN per band — `[Result]` and a truncated, comment-free movetext, nothing
else. Measured on the same 1,296,901 games:

| | |
|---|---|
| Split wall-clock | **20 s** (against 4 m 51 s to *parse* one band) |
| Games landing in some band | 700,234 — **54.0%** |
| Output size, all five bands | **151 MB** from a 3.0 GB input — 20× smaller |

| band | games | MB |
|---|---|---|
| new | 59,255 | 12.3 |
| beginner | 259,759 | 55.9 |
| improving | 232,933 | 50.6 |
| club | 120,326 | 26.2 |
| strong | 27,961 | 6.1 |

**The acceptance test passes exactly.** Building `improving` from the split and
building it directly from the full dump produce **byte-identical** position
tables: 99,030 positions, 37,401,928 characters, no difference. The split is a
lossless pre-filter, not an approximation.

The banded files are also worth keeping: a few GB rather than 29, so rebuilding
at a different depth, a different threshold or a fixed bug costs minutes instead
of another 2.3-hour download.

## Two bugs the comparison exposed

Neither was found by reading the code. Both showed up as a difference between
two builds that should have agreed.

**`truncateMovetext` could be fooled by an evaluation.** Its comment says the
move-number token "is unambiguous even inside comments and variations: `17.`
cannot appear as a SAN". True, and it can appear inside a *comment* — the
function runs before comments are stripped, and Lichess writes
`{ [%eval 9.33] }`, which matches the marker for a 14-ply build. Measured:
9.1% of games carry evals and **24 of 172,205 (0.01%)** have their first `9.`
inside one, so those games were cut a ply or two early. The effect was exactly
one missing position in 99,030 and no wrong number anywhere — small, and small
in a direction nothing could have seen.

**`matchTopPlayer` tagged strangers as Firouzja.** The pattern was
`/firouzja|alireza/i`, and `alireza` alone matches any account carrying an
extremely common given name: measured on one month, **9 distinct players** —
`Malireza2400`, `Alirezaere`, `mr-alireza` — and none of them Firouzja. The
label is sticky and rank-ordered, so one such account playing 1.e4 tagged the
most-played move in the whole corpus as his. It reaches nobody today only
because `compact-master-tree.mjs` drops the field, and a Lichess-sourced corpus
is exactly the input that would put it in front of a player. Top-player
matching is now skipped entirely for banded input, where by construction there
are no top players to find.

## What a full build costs, from these numbers

One month of Lichess is 29.4 GB compressed and about 95M games.

| step | cost |
|---|---|
| Download, at the 3.5 MB/s measured | **~2.3 h** |
| Split into five banded PGNs, streamed | **~25 min** |
| Banded PGNs on disk, kept for rebuilds | **~11 GB** |
| Per-band build, largest band, at the rate measured | **~6.6 h** |
| Four bands in parallel on four cores | **~6.6 h wall clock** |
| **Total, first run** | **~9.3 h** |
| **Every rebuild after** | **~6.6 h, no download** |

Nothing here has been run at full scale. This document exists so the decision
to spend those hours is made against measured numbers rather than an estimate.
A fraction of a month is also a coherent choice: 233k games already produced
stable shares at opening depth, and what the extra volume buys is DEPTH — the
positions that survive a 100-game threshold at ply 20-24 — not accuracy at
ply 4.
