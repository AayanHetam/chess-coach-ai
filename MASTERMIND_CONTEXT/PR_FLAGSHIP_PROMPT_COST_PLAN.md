# PR — Flagship prompt cost: slim the uncached half

**Status:** implemented, measured, gated.
**Branch:** `perf/contract-prompt-slim`
**Trigger:** marketing ramp-up (2026-09-01). `enhanced-analysis` is ~93% of AI
spend; the coach is currently paused in prod (`AI_COACH_DISABLED=true`), so the
right time to cut per-review cost is before it is switched back on.

## The measurement that set the target

30 days of `llm_calls` (the capture is now permanently disabled, so this is the
last window that exists) attributed spend as:

| feature | model | calls | est. cost |
|---|---|---|---|
| enhanced-analysis | sonnet-4-6 | 31 | **$4.13** |
| puzzle-chat | sonnet-4-6 | 45 | $0.25 |
| puzzle-hint | haiku-4-5 / sonnet | 29 | $0.05 |

`enhanced-analysis` carried ~33k uncached input tokens per call. Only the FIRST
system block carries `cache_control` (`llmProvider.ts`), and the contract rides
in the **user turn**, so that whole payload is billed at full price on every
review. The module doc in `serialize.ts` claiming byte-stability "keeps the
Anthropic prompt-cache prefix warm" is wrong as written — nothing in `messages`
is ever cached.

Per-path cost, measured over the 10 `fixtures-real` contracts:

| block | share of contract JSON |
| --- | --- |
| `insights` | 47.5% |
| `moveTable` | 43.4% |
| eval `provenance` (493 copies) | 11.4% |
| `moveTable[].fenBefore` | 5.3% |
| gold examples (fixed text, user turn) | 17.2% of the user turn |

## What changed

Everything happens inside `serializeForVerbalizer` — the **model-facing
projection**. The `CoachContract` OBJECT is untouched. That distinction is the
whole safety argument: the referee, the `san_whitelist` square pool
(`collectContractWhitelist`, armed at `error`) and `renderLegacyPrompt` all read
the object. A removal made in the builder or the types would shrink the license
pool and produce blocking false positives; a removal made here cannot.

1. **`EvalFact.provenance`** — the charter orders eval figures copied verbatim
   from `display` and says "say nothing else about provenance". Its depth is
   already on the EvalFact and in `evalIntegrity.minDepth`. Grounded sources
   (chessdb/lc0/maia/syzygy) KEEP their provenance — the charter grades hedging
   on those.
2. **`pvUci` beside a `san` array** — UCI is never sayable (MOVE-NAMING
   DISCIPLINE admits SAN only), so shipping it can only invite a
   mis-transcription. The legacy renderer's `pvUci[0]` fallback reads the
   object, so it keeps working.
3. **`moveTable[i].fenBefore` when it equals `moveTable[i-1].fenAfter`** — pure
   chain redundancy. Row 0 always keeps its own.
4. **All-empty `featureDelta` branches** — `isEmptyDelta` already carries that
   signal.
5. **Gold examples moved from the user turn to the cached stable system block.**
   They are argument-free, byte-identical instruction about HOW to write, not
   per-game evidence. In the user turn they cost full price every review; behind
   the cache breakpoint they cost a cache read.

(3) and (4) are conventions, so the charter now states both: an absent branch
means "no change", never "unknown".

## Measured result (real tokenizer, `count_tokens`, 10 fixtures)

| | before | after |
|---|---|---|
| user turn (uncached, full price) | 17,820 tok/review | **11,832 tok/review** (−33.6%) |
| stable system block (cached) | 9,052 | 11,760 |

Input cost per review: **−32.1% when the system block is a cache hit, −14.6%
when it is a miss.** It is a win in both states — there is no traffic pattern
where this costs more.

## Why it is safe

`src/lib/contract/__tests__/serializeProjection.test.ts` pins the two properties
nothing else covered, on real fixtures:

- **Nothing sayable is lost** — every cite token (`LineFact.id`), every eval
  `display`, every SAN survives. A field that silently stops reaching the model
  would not fail CI; it would just make the coach quietly vaguer.
- **The contract object is never mutated** — deep-compared before and after.
- **Removals are re-derived independently** of the implementation, so an
  over-broad strip shows as a diff, not as a smaller number nobody reads.
- **The fenBefore chain reconstructs exactly**, replaying the stated convention.

All four mutants were killed before the tests were trusted: projection disabled,
over-strip of `display`, unconditional `fenBefore` drop, and in-place mutation
of the caller's contract.

## Measured follow-up, deliberately not taken here

**EvalFact down to `display` alone** (dropping `cp`, `mate`, `depth`,
`sentinel`) is worth a further **8.4% of the contract JSON** — 493 eval objects,
33,409 chars today vs 9,374 as display-only. The charter already forbids the
model from computing evals and orders `display` copied verbatim, so on the face
of it those fields are as dead as `provenance` was.

It is NOT in this PR because it would confound the A/B validating this change —
the gate run must score the artifact that ships.

**Both edge cases have since been checked, and both argue FOR the cut:**

    03_sentinel_timeout  {"cp":0,"depth":0,"display":"engine data unavailable",
                          "mate":null,"sentinel":true}
    04_invalid_san_trunc {"cp":null,"depth":12,"display":"","mate":null,
                          "sentinel":false}

Blank `display` has `cp` and `mate` both `null`, so nothing is lost by dropping
them. The sentinel case is more interesting: we currently show the model
`cp: 0, depth: 0` — the "flagged, not forged" client-timeout zero — sitting
right beside a display that reads "engine data unavailable". The charter then
has to *forbid* the model from printing "+0.00". Removing `cp`/`depth` from the
model's view deletes that hallucination vector at the source rather than
policing it in prose, which makes this a correctness change with a cost bonus,
not the other way round.

Sizing (post-#464 contract, 10 fixtures, 493 evals):

| variant | saving |
| --- | --- |
| keep `{display, sentinel}` | 5.5% of contract JSON |
| keep `{display}` only | 8.4% |

Recommend the conservative variant — `sentinel` is a cheap boolean the guard
logic reads — as its own PR with its own gate run.

## Not done, and why

- **`bestWas` on non-carded moves** (~12% of the contract) — 70 of 84 rows carry
  a full 10-ply refutation for a quiet move. Dropping it shrinks the set of
  citable facts, which is a product ruling, not an encoding fix. Left for Aayan.
- **The ladder regen slice** (`ladder.ts:352-375`) — bespoke inline JSON, does
  not import `serialize.ts`, so it is a separate fix. It fires rarely (1 of 25
  cards in the one recorded verify run) but is flagship-tier; worth revisiting
  if `contract_enforce_card` logs show `regenerated` climbing under real load.
- **The legacy 3.6 path's randomized gold examples**
  (`route.ts:865`, `selectExamples` uses `Math.random()`) — genuinely varies
  per call, but it rides in the uncached user turn, so it costs a fixed
  1.4–2.7k chars rather than breaking any cache. Out of scope here.
