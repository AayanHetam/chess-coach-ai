# MASTERMIND_INDEX.md

## SUMMARY

Index for the Mastermind agent's static knowledge directory. Eight sibling docs ground the agent in what Chess Masti AI ships today, where it beats competitors, where it fails, what state it can read about a user, what tools it has (and doesn't), what data sits preloaded vs live-fetched, and what content gaps still need human authoring before the Mastermind reaches Tier-A coverage. This file is loaded first at session start; the agent then loads sibling docs on demand based on the user's query. Recommended load pattern: every session reads the SUMMARY blocks of [STRENGTHS](MASTERMIND_STRENGTHS.md), [USER_MODEL](MASTERMIND_USER_MODEL.md), and [TOOLS](MASTERMIND_TOOLS.md) (cheap, foundational, ~600 words combined); the rest are loaded only when the conversation enters their territory. Total inventory: 9 docs (this one plus 8 siblings) totaling ~1,460 lines, ~170 KB. The historical Feb 2026 [Quality Improvement Plan.docx](../Chess_Masti_AI_Quality_Improvement_Plan.docx) and [Gap Analysis Roadmap](_sources/gap_analysis_roadmap_feb2026.md) are sources for [COMPETITORS](MASTERMIND_COMPETITORS.md) only — they are not loaded as context, because the shipped-code reality has moved past several of their ✗-marks. Sibling docs do not duplicate content; cross-references in each doc point the agent to the canonical source for a topic.

---

## Recommended load order

Cheap-first. Each entry shows whether the SUMMARY alone is enough for most session starts (load every time) versus loading the full doc on demand (only when the conversation enters the topic).

### Tier 1 — load SUMMARY at every session start

These three SUMMARY blocks total roughly 600 words. They are foundational: the agent cannot make sound coaching decisions without knowing the strengths it should lean on, the user state it can read, and the tools it has.

| Order | Doc | Why every session |
|---|---|---|
| 1 | [MASTERMIND_INDEX.md](MASTERMIND_INDEX.md) (this file) | Per-doc routing table |
| 2 | [MASTERMIND_STRENGTHS.md](MASTERMIND_STRENGTHS.md) | What to lean on, what differentiates Chess Masti |
| 3 | [MASTERMIND_USER_MODEL.md](MASTERMIND_USER_MODEL.md) | What the agent can read about the user, with storage-tier discipline |
| 4 | [MASTERMIND_TOOLS.md](MASTERMIND_TOOLS.md) | The agent's action surface; design-only entries flag what the agent can't do |

### Build plan (load when actively shipping Mastermind code)

| Doc | Purpose |
|---|---|
| [MASTERMIND_BUILD_PLAN.md](MASTERMIND_BUILD_PLAN.md) | Executable 5-phase plan with mandatory call sites, per-PR merge contract, current file:line landmarks. Builders read this end-to-end before PR 1.A; experienced builders jump to the active phase section. |

### Tier 2 — load on demand (cheap)

Loaded when the conversation specifically enters their territory. Each is a single-doc read.

| Order | Doc | Trigger to load |
|---|---|---|
| 5 | [MASTERMIND_DATA_INVENTORY.md](MASTERMIND_DATA_INVENTORY.md) | Anything about Neo4j, the puzzle corpus, theme taxonomy, ingest filters, or external API contracts |
| 6 | [MASTERMIND_FAILURE_MODES.md](MASTERMIND_FAILURE_MODES.md) | A tool returns an error, fallback, or degraded result and the agent needs the recovery path |
| 7 | [MASTERMIND_CODEBASE_MAP.md](MASTERMIND_CODEBASE_MAP.md) | The agent needs to answer "where is X?" or "what file backs Y?" |
| 8 | [MASTERMIND_TIER_A_GAPS.md](MASTERMIND_TIER_A_GAPS.md) | The user asks for content the agent cannot synthesize without authored data (GM games, opening ideas, endgame principles, etc.) |

### Tier 3 — load on demand (medium)

| Order | Doc | Trigger to load |
|---|---|---|
| 9 | [MASTERMIND_COMPETITORS.md](MASTERMIND_COMPETITORS.md) | The user compares Chess Masti to a named competitor, asks about positioning, or asks "is X feature unique?" |

### Sources directory (not part of the agent's load order)

| Path | When to consult |
|---|---|
| [_sources/gap_analysis_roadmap_feb2026.md](_sources/gap_analysis_roadmap_feb2026.md) | Only as input to MASTERMIND_COMPETITORS.md. Not loaded directly by the agent. |

---

## Per-doc routing table

Name, purpose, when to load, typical query that triggers loading the full doc beyond its SUMMARY.

| Doc | Purpose | When to load (full) | Typical user query that triggers it |
|---|---|---|---|
| [MASTERMIND_INDEX.md](MASTERMIND_INDEX.md) | Routing table to the rest of this directory | Always (cheap) | (always loaded) |
| [MASTERMIND_STRENGTHS.md](MASTERMIND_STRENGTHS.md) | Where Chess Masti measurably beats competitors, grounded in shipped code, with caveats per strength | Whenever a user question touches differentiation, marketing, or "is X better than Y?" | "What makes you better than Sensei Chess?" / "Why should I use this instead of Lichess?" / "What's special about your puzzle engine?" |
| [MASTERMIND_USER_MODEL.md](MASTERMIND_USER_MODEL.md) | Every persistent user attribute the agent can read, with field-level schemas, storage tiers, and reading patterns | Any time the agent needs to read user state — profile, games, chat history, weakness profile, SRS state, repertoire | "Show me my recent games" / "What openings do I play?" / "What are my weaknesses?" / "Schedule my reviews" |
| [MASTERMIND_TOOLS.md](MASTERMIND_TOOLS.md) | Tool inventory by coaching verb (read_user_state, ask_user, show_user, fetch_external, generate, compare, engine_analyze, log_writeback, lifecycle, repertoire); 17 ✅ wrapped, 6 🟡 partial, 29 ⚪ design-only | Any time the agent considers an action and needs to know whether the underlying primitive exists | "Generate puzzles from my mistakes" / "Compare my game to Carlsen's treatment" / "Quiz me on this concept" |
| [MASTERMIND_DATA_INVENTORY.md](MASTERMIND_DATA_INVENTORY.md) | Preloaded `data/` contents, Neo4j Aura schema and ingest filters, external API contracts (Maia HF Spaces, Lichess endpoints, chess.com pub API) | Any time the agent reasons about data sources, query shapes, or the difference between preloaded vs live-fetched | "How many puzzles do you have?" / "What does your Neo4j schema look like?" / "Why is Maia slow on the first call?" |
| [MASTERMIND_FAILURE_MODES.md](MASTERMIND_FAILURE_MODES.md) | Nine failure classes with cited code paths and recovery paths (Maia cold start, Stockfish init, validator catch paths, Neo4j edges, FEN cosine degeneracy, opening detector ambiguity, Anthropic/OpenAI fallback, SSE timeouts, OpenAI-key gap) | A tool returns an error or a degraded result and the agent needs to choose a fallback | (loaded reactively when a tool result is degraded — rarely user-facing trigger) |
| [MASTERMIND_CODEBASE_MAP.md](MASTERMIND_CODEBASE_MAP.md) | Module-by-module map of `src/lib/` and `src/app/api/`; out-of-scope and parallel paths called out | The agent needs to find a module by purpose or check what wraps a given file | "Where is the validator implemented?" / "What does scoutService.ts do?" / "Which routes call the LLM?" |
| [MASTERMIND_COMPETITORS.md](MASTERMIND_COMPETITORS.md) | Per-competitor: what they do well, where Chess Masti now beats them (with file citations), where they still lead — overrides the Feb 2026 ✗-marks | The user compares to a named competitor, asks about positioning, or claims a feature isn't unique | "Aimchess does this — do you?" / "Why not just use Lichess?" / "What about DecodeChess?" |
| [MASTERMIND_TIER_A_GAPS.md](MASTERMIND_TIER_A_GAPS.md) | Seven content gaps in `data/` requiring human decisions before the agent reaches Tier-A coverage; cost-of-deferral matrix maps each gap to the tools it blocks | A user requests something the agent has infrastructure for but no content (GM game lookup, opening ideas, endgame principles, etc.) | "Show me Fischer-Spassky 1972 game 6" / "What's the plan in the Najdorf?" / "Explain the Lucena position" |

---

## Conventions for every doc in this directory

- Every sibling doc opens with a SUMMARY block of approximately 200 words. Agents that load only this index plus the SUMMARY blocks see roughly 1,800 words total — enough to navigate without paying the cost of the full ~170 KB.
- Every tool entry that wraps existing code cites the file path with a line range.
- Every failure mode cites the failing code path.
- Every strength claim cites the file that implements it.
- Tier-A gaps clearly flag what needs human decision before they can be filled.
- Corrections discovered during writing are flagged inside the relevant doc (search for "**Caveat**", "**Discrepancy**", "**flagged**", or "**inaccuracy**"). Fixing them belongs in separate PRs and is out of scope for the writes here.
- Cross-references between docs avoid duplication. When a topic spans multiple docs (e.g., the FEN cosine 49-vs-50 label drift appears in STRENGTHS, FAILURE_MODES, and DATA_INVENTORY), each doc points to the others rather than restating.

---

## Inventory totals

| File | Lines | Bytes |
|---|---:|---:|
| MASTERMIND_INDEX.md (this file) | ~120 | ~7,000 |
| MASTERMIND_STRENGTHS.md | 51 (wrapped paragraphs) | 16,838 |
| MASTERMIND_USER_MODEL.md | 345 | 33,430 |
| MASTERMIND_TOOLS.md | 223 | 23,983 |
| MASTERMIND_DATA_INVENTORY.md | 172 | 14,219 |
| MASTERMIND_FAILURE_MODES.md | 125 | 17,462 |
| MASTERMIND_CODEBASE_MAP.md | 198 | 21,650 |
| MASTERMIND_COMPETITORS.md | 190 | 21,239 |
| MASTERMIND_TIER_A_GAPS.md | 118 | 16,981 |
| _sources/gap_analysis_roadmap_feb2026.md | 211 | 13,059 |
| **Total** | **~1,750** | **~186 KB** |

---

## What this directory is *not*

- It is not a roadmap to execute. The Tier-A gaps doc is a backlog with decision flags, not a sequenced plan.
- It is not a runbook. The failure-modes doc cites recovery paths but the agent's actual recovery logic lives in the routes themselves (per the citations).
- It is not a design doc for the agent loop. The agent loop refactor of [enhanced-analysis](../src/app/api/enhanced-analysis/route.ts) is the subject of [FUTURE_IDEAS.md](../FUTURE_IDEAS.md) §1; this directory is the static knowledge that loop will load.
- It does not duplicate [CLAUDE.md](../CLAUDE.md). Where a fact appears both here and in CLAUDE.md, the citation in this directory takes the trouble to anchor to a file:line; CLAUDE.md is the higher-level orientation. Where the two disagree (e.g., the IndexedDB-vs-localStorage SRS storage), the per-doc inaccuracy flag in this directory documents the divergence and notes that fixing CLAUDE.md is a separate-PR item.
