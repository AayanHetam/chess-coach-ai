# Coach accuracy: findings and plan (COACH_CLAIM_VERIFIER)

Status: Step 0 of the coach-claim-verifier work (branch `fix/coach-claim-verifier`).
Written before any code change, from reading the code and replaying the two
regression games on a real board. Line numbers are against `origin/main` at
7561c94b.

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

## Plan (what each step changes)

- **Flag.** `COACH_CLAIM_VERIFIER` (server) / `NEXT_PUBLIC_COACH_CLAIM_VERIFIER`
  (browser code can only read `NEXT_PUBLIC_*`, inlined at build). Default ON
  under Vitest, OFF everywhere else; an explicit value wins.
- **Step 2.** `src/lib/coach/verifyClaims.ts`: replay a line on chess.js,
  fail at the first illegal move, ledger with separate `MaterialBalance` /
  `MaterialDelta` types, claims verified/false/unverified, mid-exchange flag.
- **Step 3.** lineStory/lineCaptions footers and the server's `material:`
  line from the verified end balance; no footer when unverified.
- **Step 4.** A `claim_verifier` check inside the contract referee (the
  production turn-1 path), armed at error, never sent to the LLM rungs:
  a false sentence is dropped or the card falls to the template. Sentences
  tagged `verified-fact` / `engine` / `judgment` in the done metadata.
  The non-contract streaming branches send raw text before any check runs
  and are not gated.
- **Step 5.** Browser re-check of the flagged moments at depth 20 under a
  deadline, sent as separate evidence (overwriting pass-1 evals would trip
  the mixed-depth guard and silently drop those moves' cards).
- **Step 6.** A verified report: verdict, story, critical moments, credit,
  one habit; deterministic text from verified facts, plus a prompt block
  that hands the same facts to the model.
