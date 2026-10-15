# Coach accuracy: findings and plan (COACH_CLAIM_VERIFIER)

Status: done on branch `fix/coach-claim-verifier`, behind the flag, default
off in production. The findings below were written before any code change
(Step 0); the sections after them say what changed, how to turn it on, what
was measured, and what this does not do. Line numbers in the findings are
against `origin/main` at 7561c94b.

## In one paragraph

Code now owns board facts. A replay verifier
([src/lib/coach/verifyClaims.ts](../src/lib/coach/verifyClaims.ts)) decides
pieces, captures, material (a balance and a delta as different types), who is
ahead, check, mate and hanging pieces by playing the line on chess.js, and
fails closed. Every footer and every `material:` line the model reads comes
from it. On the served turn-1 path a referee check rewrites or drops any card
sentence whose board claim is false, and drops unverified ones unless they
are phrased as opinion, without asking a model to fix itself. The browser
re-checks the moments that matter at depth 20 before the first turn, and the
server reads those moves from the deeper pair. The coach's message is framed
by a report (verdict, story, decisive moments, credit, one habit) that code
writes from verified facts only.

## The names in the QA notes, and where the code really lives

| QA name | Real path |
|---|---|
| lineStory.ts | [src/lib/contract/lineStory.ts](../src/lib/contract/lineStory.ts) — runs on the server (contract builder) **and** in the browser (via lineCaptions) |
| lineCaptions.ts | [src/lib/coach/lineCaptions.ts](../src/lib/coach/lineCaptions.ts) — browser only |
| "Stockfish 14 at depth ~16" | Stockfish **17 Lite** (single-threaded WASM, `public/engines/stockfish-17/`) at depth 16, MultiPV 3, in the browser: [AnalysisImpl.tsx:7349](../src/components/preview-analysis/AnalysisImpl.tsx) and the `evaluateGame` call at :7607-7631. There is no Stockfish 14 build in the repo. |
| "the Analyze coach route" | [src/app/api/enhanced-analysis/route.ts](../src/app/api/enhanced-analysis/route.ts); production turn 1 is the contract path (`serveContractAnalysis` → [contractServing.ts](../src/lib/contract/contractServing.ts) → [enforcedStream.ts](../src/lib/contract/enforcedStream.ts) → per-card [ladder.ts](../src/lib/contract/ladder.ts)) when `MASTERMIND_VALIDATORS_ENABLED` and `CONTRACT_CATEGORIES` are set (per `MASTERMIND_CONTEXT/CONTRACT_ROLLBACK_RUNBOOK.md`; not verifiable from code) |
| card footer "you come out X up" | `ledgerText` in lineCaptions.ts:46-74, rendered by [ProofLine.tsx:327-341](../src/components/preview-analysis/ProofLine.tsx) |

## Data flow: engine output → card text

1. **Browser, pass 1.** `engine.evaluateGame` (depth 16, MultiPV 3) produces a
   `GameEval`: per position `lines[{pv, cp|mate, depth}]`, plus
   `settings.engine` (e.g. `stockfish_17_lite`) once per game. The browser
   classifies every move ([moveClassification.ts](../src/lib/engine/helpers/moveClassification.ts):
   Brilliant/Great/Best/…). No engine runs on the server.
2. **Browser, the strip and the drawn lines.** For the move on the board,
   [moveAnalysis.ts](../src/components/preview-analysis/moveAnalysis.ts) builds
   "what it does" + a "why" sentence (`describeMove`, :158-214) from
   `captionLine` (lineCaptions → `buildLineStory`). Every drawn line
   ([coachLines.ts](../src/components/preview-analysis/coachLines.ts): the
   engine's best line from the position *before* the move, max 8 plies) gets
   captions and the footer ledger from the same `captionLine`.
3. **Request.** `buildAnalysisRequestBody` sends `moveHistory` + the whole
   `gameEval` (unvalidated, `z.any()`).
4. **Server, contract.** `buildCoachContract` ([builder.ts](../src/lib/contract/builder.ts))
   selects the cards (`selectInsights`, skipping mixed-depth pairs via
   `isComparableDepthPair`), and builds a `LineStory` for every engine line
   and for the game's continuation (`safeLineStory`, :233-243, 6 plies).
   Each eval becomes an `EvalFact {cp, mate, depth, display, provenance}` —
   depth is kept, the engine name is not.
5. **Server, prompt.** `serializeForVerbalizer` ([serialize.ts](../src/lib/contract/serialize.ts):503-523)
   sends each story as `projectLineStory(story)` (:473, :517): one line per
   ply plus `material: White up 2 after 7 shown plies`. Depth and engine are
   stripped from evals (only `display` survives).
6. **Server, model + referee.** The flagship model writes `[INSIGHT]` cards
   with `[F:id]` citations. Each closed card goes through the ladder:
   deterministic referee (`refereeInsight`) → (a) drop sentences →
   (b) Haiku edit → (c) one regen → (d) template card. Only checks armed in
   [armingConfig.ts](../src/lib/contract/armingConfig.ts) enforce.
7. **Browser, render.** The client parses the cards and draws each card's
   line itself from its own engine data (ProofLine); nothing in the drawn
   line or its footer comes from the server.

## The bugs, located

### BUG 1 — a delta printed as a final balance (confirmed, reproduced)

- `buildLineStory` starts `netCp` at 0 at the line's first move
  (lineStory.ts:566) and adds captures/promotions (:646, :652); it returns
  that as `netMaterialCp` (:844). That is the **change during the line**.
- `ledgerText` (lineCaptions.ts:47-73) prints it as where the line **ends**:
  "you come out 1 up", "Black ends 4 up".
- The server makes the same mistake for the model: `projectLineStory`
  writes `material: White up N after K shown plies` (lineStory.ts:531-536,
  :852-856), and the verbalizer charter tells the model to say it as
  "White comes out a rook ahead"
  ([verbalizerPrompt.ts:93](../src/lib/prompts/verbalizerPrompt.ts)).
- The existing tests pin the bug: `lineCaptions.test.ts` expects "you come
  out a queen up" in a position where White, down a rook, a bishop and a
  pawn, only wins the queen back (the real end balance is level).

Reproduced on Game B, the 19.Nxa8 card (its drawn line is the engine's best
line from the position *before* move 19). Start balance White −2. The
second engine line, 19.Qh6+ Ke7 20.Nh7 Rh8 21.Qf6+ Kd7 22.Qxf7+ Be7, captions
"you come out 1 up"; White actually ends **1 down**. On the other
line (19.Qh4 … Nxa8) the footer says "a rook up" where White ends 3 up. At
depth 16 the two are within 0.15 of each other and their order is not
stable: local Stockfish 17.1 put Qh6+ first (+3.45 vs +3.30) in a
fresh-game run and Qh4 first in another; at d20 Qh4 leads by 0.05. The
browser's Lite build is not recoverable, but the QA footer reproduces
exactly on the Qh6+ line, and both lines show the bug.

### BUG 2 — "a material win that is not on the board" (reproduced)

Opera Game, the 10…cxb5 moment. Board facts (replayed): 10.Nxb5 takes a
pawn, 10…cxb5 takes a **knight**, 11.Bxb5+ takes a pawn back. After 11.Bxb5+
White has given a knight for two pawns: White −1. The same delta bug
produces the false material lines here:

- the game line from 10…cxb5: footer "Black ends **4** up" — Black is 3 up;
- the engine line after 10…cxb5: "you come out **a rook** up" — White ends
  3 up (a piece, not a rook) — i.e. the wrong piece named.

The captions' own capture facts ("takes the knight on b5") are right;
a capture is read from chess.js. A misnamed captured piece can only come
from model prose, and nothing on the server checks a capture's piece name
against the board today (see "existing checks" below).

### BUG 3 — wrong "why" on 12.Ng5 (located)

- The strip's "why" is `describeMove` (moveAnalysis.ts:158-214): the first
  two story facts of the played move + a verdict. For 12.Ng5 it reads
  "Defends the bishop on h7; leaves the knight on b5 hanging. A small slip.
  The engine preferred 12. Rb1…". The fact is `still_en_prise`
  (lineStory.ts:749-752): the knight on **b5** (not g5) had been loose since
  11.Bxh7+ took its defender away.
- Static exchange says the b5 knight *is* capturable for free (…Qxb5); the
  engine says taking it is bad (Stockfish 17.1 d20 after 12.Ng5: best 12…g6
  +3.13, then …Ncxe5 +3.77, …Qxe5 +5.20; …Qxb5 is not in the top three, it
  walks into 13.Qh5 and the h-file). The knight on g5 is not attacked at all.
- So "leaves the knight hanging" is either false (g5) or true-but-irrelevant
  (b5: it was already loose, and the refutation does not take it). The real
  cost of 12.Ng5 is that 12.Rb1 was stronger (d20: Rb1 +4.12, Bd3 +3.71,
  Ng5 +2.89). A "hangs" fact may only be the *reason* for a mistake when the
  engine's refutation actually captures that piece.
- Depth decides which move gets named: at **d16** the engine's first
  choice is 12.Bd3 (+3.50, Rb1 +3.32), so the browser's pass-1 card says
  "the engine preferred 12. Bd3". Only the d20 re-check names 12.Rb1.
- The model can repeat it: the contract's `gameStory` for that card carries
  the same "leaves the knight on b5 hanging" entry.

### BUG 4 — "evals muted at depth 16" (not reproduced for 19.Nxa8)

Local Stockfish 17.1, single thread, position before 19.Nxa8: d16 +3.45
(the QA's "+3.4"), d20 +3.79; after 19.Nxa8: d16 +0.67, d20 +0.51. The
prompt's "+6.3 before the move at depth 20" does not reproduce; the nearest
+6.x in this game is the position after 15…Kf6 (+6.17 at d20). Depth does
change things elsewhere: the d16 pass names 12.Bd3 where d20 names 12.Rb1
(above), and puts 19.Qh6+ first where d20 puts 19.Qh4. Every number will
carry its engine and depth.

### BUG 5 — thin report, unearned chips (located)

- Turn 1 is a one-line intro plus at most 3 **mistake** cards
  (cardWorthiness.ts:87, builder.ts:624). No game story, no credit card, no
  single habit.
- "Brilliant" is computed in the browser (moveClassification.ts:255-290):
  a piece sacrifice that does not lose; it does **not** require the engine's
  top move. Then `describeMove` prints "found the move the engine rates
  highest" for Brilliant/Great (moveAnalysis.ts:182-187) even when the
  engine preferred another move. The labels also reach the model on every
  move-table row (builder.ts:358-367).
- 11.Bxh7+ in Game B is engine-best at d20 (+3.29 vs 11.Rb1 +2.91) and a
  real sacrifice, but it is not the only good move and it changes nothing
  the position did not already offer, so it is not credit-worthy under the
  criteria in Step 6. 10.Nb5 is: engine-best by ~2 pawns (+2.22 vs 10.Na4
  +0.25 at d20).
- Missed mates are invisible: mates are flattened to ±9999
  (selectInsights.ts:102), so a missed mate becomes "about 95.0 pawns of
  ground" in the template card (templateCard.ts:92) and in follow-up
  context. Nothing says "you had mate in 3".

## Engine truth for the two games (Stockfish 17.1, d20, 1 thread)

Game B (Lazer_Wizard–nguoiquangnam, chess.com 185345453122; PGN fetched from
the public archive API and cross-checked move-by-move against the game's TCN
move list):

- 9…Qxb2? +0.49 → +2.22. 10.Nb5! engine-best, the only good move.
- 10…O-O? +2.18 → +3.29. 11.Bxh7+ engine-best by 0.38.
- 12.Ng5 +2.89 vs 12.Rb1 +4.12. The g5 knight is not attacked.
- After 14…Kg7: mate in 3, 15.Nxe6+ Kf6 16.Qg5+ Kxe6 17.Bf5#; after
  15.Nxe6+ fxe6 16.Qh6+ Kg8 17.Qh7# and 15.Nxe6+ Bxe6 16.Qh6+ Kf6 17.Bg5#.
  15.Qh7+ → +5.60: mate missed, queen won.
- 19.Nxa8? +3.79 → +0.51.
- 20…Kf5?? +0.44 → +3.04; 21.Re1 (+2.03; 21.g4+ was +3.04); **21…Bd6??**
  allows 22.g4# (the actual losing move; 21…Ng6 held at +2.03).

Opera Game: 10.Nxb5 engine-best (+3.18); 10…cxb5? +3.41 → +5.17 (the engine
wanted 10…Qb4+).

## Existing checks (so the verifier does not duplicate them)

- Nothing counts board material or decides who is ahead. `materialWin.ts`
  checks voter confidence and |eval|, not material or side.
- Relational claims (attack/defend/capture/pin) are LLM-extracted (Haiku)
  and chess.js-verified (`relationalClaim.ts`), held at `warn`.
- The contract referee checks evals, SAN/squares, tactical keywords, literal
  mobility; "hangs" is not in the keyword list (only "hanging").

## Time budget

- `maxDuration: 60` for `src/app/api/**` (vercel.json). The route arms a
  55 s request deadline (requestDeadline.ts:26); the contract path a 45 s
  generation cut-off (contractServing.ts:78) and a per-card ladder deadline.
- No engine runs on the server, so the depth-20 re-check can only run in
  the browser. It costs the user wait time, not Vercel time; it gets its
  own deadline there. Server-side additions (verifier, report facts) are
  pure chess.js and are measured in the final notes.

## What changed (one commit per step)

| Commit | What |
|---|---|
| docs: coach accuracy findings and plan | this file |
| test: add coach accuracy regression fixtures | both games, engine truth at d16/d20, failing tests for every bug |
| feat: replay-based claim verifier | `verifyClaims.ts`; `capturable()` moved to `tactics/capturable.ts` so "hangs" means one thing |
| fix: separate material delta from final balance | footers and the model's `material:` line from the verified end balance; charter rule and gold example corrected |
| fix: a hanging piece is the why only when the refutation takes it | the strip's "why" (12.Ng5) |
| feat: gate coach claims behind verifier (flagged) | `claimGate.ts`, referee check `claim_verifier`, ladder rung, sentence labels, fail-closed |
| feat: re-check flagged moments at higher depth | `deepRecheck.ts`, browser pass 2, deep pairs on the server, `missedMate` |
| feat: game story, credit, one habit (flagged) | `gameReport.ts`, report around the cards, REPORT FACTS for the model, brilliant chips gated |
| style: format this branch's own lines | prettier on lines this branch added only; lint warnings in the touched files 497 on main → 466 |
| fix: call off the depth-20 re-check when the game changes | loading another game mid-pass-2 could cut into the next review (below) |
| fix: say whose missed mate it was | "You had mate" was said of every missed mate, found in the browser run (below) |
| docs: coach accuracy notes — what changed, limits, timings | this section onwards |

Where each piece lives:

- **Verifier** — [src/lib/coach/verifyClaims.ts](../src/lib/coach/verifyClaims.ts). `replayLine` (SAN or UCI, stops at the first illegal move, mid-exchange flag, memoised), `MaterialBalance` / `MaterialDelta` (branded, tsc refuses to mix them), `verifyClaims` with eleven claim kinds, each verified / false / unverified.
- **Footers and the model's material line** — `LineStory.material` (lineStory.ts) from the verifier; `ledgerText` → `verifiedLedger` (lineCaptions.ts); `verifiedMaterialLine` (lineStory.ts); `getVerbalizerCharter` and `VERIFIED_MATERIAL_REWRITES` (verbalizerPrompt.ts, verbalizerGoldExamples.ts).
- **Strip "why"** — `whyCaption` (moveAnalysis.ts).
- **Gate** — [src/lib/coach/claimGate.ts](../src/lib/coach/claimGate.ts), wired as check 7 of `refereeInsight` (referee.ts), armed in armingConfig.ts, rung (a0) in ladder.ts, labels in `done.metadata.contract.claimVerifier`.
- **Re-check** — [src/lib/coach/deepRecheck.ts](../src/lib/coach/deepRecheck.ts) (moment selection, time-sliced loop, `recheckedPair`, `missedMate`), [deepRecheckClient.ts](../src/components/preview-analysis/deepRecheckClient.ts) (the browser engine), `pairFor` in builder.ts, `pairAt` in selectInsights.ts.
- **Report** — [src/lib/coach/gameReport.ts](../src/lib/coach/gameReport.ts), emitted by contractServing.ts, `gateBrilliantChips` in AnalysisImpl's classification memo.

## Turning it on

One switch, two names (browser code can only read `NEXT_PUBLIC_*`, inlined at build):

```
COACH_CLAIM_VERIFIER=1
NEXT_PUBLIC_COACH_CLAIM_VERIFIER=1
```

Locally, put both in `.env.local` and restart `npm run dev`. The browser half
(footers, the strip, the depth-20 re-check, brilliant chips) works on any
path. The gate and the report run on the contract path, which also needs
`MASTERMIND_VALIDATORS_ENABLED=true`, a signed-in account (the coach needs
one), and either `CONTRACT_CATEGORIES` listing `game_review` (the production
setting per the rollback runbook) or your uid in `CONTRACT_UIDS`. In
production, set both variables in Vercel and redeploy: the contract response
cache is in memory per instance, so a redeploy also guarantees no answer
cached before the flip is served. Turning it off is the same in reverse.

Tests run with it on (Vitest default). Every library and server surface also
has a flag-off test proving its output is unchanged. The page wiring in
AnalysisImpl (pass 2, the chip gate) sits behind the same flag constant but,
like the rest of that component, has no unit test; the browser run below
covers it with the flag on.

## Measured

Browser pass 2 (Stockfish 17 Lite, single-threaded WASM — the review's own
engine — run under Node on this machine, a 2024 Apple laptop, light load):

| | per position to depth 20 |
|---|---|
| 19 positions from both games | 0.44 – 3.63 s, mean 1.60 s |
| Game B's three card moments (6 positions) | 10.0 s in total |
| Game B, all 12 flagged positions | 22.1 s in total |
| Opera Game, 3 flagged positions | 1.9 s in total |
| full-net Stockfish 17 (6 positions, for comparison) | 0.68 – 7.77 s, about 2.5× Lite |

The budget is 15 s (6 s cap per position). On this machine that completes
Game B's four most important moments (8 positions) and labels the rest
depth 16. Phones will finish fewer. None of it runs on Vercel.

Server (Node, same machine):

| | |
|---|---|
| claim gate per real card | ~2 ms warm, 14–17 ms cold |
| deterministic referee, 60-block perf suite | p95 4 ms with the flag on or off (budget 100 ms) |
| contract build, Game B | 9.5–9.9 s flag on, 9.5–9.7 s off: no measurable change |
| new LLM calls | none; claim fixes never use the edit/regen rungs |

So the Vercel margin is unchanged by this work: the route keeps its 55 s
request deadline and 45 s generation budget, and the additions cost
milliseconds. One pre-existing observation, not changed here: the contract
build (~10 s for this game on a loaded laptop) happens before the 45 s
generation clock starts (`contractRequestStartMs` is set after it), so a slow
build plus a full-length generation can approach 60 s.

## Checked in a browser

A local dev server from this branch with both flags on, Game B loaded by
`?pgn=`. No model could be called: the coach needs a signed-in account, and
the server had a dummy Anthropic key with both provider URLs pointed at a
closed local port. Stockfish 17 Lite in the page did pass 1 at depth 16,
then pass 2 searched 10 positions (5 moments; with no side chosen, both
sides' moves count) within its 15 s budget, and the Lines panel started its
own search after it, so the first coach turn is not held for good. The strip and the drawn lines then read:

- **19.Nxa8** — "+3.54 → +0.69 · d20"; the drawn line's footer "→ Black is
  1 point up at the end" (it was "you come out 1 up"). "Leaves the knight
  on g5 hanging" stays, correctly: Black's reply, 19...Kxg5, takes it.
- **12.Ng5** — "Defends the bishop on h7. A small slip. The engine
  preferred 12. Rb1, which attacks the queen on b2" — no hanging knight.
  Labelled d16: with no side chosen it was not among the moments re-checked.
- **15.Qh7+** — "M+3 → +5.21 · d20 … White had mate in 3 with 15. Nxe6+",
  the line 15.Nxe6+ Bxe6 16.Qh6+ Kf6 17.Bg5#, footer "→ White mates".
- **11.Bxh7+** — "Best", no brilliant chip. **10.Nb5** — "Great … the move
  the engine rates highest", which is true there (it was the engine's move).

Found and fixed in the run: the strip said "You had mate" with no side
chosen, and the report said it of the opponent's moves too.

Loading games in the page (the Opera Game, then two prefixes of Game B, the
second loaded straight after a pass-2 search) left each next review clean:
no timeouts or retries for its positions. Before the fix, a re-check still
running when another game loaded could stop one search of the next review;
the engine treats that like a timeout and re-searches the position at depth
12 instead of 16.

Not exercised in the browser: a coach turn (an account and a paid model
call), so the gate on real model prose and the report as rendered in the
coach panel are covered by the fixture and mock tests only.

Dev-only noise, not from this work: each Fast Refresh while the page is open
recreates the engine, and the review sweep left on the terminated worker
logs `position N/44 exceeded 30000ms` for a long while. A reload clears it.

## Known limits (stated, not hidden)

- **The verifier proves board facts, not chess judgment.** Pieces, captures,
  material, who is ahead, check, mate, hanging pieces, and whether the
  engine's reply takes a piece. Strategic explanations are labelled
  `judgment` (cards) or "opinion" (report), never verified.
- **Depth 20 is stronger evidence, not truth.** The browser's re-check uses
  its own engine, Stockfish 17 Lite, and at depth 20 Lite still prefers
  12.Bd3 where native 17.1 and the full-net WASM build prefer 12.Rb1. The
  tests use native depth-20 truth, so they show 12.Rb1; a user on Lite will
  see 12.Bd3, labelled d20. Recommendation, not switched: run pass 2 on the
  full-net `stockfish_17` build already in the repo (agrees with native on
  12.Rb1; ~2.5× the time per position and a 66 MB download against 6.8 MB).
- **The budget caps what is re-checked.** 15 s covers the most important
  moments on a fast laptop; the rest stay depth 16 and say so.
- **The extractor is small and regex-based.** It reads material outcomes and
  changes, captures with the piece named, hanging pieces, mate written with
  "#", and pieces named on squares. Forks, pins and "controls the d-file" are
  left to the existing referee checks. A claim-like sentence it cannot parse
  is logged at debug level and kept.
- **Gated where the cards are refereed.** The gate and the report run on the
  contract path (production turn 1 per the runbook). The non-contract
  streaming branches stream text before any check and are not gated; the
  follow-up chat is not gated, though its material lines are fixed (it uses
  `projectLineStory` too).
- **The report is written by code.** The model receives the same facts as
  REPORT FACTS and writes the cards; it does not phrase the report.
- **Not touched:** the legacy (non-contract) prompt and the follow-up context
  still describe a missed mate as a mate-flattened "95 pawns" drop.
- **Two games is a small regression set.** Add every new bug as a fixture —
  [the fixture README](../src/lib/coach/__tests__/fixtures/coach-accuracy/README.md)
  says how.

## Where the prompt and the board disagreed

- **"Stockfish 14 at depth 16."** It is Stockfish 17 Lite at depth 16.
- **"+6.3 before 19.Nxa8 at depth 20."** Not reproduced: +3.79 (native 17.1),
  +3.50 (Lite). The depth-16 "+3.4" matches.
- **10...cxb5 "wins material" must be false.** On the board Black does end a
  knight for two pawns up (+1) after 11.Bxb5+, so the verifier verifies that
  count; "Black wins a piece", "White wins material / is ahead" and a wrong
  piece name are false and blocked. The engine says Black is losing; that is
  judgment, which the verifier does not adjudicate.
- **"Unverified" for a wrong piece or an empty square.** These are `false`,
  which is stricter: a false sentence is rewritten or dropped even when it is
  phrased as opinion. An illegal line and an illegal start are `unverified`.
- **12.Ng5's "hanging knight".** The sentence was about the knight on b5,
  which static exchange says can be taken for free, but it had been loose
  since 11.Bxh7+ and the engine's reply never takes it. The rule now: a
  hanging piece is the reason for a mistake only when the refutation takes
  it. The knight on g5 is not attacked at all.
- **"11.Bxh7+ in the Opera test."** 11.Bxh7+ is Game B's move. It is
  engine-best at depth 20 and a real sacrifice, but not the only good move,
  so it earns no credit and no brilliant chip.
- **"15.Qh7+??".** A missed mate in 3, but the position stayed winning
  (+5.60): the report says "missed mate", not "blunder".
- **"20...Kf5 is the blunder."** It is a big swing (+0.44 → +3.04), but
  21...Bd6 is the move that allowed mate.

## Acceptance

1. Every Step 1 test passes; `MaterialBalance` and `MaterialDelta` are
   distinct types (checked by tsc through `@ts-expect-error`).
2. Game B's 19.Nxa8 card says "you're 1 point down at the end", never "you
   come out 1 up" (in the browser, with no side chosen: "Black is 1 point up
   at the end").
3. Opera Game: no false material-win claim on 10...cxb5 survives; the
   footers no longer name a rook or a lead that is not on the board. (See the
   caveat above: Black's +1 count is true.)
4. 12.Ng5 is not described as hanging (strip, gate); 12.Rb1 is named when
   the depth-20 engine prefers it (native truth in the tests; see the Lite
   limit above).
5. 15.Nxe6+ is reported as the missed mate in 3 (report, strip, template
   card, `missedMate` on the card's insight); seen in the browser too.
6. Flag off: unchanged output on every library and server surface (tested;
   the AnalysisImpl wiring is gated by the same constant, untested like the
   rest of that component). Flag on: every card sentence and every report
   sentence is labelled verified-fact / engine / judgment.
7. No deploy; no paid calls in tests: where a test needs the model it is a
   scripted stream, and every other model seam in the new tests throws if
   called (the suite ran with no provider key set at all). One commit per
   step, plus three follow-ups and this wrap-up.
