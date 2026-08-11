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

`--dry-run` on the python harnesses builds prompts/engine context with zero API calls.

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
