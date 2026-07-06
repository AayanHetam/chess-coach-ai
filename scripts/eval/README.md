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

`--dry-run` on the python harnesses builds prompts/engine context with zero API calls.

## CI

The **deterministic validator gate** (`scripts/mastermind/validator-gate-dryrun.ts`,
22 fixtures, no network) runs on every PR via `.github/workflows/ci.yml`. The
API-billed harnesses above are manual — run Track A + the 2×2 before/after any
prompt-version bump or model swap, and commit the results JSON with the model
ID stamped.
