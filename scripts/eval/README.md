# Coach accuracy eval harnesses

Offline harnesses that produce the accuracy numbers for the AI coach. History
and validity caveats: [docs/COACH_ARCHITECTURE_AND_ACCURACY_AUDIT.md](../../docs/COACH_ARCHITECTURE_AND_ACCURACY_AUDIT.md) §2.9/§3.7.

**As of 2026-07-05 these are self-contained**: the ChessQA fixtures are
vendored (`fixtures/chessqa/`, 100 items/category, MIT — CSSLab/chessqa-benchmark),
the coach system prompt snapshot is vendored (`fixtures/coach_prompt_v3.6_stable.txt`,
regenerate with `npx tsx` + `getCoachChatSystemPromptParts` after prompt bumps),
and nothing depends on `/tmp` any more. The pre-2026-07 result JSONs in
`results/` were produced by the retired `claude-sonnet-4-20250514`; files
suffixed `-sonnet46` are the current-flagship re-runs.

## Setup

```bash
uv venv .evalvenv && uv pip install --python .evalvenv/bin/python -r scripts/eval/requirements.txt
# needs a Stockfish binary: STOCKFISH_BIN (default /opt/homebrew/bin/stockfish)
# needs ANTHROPIC_API_KEY (env or .env.local)
```

## Harnesses

| Script | Question | Cost |
|---|---|---|
| `chessqa_grounding_eval.py --category short_tactics --n 25` | Does engine-context injection improve accuracy? (Track A) | ~2 Sonnet calls/item |
| `factual_error_eval.py --n 12` | Factual accuracy 2×2: {Sonnet,Haiku} × {grounded,ungrounded} | ~8 calls/item |
| `gcceval_hedge_eval.py` | ARCHIVED — hedging A/B (CH-1a); answered and reverted, needs a v3.2 prompt snapshot to reproduce |
| `stage9-live-test.ts` | 5 live fixtures through the real flagship + validators | ~10 flagship calls |
| `contract_ci4_gates.ts --samples 3 [--legacy] [--fixtures-real] [--only 01,07] [--label arm]` | The CI-4 gate verdict: persona / citation coverage / shipped fabrication, **per run AND pooled**. `--fixtures-real` runs the real-Stockfish fixtures; the result carries a usage-priced `spend` block (generation + judge + ladder) | ~1 flagship + 2 Haiku calls per fixture-sample, ≈$0.10 on Sonnet 4.6 |
| `contract_ci4_offline_replay.ts [results.json]` | Replays the ladder over already-committed generations — free A/B of ladder/citation changes | $0, no network |
| `motif_detector_recall.ts [--n 400]` | Do the `src/lib/tactics` detectors find the tactics humans label? Recall per Lichess puzzle theme + exact-match on the ChessQA motif battery | $0, no network, ~7 min |
| `followup_referee_replay.ts` | Replays the follow-up referee (followUpReferee.ts) over the eight saved chat answers from the probe below — what it would have cut, and why | $0, no network |
| `followup_story_probe.ts` | Does the follow-up chat (fast tier) explain a line better when its compact contract carries what each move does? Two fixtures × two student questions, with and without stories, side by side | 8 Haiku calls, ≈$0.04 |
| `line_story_check.ts [--n 300]` | Is the per-ply line story (lineStory.ts) right? Mate at the labeled ply on `mateInN`, theme motif on a solver ply, sacrifice offers vs non-sacrifice, ledger sign on `crushing` | $0, no network, ~4 min |

`--dry-run` on the python harnesses builds prompts/engine context with zero API calls.

### Motif detectors are measured against labels, not against the model

`motif_detector_recall.ts` exists because `chessqa-motifs-grounding-sonnet46.json`
shows the flagship model identifying static forks/pins/batteries at **48%
exact-match with or without engine context (+0.0pp)** — motif detection is a
job for chess.js, and the detectors are what the verbalizer narrates and the
referee licenses. Two vendored label sources:

- **Lichess puzzles** (`public/data/lichess_puzzles_100k.csv`, `Themes`).
  400 puzzles per theme (deterministic id-hash sample); the themed motif must
  appear on some solver move of the solution. The "unlabeled fire" column is
  the rate on 400 puzzles WITHOUT the theme — a precision *proxy only* (Lichess
  tags the main theme, not every incidental tactic), so read it as an upper
  bound on false fires and as a before/after delta.
- **ChessQA motifs** (`fixtures/chessqa/motifs.jsonl`): exhaustive geometric
  labels, scored with a static enumerator on the detectors' own primitives.

Committed runs (`results/motif-detector-recall-{BEFORE,AFTER}.json`,
2026-09-04; BEFORE = the detectors as shipped, AFTER = the value-aware fork,
move-created pin tag, attacked-and-immobile trapped piece, and legal-move
back-rank escape):

| theme | recall BEFORE → AFTER | unlabeled confirmed fire BEFORE → AFTER |
|---|---|---|
| fork | 98.0% → 97.5% | **48.0% → 11.3%** (90% of the old fires were a check that also hit a king-defended pawn) |
| pin | 100% → 100% | 24.5% → 24.5% (63.7% of reported pins pre-existed the move; they stay, now tagged `createdByMove:false`) |
| skewer | 96.8% → 96.8% | 13.3% → 13.3% |
| discoveredAttack | 93.8% → 93.8% | 8.8% → 8.8% |
| trappedPiece | **17.5% → 76.5%** | 9.0% → 1.5% |
| backRankMate | **54.0% → 100%** | 17.0% → 13.0% |
| hangingPiece (static, solver side) | 100% → 100% | 46.8% → 46.8% |
| ChessQA fork / pin / skewer / battery (exact) | 100 / 100 / 100 / 100% | Sonnet 4.6: 48%; Fable 5.1: 92% |

The model row is the same first-25 ChessQA motif items: Sonnet 4.6 scores
12/25 with or without engine context (`chessqa-motifs-grounding-sonnet46.json`);
Claude Fable 5.1 at `effort: low`, no engine, scores 23/25
(`chessqa-motifs-off-fable51-effort-low.json`, ~$1.45 for 25 items — one miss
is the rank-first battery ordering, the other a queen's rank attack on a pawn).
A stronger model closes most of the gap and still does not reach the
chess.js 100% at $0 — the detectors stay the authority; the model verbalizes.

Re-run before touching anything under `src/lib/tactics/motifs/` and commit the
new AFTER artifact beside the change.

### Line stories are checked against labeled solutions

`line_story_check.ts` scores `buildLineStory` on Lichess solutions (300 per
label, `results/line-story-check.json`, 2026-09-05, after the 119-position
adversarial review): mate lands on the labeled ply for 100% of mateIn1/2/3;
the story names the theme motif on a solver ply for fork 100%, discoveredAttack
92% (discovered and double checks counted), skewer 85% (a skewer is only
narrated when the back piece can actually be won), trappedPiece 75%, pin 45%
(pins that already stood before the move are deliberately not narrated as the
move's doing); on `sacrifice` puzzles the first move reads as an offer 75% of
the time against 11% on non-sacrifice puzzles, and the "offer" note fires on
8.7% vs 0.7%; on `crushing` puzzles the ledger has the solver up or mating
74%, level 23.7%, down 2.3%. 8.1% of solution plies carry no fact at all —
those are the plies the charter tells the model to call quiet.

### Verbalizer 4.1 (line stories) — the A/B that shipped it

Six real-Stockfish fixtures (01, 02, 05, 07, 09, 10), one generation each,
same day, `results/ab-*.json` (each file carries a usage-priced `spend`):

| arm | model | persona (pooled / min) | citation coverage | fabrication | ladder pass / sentence drops | prose kept | spend |
|---|---|---|---|---|---|---|---|
| baseline verbalizer 4.0 (main) | Sonnet 4.6 | 4.42 / 4.0 | 0.927 | 0 / 171 | 8 / 5 | 0.947 | $0.51 |
| 4.1 with line stories | Sonnet 4.6 | 4.33 / 4.0 | 0.948 | 0 / 168 | 10 / 3 | 0.963 | $0.55 |
| 4.1 with line stories | Sonnet 5, thinking disabled | 4.17 / 3.5 | 0.906 | 1 / 115 | 10 / 3 | 0.970 | $0.46 |

All six CI-4 gates pass in every arm. Persona is two Haiku judge passes on
six games — differences of 0.1-0.2 are inside its noise. What the stories
changed is visible in the prose, not the judge: the 4.1 reviews narrate the
game's own continuation ("the king steps to d8, its only legal move, the
knight takes the rook, then the queens come off") and quote the ledger where
4.0 restated the eval swing. Sonnet 5 is 17% cheaper per review at list price
but counted ~30% more input tokens for the same prompts, scored one
`forbidden_claim` fabrication where 4.6 scored none, and put one game at the
persona floor — not evidence to move the flagship on six games. Its ChessQA
motif run is inconclusive: the model writes past the 3,000-token budget on
that prompt (21/25 answers cut off with adaptive thinking, 16/25 with
thinking disabled; 5 of the 9 that finished were right).

### Quiet moves have purposes (2026-09-05, second pass)

`positionalFacts.ts` gives the story deterministic reasons for quiet moves —
rook to an open or half-open file (the castling rook included), doubling on a
file with no friendly pawn or on the enemy's second rank, a knight on an
outpost in the enemy half, a blockade of a passed or isolated pawn, piling
onto a pinned piece, newly attacking an isolated, backward or far-advanced
passed pawn, a pawn challenge, a passed pawn created or advanced, a pawn move
that lets an enemy pawn through, and (only on otherwise quiet plies)
development, centralization and a king walk in the endgame; at most two per
ply. Captures carry none of the line facts — "takes the pawn on d7" does not
also "seize the d-file" it just opened. "Develops" is exact when the builder
passes the game's history (`movedFrom`): a knight going b1-d2-f1-g3 is never
developed twice; from a bare FEN it needs a type-matched home square and
either castling rights or a very early move number.

An adversarial review (59 positions, 20 candidates) shaped those rules: it
found development claimed for rerouted pieces, "doubling" on a closed file or
a back rank, a promotion narrated as a pawn advancing to the 8th, a double
step capturable en passant called a passed pawn (attack scans read pawn
geometry only; `capturable` now asks chess.js for the en passant capture),
a pawn level with its neighbour called backward, weak-pawn attacks the same
piece already made from its old square, and "challenges" on a pawn that was
already lost. Every finding is a unit test in `lineStory.test.ts`.

On the labeled-solution check quiet plies fell from 8.1% to 3.3% with every
tactical figure unchanged. Rates per 100 solution plies: open file 5.3, weak
pawn 5.3, passed pawn 4.9, pinned piece 3.7, blockade 1.9, king walk 1.5,
doubling 0.8, challenge 0.8, outpost 0.3, centralize 0.3, develop 0.0 (puzzle
solutions are forcing lines with no game history, so the soft purposes are
rare there by construction). The pawn predicates were cross-checked against
the repo's older `positionAnnotator` on 1,200 positions: open files and
isolated pawns agree 1,200/1,200; the 130 passed-pawn disagreements are all
the annotator counting an enemy pawn *beside* a pawn as blocking it (a `>=`
that should be `>`), so the new predicate is the correct one.

### The verbalizer re-measured with purposes in the contract (2026-09-05, 18 games)

`results/ab-purposes-4.1-sonnet46.json`: the same six real fixtures as the
two earlier arms, three samples each (the harness default, which I failed to
override — 18 games, 513 claim sentences, $1.56 against a $1 approval).

| arm | games | persona | coverage (sentence) | fabrication / 100 | sentence drops | cost |
|---|---|---|---|---|---|---|
| baseline 4.0 (no stories) | 6 | 4.42 | 0.927 | 0 | 5 | $0.51 |
| stories 4.1 | 6 | 4.33 | 0.948 | 0 | 3 | $0.55 |
| stories + purposes 4.1 | 18 | 4.08 | 0.927 | 0.39 (2/513) | 11 | $1.56 |

Five of the six CI-4 gates pass pooled and per run; the sixth — fabrication
≤ 1/100 on EVERY run — fails on one run at 1.09 (one sentence in 92). None
of the differences against the single-sample arms clears the noise: a true
rate of 0.4 per 100 returns 0 in 100 sentences two times in three, and the
persona gap is about one standard error at these sizes. The two fabrications
are a tactical keyword without a licence (fixture 07) and a forbidden claim
class (fixture 09) — the families the programme started with; neither text
quotes a purpose fact. Two leads worth a $0 look: fixtures 01 and 05 cite a
few points less in all three samples (0.81–0.91 and 0.93–0.95 against 1.0
in the stories arm), and one sample of fixture 05 scored persona 2 from both
judges where the other two scored 5 — its two cards explain the same Nxc8+
combination twice, which the contract invites whenever consecutive blunders
share a best move.

### The follow-up referee (2026-09-05)

`followUpReferee.ts` checks every follow-up reply sentence by sentence
against the review's compact contract and the board under discussion:
tactical words need a licence (a confirmed motif, a story fact, a hanging
piece or pin actually on the board), moves in notation must be game moves,
engine-line moves, or legal where the coach put them, eval figures must be
ones the review or the per-move table displayed, and a piece named on a
square must stand there — with the ownership the sentence claims — on the
board under discussion or on a reviewed before/after board. Failing sentences
are dropped, never hedged; an emptied reply becomes one honest line. Replayed
over the eight real answers from the story probe: 10 of 67 sentences cut in
the arm without stories — every one a fabrication ("your queen on c1" for
Black's queen, a rook "on c8", "8...Kd7", an "immediate checkmate threat") —
and 0 of 65 in the arm with stories.

### Follow-up chat with line stories (2026-09-05)

`followup_story_probe.ts` (`results/followup-story-probe.json`): the same
four questions, answered by the fast tier from the compact contract with and
without stories. Without stories the coach produced chess-false sentences on
every question — it called Black's hanging queen on c1 "your queen", invented
a rook on c8, said 8.Qxc1 "captures the rook", and gave 18.Rh5 an "immediate
checkmate threat on h7" that does not exist. With stories it narrated the
game's actual continuation (8...Kd8 forced, 9.Nxa8 Qxd1+, queen for rook) and
the real reason 18.Ne6 loses (18...Bxe6 takes it for free). Four questions is
a reading, not a gate; the block grows from ~1.5k to ~4k characters per turn,
under a tenth of a cent on the fast tier.

### Arming (read before trusting a contract-mode number)### Arming (read before trusting a contract-mode number)

The enforced stream applies **no arming at all** unless a table is passed: every
card reports `pass`, shipped prose equals raw model prose, and any fabrication
gate is vacuous. So `contract_ci4_eval.ts`, `contract_ci4_verify.ts`,
`contract_ci4_gates.ts` and the offline replay all pass an explicit
`CI4_GATE_ARMING_TABLE` (`scripts/eval/ci4GateTable.ts`).

**That table IS the serving table.** It is
`{...DEFAULT_ARMING_TABLE, ...CI4_GATE_ARMING_OVERRIDES}` — derived from
`src/lib/contract/armingConfig.ts`, never retyped. It used to be a
hand-maintained mirror, which meant the gate measured a stricter posture than
serving would ever apply; `scripts/eval/__tests__/ci4GateTable.test.ts` now
fails if a literal duplicate is reintroduced, if an override is undeclared, or
if an override no longer differs from the serving value.

To measure a *proposed* arming change without shipping it, add the row to
`CI4_GATE_ARMING_OVERRIDES` with a comment naming why, add it to the test's
`DECLARED_OVERRIDES` allowlist, and re-run. Do not edit `armingConfig.ts` from
the eval side.

### Measurement discipline

`contract_ci4_gates.ts` exists because the first CI-4 pass reported a persona
figure pooled post-hoc across runs, which fell below the gate on every
single-run re-measurement. It takes N independent generations per fixture,
reports every gate per-run *and* pooled, and asserts both. Citation coverage
is emitted at both granularities from the same generations — granularity
changes only the reported coverage, never a referee finding and never
enforcement (asserted in `--dry-run`).

## CI

The **deterministic validator gate** (`scripts/mastermind/validator-gate-dryrun.ts`,
22 fixtures, no network) runs on every PR via `.github/workflows/ci.yml`. The
API-billed harnesses above are manual — run Track A + the 2×2 before/after any
prompt-version bump or model swap, and commit the results JSON with the model
ID stamped.
