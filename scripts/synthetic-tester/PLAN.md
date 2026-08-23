# Synthetic Tester for Chess Masti AI — Plan (v2)

Goal: generate transcripts of (game position, persona question, coach response, validator verdict) tuples at scale so they can be hand-graded into a labelled failure taxonomy. **Not** an auto-grader, **not** red-teaming.

Audience: future me + Claude. Sized for Phase 1 implementation immediately after approval.

**Revision history.** v2 (2026-04-30) — feedback-driven rewrite: one analysis per *game* not per checkpoint (10× cheaper); auth assumption gated behind a Phase 0 spike; calibration moved to Phase 1.5; reproducibility (`--seed`, version columns), resumability (per-row writes), and error-row capture added; persona file schema spec'd; `personalityId` exposed as a CLI flag.

---

## 0. Phase 0 — auth verification spike (BLOCKING; ~10 minutes)

The whole plan rests on the assumption that a self-minted `cm_session` JWT passes server-side auth on `/api/chat` and `/api/enhanced-analysis`. If middleware also requires Firebase ID-token verification, this approach breaks completely.

**Spike:** before any other code,
1. In a Node REPL or one-off script, sign a JWT with `SESSION_SECRET` (read from `.env.local`) using `jose.SignJWT`, payload `{ uid: "synthtest-debug", email: "synthtest@chessmasti.local" }`.
2. `curl -b "cm_session=<token>" -X POST http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"hi"}]}'`.
3. Acceptable outcomes: `200` (auth passed, fallback path responded) **or** `400` invalid input **or** `404 context_expired` (also means auth passed). Anything `401` means auth rejected — stop.
4. Repeat against `/api/enhanced-analysis` with a minimal valid body (`{ moveHistory: [], fen: "<startpos>", playerColor: "w" }`).

**If auth rejects:** stop and report. Fallback options to discuss before unblocking Phase 1:
- Dev-mode bypass gated by `process.env.NODE_ENV === "development"` and an explicit `ALLOW_TEST_AUTH=1` env var on the server.
- Mint a real Firebase custom token via Admin SDK and exchange it for a session via `/api/auth/...` — adds setup cost but avoids server changes.

Phase 0 is the **only** code allowed before plan re-approval. Output of the spike: a 1-line note appended to this plan in a "Phase 0 result" subsection.

### Phase 0 result (2026-04-30)

**PASS.** Hand-minted `cm_session` JWT (HS256, payload `{uid:"synthtest-debug", email:"synthtest@chessmasti.local"}`, signed with `SESSION_SECRET` via `jose.SignJWT`) was accepted on both endpoints against `127.0.0.1:3000`:

- `POST /api/chat` body `{}` → **400** `Messages array is required` (auth passed, schema rejected as expected).
- `POST /api/chat` body `{messages:[{role:"user",content:"hi"}]}` → **200** with a real Anthropic-generated coach reply (full pipeline works through to the LLM).
- `POST /api/enhanced-analysis` body `{moveHistory:["e4","e5","Nf3","Nc6","Bb5"], fen:"<Ruy Lopez>", playerColor:"w", userRating:1200}` → **200** with `gameAnalysis.contextId = "7601a304e3cf6625"` and a coherent Ruy Lopez analysis.

No 401s, no middleware rejection. Phase 1 is unblocked using the planned auth approach.

---

## 1. Chat endpoint integration

The chat surface is **two endpoints, not one**.

- [src/app/api/chat/route.ts](src/app/api/chat/route.ts) accepts the fast-path body `{ contextId, userMessage, conversationHistory }` ([route.ts:35](src/app/api/chat/route.ts#L35), schema at [validation/schemas.ts:89](src/lib/validation/schemas.ts#L89)). It does **not** take FEN/PGN directly — it looks the position up via `getAnalysisContext(contextId)` ([analysisContextCache.ts:86](src/lib/analysisContextCache.ts#L86)). If the context is missing it returns 404 `context_expired`.
- The `contextId` is minted by [src/app/api/enhanced-analysis/route.ts](src/app/api/enhanced-analysis/route.ts) and returned in `gameAnalysis.contextId` (route.ts:1422). The same call writes the cache entry via `storeAnalysisContext` (route.ts:1391).

**Critical: one analysis per game, not per checkpoint.** Real users analyze a game once and chat many times within that one analyzed context. The tester must mirror that:

```
for each game:
    POST /api/enhanced-analysis  (Sonnet, ~$0.05) → contextId
    for each (persona, checkpoint) pair:
        POST /api/chat            (Haiku, ~$0.001) with the SAME contextId
```

The persona's `userMessage` carries the position context the question is about — e.g., *"At move 23, after I played Bxh6, was my sacrifice sound?"* — because the checkpoint position may not be the final FEN cached on the server. The chat LLM is designed to reason about any position within the analyzed game; that's the product.

**Cost impact of getting this right:** with 5 games × 4 personas × 3 questions = 60 chat calls, the total cost is roughly `5 × $0.05 + 60 × $0.001 ≈ $0.31`, comfortably under the smoke-test budget. The previous "one analysis per checkpoint" design would have been ~$1.50 in Sonnet calls alone before any Haiku chat.

Both endpoints return JSON. Streaming on enhanced-analysis is opt-in via `stream: true` (route.ts:1193 forwards SSE deltas). **The tester does not stream** — `stream` is omitted, JSON is parsed once.

**Two-tier model selection is automatic** per route — enhanced-analysis is `flagship` (Sonnet 4), chat is `fast` (Haiku 4.5). Targeting one tier from the tester is a server change, not a tester change, so no `--tier` flag.

Validation: the chat route already calls `validateAIResponse` ([route.ts:115](src/app/api/chat/route.ts#L115)) but only returns the score, not the issue list. The tester re-runs the validator client-side against each response to capture the full issue array.

## 2. Auth strategy

**Decision (pending Phase 0 confirmation): mint our own `cm_session` JWT directly.** Sessions are signed JWTs in an httpOnly cookie ([auth/session.ts:30](src/lib/auth/session.ts#L30)) — no Firebase Admin call is needed at sign-in; the cookie *is* the credential.

The tester reads `SESSION_SECRET` from `.env.local`, signs a payload `{ uid: "synthtest-<runId>", email: "synthtest@chessmasti.local" }` with `jose`, and sends `Cookie: cm_session=<token>` on every request.

A `synthtest-*` UID prefix means:
- `getUserById(session.uid)` ([enhanced-analysis/route.ts:1061](src/app/api/enhanced-analysis/route.ts#L1061)) returns `null`, which the route handles gracefully (`coachingPrefs` stays undefined, system prompt falls back to defaults).
- analytics queries can filter `WHERE uid NOT LIKE 'synthtest-%'` to exclude test traffic.

**No Firestore user doc is created.** The fictitious UID exercises the null-coachingPrefs branch — that's also closer to a brand-new user's first session, which is a useful test condition.

**Target environment:** localhost (`http://localhost:3000`) by default; `--base-url` flag for staging. The runner refuses to start if `--base-url` resolves to `chessmasti.com` (production guard).

## 3. Where the tester lives

**In-repo, TypeScript, at `scripts/synthetic-tester/`.**

Why in-repo: import [`MoveClassification`](src/types/enums.ts), [`GameEval`](src/types/eval.ts), and especially [`validateAIResponse`](src/lib/aiResponseValidator.ts) directly. If the validator changes, the tester picks it up on the next run.

Why TypeScript: `chess.js`, the validator, and the `scripts/*.mjs` ad-hoc scripts are already TS/JS. Python would force re-implementing validation or shelling out.

Layout:
```
scripts/synthetic-tester/
  run.ts              # CLI entrypoint
  auth.ts             # mint cm_session JWT
  client.ts           # /api/enhanced-analysis + /api/chat clients
  stockfish.ts        # spawn local stockfish binary, return per-ply evals
  checkpoints.ts      # pick plies (eval-swing + quiet)
  personas/           # one .md per persona (frontmatter schema below)
    confused_beginner.md
    tilted_intermediate.md
    curious_advanced.md
    trick_questioner.md
    hinglish_learner.md
  games/              # bundled PGN files
  costTracker.ts
  output.ts           # per-row CSV append (Phase 1) → Firestore (Phase 2)
  README.md
```

Tooling: `npx tsx scripts/synthetic-tester/run.ts` — `tsx` is already in devDependencies. No build step.

## 4. Persona design

Five personas: the four scaffold-derived (`confused_beginner`, `tilted_intermediate`, `curious_advanced`, `trick_questioner`) plus a **Hinglish learner** (Aayan teaches in Hinglish per the brief).

**Calibration is Phase 1.5, not Phase 1, not Phase 2.** Phase 1 ships with uncalibrated personas — that lets us validate the pipeline end-to-end before sinking time into prompt-tuning. But calibration must happen **before any human grading begins**, because grading rows from miscalibrated personas wastes the most expensive resource (my time) on a distribution that doesn't match reality.

**Calibration source:** Firestore subcollections `users/{uid}/chats/{chatId}/messages` ([app/api/chats/route.ts:8](src/app/api/chats/route.ts#L8), 50-chat cap per user). Sentry is **not** a session-replay source — only error context, per [src/lib/sentry.ts](src/lib/sentry.ts). Process: export 30-50 recent chat docs via Firebase Console, skim, edit each `.md`. ~1 hour, no code.

If the sample is dominated by an unanticipated pattern (e.g., heavy tournament-prep questioning), add a sixth persona; otherwise ship five.

**Persona file schema** (frontmatter + body):

```markdown
---
name: confused_beginner
version: 1
date_calibrated: 2026-04-30
sample_size: 0
source: scaffold
---

# System prompt
You are a confused chess beginner around 800 ELO …

# Example utterances
- "Why did you say my horse on f3 is bad? It's defending the king right?"
- "But you told me earlier to develop the bishop first…"
- "I thought castling was illegal here?"
```

The runner hashes the entire `.md` (`persona_file_hash` column) and the version field is used in run metadata. After Phase 1.5 calibration, `version` becomes `2`, `source` becomes `firestore-2026-05-03-n=42`.

## 5. Game source

**v1 bundles 10 PGN files in `games/`:**

| | Game | Plies (approx) | Reason |
|---|---|---|---|
| 1 | Carlsen-Caruana 2018 WCC G6 | ~160 | Modern positional |
| 2 | Kasparov-Topalov Wijk 1999 | ~88 | Famous attack / sac |
| 3 | Fischer-Spassky 1972 G6 | ~82 | Classical opening, IQP |
| 4 | Anand-Kramnik 2008 G3 | ~80 | Closed Catalan endgame |
| 5 | Karjakin-Carlsen 2016 rapid TB | ~100 | Endgame technique |
| 6 | Nakamura-Caruana 2023 (rapid) | ~80 | Sharp Sicilian |
| 7 | Tal-Botvinnik 1960 G6 | ~76 | Wild middlegame, sacrifices |
| 8 | Capablanca-Tartakower NY 1924 | ~80 | Endgame, beginner-level didactic |
| 9 | Carlsen-Nepomniachtchi 2021 G6 | ~272 | Long endgame grind |
| 10 | Botvinnik-Capablanca AVRO 1938 | ~82 | Famous Botvinnik combo |

**Min-plies filter (default 30).** The runner rejects any input game with fewer than 30 plies — too short to fill the 60/20/20 checkpoint distribution from §6. Morphy-Brunswick (17 plies) is intentionally **excluded** from the bundle for this reason. Override with `--min-plies 0` if you want it.

Coverage: 1.e4 / 1.d4 / 1.c4 openings, decisive + drawn, classical + rapid, opening / middlegame / endgame focus.

**Lichess PGN dump support is plumbed but the dump is a manual setup step.** README documents the Lichess monthly dump URL — `--games-file path/to/dump.pgn --games 100` reads from that file instead of the bundle. We don't auto-download.

Pulling games from real users via Lichess OAuth: noted as v2, **not built**.

## 6. Checkpoint selection

**Run Stockfish locally** via `child_process.spawn("/opt/homebrew/bin/stockfish")` (system binary, version 17.1 already installed). UCI loop: `position fen <fen>`, `go depth 14`, parse `info ... score (cp <n>|mate <m>)` lines. Depth 14 is fast (<200ms/position) and accurate enough for swing detection.

**Mate-aware eval normalization** (replaces the previous `±1000` cap):

```
eval_to_cp(score):
    if score.cp != null:           return clamp(score.cp, -2000, 2000)
    if score.mate != null:
        sign = +1 if mate > 0 else -1
        return sign * (10000 - abs(mate) * 100)
```

Mate-in-1 → `±9900`, mate-in-50 → `±5000`. Two distinct losing-but-not-mate positions stay distinct (clamp at ±2000), while distance-to-mate is preserved monotonically. Swing computation is `swing[i] = |eval[i] - eval[i-1]|` over these normalized values.

For each game, `--questions N` checkpoints chosen as:
- **60% from blunder positions**: top-`ceil(0.6*N)` plies by swing where swing > 100cp.
- **20% from neutral positions**: a quiet middlegame ply (move 15-25, swing < 30cp). Tests the LLM weakness of inventing tactics that aren't there.
- **20% spread** across opening (ply ≤ 20) / endgame (last 20% of plies) buckets for coverage.

Output: a sorted, deduped list of plies. Each carries `checkpoint_kind ∈ {swing, quiet, opening, endgame}`. If a game has fewer than N qualifying positions in some bucket, fall back to bucket-spread across whatever moves exist.

**Reuse `MoveClassification`** ([types/enums.ts:17](src/types/enums.ts#L17)) for labeling each checkpoint (`Blunder`, `Mistake`, `Inaccuracy`, etc.) using the same thresholds the rest of the codebase uses. Filter rows like "all responses to Blunder positions where the validator complained."

The full computed `gameEval` (`PositionEval[]`) is passed to `/api/enhanced-analysis` as `gameEval` — so the LLM gets real engine context, matching what real users see.

## 7. Output destination

**Phase 1: per-row CSV append** at `scripts/synthetic-tester/runs/<runId>.csv`. Each row is fsync'd as it's generated — an abort at row 47/100 keeps 47 rows. No batched-at-end write. Run metadata (seed, git sha, persona hashes, CLI args, max-cost) goes to `scripts/synthetic-tester/runs/<runId>.meta.json` written once at start, so re-runs and PR descriptions can reference it.

There's no admin UI ([no `src/app/admin/*`](src/app/) — checked) so the "review queue" stretch goal is real new work, not an extension. CSV → Google Sheets is fine for v1 grading.

**Phase 2: also write to a Firestore collection `synthetic_test_runs/{runId}/rows/{rowId}`.** Per-row writes (not batches), so a partial run is queryable in Firebase Console without rebuilding.

**Phase 3 (deferred): minimal review-queue page** at `/app/admin/synthetic/page.tsx`, env-allowlisted UID. Skip until I dread the CSV.

**Row schema** — every row, including error rows:
```
timestamp, run_id, run_seed, app_git_sha,
game_id, white, black, persona, persona_file_hash,
ply, fen, last_move, last_n_moves,
checkpoint_kind (swing|quiet|opening|endgame),
eval_before_cp, eval_after_cp, swing_cp, move_classification,
student_question, chat_response,
context_id, analysis_latency_ms (populated only on first row per game; empty after),
chat_latency_ms,
model_chat (haiku-4-5), model_analysis (sonnet-4),
personality_id, base_url,
validator_score, validator_issue_count, validator_issues_json,
prompt_tokens, completion_tokens, est_cost_usd,
http_status, error_message,
grade, failure_mode, notes
```

`grade`, `failure_mode`, `notes` are intentionally empty — that's where I grade. `http_status` and `error_message` populate on non-2xx so error rows are still data.

## 8. Hallucination validator integration

After each `/api/chat` response (or attempted response, on errors where we still have a FEN), the tester runs `validateAIResponse(response, fen)` from [src/lib/aiResponseValidator.ts](src/lib/aiResponseValidator.ts) with the FEN at the checkpoint ply. Full `ValidationResult` (score + issues array) goes into the row. Both `validator_score` (numeric, fast filter) and `validator_issues_json` (full detail) are stored — keeps the CSV usable in Sheets while preserving raw signal.

Disagreements between my human grade and the validator's verdict are exactly the rows worth surfacing — Phase 2 adds a `grader_vs_validator` derived column once I have ≥50 graded rows.

## 9. Cost & rate controls + reproducibility

- **`MAX_RUN_COST_USD` env (default `5.00`).** Cost tracker initialized at run start; after every API call adds `(promptTokens * inputRate + completionTokens * outputRate)` using the per-1k rates for Sonnet 4 and Haiku 4.5 hard-coded in `costTracker.ts` (with a `// TODO: update if Anthropic prices change` comment). If the projected cost of the *next* call would exceed the cap, abort cleanly with all rows so far on disk.
- **`--concurrency N`** flag, default 1. Caps simultaneous in-flight HTTP requests. `4` is reasonable against staging.
- **Student persona generation uses Haiku** (cheap, doesn't need flagship reasoning) — hard-coded in `client.ts`. Server-side chat is already Haiku per `tier: "fast"`.
- **`--seed <n>`** flag. Defaults to `Date.now()`, logged to `<runId>.meta.json`. Seeds Math.random() (for game/persona shuffling and quiet-checkpoint picks). Student persona generation uses **`temperature: 0.3`** — low enough that the same seed reproduces close-to-identical questions, high enough that personas don't lock into one phrasing. Pin the seed when diffing failure rates across chat-prompt versions.
- **`--personality <id>`** flag, default `"friendly"`. Hard-coding one personality would mask bugs that only appear in non-default personalities. The flag accepts any id matching the server-side allowlist (validated by [enhanced-analysis schema](src/lib/validation/schemas.ts) regex `^[a-z0-9_-]{1,40}$`); unknown ids fall back server-side to default per the audit hardening.
- **Errors are data, not aborts.** Non-2xx responses from `/api/enhanced-analysis` or `/api/chat` write a row with `http_status`, `error_message`, `chat_response = "[ERROR]"`, validator fields null, and the run continues. If `/api/enhanced-analysis` fails for a *whole game*, skip that game's checkpoints (with N error rows, one per (persona, checkpoint) pair, marked) and move on. "Server 5xx rate per persona/checkpoint kind" is itself a metric.
- **`--dry-run`** flag: prints planned (game, persona, ply) tuples and estimated cost, makes zero API calls.

## 10. Out of scope (NOT building)

- Automated grading / LLM-as-judge.
- Multi-turn conversations within a single checkpoint (one Q per checkpoint, period).
- Web UI beyond the optional Firestore review queue (Phase 3).
- Fine-tuning / training off the labelled data.
- CI integration.
- Pulling games from real users via Lichess OAuth.
- Streaming response support in the tester.
- Any modification to `/api/chat` or `/api/enhanced-analysis` server code.

---

## Phased implementation checklist

**Phase 0 — auth verification spike (BLOCKING; ~10 minutes)**
- [ ] Hand-mint `cm_session` JWT for `synthtest-debug` using `SESSION_SECRET` + jose.
- [ ] curl `/api/chat` and `/api/enhanced-analysis` against localhost; confirm 200 / 400 / 404 (any non-401).
- [ ] Append "Phase 0 result" subsection to this plan with outcome + (if rejected) proposed fallback.
- [ ] **Stop and re-confirm with reviewer if auth was rejected.**

**Phase 1 — minimum viable pipeline (target: ~1 day)**
- [ ] `auth.ts`: mint `cm_session` JWT from `SESSION_SECRET`.
- [ ] `stockfish.ts`: spawn local binary, return per-ply normalized evals (mate-aware).
- [ ] `checkpoints.ts`: swing-biased + quiet checkpoint selection; min-plies filter.
- [ ] `client.ts`: **one** enhanced-analysis per game → contextId; many chat calls reusing it.
- [ ] `personas/`: 5 .md files with frontmatter schema, all `source: scaffold`, `version: 1`. **Uncalibrated.**
- [ ] `games/`: 10 bundled PGN files (≥30 plies each).
- [ ] `costTracker.ts`: hard cap, abort on projected exceed.
- [ ] `output.ts`: per-row CSV append + `<runId>.meta.json` writer; error rows populate `http_status`/`error_message`.
- [ ] `run.ts`: CLI with `--games --personas --questions --base-url --concurrency --dry-run --max-cost --seed --personality --min-plies`.
- [ ] Capture `app_git_sha` (`git rev-parse HEAD`) and `persona_file_hash` (sha256) into every row.
- [ ] Production guard: refuse to run if base URL contains `chessmasti.com`.
- [ ] `README.md`: setup, env vars, example invocations, Lichess-dump instructions.
- [ ] Smoke test: `--games 3 --personas all --questions 2` against localhost. Acceptance: completes <5min, <$1, validator output present in every row, kill mid-run → partial CSV is intact.

**Phase 1.5 — persona calibration (BEFORE any human grading begins)**
- [ ] One-shot Firestore review of 30-50 real chats; rewrite persona `.md` files; bump `version`, set `date_calibrated` and `source: firestore-YYYY-MM-DD-n=N`.
- [ ] Re-run smoke test with calibrated personas; spot-check 10 rows for plausibility.
- [ ] Only then begin human grading on the larger run.

**Phase 2 — Firestore output (target: ~half day)**
- [ ] `output.ts`: also write per-row to `synthetic_test_runs/{runId}/rows/{rowId}`. Per-row, not per-batch.
- [ ] `synthetic_test_runs/{runId}` parent doc carries the same metadata as `<runId>.meta.json`.
- [ ] Add `grader_vs_validator` derived column to the writer once I have 50+ graded rows.

**Phase 3 — review UI (deferred until I dread the CSV)**
- [ ] `/app/admin/synthetic/page.tsx` env-allowlisted UID, ungraded rows with one-click good/bad/hallucination buttons writing back to Firestore.

---

**Stop here. Awaiting approval before any code beyond the Phase 0 spike is written.**
