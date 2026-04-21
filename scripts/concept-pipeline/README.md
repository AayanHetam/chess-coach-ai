# Concept Pipeline

Scripts that populate and maintain the concept-first retrieval system
(`src/lib/concept/`).

Run in order. Each step is idempotent and resumable.

| Step | Script | What it does |
|---|---|---|
| 0 | `00-schema.mjs` | Creates `:Concept` nodes, `PREREQUISITE_OF` edges, indexes, and attempts the `:Puzzle.positionEmbedding` vector index (best-effort). |
| 1 | `01-classify.ts` | Classifies every `:Puzzle` via detector + LLM, writes `(:Puzzle)-[:EXERCISES]->(:Concept)` edges with `confidence`, `source`, `classifiedAt`. |
| 2 | `02-train-embed.py` | *(Part B3 — future)* Trains the 128-dim position encoder with concept-aware triplet loss on the classified corpus. Exports ONNX. |
| 3 | `03-embed-corpus.ts` | *(Part B3 — future)* Runs the ONNX encoder over the corpus, writes `p.positionEmbedding` on each `:Puzzle`. |
| 4 | `04-link-commentary.ts` | *(Part B6 — future)* Links the orphaned Jhamtani commentary nodes to their nearest puzzles by embedding cosine. |

## Prerequisites

1. `.env.local` at project root with:
   ```
   NEO4J_URI=bolt+s://...neo4j.io
   NEO4J_USERNAME=neo4j
   NEO4J_PASSWORD=...
   ANTHROPIC_API_KEY=sk-ant-...     # or OPENAI_API_KEY for LLM fallback
   ```
2. Lichess puzzles already loaded into Neo4j (see `scripts/neo4j-loaders/`).

## Usage

```bash
# 0) Schema + concept taxonomy
node scripts/concept-pipeline/00-schema.mjs

# 1) Classify corpus (full run: ~hours for 100K puzzles w/ LLM, ~minutes without)
# Fast first pass — detector only, no API cost:
npx tsx scripts/concept-pipeline/01-classify.ts --skip-llm

# Then a full pass with LLM for strategic/positional coverage:
npx tsx scripts/concept-pipeline/01-classify.ts --concurrency=8

# Or dry-run a batch to eyeball output:
npx tsx scripts/concept-pipeline/01-classify.ts --limit=20 --dry-run
```

## Resuming

`01-classify.ts` records its cursor in a `:ClassifierProgress` singleton node.
Re-running picks up from the last processed `puzzleId`. To restart:

```bash
npx tsx scripts/concept-pipeline/01-classify.ts --reset
```

## Verification queries

```cypher
// How many puzzles are classified?
MATCH (p:Puzzle) WHERE (p)-[:EXERCISES]->(:Concept)
RETURN count(p) AS classified;

// Distribution of concepts
MATCH (:Puzzle)-[r:EXERCISES]->(c:Concept)
RETURN c.id AS concept, c.tier AS tier, count(r) AS n
ORDER BY n DESC;

// Puzzles the LLM tagged with confidence >= 0.8
MATCH (:Puzzle)-[r:EXERCISES {source: 'llm'}]->(c:Concept)
WHERE r.confidence >= 0.8
RETURN c.id, count(r) AS n ORDER BY n DESC;
```
