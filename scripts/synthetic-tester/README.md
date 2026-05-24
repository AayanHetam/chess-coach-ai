# Synthetic Tester for Chess Masti AI

Generates (game position, persona question, coach response, validator verdict) tuples at scale for **manual** grading. Not an auto-grader. Plan: [SYNTHETIC_TESTER_PLAN.md](../../SYNTHETIC_TESTER_PLAN.md) at the repo root.

## Quick start

```bash
# 1. Make sure the dev server is running:
npm run dev    # → http://127.0.0.1:3000

# 2. From the repo root:
npx tsx scripts/synthetic-tester/run.ts \
  --games 3 --personas all --questions 2 \
  --base-url http://127.0.0.1:3000 \
  --max-cost 1.0
```

Output lands in `scripts/synthetic-tester/runs/<runId>.csv` (per-row append, fsync after each line) plus `<runId>.meta.json` with the run config.

## Required env (read from `.env.local`)

| Var | Use |
|---|---|
| `SESSION_SECRET` | Signing key for the `cm_session` JWT cookie. ≥32 chars. |
| `ANTHROPIC_API_KEY` | Used for student persona generation (Haiku 4.5). |

The tester does **not** create a Firestore user doc — the JWT carries a fictitious `synthtest-<runId>` UID, and `getUserById` returns `null` (the route handles this branch). To exclude test traffic from analytics: `WHERE uid NOT LIKE 'synthtest-%'`.

## CLI flags

| Flag | Default | Notes |
|---|---|---|
| `--games N` | `3` | Max games to run from `games/` (or `--games-file`). |
| `--questions N` | `2` | Checkpoints per game (60% swing / 20% quiet / 20% spread). |
| `--personas a,b,…` or `all` | `all` | Subset of `personas/*.md`. |
| `--base-url URL` | `http://127.0.0.1:3000` | **Refuses** `chessmasti.com`. |
| `--concurrency N` | `1` | Concurrent in-flight requests. |
| `--max-cost USD` | `5.0` | Aborts cleanly if total Anthropic spend would exceed. |
| `--seed N` | `Date.now() & 0xffffffff` | Mulberry32 RNG for deterministic checkpoint picks. |
| `--persona-temp X` | `0.3` | Anthropic temperature for student-persona generation. |
| `--personality ID` | `friendly` | Coach personality (server allowlist via `personalityId`). |
| `--min-plies N` | `30` | Drops bundled games shorter than this. |
| `--games-file PATH` | — | PGN file with multiple games (e.g. Lichess monthly dump). |
| `--sf-depth N` | `14` | Stockfish search depth per ply. |
| `--dry-run` | off | Loads everything, writes meta.json, makes zero API calls. |

## Stockfish

The tester spawns the system `stockfish` binary, defaulting to `/opt/homebrew/bin/stockfish` (macOS Homebrew). Override with `STOCKFISH_BIN=/path/to/stockfish`. Verified against Stockfish 17.1.

## Lichess PGN dumps

The bundled `games/` set is 10 GM games extracted from `scripts/data-pipeline/output/GM_games.pgn`. For volume:

```bash
# Manual setup — download the monthly dump from
#   https://database.lichess.org/standard/lichess_db_standard_rated_2026-04.pgn.zst
# Decompress, then point the tester at it:
npx tsx scripts/synthetic-tester/run.ts \
  --games-file ~/data/lichess-2026-04.pgn \
  --games 50 --questions 3 --personas all
```

## Persona files

Each `personas/<name>.md` is frontmatter (yaml) + body. The tester sha256-hashes the entire file and stores the digest on every row (`persona_file_hash`), so an edit is observable in the CSV without manual versioning.

```yaml
---
name: confused_beginner
version: 1
date_calibrated: 2026-04-30
sample_size: 0       # 0 = uncalibrated; >0 = calibrated against N real chats
source: scaffold     # or e.g. firestore-2026-05-03-n=42
---
# System prompt
…
# Example utterances
- …
```

Calibration (Phase 1.5 of the plan) is a one-shot Firestore review of 30-50 real chats; bump `version`, set `date_calibrated`, and update `source`.

## Row schema

See `output.ts:Row`. Highlights:
- `validator_score` + `validator_issues_json` — output of [`validateAIResponse`](../../src/lib/aiResponseValidator.ts) re-run client-side.
- `eval_before_cp` / `eval_after_cp` / `swing_cp` — mate-aware (see plan §6).
- `analysis_latency_ms` — populated only on the *first* row per game (one analysis call shared by all checkpoints in that game).
- `http_status` + `error_message` — populated on non-2xx; chat_response is `[ERROR]`. Non-2xx never aborts; partial CSV always usable.
- `grade`, `failure_mode`, `notes` — empty by design. That's where you grade.

## Out of scope

Per the plan §10: no auto-grading, no multi-turn within a checkpoint, no web UI, no fine-tuning, no CI hookup, no streaming.
