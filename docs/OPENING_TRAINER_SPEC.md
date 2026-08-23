# Opening Trainer — design spec

Target: the screen that turns "here is the line costing you games" into "you have
fixed it". Sits beside the Puzzle Coach in importance, so the bar is the same:
the layout and the hierarchy are the point, not the decoration.

Read this before touching layout code.

---

## Part 1 — The two references, and why we do not copy either

### 1.1 Chessable MoveTrainer

Structure, from their own docs and from Matuschak's teardown:

- Card-based spaced repetition, Anki-shaped. A position is served just before
  the algorithm predicts you forget it.
- A lesson **alternates prose and a single move**: read commentary, play the
  move, read the next commentary, play the next move.
- The board is the input device, so answers grade themselves.
- Transpositions do not count as errors.

What is genuinely good, and worth taking:

1. **The board is the answer field.** No multiple choice, no "click to reveal".
   Recall is motor as well as verbal, and the board makes the two the same act.
2. **One move per beat.** Prose is delivered in the position it belongs to,
   never as a wall of text up front.
3. **Auto-grading is instant.** No self-report, no "did you get it right?".

The documented weakness, in their users' words: the interface **is dense and
assumes fluent notation**, which makes it the wrong first app for a beginner.
That is precisely our audience.

### 1.2 Chessly

- Sidebar: courses, lectures, training. Dashboard shows current study + progress.
- A course is a video lesson, plus an interactive study board with written
  annotations, plus drills and quizzes.
- Drills are guided, step-by-step.

What is good: **one concept per lesson**, and a clear separation between
*being shown* and *being tested*. What we cannot have: Levy. The video and the
authored repertoire are the product, and they are not licensable.

### 1.3 The thing neither of them can do

Both platforms teach you a repertoire **somebody else chose**. They open with an
assertion: *this is the line, learn it.*

We know the user's own record. We can open with evidence instead:

> You have reached this position 150 times. You score **30%** here. Your average
> is **45%**. Masters play your move in 6% of games.

That is not a better presentation of the same product. It is a different product,
and it is the one our data earns. The trainer is therefore built as a
**confrontation, not a curriculum**.

---

## Part 2 — The loop

Three acts, in one session, on one line.

### Act 1 — CONFRONT

Board sits at the position **one ply before** the move the screen flagged. It is
your turn. Nothing in the panel but the instruction: *play the move you normally
play here.*

You play your habitual move, because it is habitual. Then, and only then, the
right panel fills in with your own record.

Why this order: being told "you play c3 too much" is an accusation. Watching
yourself play c3 and then reading your own scoreline is an observation. The
second one lands, and it does not require us to be believed.

If they play something **other** than their habit, that is a real answer too:
say so, and skip to Act 3. Do not pretend they made the mistake.

### Act 2 — LEARN

The panel now carries, in this order:

1. **Your record here** — score, your baseline, games, p-value.
2. **The verdict** — one of two sentences, never both:
   - engine disagrees by ≥30cp: *"The engine would rather you played Nf3."*
   - engine agrees: *"Your move is sound. The position is what does not suit
     you."*
3. **The theory**, verbatim from Wikibooks, with attribution.
4. **What masters do** — the principal move, and where yours ranks.

The board shows the improvement as an arrow, not as an animation that plays
itself. The user presses to see it.

### Act 3 — DRILL

Replay the line from the start. The opponent plays their **real** replies, drawn
from their own frequency table, not from a script. You play the corrected move.

Three consecutive clean runs and the line is marked repaired. A miss resets the
streak, and shows the correction inline, once.

Why three: one is luck, two is a pattern, three is the smallest number a player
will accept as evidence about themselves. It is also the number the founder
already set for "real benefit consistently" on the scout side.

---

## Part 3 — Layout

Three regions, full viewport height, no page scroll on desktop. Same family as
`PUZZLE_TRAINING_LAYOUT_SPEC.md`, re-proportioned because a board needs more
room than a text question.

| Region | Width | Treatment |
|---|---|---|
| Left rail — the session | 220px fixed | Flush to viewport edge, no radius, one step darker than the page |
| Centre — the board | flex, max 620px | No card. The board IS the surface |
| Right — the teaching panel | 380px fixed | Glass card, `1.5rem` radius, blur 12px |

Below 1024px: rail collapses to a horizontal progress strip at the top, board
goes full width, panel stacks beneath. Board must never be smaller than 320px.

### 3.1 Left rail

1. Back link, `← Your plan`, exits the session. Always present, top-left. A
   trainer you cannot leave is a trap.
2. The line, in mono, as the session title: `1.e4 c5 2.c3`.
3. `THE SESSION` label, hairline rule.
4. Three act rows, in order, each with a status glyph:
   - hollow ring = not reached
   - filled ember disc = current
   - filled green disc + check = done
   Labels: `Play your move` / `See why it costs you` / `Drill it three times`.
5. Drill counter, pinned under the third row when Act 3 is live: three pips,
   filling left to right. Resets visibly on a miss, so the cost of a miss is
   legible before it happens.

### 3.2 Centre

Board only, centred, with a caption strip beneath:

- Left: whose move it is, in words (`You play White`), never a coloured dot alone.
- Right: ply indicator `move 2 of 4`.

The board is `PuzzleBoardSurface`. It already owns selection, legal-target dots,
last-move highlight and the red/green flash ring, and it is the shared look
across every solving surface in the product. Do not fork it.

### 3.3 Right panel

One column, `24px` gap, scrolls internally if it must. Contents by act, as
Part 2. Empty in Act 1 except the instruction, because a panel that shows the
answer before the question is a panel that gets ignored.

---

## Part 4 — Motion

Tokens from the design OS: 180-220ms, ease-out entering, ease-in leaving.

| Event | Motion |
|---|---|
| Panel content arriving after your move | fade + 8px rise, 200ms, staggered 40ms per block |
| Correct move | the board's existing green flash ring |
| Wrong move | the board's existing red flash ring, then the piece returns |
| Act advance | rail glyph crossfades, 180ms |
| Drill pip filling | scale 0.8 → 1, 160ms, spring |

`prefers-reduced-motion` drops every transform and keeps the opacity changes.
Nothing in this screen conveys meaning through motion alone.

---

## Part 5 — What this screen must never do

- **Never invent a line.** Every move shown comes from the engine, the master
  corpus, or the opponent's own frequencies. No model writes a move.
- **Never paraphrase the theory.** It is CC BY-SA and it is quoted verbatim with
  attribution, or it is absent.
- **Never claim a weakness the screen did not measure.** If the line is `signal`
  rather than `confirmed`, the panel says so in those words.
- **Never grade a transposition as wrong.** Compare positions, not move strings.
  This is the one Chessable behaviour we must match exactly.
- **Never block on the engine.** A dead cloud eval degrades to the results
  signal, as everywhere else in this feature.

---

## Part 6 — Build order

1. `src/lib/learn/trainerSession.ts` — the session state machine, pure. Acts,
   grading, drill streak, transposition-safe comparison.
2. `src/components/train/` — rail, board pane, panel, and the three act views.
3. `src/pages/train/opening.tsx` — the route, wiring the cached repertoire
   report and the theory fetch.
4. Entry from the `/plan` card: `Fix this line`.
5. Coverage: unit on the state machine, mutation group `trainer`, browser test
   that plays a full session, screenshots looked at on desktop and 375px.
