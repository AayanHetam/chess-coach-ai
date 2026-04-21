/**
 * 01-classify.ts — batch concept classification over the Neo4j puzzle corpus.
 *
 * For every :Puzzle that does not yet have any [:EXERCISES]->(:Concept) edge,
 * runs the deterministic detector + LLM tagger, writes edges with
 *   r.confidence   (0–1)
 *   r.source       ('detector' | 'llm')
 *   r.classifiedAt (ISO timestamp)
 *
 * Idempotent. Resumable — uses a Neo4j `:ClassifierProgress` singleton node
 * to record last-processed puzzleId so re-running picks up where it left off.
 *
 * Usage (TypeScript script — requires tsx at runtime, no install needed):
 *   npx tsx scripts/concept-pipeline/01-classify.ts [options]
 *
 * Options:
 *   --batch-size=200         puzzles per Cypher fetch (default 200)
 *   --limit=N                stop after N puzzles (default: process all)
 *   --skip-llm               run detector only (fast; skips strategic/positional tags)
 *   --concurrency=4          parallel LLM calls (default 4; increase if rate allows)
 *   --reset                  clear :ClassifierProgress before starting
 *   --dry-run                classify but do not write edges
 *
 * Env (from .env.local):
 *   NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD,
 *   ANTHROPIC_API_KEY or OPENAI_API_KEY (for LLM fallback)
 */

import neo4j, { Driver } from "neo4j-driver";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Chess } from "chess.js";

import { classify } from "../../src/lib/concept/conceptClassifier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
loadDotenv({ path: join(__dirname, "../../.env.local") });

// ── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argMap = new Map<string, string>();
for (const a of args) {
  if (a.startsWith("--")) {
    const [k, v] = a.slice(2).split("=");
    argMap.set(k, v ?? "true");
  }
}
const BATCH_SIZE = parseInt(argMap.get("batch-size") ?? "200", 10);
const LIMIT = argMap.has("limit") ? parseInt(argMap.get("limit")!, 10) : Infinity;
const SKIP_LLM = argMap.get("skip-llm") === "true";
const CONCURRENCY = parseInt(argMap.get("concurrency") ?? "4", 10);
const RESET = argMap.get("reset") === "true";
const DRY_RUN = argMap.get("dry-run") === "true";

// ── Neo4j driver ──────────────────────────────────────────────────────────
const { NEO4J_URI, NEO4J_USERNAME = "neo4j", NEO4J_PASSWORD } = process.env;
if (!NEO4J_URI || !NEO4J_PASSWORD) {
  console.error("❌ Missing NEO4J_URI or NEO4J_PASSWORD in .env.local");
  process.exit(1);
}
const driver: Driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
);

async function run<T = any>(cypher: string, params: Record<string, any> = {}): Promise<T[]> {
  const session = driver.session();
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}

// ── Progress tracking ─────────────────────────────────────────────────────
async function getLastProcessedId(): Promise<string | null> {
  const rows = await run<{ lastId: string | null }>(
    `MATCH (p:ClassifierProgress {id: 'singleton'}) RETURN p.lastId AS lastId`
  );
  return rows[0]?.lastId ?? null;
}

async function setLastProcessedId(lastId: string): Promise<void> {
  await run(
    `MERGE (p:ClassifierProgress {id: 'singleton'})
     SET p.lastId = $lastId, p.updatedAt = datetime()`,
    { lastId }
  );
}

async function resetProgress(): Promise<void> {
  await run(`MATCH (p:ClassifierProgress {id: 'singleton'}) DELETE p`);
}

// ── Batch fetcher ─────────────────────────────────────────────────────────
async function fetchUnclassifiedBatch(
  afterId: string | null,
  size: number
): Promise<Array<{ puzzleId: string; fen: string; moves: string; themes: string[] }>> {
  const cypher = `
    MATCH (p:Puzzle)
    WHERE ($afterId IS NULL OR p.puzzleId > $afterId)
      AND NOT (p)-[:EXERCISES]->(:Concept)
    OPTIONAL MATCH (p)-[:HAS_THEME]->(t:Theme)
    WITH p, collect(DISTINCT t.id) AS themes
    RETURN p.puzzleId AS puzzleId,
           p.fen      AS fen,
           p.moves    AS moves,
           themes
    ORDER BY p.puzzleId
    LIMIT $size
  `;
  return run(cypher, { afterId, size: neo4j.int(size) });
}

// ── Write edges ───────────────────────────────────────────────────────────
async function writeEdges(
  puzzleId: string,
  classified: Array<{ conceptId: string; confidence: number; source: string; evidence: string }>
): Promise<void> {
  if (DRY_RUN || classified.length === 0) return;
  // Use UNWIND so this is one round-trip per puzzle
  await run(
    `MATCH (p:Puzzle {puzzleId: $puzzleId})
     UNWIND $edges AS e
     MATCH (c:Concept {id: e.conceptId})
     MERGE (p)-[r:EXERCISES]->(c)
     SET r.confidence = e.confidence,
         r.source = e.source,
         r.evidence = e.evidence,
         r.classifiedAt = datetime()`,
    { puzzleId, edges: classified }
  );
}

// ── Concurrency helper ────────────────────────────────────────────────────
async function parallelMap<T, R>(
  items: T[],
  n: number,
  fn: (x: T, i: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

// ── Main loop ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`Connecting to ${NEO4J_URI}`);
  await driver.verifyConnectivity();
  console.log(
    `Config: batch=${BATCH_SIZE} limit=${LIMIT === Infinity ? "all" : LIMIT} ` +
      `skipLLM=${SKIP_LLM} concurrency=${CONCURRENCY} dryRun=${DRY_RUN}\n`
  );

  if (RESET) {
    console.log("→ Resetting progress cursor");
    await resetProgress();
  }

  let lastId = await getLastProcessedId();
  let totalProcessed = 0;
  let totalEdges = 0;
  let totalErrors = 0;
  const t0 = Date.now();

  while (totalProcessed < LIMIT) {
    const batch = await fetchUnclassifiedBatch(lastId, BATCH_SIZE);
    if (batch.length === 0) break;

    const results = await parallelMap(batch, CONCURRENCY, async (puzzle) => {
      try {
        // Lichess convention: moves[0] is opponent setup, moves[1..] is solver.
        // Detector now takes the critical position directly, so advance by setup.
        const rawMoves = puzzle.moves.split(/\s+/).filter(Boolean);
        const setup = rawMoves[0];
        const solverMoves = rawMoves.slice(1);
        if (!setup || solverMoves.length === 0) {
          return { puzzleId: puzzle.puzzleId, edgeCount: 0, ok: false };
        }
        const chess = new Chess(puzzle.fen);
        const setupMove = chess.move({
          from: setup.slice(0, 2),
          to: setup.slice(2, 4),
          promotion: setup.length > 4 ? setup[4] : undefined,
        });
        if (!setupMove) {
          return { puzzleId: puzzle.puzzleId, edgeCount: 0, ok: false };
        }
        const classified = await classify({
          fen: chess.fen(),
          solutionUci: solverMoves,
          lichessThemes: puzzle.themes,
          skipLLM: SKIP_LLM,
        });
        await writeEdges(puzzle.puzzleId, classified);
        return { puzzleId: puzzle.puzzleId, edgeCount: classified.length, ok: true };
      } catch (err) {
        console.error(`  ! ${puzzle.puzzleId}: ${(err as Error).message}`);
        return { puzzleId: puzzle.puzzleId, edgeCount: 0, ok: false };
      }
    });

    for (const r of results) {
      totalProcessed++;
      if (r.ok) totalEdges += r.edgeCount;
      else totalErrors++;
    }

    lastId = batch[batch.length - 1].puzzleId;
    if (!DRY_RUN) await setLastProcessedId(lastId);

    const elapsed = (Date.now() - t0) / 1000;
    const rate = totalProcessed / elapsed;
    console.log(
      `processed ${totalProcessed} | edges ${totalEdges} | errors ${totalErrors} | ` +
        `${rate.toFixed(1)}/s | cursor ${lastId}`
    );

    if (totalProcessed >= LIMIT) break;
  }

  console.log(
    `\nDone. ${totalProcessed} puzzles classified in ${((Date.now() - t0) / 1000).toFixed(1)}s. ` +
      `${totalEdges} edges written. ${totalErrors} errors.`
  );
}

main()
  .catch((err) => {
    console.error("\nClassify pipeline failed:", err);
    process.exit(1);
  })
  .finally(() => driver.close());
