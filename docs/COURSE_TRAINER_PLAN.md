# The course trainer

The screen that turns a readable opening course into a learned one.

`/learn/<course>` ships 43 courses, 24,036 lines, engine-checked, cut to the
reader's band. It can be read. Nothing in the product can ask you a question
about it. `trainerSession.ts` grew a `study` mode and a `probe` act in PR #405,
fully tested, and **nothing constructs one** — `modeOf()` returns `review` or
`repair` and there is no third door. This plan builds the door and the room
behind it.

---

## The thesis, and why it is not a course

> A curriculum tells you what you do not know. A confrontation asks first, and
> only teaches what you got wrong. The session gets **shorter** as you learn,
> which is the opposite of what a course does.

That is already written in `trainerSession.ts`'s header. The research turned up
that Chessable ships our entire thesis as a **hidden per-course toggle** —
*"Quiz Course → immediately"*, which skips the lesson, quizzes first, and shows
the text only after the first play-through. The differentiator is not the idea.
It is making it the default and the only mode.

---

## What the outside world does, and what we take

### Chessly — take the session bracket, reject the ordering

The chapter is their session unit, and each one is bracketed by a **landing
route and a summary route**, not modals: `/chapters/<id>/landing` → N lessons →
`/chapters/<id>/summary`. The landing declares the size before you start —
*"Ahead you will find 5 studies and 15 exercises"* — which is a hand-authored
sentence over measured counts, exactly the register we are allowed to speak in.

Their item ordering is Video → 8 Studies → Video → Study → 11 Quizzes → ~15
Drills. It measures nothing before it teaches, so the session length is fixed
by the author and can never shrink. We invert it: state the count that is
**left**, so the number visibly falls each sitting.

Their loudest paying-user complaint is worth writing down: a reviewer said they
joined because *"this isn't just a drill site"* and felt it became *"another
drill website"*. A pile whose size is independent of what the user knows is the
failure mode.

Honest limit on this research: the drill micro-interaction could not be
verified. Chessly's app is a client-rendered SPA behind login and no third-party
source describes its right/wrong feedback, hint or retry. We have no evidence
either way, and nothing below leans on a guess about it.

### Quizlet — take the round machine

Read out of `quenti`, an open-source reimplementation, and corroborated against
Quizlet's own help content:

- `LEARN_TERMS_IN_ROUND = 7`; every round is a concat of candidate pools then
  `.slice(0, 7)`.
- A **four-value lattice**, not a boolean: `0` unseen, `-1` missed, `1`
  familiar, `2` mastered. A boolean cannot express "missed outranks never seen"
  in the next round's queue.
- **The progress bar advances only on a correct answer.** `roundProgress += correct ? 1 : 0`.
  The round ends after 7 *correct answers*, not 7 questions.
- A miss re-queues the same item at the **back of the current round**.

That third one is the whole thing. It makes round length a direct readout of
how well it is going, which is our thesis rendered as a progress bar with zero
prose.

Rejected, with reasons: multiple choice (in chess the plausible distractors are
*good moves*, and showing four candidates teaches that the position has four
candidates); the praise bank (ten rotating variants is precisely the pattern
"no generated sentence templates" targets); Answer Streaks (resets when the
question type changes, so it penalises the escalation it sits on); and the
unbounded session, which shows "Round N" with no denominator.

One correction Quizlet hands us about itself: **do not demote a miss to the
floor.** Dropping someone who was one square off from "play it cold" back to
"pick from a list" is an insulting demotion and a false measurement.

### Chessable — the crux, in their own documentation

Their two review modes, quoted from their help centre:

| mode | what it does | their own words |
|---|---|---|
| Whole Variation *(default since 2018)* | replays the complete line to the due move | *"you have to spend more time because you're reviewing 10 moves instead of just one"* |
| Randomized | serves only due moves | *"you have to play the moves without the context of the previous moves"*, *"considerably harder"* |

The replayed moves are flagged **Overstudy** and pay no global XP. And
Overstudy is asymmetric: get it right and nothing changes, get it wrong and
*"its spaced learning timer will be reset."* A voluntary extra probe that is
net-negative.

Their own remedy for overload is to have the **user** shed load: pause
variations, pause chapters, archive courses, *"not feel compelled to do all
reviews once they are due."* One user documented 9,000+ pending reviews.

**Every number in that product grows.** XP, streak, mature count, and the queue
itself. Ours must be a number that only falls.

Worth taking: their published **soft-fail margin of 0.3 pawn for openings** —
evidence that a measured tolerance band, not string equality, is the accepted
way to accept an alternative move. And their **Difficult Moves** list, which
shows the position, the correct move, every wrong move you actually played and
its count. That is a confrontation screen already, buried behind PRO.

### Lichess — take the verdict vocabulary and the null contract

Their practice mode computes a verdict rather than scripting one, and its
vocabulary is three-valued and hand-authored:

- exact match → *"Good move"*, no alternative shown
- good but not top → **"Another was X"**
- worse → **"Best was X"**

And `studyPracticeSuccess` returns `null` until `ceval.depth >= 16` — the
product **structurally cannot speak before it has measured.** That is the shape
every claim surface here should copy.

Two more: `chapter.conceal = <ply>` withholds the continuation **server-side**
at a named ply, which is what our band cut should be; and hints escalate
`piece → move`, which is exactly the ladder our own data supports.

---

## What our data says

Measured against the shipped artifacts. Full tables and scripts in the PR.

**An earlier pass used invented band depths and every table from it was wrong.**
The real values are in `levels.ts`: `new` 4, `beginner` 6, `improving` 8,
`club` 12, `strong` 14 plies, with `enoughAt` 0.80 → 0.95.

### 1. The chapter is one sitting low down and fourteen high up

Probes per chapter, after `viewFor`'s dangling-edge trim:

| band | p50 | p90 | max | chapters over 60 |
|---|---|---|---|---|
| new | 5 | 7 | 9 | 0 |
| beginner | 11 | 23 | 34 | 0 |
| improving | 18 | 51 | 90 | 12 of 169 |
| club | 27 | 118 | 286 | 56 of 194 |
| strong | 27 | 150 | 431 | 73 of 214 |

A beginner chapter is eleven decisions. A club chapter can be 286. No single
session unit spans that, which is why the round exists.

`bandFor(undefined)` returns `improving`, so a signed-out visitor gets depth 8.

### 2. What a sitting buys

Share of real play you stay in book for, knowing the top N decisions. A path
counts only if **every** decision on it is known.

| first chapter | probes | N=5 | N=10 | N=20 |
|---|---|---|---|---|
| London, beginner | 26 | 19% | 71% | 96% |
| Caro-Kann, beginner | 20 | 22% | 86% | 100% |
| London, improving | 64 | 0% | 31% | 66% |
| Caro-Kann, club | 196 | 0% | 0% | 24% |

**Coverage is the wrong per-round number.** It reads 0% after five correct
answers in most courses, because no line is complete yet. A perfect round would
render as zero. Count decisions; save coverage for chapter completion.

### 3. The engine label is honest, and therefore silent

19,956 our-turn nodes: 97.6% `corpus-confirmed`, 1.9% `setup`, 0.3% `engine`,
0.3% `corpus`. Of the corpus-confirmed, **85.8% are the engine's exact top
move** and 99.8% within 15cp; the 32 that give up more all sit below
`MIN_OVERRIDE_DEPTH` at plies past any beginner's view.

So "engine-checked" is supportable — and printing it on 97 cards in 100 is
wallpaper. `lineNotes` already wrote the rule: show a part only when it
deviates from the ordinary case.

### 4. The hint cannot use the engine, and does not need to

Only **14.4%** of our-turn nodes carry `loss > 0`. At the rest the course move
*is* the engine move, so "the engine would rather you played X" says nothing.

The hint is a projection of the answer we already hold: **which piece**, then
**which square**. Same ladder Lichess ships. No engine, no network, no model,
nothing that can hallucinate.

### 5. A drill would replay the whole game

`startRun()` replays from ply 0 — correct for the repair path, where a measured
hole is shallow and the point is breaking a habit. For a course probe:

| band | from move 1, x3 runs | from the previous decision, x3 |
|---|---|---|
| beginner | 12 → 18 questions | 5.8 |
| improving | 15 → 21 | 5.9 |
| club | 18 → 24 | 5.9 |

That is Chessable's Whole Variation problem reproduced exactly. **The design
removes the drill rather than relocating it**, which is why no change to
`trainerSession.ts` is needed. See open question 2.

---

## The design

A new full-viewport route, `/train/course/[courseId]/[chapter]`, in
`BARE_ROUTES`, mirroring the proven `/train/opening` three-region shape.

**Six phases on one route:** contract → probe → teach → summary → sitting-done
→ closed.

### Three decisions that define it

**1. There is no DRILL act.** Not deferred — absent. A miss is re-queued at the
back of the current round; a second miss in the same round carries to the next
round rather than looping. The page imports `createSession`, `submitProbe` and
the types, **and nothing else**, asserted on the import closure. Every landmine
in that module — `advance()` wiping `knewIt`, `submitMove` silently ignoring
act `probe`, `goalFor('study') === 3` — becomes unreachable rather than fixed,
and a 42-test mutation-checked module is not touched.

**2. The teach card is a replies table with an optional quote, not a quote with
optional data.** Measured at the improving band across 3,991 probe nodes:
**12.9% carry a Wikibooks excerpt** (86% at ply 2, 4% by ply 12), while
**78.6% carry `them[]` and `rc`** on the node after the course move. Build the
card around the quote and it is empty seven times in eight. Build it around the
replies table and it is dense four times in five. This is the answer to "quote
only, stay silent" without the screen reading as unfinished.

Block order follows coverage, so the card degrades from the bottom up and what
disappears is always the last thing: verdict (100%) → the two moves (100%) →
engine facts (100%) → replies table (78.6%) → quote (12.9%).

**3. The band is resolved server-side in `getServerSideProps` and `?band=` on
this route is ignored.** The shipped reader at `/learn/[courseId]` computes the
band in the browser and sends it as a query param; `/api/opening-courses/[id]`
says in its own header that this is a size boundary and not a security one.
This route does not inherit that hole, because it does not use that route.

### The screens

**Contract.** Diagram, the chapter's numbered line, its share, three buckets
(NOT ASKED YET / STILL LEARNING / KNOWN), the sitting shape, one button. When a
chapter is capped: *"Showing the 60 most likely of 74 positions in this chapter."*

**Probe.** Rail, board, panel. `interactive` only during the ask. Illegal
geometry is rejected in `onPieceDrop` **before** the machine is called — that
is what keeps `submitProbe`'s illegal branch, which sets `feedback: 'wrong'`
under a comment reading *"no verdict, no penalty"*, unreachable. Correct: green
ring, the word `Correct.`, the SAN alone, auto-advance. A re-served position
gets an `Asked again` chip: item history as state, not as a sentence.

**Teach**, only on a miss. The two moves as tokens, the engine facts as a
two-column table, the replies table with its `rc` coverage figure beside it,
the verbatim quote when one exists and nothing at all when it does not.

**Round summary** — the screen the product is for. One integer that only falls:
`open = total − known`, animated from its value at round start. Three buckets,
the five positions studied as diagrams, and the next round named before you
commit: *"Round 3 asks 5 positions: 1 carried, 4 new."*

**Sitting done.** The whole sitting as one arrow. "Keep going" is deliberately
the secondary button — the sitting is bounded on purpose. No XP, no streak, no
confetti. The only reward is a smaller number.

**Chapter closed.** *"Nothing left to ask in this chapter at your level."*
Styled like every other end state: not an apology and not a celebration. A
confrontation trainer that cannot report finding nothing is a trainer that will
always find something, which is the ruling this repo already made on the scout
hole-finder.

### Composing analyze and hint

**Analyze** reuses the gate that already exists. `src/lib/puzzle/analysisGate.ts`
unlocks analysis only on `solved || solutionRevealed`, with "wrong" deliberately
not unlocking, enforced three times over. Same rule here, so analyze cannot be a
cheat button. Plain `<a href>`, never prefetched: `/analysis` mounts Stockfish
eagerly and ungated, so hovering must not cost 6.8 MB.

**Hint** is two buttons, probe phase only, painting `underlaySquareStyles`.
Five things stop it becoming an assist, each checkable rather than promised:

1. Its only input is `probe.node.us`, already in the SSR payload.
2. A module-graph test — written like `courses/__tests__/quarantine.test.ts`,
   on the import closure and not as a grep — asserts the route reaches no
   `useEngine`, no `@/lib/engine/**`, no `getLichessEval`, no `/api/puzzle-hint`.
3. No free-FEN entry: `hintSquares` is only ever called with a probe the round
   controller chose from this chapter's list. You cannot hand it your live game.
4. It costs the round. A hinted answer can never reach `KNOWN` that round, and
   the `hinted` flag survives into the store, so `Known` never means `was shown`.
5. A test asserts `src/sections/play/**` never imports it.

**The repertoire builder is not touched.** The trainer never reads or writes
`loadBracket`/`saveBracket`. Entry is a per-chapter CTA on the reader:
*"Train this chapter — N positions"*. Exit goes to `/learn/<course>`, not
`/plan`, so a course learner is not stranded on a plan they never measured. A
deep link to a course outside your bracket works and shows no "your repertoire"
framing: whether the chapter is yours is the builder's business.

### Copy

31 hand-authored strings, three fixed sentences, four format strings over
measured integers, and everything else is data. Three things a reviewer should
reject on sight:

1. A sentence composed from a measured value plus a judgement — the shape
   `TrainerPanel`'s Learn act already uses (*"The engine would rather you played
   {move}, by about {cp}cp"*). The teach card is a two-column table for exactly
   this reason. **See open question 4: the shipped panel is on the wrong side of
   this rule today.**
2. A praise bank.
3. Anything naming the user's ability. *"You're getting better at this chapter"*
   is a claim the screen has not measured.

---

## Three defects in merged code

All latent only because `study` is unreachable. The design routes around all
three; **D-1 should be fixed anyway**, because a landmine that is currently
unreachable is still a landmine.

**D-1. A correct answer would mint a review card.** `opening.tsx:180-184`
branches on `state.mode === "review"`, so `study` falls into the else and calls
`scheduleAfterRepair` — the only place a card is ever constructed — then
`markRepaired`. `applySm2` forces `interval = 1` when `attempts === 0`, so it
returns tomorrow. That is the exact inversion of earned-not-granted, and it is
Chessable's failure shape.

**D-2.** `trainerProgress.ts:143` normalises a resumed session's mode to
`repair`, so a paused chapter would come back as a confrontation.

**D-3.** `sessionKey` gives `study` the same empty suffix as `repair`, so
starting a chapter would silently discard a half-finished repair of a measured
hole.

---

## Pause and return

Today there is **nothing to return to**. `/learn/[courseId]` writes zero bytes
to storage — it has no per-chapter state beyond a `useState` for which
accordion is open. Nothing anywhere records that a chapter was studied. The
only resumable thing in the whole learn/train area is a single in-flight
`/train/opening` session, and it has a **3-day TTL** and one slot.

Day-to-day resumability is therefore a build item, not a check. Four rules:

**1. Mastery never expires; only the in-flight round does.** `SESSION_TTL_MS`
is 3 days and its comment is right about *sessions* — resuming into the middle
of a drill you have no memory of starting is worse than starting again. It is
wrong about *mastery*. A `ProbeRecord` carries no TTL. Come back in six weeks
and the chapter still knows which 17 decisions you own.

**2. Its own key, so it cannot collide.**
`cm.course.v1.chapter:<account>:<courseId>:<chapterIndex>`. Deliberately not
`trainerProgress`, whose `sessionKey` gives `study` the same suffix as `repair`
and whose `loadSession` coerces the mode back to `repair` on read (D-2, D-3). A
paused chapter must not be able to clobber a paused repair.

**3. Every screen is a URL.** The phase lives in `?round=N`, so a refresh, a
back button, or a link mailed to yourself lands where it should. The round
summary regenerates from the round record rather than from React state.

**4. The failure is visible.** `writeChapter` returns a boolean instead of
swallowing the exception, and a failed write renders *"Not saved on this
device."* On this origin `savedEvalsAtom` grows without eviction through jotai's
**unguarded** `setItem`, so a full origin is a real state — and an unsaved
chapter is otherwise pixel-identical to an unstudied one.

**The honest limit: this is localStorage, so it is one device.** Clearing site
data or moving to a phone loses it. Every existing progress layer in the repo
has the same property and `trainerProgress`'s header calls it intentional —
*"the working copy of one person's progress on one device."* For a repertoire
you are building over months that is a weaker promise than for a drill you did
once. Whether chapter mastery syncs to the account is open question 5.

---

## PR sequence

| PR | Contents | The acceptance test that matters |
|---|---|---|
| **1** | `src/lib/courses/probes.ts` — `probesOf(view, chapter, side)`, `CourseProbe`, `toTrainerLine`, `MAX_PROBES_PER_CHAPTER`, `sourceWords`. Pure. Ships dark | Sweep all 43 courses × 5 bands: count of probes where `expectedAt(toTrainerLine(p)) !== p.san` is **0**. Duplicate node keys within a chapter: **0**, with a control asserting the dedupe fired on w-italian, whose chapters 0 and 1 transpose |
| **2** | `chapterRound.ts` (round machine, four-value lattice) + `chapterProgress.ts` (store, `writeChapter` returns a boolean). Still dark | The round ends on the 5th **correct** answer: drive 8 asks with 3 misses, assert the boundary lands at ask 8. Hint gate swept exhaustively over 4 correctness × 2 outcomes: count reaching `KNOWN` is **0**, mutation-tested |
| **3** | The route, the contract screen, server-side band, and the reader CTA | **Segregation, asserted on `__NEXT_DATA__` and not the UI**: byte difference between the payload with and without `?band=strong` is **0**, and nodes deeper than the band's cut is **0**, with the payload asserted non-empty in the same test |
| **4** | The probe loop and the teach card. Adds a 375×667 Playwright project | The mis-drag control: an illegal drop yields **0** verdicts and **0** change to `asks`, with a legal-but-wrong drag asserted to yield exactly 1 so a dead board cannot pass. The absent-quote control on a named FEN from the 87%: **0** characters in the theory container, with a ply-2 position asserted greater than 0 |
| **5** | Round summary and sitting-done | One deliberate miss in five: KNOWN 4, STILL LEARNING 1, headline strictly falls. The memo control — force a re-render with identical props, count of `moves` props whose reference identity changed is **0** |
| **6** | Hint ladder and the analyze gate | Watch it fail first: let a hinted-correct probe reach KNOWN and confirm the e2e goes red. Engine quarantine on the import closure, with the same walker run against `/analysis` returning greater than 0 to prove the walker works |
| **7** | Earned review dates, chapter-closed screen | A clean sitting of 20 with 0 misses writes **0** cards and **0** `dueAt`; repeat with exactly one miss and assert both are exactly 1, so a run where nothing executed cannot pass |

Nothing goes into `reviewSchedule.ts`: its `upsert` is uncapped, it is keyed by
`lineKeyOf` with no namespace so a course line and a measured hole with the same
moves collide into one card, and its only reader sits behind a repertoire
measurement less than 7 days old that a course learner may not have.

---

## What is stopping the theory from being finished

Measured, not estimated. Two of the four pillars are done and the other two are
named.

**Coverage is complete.** All 43 catalogue choices have a course. 40,196 nodes,
19,956 decisions, 87.0% carrying an engine eval.

**Depth is complete for everyone below club.** At the depth each band actually
sees, why does a line stop?

| band | line ends | we chose to stop | the data ran out | too rare to prepare |
|---|---|---|---|---|
| new | 419 | **99%** | 0% | 0% |
| beginner | 1,157 | **96%** | 2% | 2% |
| improving | 2,285 | **88%** | 7% | 5% |
| club | 4,516 | 61% | **25%** | 14% |
| strong | 5,629 | 50% | **32%** | 18% |

Below 1600 the theory is finished: 96-99% of lines end because the band said
stop, not because we ran out. From club upward a quarter to a third of lines
end at the corpus wall — that is the ply-24 ceiling, and the fix is a deeper
corpus, not a different generator.

So what is left is not depth and not coverage. It is:

1. **The trainer** — the seven PRs above. Theory nobody can be asked about is a
   book, not a course. This is the whole gap between "we have theory" and
   "people are learning theory".
2. **Relevance.** Every share on every screen comes from Lichess Elite 2300+.
   A 900 is told the Najdorf is nearly twice as likely as the London when at
   their level that is close to inverted. The rating-banded corpus is an ~11
   hour build and wants the parallel aggregator first.
3. **Traps**, which are blocked on (2) by definition: a trap is frequent *in
   your band* and losing. A 2300+ corpus is structurally blind to them.
4. **Words**, which are capped by the sourcing decision, not by effort. 12.9%
   of decisions carry a Wikibooks quote. The answer is the replies table, and
   the one cheap win is adding our own move's corpus share to the node — the
   builder already computes it at `course.mjs:239` and throws it away at :395.

Nothing on that list blocks starting. Items 2-4 make an existing product
better; item 1 is the product.

---

## Not building

- Book status during live play. Permanently out of scope.
- Any LLM anywhere on this path.
- Any generated prose.
- Multiple choice, streaks, XP, a praise bank, a growing number of any kind.
- **Keyboard move entry.** `PuzzleBoardSurface` does not support it and forking
  it is forbidden by its own spec. A keyboard-only user cannot answer a probe.
  That is a real, stated gap and the honest fix is a change to the shared board
  in its own PR, not a fork inside this feature.
