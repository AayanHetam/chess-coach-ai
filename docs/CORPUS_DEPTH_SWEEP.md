# Corpus depth sweep

Measured 2026-08-24 on the full Lichess Elite corpus, 3,439,091 games,
2024-12 → 2025-11, aggregated to **24 plies**. Reproduce with:

```
node --max-old-space-size=14336 scripts/process-master-pgn.mjs all.pgn tree24.json 24 10
node --max-old-space-size=14336 scripts/compact-master-tree.mjs tree24.json out.json \
     --max-positions=N --source="…"
```

The question this answers: the shipped tree stopped at 14 plies (move 7), and
nothing could teach past it. Was that a data limit or a build parameter?

**A build parameter.** The tree does not explode with depth.

## Positions by threshold, at 24 plies

| min games | positions | move rows | shipped size |
|---|---|---|---|
| ≥ 10 | 463,960 | 1,831,111 | ~54 MB |
| ≥ 25 | 196,200 | 974,984 | 25.9 MB *(measured)* |
| **≥ 50** | **99,836** | **581,026** | **14.4 MB** *(measured)* |
| ≥ 100 | 50,286 | 339,617 | ~8 MB |
| ≥ 200 | 25,369 | 196,098 | ~4 MB |
| ≥ 500 | 10,250 | 94,994 | ~2 MB |

Size model `bytes ≈ 62·positions + 15·rows` reproduces both measured points
within 1.5%, so the unmeasured rows are projections from a calibrated model
rather than guesses.

**The headline: ≥50 at 24 plies is 14.4 MB against 13.7 MB for ≥25 at 14 plies.**
Ten more plies for 5% more bytes. Depth was never what the size was being spent
on — the shallow tail was.

## Positions by shallowest ply, at ≥50 games

Judged on the *shallowest* ply a position was seen at, so a common opening with
an obscure deep transposition into it is not counted as deep.

| ply | positions | cumulative |
|---|---|---|
| 0-6 | 9,498 | 5.9% |
| 7 | 7,113 | 9.5% |
| 8 | 9,063 | 14.1% |
| 9 | 10,827 | 19.6% |
| 10 | 12,509 | 26.0% |
| 11 | 13,892 | 33.1% |
| 12 | 14,874 | 40.7% |
| 13 | 15,310 | 48.5% |
| **14** | **15,317** | **56.3%** |
| 15 | 14,730 | 63.8% |
| 16 | 13,871 | 70.8% |
| 17 | 12,504 | 77.2% |
| 18 | 11,037 | 82.8% |
| 19 | 9,490 | 87.7% |
| 20 | 8,029 | 91.8% |
| 21 | 6,569 | 95.1% |
| 22 | 5,289 | 97.8% |
| 23 | 4,278 | 100.0% |

The count **peaks at ply 13-14 and decays**. It does not grow geometrically,
because deeper positions are rarer and the threshold prunes them faster than
branching adds them. Plies 14-23 are 43.7% of the tree, not a multiple of it.

This is the number the whole corpus programme hung on, and it was deliberately
not extrapolated from the 14-ply tree beforehand — the per-ply growth factor was
still 1.07× at ply 13, which projected a far worse outcome than the truth.

## Effect on the bracket: none

Rebuilding `src/data/repertoire-map.json` against the 24-ply ≥50 tree instead of
the 14-ply ≥25 tree produces:

- identical slot ids (131)
- **zero** slots whose share moved by more than 0.5pp
- zero briefs gained or lost, zero mainlines lengthened
- identical gap entries (164) and identical choice absorb values (43/43)

Raising the threshold from 25 to 50 costs nothing at bracket depth, because
every slot sits at plies 0-6 where positions carry thousands of games. The
depth is a pure gain.

## Throughput, measured

Two projections in the plan were wrong and are corrected here.

**Movetext truncation gains 3%, not 3-5×.** 287s vs 296s on one month, with
byte-identical output. Elite PGNs carry no `%eval`/`%clk` comments to skip; the
speedup was projected for raw Lichess dumps, which do. Truncation stays because
it is free and will matter for the banding build.

**The wall is `chess.js`, not parsing.** Profiled at 14 plies:

| | games/sec |
|---|---|
| moves only | 1,292 |
| moves + `fen()` every ply | 1,310 |
| moves + `fen().split().slice().join()` | 1,268 |

`fen()` is not the cost; move generation is. Observed end-to-end throughput is
~975 games/sec at 14 plies and ~545 at 24 plies.

**Consequence for rating banding.** Scanning ~40M raw games for three bands is
~11 hours single-threaded, not the ~2.8 estimated. The aggregation is a
map-reduce over independent byte ranges, so it parallelises cleanly across
cores; build that before the banding run, not before this one.

## Full-corpus build cost

| step | wall clock |
|---|---|
| download 12 Elite months (946 MB zipped) | ~2 min |
| aggregate to 24 plies, ≥10 | 105 min |
| compact to a shipping threshold | ~90 s |
