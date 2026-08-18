# Hooking the prep engine into the learning programme

**Status:** plan → implementation, branch stacked on `feat/scout-prep-lines` (PR #351).
**Constraint (Aayan, standing):** 100% machine algorithm, 0% AI. Every number
counted or computed. No LLM anywhere in this path.

---

## 1. What is actually being asked

`/learn` is a 21-line redirect to `/plan`. The real target is the curriculum
engine, and the hook already exists there — unused.

`src/lib/curriculum/dailyPlan.ts` emits a daily task of kind `theory`:

> **Learn one opening line** — "We recommend Chessly for now while we build our
> own theory course."

That is a link to a competitor sitting inside our own daily plan, with a promise
attached to it. The prep engine shipped in #329/#351 *is* that theory course. The
work is to point the task at the player's own worst line instead of at Chessly.

## 2. The insight: same machinery, subject switched

The hole finder answers: *which positions does the subject reach often and score
below their own baseline in, and what does the engine prefer instead?*

Scout points it at an opponent. Point it at the **user** and the same question
becomes the single most useful thing a learning programme can say:

| | Scout (`/scout`) | Learn (`/plan`) |
|---|---|---|
| Subject | the opponent | **you** |
| Baseline | their score in that colour | **your** score in that colour |
| Screen | BH over their positions | BH over **your** positions |
| `betterMove` | what they should have played | **what you should have played** |
| Master ideas | context for your prep | context for your fix |
| Output | a line to steer them into | a line to stop losing |

Nothing about the statistics changes. Recency weighting still matters — more so:
a repertoire you abandoned eight months ago is not a hole you have today.

## 3. Three things do NOT transfer, and each is a silent-wrongness risk

This is the part that needs care. Reusing `findHoles` wholesale would produce a
completely plausible report that is quietly measuring the wrong thing — the same
failure mode as the White-relative centipawn sign and the scouted-colour
inversion, both of which already shipped as bugs once.

### 3.1 `reach` is inverted

`findHoles` computes reach as the product of the **subject's** move
probabilities, treating the other side's moves as free — because in scout, the
other side is you, and you simply choose them.

Point it at yourself and that reads: *"how likely am I to play into my own
weakness, treating my opponent's moves as free."* But my opponent's moves are the
ones I cannot choose. The quantity is backwards.

**Fix:** do not model reach at all. The index already measures the thing
directly — the recency-weighted share of your games that arrive at the position,
`neff / baselineNeff`, which accounts for both sides' choices because it counts
games that actually happened.

### 3.2 Concession is meaningless, and its gate is actively harmful

`concessionCp` prices what *you* give up to steer an opponent somewhere. In
self-scout nobody is steering, so the "concession" being measured is how far the
**opponent's** moves fall below the engine's choice — a quantity of no interest.

Worse, it is a hard gate: `maxConcessionCp: 50` drops any line where the
opponent's moves cumulatively cost more than half a pawn. That silently discards
precisely the most valuable lines to learn — the ones where someone plays
something objectively mediocre at you and you lose anyway. And `benefit`
subtracts `cpToScoreEdge(concessionCp)`, so raising the cap alone still zeroes
them out.

**Fix:** no concession accounting on this path at all.

### 3.3 The `side` labels flip

In `HoleMove`, `side: 'them'` means the subject and `side: 'you'` means the other
player. Under self-scout the subject IS you, so a move labelled `'them'` is yours
and one labelled `'you'` is your opponent's. Rendering those labels straight puts
every move under the wrong player's name.

**Fix:** translate once, at the boundary, in `toRepertoireHole`. Tested with an
asymmetric fixture — a symmetric one passes either way.

Consequently `keyMove` (last move by side `'you'`) is the *opponent's* last move
and is not the actionable instruction here. `betterMove` is. And `prepared` lines
predict the subject's replies — i.e. they would tell you what YOU are about to
play, which is not a prediction anyone needs. Not used on this path.

## 4. Ranking

```
teachingValue = frequency × deficit
frequency     = hole.neff / report.baselineNeff      (recency-weighted share of your games)
deficit       = hole.baseline − hole.shrunkScore     (how far below your own average)
```

Shrunk, not raw, so a five-game disaster cannot outrank a forty-game slump — the
same reason it is shrunk in scout.

A tier is still attached and still honest: `confirmed` survived Benjamini-Hochberg
over your own positions, `signal` is real but unproven, `prep` is neither. **If
nothing is confirmed the card says so.** "You have no line where you are
measurably worse than your own average" is a true and useful sentence; inventing a
weakness to fill a card is not.

## 5. Shape of the change

| File | Change |
|---|---|
| `src/lib/scout/holeFinder.ts` | Extract `createEngineSession` (evaluate + budget + sibling-compared `costOfMove`) so learn does not grow a second copy of the sibling logic that would drift. `findHoles` uses it; behaviour identical. |
| `src/lib/learn/repertoireHole.ts` | **New.** Self-scout: screen your index, collect candidates, engine pass, rank by §4, translate sides. Own config — no concession, own depth. |
| `src/lib/learn/useRepertoireHole.ts` | **New.** Fetch your archive from `/api/scout`, build both colours, cache in `localStorage`. |
| `src/lib/curriculum/dailyPlan.ts` | `secondaryTasksFor` gains optional `openingLine`; the `theory` task names your real line when one exists. |
| `src/components/plan/OpeningLineCard.tsx` | **New.** The surface. Opt-in build, like scout's BUILD MY PREP. |
| `src/pages/plan.tsx` | Mount the card; feed the cached line into `buildDailySession`. |

## 6. Cost

Both colours, ≈120 cloud evaluations each, concurrency 4 at a ~200ms p50 ≈ **12s
total**. Opt-in behind a button, cached in `localStorage` keyed by
`platform:username:color` with the newest game's timestamp as the freshness token,
so it rebuilds when they have played more and not before. Never on page load.

## 7. Verification

- Unit: ranking, side translation (asymmetric), no-confirmed-hole honesty,
  frequency vs reach, cache freshness.
- Mutation: extend `scripts/scout/mutate-holefinder.sh` with a `learn` group. A
  green test on this module has to be shown failing first — three separate green
  tests on this feature have already meant nothing.
- Browser: the card renders and builds against stubbed archive + cloud.
