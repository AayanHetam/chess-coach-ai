# Puzzle Training — Acely-format layout spec

Target: rebuild the puzzle-training screen (`/puzzles`) to the three-region
practice format used by Acely's SAT trainer. Reference screenshot supplied by
Aayan 2026-08-10.

This doc is the reference teardown + the element-by-element translation to
chess + the build plan. Read the teardown before touching layout code; the
proportions and the hierarchy are the point, not the decoration.

---

## Part 1 — The reference, measured

Screenshot 2940×1912 native; all coordinates below are at the 2000×1301
measuring scale (×1.47 → native).

Three regions, full viewport height, **no page scroll**:

| Region | x-range | width | Treatment |
|---|---|---|---|
| Left rail — session navigator | 0 → 348 | 17.4% | Navy `#0E2748`, full-bleed, flush to viewport edge, no radius |
| Center — the question | 370 → 1366 | ~50% | White card, radius ~12, hairline border, soft shadow |
| Right — the AI tutor | 1390 → 1980 | ~30% | White card, same treatment, **separate** card |

A 6-dot vertical grip sits in the gutter at (1377, 673) — the center/right
split is user-resizable.

### 1.1 Left rail
1. Wordmark, white, heavy rounded display face, ~40px, at (36, 98).
2. `← Back to SAT` — white, ~17px, y≈178. Exits the session.
3. `Math` — white, ~30px bold, y≈232. The **subject of this session**.
4. `TODAY'S QUESTIONS` — uppercase, ~12px, letterspacing ~0.08em, muted
   blue-gray, followed by a hairline rule running to the rail's right padding.
5. **The question list.** One row per item, ~56–80px pitch (rows grow to fit).
   - Status glyph at x≈51, 22px: **hollow white ring** = current/unanswered;
     **filled green disc `#4ADE80` + white check** = answered.
   - Label is the question stem itself, one line, ellipsis-truncated
     ("A sample of granite has a…"). Inline math renders as real LaTeX in
     serif italic, so rows with display math expand to three lines.
   - Active row: rounded-rect fill (radius ~10) one step lighter than the rail
     (`#1B3A63`-ish), spanning the rail's inner width.
   - No numbering, no per-row timing, no chevrons. The list scrolls and is
     clipped at the bottom by the user chip.
6. **User chip**, pinned bottom: rounded card in the lighter navy holding a
   44px circular avatar, the first name, and a right-aligned gear icon.

### 1.2 Center card
1. **Toolbar strip** (y 60→168, closed by a full-width hairline divider).
   - Left, low emphasis: outline clock + `00:00:13` timer + an
     **eye-with-slash** toggle to hide the timer.
   - Right: three **icon-over-label** buttons, ~105px pitch, no border, no
     fill — `Calculator`, `Reference` (√x), `Eliminate` (struck-through ABC).
     Icons ~22px, labels ~13px.
2. **Question stem** — y≈233, spans the full text column (x 402→1335).
   **Serif**, ~21px, line-height ~1.55. Left-aligned, ragged right. The single
   most prominent thing on screen.
3. **Answer choices** — 4 stacked buttons, y 371→711.
   - Width ~609px = only **61% of the card**, and **indented** (starts x 563,
     not 402) so the block reads as a distinct interactive zone rather than a
     continuation of the prose.
   - Each: height ~72, radius ~10, white fill, ~1.5px navy border, no shadow.
     Pitch ~90 → ~18px gaps.
   - Inside: a **circled letter badge** (thin navy ring, serif bold A/B/C/D)
     at x≈597, then the choice text ~24px to its right, same serif as the stem.
4. **Action bar** — divider at y≈1160, buttons centered as a pair at y≈1226.
   - `Submit Answer`, **disabled**: gray fill, gray text, radius ~8, ~180×48.
   - `New Hard Question`: white fill, navy border, navy text, **chevron-down**
     on the right → a dropdown that picks the *difficulty* of the next
     question. Wider (~300px).
   - Commit on the left, escape hatch on the right, both bottom-anchored.

### 1.3 Right card — the tutor, empty state
1. **Illustration**, centered, ~300×260 at y 285→545: hand-drawn black ink line
   art with halftone stipple, a hand holding a lightbulb, the glass filled
   **mint green** — the only saturated color in the panel. Deliberately not a
   slick vector icon; the hand-drawn quality *is* the personality.
2. **Copy** — "Ask me a question or request a hint to get started", centered,
   two lines, ~19px, medium gray. Second person, conversational.
3. **Hand-drawn arrow** — light periwinkle sketched curve with a loop, sweeping
   from under the copy down to the composer (y 655→925). Exists only in the
   empty state.
4. **`Hint` pill** — bottom-left above the composer: pale blue fill, blue text,
   small lightbulb icon, fully rounded, ~90×36.
5. **Composer** — full-width rounded input (radius ~14, ~1.5px light border),
   placeholder "Ask Acely a question", with a circular navy **send button**
   (up-arrow) inset at the right edge.

### 1.4 Why it works — the principles to carry over
- **One item at a time.** Center card holds exactly one question; the rail holds
  the set. You never scroll between problems.
- **Progress is ambient.** Green checks accumulate in the rail, so you always
  know how much is left without leaving the question.
- **The tutor is a peer panel, not an overlay.** It never covers the problem,
  and the resize grip says "make it as big as you want."
- **Empty states do work.** Illustration + copy + drawn arrow turn a blank
  panel into an invitation.
- **Restraint in color.** Navy, white, one gray. Green *only* for completion,
  blue *only* for assist affordances, mint *only* inside the illustration.
- **Serif for content, sans for chrome.** The problem and the answers are serif;
  every label, button, and tool is sans. That one split makes the question feel
  like the artifact and everything else like the app.
- **The escape hatch is first-class.** "New Hard Question" is as visually heavy
  as Submit — skipping isn't punished, and difficulty is steerable inline.

---

## Part 2 — Where `/puzzles` stands today

**Which screen is "puzzle training".** The solving screen is **`/puzzles`**
(`src/pages/puzzles.tsx`). `/practice` is only a thin 3-card modes hub that
redirects `?theme=` straight to `/puzzles` — but the legacy footer labels it
"Puzzle training" ([src/sections/layout/index.tsx:191](../src/sections/layout/index.tsx#L191)),
so the name is ambiguous in the codebase. This spec targets `/puzzles`.
`PuzzleRush` and `PatternTraining` (rendered inside `/practice`) are separate
timed drills and are out of scope. `/placement` is *not* on the glass allowlist
and still renders the legacy light NavBar — worth fixing separately.

`src/pages/puzzles.tsx` (1863 lines) is a **two**-column grid, not three:

- [src/pages/puzzles.tsx:1315-1325](../src/pages/puzzles.tsx#L1315-L1325) —
  `gridTemplateColumns: minmax(0,1fr) minmax(440px, 540px)`, board column plus
  coach column, `minHeight: clamp(540px, 70vh, 740px)`.
- Board column: glass card at
  [puzzles.tsx:1329-1350](../src/pages/puzzles.tsx#L1329-L1350) wrapping
  `PuzzleBoardSurface` ([:1376](../src/pages/puzzles.tsx#L1376)), with a
  `sessionHud` pinned top-right ([:1356-1364](../src/pages/puzzles.tsx#L1356-L1364))
  and a status row underneath
  ([:1460-1526](../src/pages/puzzles.tsx#L1460-L1526)) carrying the
  Solved / Try again / "White to move" pill and `#id · rating`.
- Coach column: `PuzzleCoachPanel`
  ([src/components/puzzle/PuzzleCoachPanel.tsx](../src/components/puzzle/PuzzleCoachPanel.tsx),
  835 lines), mounted at [puzzles.tsx:1711](../src/pages/puzzles.tsx#L1711).
  More of the reference is already built here than it first appears:
  - Composer `TextField` at
    [PuzzleCoachPanel.tsx:772-803](../src/components/puzzle/PuzzleCoachPanel.tsx#L772-L803),
    placeholder "Ask for a hint…" / "Ask about this puzzle…", with a **circular
    ArrowUp send button** at :804-830 — this is already Acely's composer.
  - `HintStageRow`
    ([src/components/puzzle/HintStageRow.tsx](../src/components/puzzle/HintStageRow.tsx),
    mounted :630-636) — staged escalation `why_wrong → hint → answer →
    deeper_dive`, with an orange "Get a hint" button. This is already Acely's
    Hint pill, in a different shape.
  - Empty state at :570-607 — centered `Target` icon at 50% ember, headline
    "Solve the puzzle to start coaching", subcopy "I'll explain the reasoning
    the moment you solve it — or get stuck." Right structure, missing the
    illustration and the drawn arrow.
  - Also 4 suggestion chips (`SUGGESTED_FOLLOWUPS`, :109-114, rendered
    :713-753) — no Acely equivalent; keep.
- Action row is **inside the board card**, not page-bottom
  ([:1460-1609](../src/pages/puzzles.tsx#L1460-L1609)): status pill, `#id ·
  rating`, then Reset / "Show solution" / "Next puzzle". "Finish" lives in the
  top-right HUD instead ([:865-891](../src/pages/puzzles.tsx#L865-L891)).
  **There is no Submit** — moves are graded on drop via `onBoardMove`.
- The route is a **glass route**
  ([src/sections/layout/index.tsx:53](../src/sections/layout/index.tsx#L53)) —
  dark always, self-hosting `GradientBackdrop` + nav pill.

### Gap table

| Acely element | Status on `/puzzles` |
|---|---|
| Left rail session navigator | **Missing.** No rail at all |
| "TODAY'S QUESTIONS" list with per-item status | **Missing.** Session results only surface post-hoc in `SessionRecapDialog` |
| Subject heading + back link | **Missing** from the rail (page header exists at :1168-1232) |
| User chip pinned bottom-left | **Missing** here (lives in the global nav pill) |
| Solve timer + hide toggle | **Missing** |
| Icon-over-label tool row | **Missing** |
| One-item-at-a-time center card | ✅ Present |
| Serif content vs sans chrome | **Missing.** Everything is sans |
| Choice list treatment | N/A — input is drag-on-board (see §3.4) |
| Commit + escape-hatch action pair | ⚠️ Partial. A "Next puzzle" button exists ([:1607](../src/pages/puzzles.tsx#L1607)); no difficulty dropdown, no disabled-commit state |
| Right-hand tutor with composer + circular send | ✅ Present (`PuzzleCoachPanel:772-830`) |
| Hint affordance | ✅ Present as `HintStageRow`, not as a pill |
| Illustrated empty state | ⚠️ Partial. Icon + headline + subcopy at `PuzzleCoachPanel:570-607`; no illustration, no drawn arrow. Separate no-puzzle state is one gray line ([:1739](../src/pages/puzzles.tsx#L1739)) |
| Resizable split grip | **Missing.** Width is fixed by the `minmax(440px,540px)` track |

---

## Part 3 — Translation to chess

Two things in the reference **cannot** be copied literally. Both are called out
here with the recommended substitute; everything else transfers 1:1.

### 3.1 Palette — replicate the structure, not the colors
Acely is white-and-navy. Chess Masti is **Obsidian Glass, Ember Core** and
`/puzzles` is a forced-dark glass route. Copying the white cards would fight the
whole app. Map instead:

| Acely | Chess Masti |
|---|---|
| Navy rail `#0E2748` | Darker glass panel — `rgba(12,10,8,0.72)`, `blur(16px) saturate(150%)`, 1px `rgba(255,255,255,0.08)` right edge |
| White question card | Existing board-card glass ([puzzles.tsx:1329-1350](../src/pages/puzzles.tsx#L1329-L1350)) |
| Active-row lighter navy | `rgba(255,122,26,0.10)` + 1px `rgba(255,122,26,0.28)` — the ember active state already used in the status pill |
| Green check `#4ADE80` | Keep as-is; `#4ade80` is already the correct-move green at [puzzles.tsx:849](../src/pages/puzzles.tsx#L849) |
| Blue assist accents (Hint pill, send button) | Ember `#FF7A1A` at 0.14 fill / 0.35 border |
| Mint in the illustration | Ember glow in the illustration |

The **hierarchy** — 17/50/30 split, rail-holds-the-set, bottom-anchored action
pair, ambient green progress — is what gets replicated exactly.

### 3.2 The rail list — what a row says
A chess puzzle has no text stem to truncate. Row label becomes
**theme + rating**: "Knight fork · 1420", "Back-rank mate · 1655". Status glyph
gets one more state than Acely, because chess has a middle outcome:

- hollow ring — upcoming / current
- green disc + check — solved unaided
- ember disc + check — solved after hints
- red disc + × — failed / solution shown

Data already exists: `feed.upcoming` feeds the queue, and the per-puzzle
outcomes already collected for `SessionRecapDialog` (`recapResults`) feed the
glyphs. This is a presentation change, not a new data path.

Heading = the session's mode/theme ("Tactics", "Knight Forks", "Rush").
Back link = `← Back to plan` → `/plan`, the calendar home.

### 3.3 The tool row — the strongest translation in the whole design
`Calculator / Reference / Eliminate` maps cleanly, same icon-over-label,
borderless treatment:

- **Analyse** (calculator analog) — engine peek / eval bar for this position.
- **Reference** (√x analog) — the motif card: what a fork *is*, with the
  canonical diagram. Ties directly into the theme vocabularies.
- **Eliminate** (ABC-strikethrough analog) — mark candidate moves as ruled out,
  drawn as struck-through arrows on the board. This is the best idea in the
  reference: "cross out the wrong answers" is a real SAT technique, and "rule
  out candidate moves" is a real chess technique. It teaches calculation
  discipline rather than just decorating the board.

### 3.4 The four choices → an **answer-mode registry** (decided)
Dragging a piece is chess's native input, so the A/B/C/D list does not replace
it. But Aayan's call is that puzzles should support **several answer modes**,
not one, with drag as the default. Model it as a registry, not as branches
scattered through `onBoardMove`:

| Mode | Input | Who it's for |
|---|---|---|
| `drag` (default) | Drag a piece to its square | Everyone |
| `select` | Tap the piece, tap the destination | Touch, accessibility, and anyone who mis-drags |
| `choice` | Pick from 4 candidate moves rendered as Acely choice rows | Sub-1000, placement, and coach-authored "which would you play?" turns |

The board *is* the stem in every mode — it stays the hero, centered. Move the
"White to move" pill from the status row
([:1460-1515](../src/pages/puzzles.tsx#L1460-L1515)) to a **serif line above the
board**, the structural position Acely's stem occupies.

Build the A/B/C/D row (72px, radius 10, circled badge, 61% width, indented) as a
shared `ChoiceRow` — `choice` mode, the Eliminate candidate list, and the
coach's multiple-choice turns are three consumers of one component.

For `choice` mode the distractors have to come from somewhere. Cheapest credible
source is the engine: take the top legal moves that are *not* the solution and
are meaningfully worse, which the Stockfish path can already produce. Do not
generate distractors with the LLM — a plausible-looking wrong move that is
actually good would teach the wrong lesson, and chess correctness is
non-negotiable.

### 3.5 The action pair — near-exact copy (decided)
- `Submit move` on the left, **disabled until a move is staged**, in Acely's
  gray disabled treatment.
- **Confirm-move is a setting, default ON for everyone, toggleable off.**
  (Decided; supersedes the earlier proposal to gate it by rating.) Players who
  want instant-drop back can switch it off in profile settings, and the toggle
  should also be reachable from the puzzle screen itself — the moment you want
  it off is the moment it just slowed you down.
- **Confirm applies only to the user's own moves.** In a multi-move puzzle the
  opponent's replies still auto-play, exactly as they do today
  ([puzzles.tsx:401-404](../src/pages/puzzles.tsx#L401-L404)). If the user is
  White, Black's moves are never staged and never need confirming. This is the
  part most likely to be implemented wrong — the staging state must key off
  "is it the user's turn", not "a move was made".
- `New puzzle ⌄` on the right, same weight, dropdown = **Easier / Same /
  Harder**. A direct lift of "New Hard Question ⌄" that hands difficulty
  steering to the user inline.

### 3.6 The tutor empty state (decided — **no illustration**)
Acely's hand-drawn lightbulb and sketched arrow are **not** being copied.
Decided treatment is the brand mark plus an elegant caption:

- `<Logo />` (the bullseye rings, ember) at 46px.
- **"Chess Masti Puzzle AI"** in `SERIF_DISPLAY` at ~1.28rem, weight 500, slight
  positive letterspacing. The app has no webfont pipeline, so the stack is a
  *system* serif — Iowan Old Style → Palatino → Georgia — which looks elegant on
  Apple hardware and acceptable everywhere, with no network request. Token lives
  in [src/theme/fonts.ts](../src/theme/fonts.ts).
  - Note: Aayan wrote "ChessMasti"; the app writes **"Chess Masti"** (two words)
    everywhere else including `NavPill`. Using the two-word form for
    consistency — trivial to flip if the one-word form is intended.
- Keep the existing subcopy ("I'll explain the reasoning the moment you solve
  it — or get stuck") — it sets an expectation Acely's copy doesn't.

`HintStageRow`'s "Get a hint" still gets restyled as Acely's rounded pill
sitting directly above the composer. Also replace the bare no-puzzle line at
[puzzles.tsx:1739](../src/pages/puzzles.tsx#L1739) so the panel is never a
single gray sentence.

**Status: shipped** in the working tree.

---

## Part 4 — Build plan

Six PRs, each independently shippable. PR-1 and PR-2 carry most of the visual
payload.

**PR-1 — Three-region shell.**
Change [puzzles.tsx:1315](../src/pages/puzzles.tsx#L1315) from a 2-col to a
3-col grid: `minmax(240px,17%) minmax(0,1fr) minmax(380px,30%)`. New
`PuzzleSessionRail` component (rail chrome, heading, back link, user chip).
Collapse the rail to a drawer below `lg`. No behavior change.

**PR-2 — Rail queue.** `PuzzleQueueList` + `PuzzleQueueRow`: theme·rating label,
four status glyphs, ember active row, scroll with bottom clip. Wire to
`feed.upcoming` + the existing per-puzzle outcome state. Clicking a solved row
re-opens it read-only.

**PR-3 — Toolbar strip.** Solve timer + eye-slash hide toggle on the left;
`Analyse / Reference / Eliminate` icon-over-label buttons on the right; hairline
divider. Ship Analyse and Reference first; Eliminate needs board annotation
work and can trail in its own PR.

**PR-4 — Action pair + confirm-move setting.** Stage-then-commit input behind a
`confirmMoves` preference (default true, editable in ProfileDialog *and* from
the puzzle screen), staging keyed off "user's turn" so opponent replies still
auto-play. Disabled `Submit move`, `New puzzle ⌄` with the Easier/Same/Harder
menu, both bottom-anchored under a divider. Retire the bare "Next puzzle" button
at [:1607](../src/pages/puzzles.tsx#L1607). Needs tests: a multi-move puzzle
must confirm exactly once per user move and zero times for the opponent.

**PR-4b — Answer-mode registry.** `drag` / `select` / `choice` per §3.4, shared
`ChoiceRow`, engine-sourced distractors. Depends on PR-4's staging state, since
`select` and `choice` both stage a move before committing it.

**PR-5 — Tutor empty state + resizable split.** Illustration asset, copy,
sketched arrow, `HintStageRow` restyled as the pill. The composer and its
circular send button already exist — leave them. Add a drag grip in the
center/right gutter persisting its width to localStorage (replaces the fixed
`minmax(440px,540px)` track).

**PR-6 — Type split.** Serif for puzzle content (the "White to move" prompt,
theme names, choice rows); sans everywhere in chrome. Add the pair to the local
`puzzleTheme` ([puzzles.tsx:119-137](../src/pages/puzzles.tsx#L119-L137)) and
apply at the content sites only.

### Constraint the plan has to live with
These files are **MUI `sx` with hard-coded literal colors** — no `styled()`, no
tokens; every value is an inline `rgba(255,240,224,…)` / `#FF7A1A` string, and
`/puzzles` builds its own local `puzzleTheme` rather than using
`chessMastiDarkTheme`. A three-region rebuild touching this many surfaces is the
moment to lift the recurring glass/ember values into that theme instead of
copying more literals into three new components. Doing it inside PR-1 keeps the
later PRs small; skipping it triples the literals.

---

## Part 5 — Two issues raised from the live screen (2026-08-10)

### 5.1 P0: the coach fabricated a checkmate — FIXED (partially enforced)

On Lichess puzzle **0vFpB** the coach wrote "**Qxd8#** is checkmate because the
king can't move and no piece covers d8". Verified against the real CSV record
(`public/data/lichess_puzzles_100k.csv`), replaying `f6e4 d1d8 c8d8 h4d8`:

```
Ne4  Rxd8+  Rxd8  Qxd8+          <- chess.js annotates "+", never "#"
isCheckmate: false
legal replies: Kh7, Bf8
```

Two escapes, not zero. The line is still correct — it wins a rook — but the
stated reason was invented. Aayan caught Kh7; Bf8 (bishop interposes) is a
second refutation the coach also missed.

**Root cause: neither puzzle route validates anything.**
- `src/app/api/puzzle-chat/route.ts` — streams raw model tokens straight
  through. No `runValidationPipeline`, nothing from `src/lib/grounding` or
  `src/lib/tactics`. Turn 0 is flagship, follow-ups Haiku.
- `src/app/api/puzzle-hint/route.ts` — the only output check is
  `detectSolutionLeak`, a substring match about *secrecy*, not truth. Worse, it
  **caches** its output, so a fabricated claim is memoised and replayed to every
  later user on a warm container.
- The prompts never mention mate claims at all, and `puzzleHintPrompts.ts`
  explicitly invites `checkmate` in its structured-mentions vocabulary.
- `validateMateInN` exists but is the wrong tool twice: its regex doesn't match
  this sentence shape, and it needs a Syzygy/Stockfish grounding snapshot the
  puzzle routes never build.

**Fix shipped:** [src/lib/tactics/mateClaim.ts](../src/lib/tactics/mateClaim.ts)
— `analyzeMateClaim(fen, uci)` replays the line and records per-ply truth
(SAN with chess.js's own `+`/`#`, isCheckmate, legal escapes);
`findFalseMateClaims(text, truth)` flags `#`-suffixed SAN tokens that the line
disproves; `describeMateTruth(truth)` renders a one-line ground-truth statement
for the prompt. 13 unit tests, including the exact shipped sentence.

The check is deliberately **narrow**: it only flags a `#` token whose bare SAN is
a move *in the verified solution line*. Coaches legitimately discuss mate in
hypothetical branches ("if Kh8 then Qg7#") and legitimately name patterns
("back-rank mate threat") — both appeared in this same response, and a keyword
scan for "checkmate" would have flagged both correct statements.

Wired in three places:
1. `puzzleChatPrompt.ts` — ground truth in the per-puzzle suffix (**prevention**;
   this is the route that produced the bug). Verified rendering for 0vFpB:
   *"the final move Qxd8+ is CHECK, not checkmate. Legal replies remain: Kh7,
   Bf8. Do NOT call this mate."*
2. `puzzleHintPrompts.ts` — same ground truth.
3. `puzzle-hint/route.ts` — **enforcement**: rewrites `Qxd8#` → `Qxd8+`, appends
   a correction note, and runs *before* the cache write so a false claim is
   never memoised.

**Streaming enforcement — now BUILT.** `puzzle-chat` accumulates the full text,
runs `applyMateCorrection` on the `done` event, and — only when something
actually changed — ships `correctedText` on the terminal `meta` SSE event. The
panel, which previously ignored `meta` entirely, now swaps the bubble's content
on stream completion. The deltas can't be recalled, but the message the user is
left reading is the true one. No second LLM call: the `#` → `+` swap is
deterministic, and spending a model call to fix a model mistake just buys a
second chance to be wrong. `applyMateCorrection` is shared with puzzle-hint so
the correction reads identically wherever it fires.

Also worth noting: a mate asserted in **words alone** ("this is checkmate") with
no `#` token is not caught, by design — tying the claim to a specific move is
what makes the check safe from false positives.

### 5.2 "Similar puzzle" in the New puzzle menu — Neo4j NOT required

Aayan asked for a fourth menu option serving a puzzle of the same type and
difficulty, backed by Neo4j, and wondered whether Neo4j needs rebuilding to fix
theme + difficulty as parameters. **It doesn't.** `Theme.id` and `Puzzle.rating`
indexes already exist and cover this access pattern exactly; no `SIMILAR_TO`
edge or vector index is needed for "same theme + same band", and none exists.

The bigger finding: **`/puzzles` doesn't use Neo4j at all.** The feed is a static
CSV parsed in-process (`src/lib/puzzle-feed/loadPuzzles.ts`, `/api/puzzle-feed`
reports `source: "static-csv"`, 100k rows). Neo4j is a *separate* store loaded
from a version of the same Lichess dump, with a **different theme vocabulary** —
the page filters on raw camelCase (`discoveredAttack`, `mateIn2`), Neo4j stores
inferred kebab ids (`discovered-attack`), and `middlegame` / `endgame` /
`crushing` have no Theme node at all, so they'd silently return nothing.

Two paths:

- **Path A (recommended): stay on the CSV feed.** `queryPuzzleFeed` already
  supports "themes + rating band + excludeIds", and the `byTheme` index is
  prebuilt. Themes round-trip in one vocabulary, it works with no credentials in
  dev, and it needs no new infra. The only real work is a one-shot fetch path on
  `usePuzzleFeed` — `setFilters` currently resets the queue and seen-ids, which
  would nuke the session stream.
- **Path B: Neo4j.** `POST /api/similar-puzzles` already exists and is
  Neo4j-backed (theme match + ±300 rating + FEN cosine rerank), it just has no
  caller on `/puzzles`. Costs: mandatory theme-vocabulary translation with an
  unmappable-theme fallback, `±300` doesn't equal the page's bands (the route
  takes no min/max), `{puzzleId, moves}` → `{id, solution[]}` shape mapping, and
  Neo4j hard-503s when unconfigured while `/puzzles` currently has zero Neo4j
  dependency — so it needs a graceful fallback to Path A regardless.

**BUILT — Path B, per Aayan's call to name it "Neo4j similar puzzle".** The
label made the choice: a menu item that says Neo4j must actually query Neo4j, or
it's the opposite of the credibility it's there for.

Verified working end to end against the live graph (`/api/health/neo4j` →
`{ok:true, configured:true}`). Feeding it puzzle 0vFpB returns **08q4o at rating
1331** — the identical rating, `kingside-attack` motif, and a valid line
(`gxf4 Ne7+ Qxe7 Qxh7#`, genuinely mate, which the new mate validator correctly
leaves alone).

Implementation notes:
- `NON_GRAPH_THEMES` filters structural Lichess tags (`middlegame`, `endgame`,
  `crushing`, `short`, …) before the call. The graph stores those as node
  *properties*, not `:Theme` nodes, so sending them matches nothing and
  "similar" would silently return empty. The route kebabs camelCase itself, so
  `kingsideAttack` → `kingside-attack` needs no work on our side.
- Graph shape → feed shape: `moves` is one space-separated UCI string, mapped to
  `solution: string[]`. Injected via `setResumeOverride`, which already takes
  precedence over the feed and is cleared by `handleNextPuzzle`.
- **Every fallback is announced.** Neo4j 503, empty result, no tactical theme,
  or a network failure each serve a normal same-difficulty puzzle *and* raise a
  snackbar saying so. Silently substituting a CSV puzzle under a "Neo4j" label
  is exactly the failure the naming was meant to avoid.

Watch item: `poolSize` came back as **1** for that theme+rating combination.
Candidate pools are thin, so repeated use on one motif will exhaust matches and
fall back. If that shows up in practice, widening the rating window or falling
back to concept retrieval is the lever — not a schema change.

Unrelated correction found on the way: `CLAUDE.md`'s readiness table says the
`NEO4J_*` env vars are absent from `.env.local`. They are present. The vars are
missing from `.env.example` though, so a fresh deploy has no template entry.

---

### Decisions — Aayan, 2026-08-10
All four open questions are resolved. Recorded here so nobody relitigates them.

1. **Confirm-move is a setting, default ON for all, toggleable off** — not
   rating-gated. Applies to the user's own moves only; opponent replies keep
   auto-playing. See §3.5.
2. **Yes to multiple answer modes** — `drag` (default), `select` (tap-tap), and
   `choice` (multiple choice). Built as a mode registry, not scattered branches.
   See §3.4.
3. **`Eliminate` trails in its own PR.** `Analyse` and `Reference` ship with the
   toolbar in PR-3; Eliminate follows as PR-7.
4. **No hand-drawn illustration.** Logo + "Chess Masti Puzzle AI" in an elegant
   serif. See §3.6 — already built.

### Status

**This is an in-place reshape of `/puzzles`, not a parallel surface.** No new
route, no new page file, no second puzzle screen to keep in sync. `puzzles.tsx`
is edited directly; `PuzzleBoardSurface`, `PuzzleCoachPanel`, the session HUD,
the status row, Reset / Show solution, the theme + rating filters, demo
playback, the recap dialog, resume, and the re-practice queue are all untouched
and still mounted. The only thing removed is the standalone "Next puzzle"
button, whose behaviour moved into the `New puzzle ⌄` split control's body.
Anything the spec adds that doesn't exist yet (rail, toolbar, choice rows)
arrives as a leaf component mounted into that same page.

All built work is in the working tree on `main`, uncommitted. `tsc --noEmit`
clean, 153 test files / 1934 tests green, `/puzzles` serves 200 with a clean
dev log.

- ✅ **PR-1 + PR-2** — three-region shell + `PuzzleSessionRail`.
- ✅ **§3.6 tutor wordmark** — `Logo` + "Chess Masti Puzzle AI" in
  `SERIF_DISPLAY`.
- ✅ **PR-4** — confirm-move staging + the action pair. Details below.
- ⬜ PR-3 toolbar (timer + Analyse + Reference), PR-4b answer-mode registry,
  PR-5 resizable split, PR-6 type split, PR-7 Eliminate.

#### PR-4 as built
- `confirmMovesAtom` in [src/lib/puzzlePrefs.ts](../src/lib/puzzlePrefs.ts) —
  localStorage, default `true`, per-device on purpose (the right answer differs
  between laptop and phone for the same person).
- `onBoardMove` now probes legality, then either stages or grades. Staging sets
  `{from, to, fen}`; `game` keeps the pre-move position, so `handleMove` works
  unchanged when Submit fires.
- `displayFen` and `displayLastMove` render the staged move, so the preview
  itself is the "you picked this, now commit" affordance.
- The board is **locked while staged** — it's rendering the staged position, so
  a second drag would report squares that don't exist in the real position.
  "Change move" unstages. This is the one place the format costs an extra click
  versus Acely, where you can just click a different choice; PR-4b's `select`
  mode is the fix, since re-picking becomes natural there.
- Staging is cleared on puzzle change, reset, and on toggling confirm-mode off
  (otherwise a move strands on the board with no Submit to commit it).
- Action pair is bottom-anchored under a divider: `Submit move` (disabled until
  staged) + `New puzzle ⌄`, with the confirm-mode toggle as a quiet line
  beneath. `New puzzle` is a **split control** — the body advances at the
  current difficulty (preserving the one-tap "Next puzzle" it replaced), the
  chevron opens Easier / Same difficulty / Harder. It keeps the ember gradient
  on solve, so the "you're done, go on" signal survives.
- Difficulty stepping extracted to
  [src/lib/puzzleDifficulty.ts](../src/lib/puzzleDifficulty.ts) and unit-tested
  (6 cases): stepping from a selected band, locating the band from the puzzle's
  rating when none is selected, no wrapping at either end, and clamping ratings
  that fall outside every band — an earlier draft defaulted those to index 0,
  which yanked a 3200 player down to beginner on "Easier".

**Not covered by a test:** the "confirm exactly once per user move, zero times
for the opponent" invariant. It holds *structurally* — `onBoardMove` is the only
staging entry point and it's wired solely to the board's `onPieceDrop`, while
opponent replies are applied inside the reply timer at
[puzzles.tsx:401-404](../src/pages/puzzles.tsx#L401-L404) and never travel
through it. Proving it would need a rendered-page test, and there's no Playwright
config in the repo yet. Worth doing when e2e lands; until then, treat it as an
invariant to preserve rather than one that's enforced.
