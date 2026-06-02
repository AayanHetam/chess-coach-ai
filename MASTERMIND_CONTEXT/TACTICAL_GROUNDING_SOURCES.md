# Tactical Grounding Sources — Exhaustive Research Notes

_Compiled 2026-05-30 after Aayan's directive: "find all possible sources; the less external grounding we have the more inaccurate we are." Full enumeration across 15 categories, ~80 candidates. This file is the permanent record so future contributors don't re-research. Top 10 are wired into the 8-stage Tactical Grounding Program. See `PR_TACTICAL_DETECTOR_PLAN.md` §Grounding sources for the ranked top-10._

---

## Category 1 — Chess Engines (beyond client-side Stockfish)

| Source | License | Notes |
|---|---|---|
| **Stockfish WASM (client-side, already wired)** | GPL-3 (safe as WASM worker) | Currently in browser; Stage 5 adds server-side depth-12 PV for escapability |
| **Stockfish server-side (Node WASM)** | GPL-3 | One npm dep; Stage 5 |
| **Lc0 (Leela Chess Zero)** | GPL-3 | Neural net; catches sacrificial lines Stockfish misses; Stage 7 microservice |
| **Komodo (free version)** | Non-commercial | **KILLED** — can't ship in paid product |
| **Berserk** | MIT | Stockfish derivative; lower marginal value than Lc0 |
| **Ethereal** | GPL-3 (?)  | Strong open-source engine; deploy as binary if needed |
| **Maia-1 (per-rating 1100-1900)** | GPL-3 | Covered by Maia-2 (MIT) which is broader; defer |
| **Maia-2 (already wired partially)** | MIT | Stage 8: `predict_at_rating(fen, rating)` endpoint deepening |
| **Sayuri (educational engine)** | MIT | Weak player emulator; niche use for "would a 600 see this?" |

## Category 2 — Endgame Tablebases

| Source | License | Notes |
|---|---|---|
| **Syzygy 7-piece via Lichess API** | Free API; TBs public domain | **Stage 1 — IMPLEMENTED.** `https://tablebase.lichess.ovh/standard?fen=X`. Perfect W/D/L + DTZ + best move for ≤7 pieces. |
| **Fathom (MIT, self-hosted)** | MIT | Belt-and-suspenders for Stage 1 if Lichess 429s. ~150MB binary + 1GB for 3-5 piece files. Stage 4 backstop. |
| **lila-tablebase (Lichess source)** | AGPL-3 | **KILLED** — use Fathom instead |
| **Nalimov (KGaA format)** | Patent-free | Older format; Syzygy is superior; skip |
| **HHdb VII (endgame studies)** | Commercial | Niche to composed studies; skip |
| **Lomonosov 7-piece TBs** | Free for non-commercial | Non-commercial restriction; skip |

## Category 3 — Cloud Evaluation Databases

| Source | License | Notes |
|---|---|---|
| **chessdb.cn cloud eval + `queue` action** | Public domain | **Stage 3 — IMPLEMENTED.** `http://www.chessdb.cn/cdb.php?action=queryscore&board=FEN`. Pre-computed deep evals; `queue` action compounds coverage. |
| **Lichess cloud eval** | Free API | Cache-only (no queue). `https://lichess.org/api/cloud-eval?fen=X`. Returns on cache hit, 404 on miss. Lower coverage than chessdb.cn. |
| **Chess Tempo database** | Proprietary | Web-only; no API; skip |
| **Chessprogramming.org analysis** | CC BY-SA | Research resource, not a live API |

## Category 4 — Puzzle / Problem Databases

| Source | License | Notes |
|---|---|---|
| **Lichess puzzle DB (4.4M, CC0)** | CC0 | **Stage 2.** Current dump has 4.4M puzzles with Lichess theme tagging. Replace stale 100k Neo4j. Theme vocab (fork/pin/skewer/discoveredAttack/etc.) becomes canonical. |
| **chess.com puzzle DB** | Proprietary | No API; skip |
| **Chess Tempo puzzles** | Proprietary | Web-only; skip |
| **YACPDB (composed problems)** | Verify | Smothered mate, zugzwang, helpmate patterns; v2 motif pack. Defer. |
| **PDB Server (chess problems)** | Free | Fairy chess; too niche |
| **Polgar Combinations Encyclopedia OCR** | Manual | Most covered by Lichess puzzle DB; skip |

## Category 5 — Annotated Master Game Databases

| Source | License | Notes |
|---|---|---|
| **Lichess opening explorer / master games** | API free; data CC BY-SA | Returns "after this move, masters play X 73% of the time." Opening-novelty grounding. |
| **TCEC engine-vs-engine archive** | CC BY-SA 3.0 | Extract facts only; heavily analyzed positions are tactically rich labeling source. Stage source for voting model. |
| **CCRL archive (engine vs engine)** | Verify | Similar to TCEC; lower priority |
| **ChessBase Mega Database 2026** | €199 + CBV format | High-value annotation. Commercial format wrangling pain. Defer post-Stage-8 if needed. |
| **TWIC (The Week in Chess)** | Free | Weekly PGN ingestion; lower value than position-level sources |
| **Caissabase (3M+ games, free)** | CC0 | PGN collection; no annotation; useful for position extraction |
| **Chess.com Master Games** | Proprietary | No API |

## Category 6 — Open-Source Tactical Libraries (algorithmic reference)

| Source | License | Notes |
|---|---|---|
| **Lichess `cook.py` motif tagger** | **AGPL-3** | **KILLED — algorithmic reference only.** 40+ motifs, clean geometric detection. Read to enumerate edge cases; clean-room TS re-implement (§7 in plan). |
| **CARA (44-motif detector)** | **GPL-3** | **KILLED — algorithmic reference only.** Read for edge cases. |
| **python-chess** | **GPL-3** | **KILLED** — use chess.js (BSD) |
| **chessops (TypeScript)** | **GPL-3** | **KILLED** — use chess.js or chess.ts |
| **chess.ts (MIT)** | MIT | TypeScript chess library; alternative to chess.js if needed |
| **shakmaty (Rust)** | GPL-3 → Rust; not applicable | Server language mismatch |

## Category 7 — Academic Datasets and Benchmarks

| Source | License | Notes |
|---|---|---|
| **GCC-Eval (Kim et al., NAACL 2025)** | Verify ml-postech repo | **Stage 4.** `arxiv:2410.20811`. External, citable hallucination metric. Every program PR ships with "GCC-Eval moved from X to Y." |
| **ChessQA (CSSLab, Oct 2025)** | Verify | **Stage 4.** `arxiv:2510.23948`. 5-category benchmark with Motifs + Short Tactics. Run to establish baseline. |
| **Jhamtani (298k commentary pairs)** | Public (EMNLP 2018) | Loaded but **zero in-app callers**. Not useful for tactical detector (needs motif back-tagging first, which is Stage 5-downstream). Revisit after puzzle DB retag. |
| **TakeTakeTake architecture** | Writeup only | Magnus Carlsen's team. Engine→detectors→constrained narration = exact shape of this program. Cited in plan §Industry validation. |
| **ChessGPT (2023)** | CC BY-SA | Fine-tuned LLM; not a grounding source; skip |
| **ChessGrammar API** | DevTo writeup | Two-depth API pattern validates our escapability approach. Not a data source. |
| **Stockfish NNUE evaluation features** | GPL-3 | 45k NNUE params accessible via UCI; DecodeChess's "symbolic explainable AI" approach. Interesting for positional explanations; out of scope for v1. |

## Category 8 — Move Quality Classifiers

| Source | License | Notes |
|---|---|---|
| **Chess.com Game Review (CAPS)** | Proprietary | No API. Their approach: pure Stockfish + templated text, no LLM for tactical claims. |
| **Aimchess** | Proprietary | Engine-only statistical; no tactical NL claims at all |
| **DecodeChess** | Proprietary | Symbolic explainable-AI over Stockfish NNUE; relevant for future positional work |
| **Chessstalker** | Proprietary | Historical game pattern analysis |
| **Puzzle Rush / Puzzle Storm (Lichess)** | CC BY-SA | Performance data, not a source for position classification |

## Category 9 — Opening Books and Theory

| Source | License | Notes |
|---|---|---|
| **eco.json + Lichess chess-openings TSV** | Public domain | **Stage-adjacent.** Already available. Kills opening-novelty hallucinations: if position is in book, suppress "this is a novelty" claims. |
| **Scid's opening book** | GPL | Skip; eco.json covers it |
| **TWIC opening coverage** | Free | Lower priority |
| **PolyGlot books** | GPL | Binary format; eco.json is more accessible |

## Category 10 — Specialized Tactical Pattern Databases

| Source | License | Notes |
|---|---|---|
| **Lichess puzzle themes (cook.py output)** | CC0 (puzzle DB), AGPL (tagger) | Cook.py tags: fork, pin, skewer, discoveredAttack, discoveredCheck, doubleCheck, mateIn1/2/3, backRankMate, smotheredMate, exposedKing, trappedPiece, zugzwang, hangingPiece, attackingF2F7, quietMove, defendingMove, sacrifice. We adopt these themes verbatim from the CC0 puzzle dump. |
| **chess.com puzzle themes** | Proprietary | Less canonical than Lichess |
| **Chesstactics.org** | Free | Smaller; covered by Lichess puzzle DB |
| **Shredder tactical training** | Proprietary | Skip |

## Category 11 — Live Tournament and Broadcast Data

| Source | License | Notes |
|---|---|---|
| **Lichess broadcast API** | Free; CC BY-SA | Live PGN + analysis. Useful for freshness; lower priority than reference DBs |
| **chess.com live events** | Proprietary | No API |
| **FIDE API** | Free (limited) | Rating/player data; not position-level |
| **ProChessLeague** | Proprietary | Skip |

## Category 12 — Multimodal / FEN-Image Sources

| Source | License | Notes |
|---|---|---|
| **Chessvision.ai** | Proprietary API | Board recognition from images; not relevant for FEN-in analysis |
| **Chess diagram generators** | Various | OCR research; irrelevant |

## Category 13 — Community-Tagged Data

| Source | License | Notes |
|---|---|---|
| **Lichess studies (annotated)** | CC BY-SA | User-annotated games with `[%cal]` / `[%csl]` annotations. Rich source for human-judgment labels. Large-scale extraction feasible. |
| **Chess Stack Exchange** | CC BY-SA | Q&A pairs about specific positions; useful for coaching tone research |
| **Reddit r/chess puzzle threads** | CC BY-SA | Community-sourced tactical positions with discussion |
| **YouTube chess commentary transcripts** | Copyright (per creator) | Most YouTubers (GothamChess, Agadmator) are copyrighted; skip |

## Category 14 — Engine-vs-Engine Archives (deep analysis)

| Source | License | Notes |
|---|---|---|
| **TCEC seasons archive** | CC BY-SA 3.0 | Thousands of games between top engines, heavily analyzed. Engine-disagreement positions are tactically rich labeling source for voting model training. |
| **CCRL** | Verify | Similar to TCEC at lower-quality settings |
| **Chess.com Computer Chess Championship** | Proprietary | No API |

## Category 15 — Leftfield / Unconventional Finds

| Source | License | Notes |
|---|---|---|
| **Stockfish GitHub issues and discussions** | MIT | Engine developers discuss specific positions where SF is wrong; gold mine for edge cases |
| **Lc0 blog posts** | CC BY-SA | Lc0 team documents positions where neural net evaluation differs from Stockfish |
| **Chessprogramming wiki** | CC BY-SA | Algorithmic reference for SEE, quiescence search, etc. |
| **PGN Standard (FIDE)** | Public domain | Annotation symbols `!`, `!!`, `?`, `??`, `?!`, `!?` — standardized quality labels from human annotators |
| **Informator (ECO/NCO/MCO)** | Commercial | Copyrighted encyclopedias; skip |
| **Nunn's Chess Openings** | Commercial | Skip |
| **Chess Informant symbols** | Public domain (symbols only) | The `!`/`?` system is public domain; actual game annotations are copyrighted |

---

## Key Findings Summary

1. **TakeTakeTake (Magnus Carlsen's team)** — published exact same pipeline as this program: engine → dedicated detectors → LLM constrained to narrating extracted facts. Industry validation that this is the correct approach.

2. **Lichess cook.py** — AGPL algorithmic reference. Theme vocabulary (40+ motifs) becomes canonical via the CC0 puzzle dump. Most valuable: documented edge cases for each motif (absolute vs. relative pin via `is_pinned`, en-passant interactions in discovered_attack, smothered-mate exclusion from back_rank, etc.).

3. **Syzygy via Lichess API** — one afternoon, kills ALL endgame hallucinations for ≤7 pieces. Mathematical certainty. No dependency on any LLM judgment.

4. **chessdb.cn `queue` action** — unique: requests the cloud to compute positions WE care about. Coverage compounds over time for free. Every analysis call that hits a cache miss queues the position → next time, we have the answer.

5. **GCC-Eval (Kim NAACL 2025)** — designed specifically to measure chess commentary hallucination. Becomes our external, citable accuracy metric. Every PR ships with a number.

6. **Lichess puzzle DB (4.4M, CC0)** — theme tags ARE cook.py tags (Lichess runs cook.py to generate them). Using the CC0 dump = using cook.py's output without violating AGPL (we don't run or distribute the tagger; we use its openly-licensed output).

7. **Maia-2 (MIT)** — per-rating prediction stops "this is obvious" hallucinations when the tactic is above the user's level. Already wired; Stage 8 deepens the integration.

8. **ChessGrammar two-depth API** — published architecture validates our escapability check approach: structural detection → forcing-move search to confirm. Used by an in-production API, not just academic.

---

_Document maintained by: engineering team. Update when new sources are evaluated or license terms change. Last updated: 2026-05-30._
