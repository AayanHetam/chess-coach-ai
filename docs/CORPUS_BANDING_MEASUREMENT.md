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

## What a full build costs, from these numbers

One month of Lichess is 29.4 GB compressed and about 95M games.

| | |
|---|---|
| Download, at the 3.5 MB/s measured | **~2.3 hours** |
| Scan + parse, at 4,030 games/s | **~6.5 hours** |
| Disk, streamed (never stored decompressed) | 29.4 GB |

Four bands from one pass rather than four passes is the obvious shape: the
filter runs before any parsing, so a second tree costs only the games it keeps.
That is not built yet — the flag today produces one band per run.

Nothing here has been run at full scale. This document exists so the decision
to spend those hours is made against measured numbers rather than an estimate.
