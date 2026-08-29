# Intent-module calibration tooling

The thresholds in `src/lib/intent/intentFacts.ts` (`INTENT_CALIBRATION`) were
set against founder rulings on a corpus of real games, measured under one
exact engine regime. These scripts are how that corpus is produced, applied,
and defended. They used to live in a session scratchpad; they are in-repo
because the calibration is unreproducible without them.

## The measurement regime (do not vary it casually)

`probe-corpus.mjs` measures every position at **depth 16, single-threaded,
MultiPV 3**, with `ucinewgame` once per game and positions searched in game
order (warm transposition table — the same warmth the client's gameEval has).
Restricted probes (`searchmoves`) run MultiPV 1. Every threshold in
`INTENT_CALIBRATION` assumes numbers from THIS regime; a different depth or
thread count is a different measurement distribution, and comparing across
regimes is how the module once manufactured phantom eval swings. Stage I-2
(client-computed Tier-1 probes) must either match this regime or re-derive
the affected thresholds from a re-measured corpus.

## Workflow

```bash
# 1. Measure: engine-backed probes for a set of games (native reference
#    instrument; ~1h for the 835-ply corpus)
DEPTH=16 node scripts/intent/probe-corpus.mjs games.json probes.json

# 1b. Same corpus, PRODUCTION instrument (stockfish-17-lite-single via
#     headless Chromium — the engine every real browser runs; ~40 min).
#     Shares probe-recipe.mjs byte-for-byte with the native sweep, so the
#     two runs differ in exactly one thing: the engine.
DEPTH=16 node scripts/intent/probe-corpus-lite.mjs games.json probes-lite.json

# 2. Apply: run the REAL intent module over the probes
node_modules/.bin/tsx scripts/intent/apply-corpus.ts probes.json intent.json

# 3. Diff: after ANY behavior change, re-run (2) and diff ply-by-ply.
#    The diff must contain exactly the plies the change claims to affect.

# 4. Mutate: flip each new gate's direction/threshold and prove the test
#    suite kills every mutant (see mutate.py --help). A green suite on
#    unmutated code proves nothing — three separate intent bugs shipped
#    under green tests before this became mandatory.
python3 scripts/intent/mutate.py
```

The corpus JSONs themselves (probes + per-ply facts for the founder's games)
are local artifacts, deliberately not committed: they are large, regenerable
from the games via step 1, and derived from specific users' game history.

## Reading shadow telemetry

With `INTENT_FACTS_ENABLED` armed, production writes one content-free
aggregate row per reviewed game to the tracking warehouse
(`intent_outcomes`). The query kit lives at the end of
[supabase-tracking/QUERIES.sql](../../supabase-tracking/QUERIES.sql). Quote
**episode** counts, never raw ply counts, and never compare rows across
different `intent_fingerprint` values — a retune is a different population.
