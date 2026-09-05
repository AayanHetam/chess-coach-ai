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
| `contract_ci4_gates.ts --samples 3 [--legacy]` | The CI-4 gate verdict: persona / citation coverage / shipped fabrication, **per run AND pooled** | ~4 flagship + 2 Haiku calls per fixture-sample |
| `contract_ci4_offline_replay.ts [results.json]` | Replays the ladder over already-committed generations — free A/B of ladder/citation changes | $0, no network |
| `motif_detector_recall.ts [--n 400]` | Do the `src/lib/tactics` detectors find the tactics humans label? Recall per Lichess puzzle theme + exact-match on the ChessQA motif battery | $0, no network, ~7 min |

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

### Arming (read before trusting a contract-mode number)

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
