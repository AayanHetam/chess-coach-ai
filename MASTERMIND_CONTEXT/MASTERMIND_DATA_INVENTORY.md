# MASTERMIND_DATA_INVENTORY.md

## SUMMARY

What's preloaded vs live-fetched. Three tiers of data feed the coaching system. **Preloaded** lives at [data/](../data/): two Lichess puzzle CSVs (1,000 sample / 100,000 production), a hierarchical `theme-taxonomy.json`, and the Jhamtani et al. (ACL 2018) ChessCommentaryGeneration corpus under `chess-commentary/`. **Live database** is Neo4j (Aura free tier) holding **~100,000 puzzles per CSV size (live Aura count pending verification — see Discrepancy Table)** loaded from the 100k CSV via [scripts/neo4j-loaders/load-puzzles.mjs](../scripts/neo4j-loaders/load-puzzles.mjs), with the position-as-hub schema documented in [NEO4J_ARCHITECTURE.md](../NEO4J_ARCHITECTURE.md): `(Position)←[:FROM_POSITION]−(Puzzle|Commentary)`, `(Puzzle)−[:HAS_THEME]→(Theme)`, `(Commentary)−[:IN_OPENING]→(Opening)`. **Jhamtani `:Commentary` nodes are a separate concern**: loader and HTTP route both exist, but live Aura state is unknown (Aayan may have removed them) and the route has zero in-app callers as of 2026-05-17 — see [PR_1C_DATA_AUDIT.md §A](PR_1C_DATA_AUDIT.md). Ingest filters from [scripts/build-puzzle-db.py:31-33](../scripts/build-puzzle-db.py#L31-L33) keep only quality puzzles: popularity ≥ 60, plays ≥ 50, rating-deviation ≤ 120 — matching the prompt's stated thresholds exactly. **External APIs** in live use: Anthropic and OpenAI (via [llmProvider.ts](../src/lib/llmProvider.ts)), Maia-2 on Hugging Face Spaces (via [api/maia-predict](../src/app/api/maia-predict/route.ts)), Lichess (`api.chess.com/pub` for chess.com profile, `lichess.org/api/{stream/event, board/seek, token, account}`). The discrepancy table at the end flags the .py-vs-.mjs ingest filter mismatch (`MIN_NB_PLAYS = 50` vs default `100`).

---

## Preloaded data — `chess-coach-ai/data/`

| Path | Size / shape | Purpose | Loaded by |
|---|---|---|---|
| [data/lichess_puzzles.csv](../data/lichess_puzzles.csv) | 1,001 rows (1 header + 1,000 puzzles) | Sample / smoke-test corpus | Smoke tests in [test-puzzle-matching.mjs](../scripts/test-puzzle-matching.mjs); not used at runtime |
| [data/lichess_puzzles_100k.csv](../data/lichess_puzzles_100k.csv) | 100,001 rows (1 header + 100,000 puzzles), 18 MB | Primary ingest source for Neo4j | [scripts/neo4j-loaders/load-puzzles.mjs](../scripts/neo4j-loaders/load-puzzles.mjs) (default `--limit=100000`) and [scripts/import-lichess-puzzles.mjs](../scripts/import-lichess-puzzles.mjs) |
| [data/theme-taxonomy.json](../data/theme-taxonomy.json) | 22 KB; hierarchical theme tree | Maps Lichess theme tags into the 4-level taxonomy used by [NEO4J_ARCHITECTURE.md](../NEO4J_ARCHITECTURE.md) Layer 1 | Read by Neo4j loaders during theme-edge creation |
| [data/chess-commentary/](../data/chess-commentary/) | Jhamtani et al. ACL 2018 ChessCommentaryGeneration dataset; subdirs `Code/`, `Data/`, `README.md` | Research corpus for natural-language commentary on positions | **Loader DOES exist** at [scripts/neo4j-loaders/load-commentary.mjs](../scripts/neo4j-loaders/load-commentary.mjs) (default `--limit=500`); HTTP route at [api/commentary-by-fen/route.ts](../src/app/api/commentary-by-fen/route.ts) queries `:Commentary` nodes; **but: live Aura state unknown** (Aayan may have removed Commentary nodes per 2026-05-17), and the route has **zero in-app callers** outside itself. Concept retrieval pipeline ([conceptRetrieval.ts](../src/lib/concept/conceptRetrieval.ts)) does **not** reference Commentary nodes. See [PR_1C_DATA_AUDIT.md §A](PR_1C_DATA_AUDIT.md) for full audit findings. |

### `theme-taxonomy.json` schema

A `themes[]` array of nodes with up to four levels of `subthemes[]`. Each node carries:

```ts
{
  id: string;           // kebab-case, e.g. "f7-knight-fork"
  name: string;         // human-readable, e.g. "f7 Knight Fork"
  level: 0 | 1 | 2 | 3; // 0 = root motif (fork, pin, …), 1 = piece-specific, 2 = target-specific, 3 = position-specific
  description: string;
  keywords?: string[];
  commonSquares?: string[];   // present at level 2+
  specificSquares?: string[]; // present at level 3
  subthemes?: ThemeNode[];
}
```

Verified at the file head: `fork → knight-fork → king-rook-knight-fork → f7-knight-fork` is one of several level-3 chains. The version field is `"1.0"`.

---

## Neo4j live database — Aura free tier

Connection at [neo4j.ts:20-40](../src/lib/neo4j.ts#L20-L40), driver pool size 50, `disableLosslessIntegers: true`. Read-mostly; `executeRead` and `executeWrite` at [neo4j.ts:55-90](../src/lib/neo4j.ts#L55-L90) without `defaultAccessMode` per the Aura 2026.02 driver constraint noted in the source comment.

### Schema (Layer 0 — Position-as-Hub)

From [NEO4J_ARCHITECTURE.md](../NEO4J_ARCHITECTURE.md) and [scripts/neo4j-loaders/README.md](../scripts/neo4j-loaders/README.md):

```
                    ┌──────────────┐
               ┌────│   Position   │────┐
               │    │  {fen: str}  │    │
               │    └──────────────┘    │
               │                        │
      [:FROM_POSITION]          [:FROM_POSITION]
               │                        │
               ▼                        ▼
       ┌──────────────┐        ┌──────────────┐
       │    Puzzle    │        │  Commentary  │
       │  {id, moves, │        │   {text}     │
       │   rating, …} │        └──────────────┘
       └──────────────┘                │
               │                  [:IN_OPENING]
        [:HAS_THEME]                   │
               │                       ▼
               ▼               ┌──────────────┐
       ┌──────────────┐        │   Opening    │
       │    Theme     │        │  {name,eco}  │
       │  {id, name}  │        └──────────────┘
       └──────────────┘
```

### Node properties

`Puzzle` (per [puzzleRepository.ts:7-15,68-88](../src/lib/puzzleRepository.ts#L7-L88) and [scripts/neo4j-loaders/load-puzzles.mjs:70-78](../scripts/neo4j-loaders/load-puzzles.mjs#L70-L78)):

| Property | Type | Source |
|---|---|---|
| `puzzleId` | string | Lichess CSV col 0 |
| `fen` | string | Lichess CSV col 1 |
| `moves` | string (space-separated UCI) | Lichess CSV col 2 |
| `rating` | int | Lichess CSV col 3 |
| `popularity` | int (0-100) | Lichess CSV col 5 |
| `nbPlays` | int | Lichess CSV col 6 |

`Theme` carries `{id, name}` with `id` normalized to kebab-case via [puzzleRepository.ts:41-48](../src/lib/puzzleRepository.ts#L41-L48). `Position` is keyed by FEN. `Commentary` and `Opening` exist in the schema but their loaders are part of [scripts/neo4j-loaders/](../scripts/neo4j-loaders/) and not exhaustively traced here.

### Indexes

Per [scripts/neo4j-loaders/README.md:83](../scripts/neo4j-loaders/README.md#L83): "Creates indexes for fast queries (rating, popularity)." Concrete index DDL lives in [scripts/neo4j-loaders/load-puzzles.mjs](../scripts/neo4j-loaders/load-puzzles.mjs); the live shape is verifiable with `SHOW INDEXES` against Aura.

### Ingest filters

From [scripts/build-puzzle-db.py:31-33](../scripts/build-puzzle-db.py#L31-L33):

```python
MIN_POPULARITY = 60
MIN_NB_PLAYS = 50
MAX_RATING_DEVIATION = 120
```

Applied at [scripts/build-puzzle-db.py:117-129](../scripts/build-puzzle-db.py#L117-L129) — puzzles below the popularity threshold or with too-uncertain ratings are dropped at ingest. These are the values stated in the green-light prompt.

`scripts/import-lichess-puzzles.mjs` shares the same `MIN_POPULARITY = 60` ([line 48](../scripts/import-lichess-puzzles.mjs#L48)) but defaults `MIN_NB_PLAYS = 100` ([line 49](../scripts/import-lichess-puzzles.mjs#L49)) — see Discrepancy Table below.

### Retrieval pipeline (concept-first)

[conceptRetrieval.ts:1-50](../src/lib/concept/conceptRetrieval.ts#L1-L50) — three-stage pipeline. Stage 1 hard-filters by overlap with the anchor's detected concepts. Stage 2 reranks with `RETRIEVAL_WEIGHTS = {concept: 0.5, structural: 0.35, ratingProximity: 0.15}` ([conceptRetrieval.ts:37-41](../src/lib/concept/conceptRetrieval.ts#L37-L41)) — the structural signal is the 49-dim FEN cosine from [fenSimilarity.ts:14-80](../src/lib/fenSimilarity.ts#L14-L80) (label `STRUCTURAL_EMBEDDING_VERSION = "handcrafted-50d-v1"` at [conceptRetrieval.ts:48](../src/lib/concept/conceptRetrieval.ts#L48); see MASTERMIND_STRENGTHS.md caveats for the 49-vs-50 label drift). Stage 3 picks the final set by max-marginal relevance with `MMR_LAMBDA = 0.3`.

### Default tunables

| Constant | Value | Source |
|---|---|---|
| `DEFAULT_CANDIDATE_POOL` | 60 | [conceptRetrieval.ts:45](../src/lib/concept/conceptRetrieval.ts#L45) |
| `DEFAULT_LIMIT` | 5 | [conceptRetrieval.ts:46](../src/lib/concept/conceptRetrieval.ts#L46) |
| `RATING_BAND` | 300 | [conceptRetrieval.ts:47](../src/lib/concept/conceptRetrieval.ts#L47) |

---

## External APIs in live use

### LLM providers

Both routed through [llmProvider.ts](../src/lib/llmProvider.ts).

| Provider | Endpoint | Models | Source |
|---|---|---|---|
| Anthropic | `https://api.anthropic.com/v1/messages` (override via `ANTHROPIC_BASE_URL`) | flagship `claude-sonnet-4-20250514`, fast `claude-haiku-4-5-20251001` | [llmProvider.ts:24-25,84-87](../src/lib/llmProvider.ts#L24-L87) |
| OpenAI (fallback) | `https://api.openai.com/v1/chat/completions` (override via `OPENAI_BASE_URL`) | flagship `gpt-4o`, fast `gpt-4o-mini` | [llmProvider.ts:27-28,88-91](../src/lib/llmProvider.ts#L27-L91) |

### Maia-2 microservice (Hugging Face Spaces)

Endpoint: `${MAIA_API_URL}` (env var). HF free-tier sleeps after 48h; warm-up 30–90s.

| Path | Method | Request | Response |
|---|---|---|---|
| `/predict` | POST | `{fen: string, rating: int, opponent_rating: int}` | `{humanLikeMove: SAN, confidence: float, alternativeMoves: [{move, probability}], rating: int, model: "maia2"}` |
| `/health` | GET | (none) | `{model_loaded: boolean, error?: string}` |

Proxy route: [api/maia-predict/route.ts:38-69](../src/app/api/maia-predict/route.ts#L38-L69). Status: [api/maia-status/route.ts:25-56](../src/app/api/maia-status/route.ts#L25-L56). Keep-alive cron: [api/keep-maia-alive/route.ts:20-75](../src/app/api/keep-maia-alive/route.ts#L20-L75) — fires every 12h, 110-second abort budget.

### chess.com public API

| Endpoint | Used by | Purpose |
|---|---|---|
| `https://api.chess.com/pub/player/{username}` | [chessCom.ts:55](../src/lib/chessCom.ts#L55) | Player profile lookup |
| (chess.com `ongoing` route) | [api/chesscom/ongoing/](../src/app/api/chesscom/ongoing/) | Currently-active games (only chess.com sub-route shipped) |

### Lichess public API

| Endpoint | Used by | Purpose |
|---|---|---|
| `https://lichess.org/api/stream/event` | [lichess-board.ts:95](../src/lib/lichess-board.ts#L95), [api/lichess/events/stream/route.ts:32](../src/app/api/lichess/events/stream/route.ts#L32) | Real-time event stream for the player's board |
| `https://lichess.org/api/board/seek` | [lichess-board.ts:254](../src/lib/lichess-board.ts#L254), [api/lichess/seek/route.ts:49](../src/app/api/lichess/seek/route.ts#L49) | Create a seek for an OTB-style game |
| `https://lichess.org/api/token` | [lichess-oauth.ts:163,222](../src/lib/lichess-oauth.ts#L163-L222) | OAuth token exchange and revocation |
| `https://lichess.org/api/account` | [lichess-oauth.ts:182](../src/lib/lichess-oauth.ts#L182) | Authenticated user profile |

Sub-routes under [api/lichess/](../src/app/api/lichess/): `auth`, `callback`, `current-games`, `disconnect`, `events`, `game`, `seek`.

### Endpoints **not currently wired** but referenced in design

`https://explorer.lichess.ovh/masters?fen=…`, `https://tablebase.lichess.ovh/standard?fen=…`, `https://explorer.lichess.ovh/lichess?fen=…&speeds=…&ratings=…` — design-only per `fetch_lichess_master_db`, `fetch_lichess_tablebase`, `fetch_lichess_opening_explorer` in MASTERMIND_TOOLS.md.

---

## Discrepancy table

| Discrepancy | Where | What's stated | What's in code | Action |
|---|---|---|---|---|
| `MIN_NB_PLAYS` | Two ingest scripts diverge | Plan says plays ≥ 50 | [scripts/build-puzzle-db.py:32](../scripts/build-puzzle-db.py#L32) `MIN_NB_PLAYS = 50` ✓ ; [scripts/import-lichess-puzzles.mjs:49](../scripts/import-lichess-puzzles.mjs#L49) defaults to `100` | The .py value matches the prompt; the .mjs default must have been used at last load if the .py was not invoked. **Resolves with a live `count(p:Puzzle)` and a `min(p.nbPlays)` against Aura.** |
| Puzzle count | Documentation | Earlier doc said "~200,000 puzzles loaded into Aura"; Aayan corrected 2026-05-17 → corpus is 100k, not 200k | CSV is 100,000 puzzles ([data/lichess_puzzles_100k.csv](../data/lichess_puzzles_100k.csv) 100,001 rows incl. header); loader default `--limit=100000`; **public site copy already says "100,000+" (FAQ, LandingFeatures, how-it-works, architecture)** | Doc SUMMARY now reads "~100,000 per CSV size, live Aura count pending verification." Live `count(p:Puzzle)` query against Aura still needed to settle absolute count and verify which `MIN_NB_PLAYS` was applied. |
| Jhamtani `:Commentary` corpus state | Inferred vs verified | MASTERMIND_DATA_INVENTORY previously said "no loader" (was wrong); PR_1C_PLAN.md §6.4 originally specced `:Concept`/`:HAS_COMMENTARY` schema; site copy claims "298,000+" pairs | Loader exists at [load-commentary.mjs](../scripts/neo4j-loaders/load-commentary.mjs) and produces `:Commentary` nodes via `[:FROM_POSITION]` from `:Position`. **Live Aura state unknown — Aayan may have removed nodes.** Zero in-app callers of `/api/commentary-by-fen` outside the route itself. Concept retrieval pipeline does not use Commentary nodes. | Aayan's call (see [PR_1C_DATA_AUDIT.md §A.5](PR_1C_DATA_AUDIT.md)): A wire-up sub-PR / B drop / C defer §6.4. Public marketing copy depends on this; flag separately. |
| FEN cosine dimensionality | Embedding label vs field count | Code label `STRUCTURAL_EMBEDDING_VERSION = "handcrafted-50d-v1"` ([conceptRetrieval.ts:48](../src/lib/concept/conceptRetrieval.ts#L48)) and source comment "~50-dim feature vector" ([fenSimilarity.ts:7](../src/lib/fenSimilarity.ts#L7)) | Field count sums to 49 ([fenSimilarity.ts:14-80](../src/lib/fenSimilarity.ts#L14-L80)): 5+5+8+8+8+4+4+3+4 | Strength claim cites 49 (factual). Label drift in source — separate-PR fix. |
| Firestore user subcollections | Originally implied richer schema | PR_1C_PLAN §6.3 assumed `users/{uid}/puzzle_stats` and `users/{uid}/rating_history` exist as server-readable subcollections | **Only `games` and `chats` exist** under `users/{uid}`. Puzzle stats live in localStorage ([puzzleRating.ts:46](../src/lib/puzzleRating.ts#L46)); rating history is `puzzleStats.ratingHistory` in localStorage; no server endpoint for either. Single scalar `rating` field on user doc, no history. | 3 of 6 §6.3 claim types (`rating_trajectory`, `puzzle_stats_claim`, `puzzle_rating_trajectory`) are unverifiable from server. See [PR_1C_DATA_AUDIT.md §D](PR_1C_DATA_AUDIT.md). Aayan's call: A sync-puzzle-stats sub-PR / B ship 3 derivable + defer 3 / C drop §6.3. |
| Scout output coverage | PR_1C_PLAN spec vs reality | PR_1C_PLAN §6.2 enumerated 5 claim types: opponent_plays_opening, repertoire_collision, stalker_score_claim, tilt_pattern, timeout_pattern | Actual [src/types/scout.ts](../src/types/scout.ts) `ScoutAnalytics` carries 8 top-level fields (profile, stalker, prep, checklist, rivals, psychology, recentBuckets, novelty) + separate `Collisions` type. ~15 distinct claim patterns the coach could cite that §6.2 missed. | See [PR_1C_DATA_AUDIT.md §C](PR_1C_DATA_AUDIT.md). Aayan's call: A expand to full coverage (recommended) / B ship 5 as-is / C phased expansion. |
| `chess-commentary/` corpus | Preloaded with loader | [data/chess-commentary/](../data/chess-commentary/) is the ACL 2018 dataset | Loader at [load-commentary.mjs](../scripts/neo4j-loaders/load-commentary.mjs) exists. Live Aura state unknown — see Jhamtani row above. | Resolved as part of the Jhamtani row's audit decision. |
| Local Lc0 path coexists with HF Spaces Maia | Two parallel implementations | Architectural constraint: "Maia-2 stays on Hugging Face Spaces, never Vercel serverless" | In-process Lc0 path exists at [engine/maiaServerService.ts:122-204](../src/lib/engine/maiaServerService.ts#L122-L204), with a heuristic fallback. The HF Spaces proxy at [api/maia-predict/route.ts](../src/app/api/maia-predict/route.ts) is the canonical path. | The local Lc0 path is not on the Vercel runtime path; both coexist in the repo as parallel implementations. The agent should always go through the HF Spaces proxy; the local path is a developer convenience for off-Vercel deploys. |
