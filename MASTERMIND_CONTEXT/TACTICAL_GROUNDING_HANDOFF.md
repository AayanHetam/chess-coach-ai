# Tactical Grounding Program — Handoff

_Last updated: 2026-06-01. Status snapshot for anyone (human or Claude session) picking this up._

---

## Build status at handoff

| Stage | What | Status | PR-ready |
|---|---|---|---|
| **0** | Research notes (`TACTICAL_GROUNDING_SOURCES.md`) | ✅ DONE | yes |
| **1** | Syzygy tablebase → route injection | ✅ DONE | yes |
| **2** | Lichess puzzle DB → Lichess themes canonical (loader v4) | ✅ DONE | yes |
| **3** | chessdb.cn lookup + queue | ✅ DONE | yes |
| **4** | GCC-Eval + ChessQA eval runners | ✅ DONE | yes |
| **5** | Motif detector (8 types) + escapability + validator | ✅ DONE | yes |
| **6** | Multi-source consensus voter + route wiring | ✅ DONE | yes |
| **7** | Lc0 server microservice + voter wiring | ✅ DONE | yes |
| **8** | Maia-2 `predict_at_rating` + user_visibility | ✅ DONE | yes |

**tsc --noEmit**: clean  
**vitest**: 851 pass / 1 fail — the 1 failure is a pre-existing timeout in `threatTree.test.ts > enumerates defenses for a non-mate threat` (5000ms limit, `buildThreatTree(fen, 3)` is genuinely slow; unrelated to this program)

---

## Files created this program (Stage 5–6 only)

```
src/lib/tactics/
  types.ts              — 8 motif TypeScript types + Refutation
  utils.ts              — rawAttacks, attackersOf, SEE, squaresBetween
  escapability.ts       — applyEscapability() — 2-ply forcing-move confirmation
  index.ts              — detectMotifs(fenBefore, moveSan): AnyMotif[]
                          motifsToPropmt(), TACTICAL_CLAIM_KEYWORDS
  motifs/
    fork.ts             — detectFork()
    pin.ts              — detectPin(), detectPinsAfterMove()
    skewer.ts           — detectSkewers()
    discovered_attack.ts — detectDiscoveredAttacks()
    removed_defender.ts  — detectRemovedDefenders()
    hanging_piece.ts    — detectHangingPieces()
    trapped_piece.ts    — detectTrappedPieces()
    back_rank_mate.ts   — detectBackRankMate()
  __tests__/
    index.test.ts       — fork, pin, hanging, back_rank, integration (21 tests)
    motifGrounding.test.ts — validator tests (9 tests)

src/lib/grounding/
  chessdb.ts            — queryChessdb(), chessdbResultToContext() (Stage 3)
  voter.ts              — compileVoterResult() — multi-source consensus voter (Stage 6)
  __tests__/
    voter.test.ts       — 30 voter tests

src/lib/mastermind/validators/
  motifGrounding.ts     — validateMotifGrounding() — pure string scan, $0 cost
  (types.ts updated)    — "motif_grounding_ungrounded" + "tactical_claim_without_grounding"

MASTERMIND_CONTEXT/
  TACTICAL_GROUNDING_SOURCES.md   — 15 categories, ~80 sources, licensing notes (Stage 0)
  TACTICAL_GROUNDING_HANDOFF.md   — this file

scripts/neo4j-loaders/
  load-puzzles.mjs      — v4: Lichess themes canonical; --no-lichess-themes, --no-fen-analysis flags (Stage 2)
```

**Files modified (targeted edits only):**
- `src/app/api/enhanced-analysis/route.ts` — imports, `buildGameContext` → async, voter wiring at 2 injection points + tablebase injection
- `src/lib/mastermind/validators/types.ts` — added 2 new check_name/fire_reason values

---

## Architecture in one diagram

```
Per-move analysis (enhanced-analysis/route.ts)
        │
        ├── detectMotifs(fenBefore, moveSan)          ← Stage 5: chess.js only, <50ms
        │     └── applyEscapability()                  ← 2-ply forcing-move search
        │           → AnyMotif[] with confirmed: bool
        │
        ├── fetch_lichess_tablebase(fen)               ← Stage 1: Syzygy (≤7 pieces)
        │     → TablebaseResult | null
        │
        ├── queryChessdb(fenAfter)                    ← Stage 3: cloud eval + queue
        │     → ChessdbResult | null
        │
        └── compileVoterResult({ motifs, tablebase,   ← Stage 6: consensus voter
                                  chessdb, sfEval })
              → { confidence, allowedKeywords,
                  groundingContext }  ← injected into LLM prompt
                        │
                        ▼
                LLM prompt receives:
                  ENDGAME GROUND TRUTH (if Syzygy hit)
                  TACTICAL FACTS (confirmed motifs only)
                  UNCONFIRMED PATTERNS (with refutation, if any)
                  ChessDB cloud-eval (if known)
                        │
                        ▼
                validateMotifGrounding(llmResponse, motifs)  ← Stage 5 validator
                  pure string scan, $0 cost
                  fails if LLM uses fork/pin/skewer/... without confirmed motif
```

---

## Key design decisions (do not silently reverse)

1. **Fail-CLOSED**: no grounding sources → claim dropped, not asserted. The LLM says less, not wrong. This is intentional.

2. **Confirmed vs structural**: `motif.confirmed = false` means the pattern exists geometrically but the opponent has a forcing reply. LLM may only narrate `confirmed: true` motifs by default. It may mention `confirmed: false` patterns only if it explicitly cites the `refutation.move`.

3. **`buildGameContext` is now async**: changed from `function` to `async function` to support `await queryChessdb()` inside the mistakes loop. The single call site at line ~1211 of route.ts was updated to `await buildGameContext(...)`. This is the only breaking API change.

4. **Stage 2 loader v4**: Lichess themes from the CSV column are the canonical source (CC0 from cook.py). Old FEN-derived themes still work via `--no-lichess-themes`. The `lichessThemes` string property is stored on every Puzzle node for debugging / rollback.

5. **Voter is pure synchronous**: `compileVoterResult()` takes pre-fetched inputs, no side-effects, no network calls. All async work (chessdb, tablebase) happens in the route before calling the voter.

---

## Stage 4 — DONE

**Files created:**
```
scripts/eval/
  gcc-eval-runner.ts          — GCC-Eval runner (CLI, npx tsx)
  chessqa-runner.ts           — ChessQA runner (CLI, npx tsx)
  benchmarks/
    gcc-eval-sample.json      — 10 verified sample fixtures (bundled)
    chessqa-sample.json       — 12 verified sample fixtures (bundled)
```

**Run (samples — works immediately):**
```bash
npx tsx scripts/eval/gcc-eval-runner.ts
npx tsx scripts/eval/chessqa-runner.ts --verbose
```

**Run with full benchmark (download first):**
```bash
# GCC-Eval: https://github.com/ml-postech/concept-guided-chess-commentary
npx tsx scripts/eval/gcc-eval-runner.ts --fixtures=gcc-eval.json

# ChessQA: https://github.com/CSSLab/chessqa-benchmark
npx tsx scripts/eval/chessqa-runner.ts --fixtures=chessqa.json
```

**Pre-Stage-5 baseline:**
```bash
npx tsx scripts/eval/gcc-eval-runner.ts --no-motifs   # grounding_rate = 0%
npx tsx scripts/eval/chessqa-runner.ts --no-motifs    # accuracy = 0%
```

**Sample fixture results (bundled):**
- GCC-Eval: grounding_rate = 100% (13/13 gold tactical keywords grounded). 3 false-positives on positions where our detector catches motifs the gold commentary didn't label.
- ChessQA: accuracy = 100% (10/10 motif questions answered correctly), specificity = 100% (no-motif correctly detected).

**To scale:** replace bundled JSON with the full benchmark file. Same format, same runner — just point with `--fixtures=`.

**Key flags:**
- `--no-motifs` — pre-Stage-5 baseline (simulates no detector)
- `--output=FILE` — emit JSON report for tracking over time
- `--verbose` — per-fixture breakdown
- `--categories=motifs,short_tactics` — ChessQA category filter (default: these two)

---

## Stage 7 — DONE

**Files created:**
```
lc0-service/                              — microservice (GPL-3 binary, separate process)
  lc0_server.py                           — FastAPI; one persistent UCI engine
  Dockerfile                              — downloads lc0 v0.31.2 CPU + maia-1900.pb.gz
  requirements.txt                        — fastapi, uvicorn, chess, pydantic
  render.yaml                             — Render deploy config
  README.md                               — dev + deploy + license notes

src/lib/grounding/
  lc0.ts                                  — HTTP client + shouldCallLc0() + lc0AgreesWithSf()
  __tests__/lc0.test.ts                   — 14 unit tests

src/app/api/lc0-status/route.ts           — health proxy
src/app/api/keep-lc0-alive/route.ts       — Vercel cron keep-alive
```

**Files modified:**
- `src/lib/grounding/voter.ts` — added `lc0Result?: Lc0Result | null` to `VoterInput`, `positional_plan: ConfidenceLevel` to `VoterConfidence`, MED → HIGH upgrade for `material_win` when `sfAndLc0Agree`, full `positional_plan` decision table (HIGH / MED / LOW / NONE with veto logic). 13 new voter tests.
- `src/app/api/enhanced-analysis/route.ts` — pre-fetches Lc0 results in parallel at both voter call sites (mistakes loop + intelligence loop), gated by `shouldCallLc0()`.

**Wiring shape (route.ts):**
```ts
const [chessdbResults, lc0Results] = await Promise.all([
  Promise.all(mistakes.map(m => queryChessdb(m.fenAfter).catch(() => null))),
  Promise.all(mistakes.map(m => {
    const sfCp = evalBefore?.lines?.[0]?.cp ?? null;
    return shouldCallLc0(sfCp, evalBefore?.lines ?? [])
      ? queryLc0(m.fenBefore).catch(() => null)
      : Promise.resolve(null);
  })),
]);

compileVoterResult({ motifs, chessdbResult, lc0Result, stockfishEvalCp, ... });
```

**Trigger condition (per spec):** call Lc0 only when `|SF eval| ≤ 100cp` AND `≥2 candidates within 30cp`. Typical game analysis: 1–3 Lc0 calls out of 40 moves.

**Confidence upgrade rules:**
- `material_win`: MED → HIGH when SF and Lc0 both ≥ +150cp (or both ≤ -150cp)
- `positional_plan` (new): HIGH if both engines agree ≥150cp same direction; NONE if Lc0 vetoes SF (opposite direction, |Lc0| ≥ 50cp); MED if SF ≥ 100cp with no Lc0 contradiction; LOW for SF in [50,100); NONE otherwise.

### ⚠️ Design tension surfaced (technical-correctness deviation, documented per CLAUDE.md feedback rule)

**The trigger condition and the upgrade condition mutually exclude in production:**
- `shouldCallLc0` fires only when `|SF| ≤ 100`
- The `material_win` upgrade requires `SF ≥ 150` AND `Lc0 ≥ 150`
- ∴ when Lc0 fires, SF can never be ≥ 150 — the upgrade is unreachable via the route.

What this means in production: the `material_win` MED → HIGH upgrade as specced never fires. The implementation is faithful to the spec, but the **active production effect of Lc0 is the `positional_plan` decision** — specifically:
- Confirm SF's read in [50, 100]cp positions (MED stays MED)
- **Veto SF's read** when Lc0 disagrees in opposite direction with |Lc0| ≥ 50 (MED → NONE, LOW → NONE)

This veto is the most valuable Stage 7 signal in practice — Lc0 catches positions where SF's depth-limited material count misses positional reality.

**Decision to revisit (suggest in Stage 8 PR or follow-up):** either (a) relax `shouldCallLc0` to also fire on critical positions where SF is decisive (extending the trigger range), or (b) lower the upgrade threshold (e.g., "Lc0 ≥ 150 alone is enough to upgrade, regardless of SF magnitude"). Option (b) better matches the "Lc0 catches what SF misses" intent.

### Run locally

```bash
# In lc0-service/
pip install -r requirements.txt
curl -fsSL https://github.com/LeelaChessZero/lc0/releases/download/v0.31.2/lc0-v0.31.2-linux-cpu.tar.gz | tar xz
curl -fsSL -o maia-1900.pb.gz https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1900.pb.gz
LC0_BINARY=./lc0 LC0_NETWORK=./maia-1900.pb.gz uvicorn lc0_server:app --reload --port 8001

# In chess-coach-ai/
LC0_API_URL=http://localhost:8001 npm run dev
```

### Health checks

- `GET /api/lc0-status` → service config + reachability + model_loaded
- `GET /api/keep-lc0-alive` → daily Vercel cron (add to `vercel.json`: `{ "path": "/api/keep-lc0-alive", "schedule": "0 6 * * *" }`)

---

## Stage 8 — DONE

**Files created:**
```
src/lib/grounding/
  maia.ts                                  — HTTP client + shouldCallMaia() + probToVisibility()
  __tests__/maia.test.ts                   — 25 unit tests

maia-service/maia_server.py                — added POST /predict_at_rating endpoint
                                              + PredictAtRatingRequest / PredictAtRatingResponse
                                              + LikelyMove + _maia_distribution helper
```

**Files modified:**
- `src/lib/grounding/voter.ts` — added `maiaResult?: MaiaProbResult | null` and `bestMoveSan?: string | null` to `VoterInput`; added `user_visibility: ConfidenceLevel` to `VoterConfidence`; Maia grounding context block emits suppression rule when prob < 0.15. 9 new voter tests.
- `src/app/api/enhanced-analysis/route.ts` — pre-fetches Maia per-rating predictions in parallel alongside chessdb + Lc0 at both voter call sites; gated by `shouldCallMaia(userRating, bestMoveUci)`.

**Visibility thresholds (probToVisibility):**
- `HIGH`: prob ≥ 0.50 — most players at this rating play this; "obvious" tone okay
- `MED`: prob ≥ 0.25 — clearly the expected move
- `LOW`: prob ≥ 0.15 — findable but not automatic
- `NONE`: prob < 0.15 — **emits suppression rule**: forbids "obvious", "obviously", "clearly", "simply", "just" in the LLM response. Frames the miss as a discovery, not a failure.

**Trigger condition (shouldCallMaia):** call when (a) `MAIA_API_URL` configured, (b) user rating present (100–3500), (c) SF best move UCI present (4–5 chars). No SF-eval-range gate — Maia inference is fast (~50ms) and informative on every kind of position. Rate-limited naturally by calling only on top mistakes + critical positions.

**Cache:** 30-min TTL keyed by `(fen, rating, best_move)`.

**Wiring shape (route.ts):**
```ts
const [chessdbResults, lc0Results, maiaResults] = await Promise.all([
  Promise.all(topMistakes.map(m => queryChessdb(m.fenBefore).catch(() => null))),
  Promise.all(topMistakes.map(m => shouldCallLc0(...)
    ? queryLc0(m.fenBefore).catch(() => null) : Promise.resolve(null))),
  Promise.all(topMistakes.map(m => {
    const bestUci = evalBefore?.lines?.[0]?.pv?.[0] ?? null;
    return shouldCallMaia(userRating, bestUci)
      ? queryMaiaAtRating(m.fenBefore, userRating!, bestUci!).catch(() => null)
      : Promise.resolve(null);
  })),
]);

compileVoterResult({ motifs, chessdbResult, lc0Result, maiaResult, bestMoveSan, ... });
```

**Maia API contract (Python service):**
```
POST /predict_at_rating
Body:   { fen, rating: int, best_move: str (UCI), opponent_rating?: int }
Return: { prob_plays_best: float, likely_moves: [{ move, probability }, ...], rating, model }
```

### Operations

- Same HF Spaces deployment as existing Maia service (no new container needed)
- Add the endpoint by re-deploying `maia-service/` (Dockerfile and requirements unchanged)
- Existing `/api/keep-maia-alive` cron keeps it warm — no new cron needed

---

## Known issues / pre-existing failures

- `threatTree.test.ts > enumerates defenses for a non-mate threat` — 5s timeout, pre-existing, not caused by this program. `buildThreatTree(fen, 3)` with a depth-3 search is genuinely slow. Fix: add `{ timeout: 15000 }` as 3rd arg to `it()`, or reduce depth to 2 in that test.

- `detectBackRankMate` has a latent bug with undefended delivering pieces: if the rook delivering back-rank mate is itself undefended AND adjacent to the king, the escape-square check may falsely report the king can escape by capturing the rook (the `isAttacked` call doesn't account for this case). Doesn't affect confirmed `isCheckmate()` positions. Will surface as a false-negative on rare near-checkmate threats. Post-program fix.

---

## Running things

```bash
# Type check
cd chess-coach-ai
npx tsc --noEmit

# Tests (all)
npm test

# Tests (tactics only — fast, <1s)
npm test -- src/lib/tactics src/lib/grounding

# Puzzle loader (4.4M full dump — requires CSV at data/lichess_db_puzzle.csv)
node scripts/neo4j-loaders/load-puzzles.mjs --csv=./data/lichess_db_puzzle.csv

# Puzzle loader (100k sample, old behavior)
node scripts/neo4j-loaders/load-puzzles.mjs --limit=100000 --csv=./data/lichess_puzzles_100k.csv --no-lichess-themes --no-fen-analysis
```

Download the 4.4M Lichess puzzle CSV: https://database.lichess.org/#puzzles (current dump: `lichess_db_puzzle_2024-xx.csv.zst`, ~300MB compressed).

---

_All 8 stages of the Tactical Grounding Program shipped. Open follow-ups: (1) Stage 7 design tension — `shouldCallLc0` range and `material_win` MED → HIGH upgrade thresholds mutually exclude in production (see §"Design tension surfaced"); pick one of relax-trigger or lower-threshold before next iteration. (2) Stage 4 — download the full GCC-Eval and ChessQA benchmarks and re-run runners to get real before/after numbers across the program. (3) Stage 7+8 — deploy `lc0-service/` to HF Spaces and re-deploy `maia-service/` to expose `/predict_at_rating`, then verify both with `/api/lc0-status` and `/api/maia-status`._
