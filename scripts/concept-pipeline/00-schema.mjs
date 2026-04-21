#!/usr/bin/env node
/**
 * 00-schema.mjs — Neo4j schema migration for the concept-first retrieval system.
 *
 * Idempotent. Safe to re-run. Does:
 *   1. Unique constraint on (:Concept {id})
 *   2. Upserts every concept in conceptTaxonomy.data.json as a :Concept node
 *      with all metadata (name, tier, ratingBand, definition, lichessAliases)
 *   3. Creates (:Concept)-[:PREREQUISITE_OF]->(:Concept) edges from the
 *      `prerequisites` field
 *   4. Index on :Puzzle(puzzleId) and :Puzzle(rating) if missing
 *   5. Attempts to create a vector index on :Puzzle(positionEmbedding)
 *      for the coming 128-dim learned embedding — best-effort; warns and
 *      continues if Aura plan doesn't support vector indexes
 *
 * Usage:
 *   node scripts/concept-pipeline/00-schema.mjs
 *
 * Env (from .env.local):
 *   NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD
 */

import neo4j from "neo4j-driver";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, "../../.env.local") });

const { NEO4J_URI, NEO4J_USERNAME = "neo4j", NEO4J_PASSWORD } = process.env;

if (!NEO4J_URI || !NEO4J_PASSWORD) {
  console.error("❌ Missing NEO4J_URI or NEO4J_PASSWORD in .env.local");
  process.exit(1);
}

const CONCEPTS_PATH = join(__dirname, "../../src/lib/concept/conceptTaxonomy.data.json");
const concepts = JSON.parse(readFileSync(CONCEPTS_PATH, "utf-8"));

const EMBEDDING_DIM = 128;
const EMBEDDING_VERSION = "v1";

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD));

async function run(cypher, params = {}) {
  const session = driver.session();
  try {
    return await session.run(cypher, params);
  } finally {
    await session.close();
  }
}

async function step(label, fn) {
  process.stdout.write(`→ ${label}... `);
  try {
    const t0 = Date.now();
    const result = await fn();
    console.log(`ok (${Date.now() - t0}ms)`);
    return result;
  } catch (err) {
    console.log(`failed: ${err.message}`);
    throw err;
  }
}

async function stepSoft(label, fn) {
  process.stdout.write(`→ ${label}... `);
  try {
    const t0 = Date.now();
    await fn();
    console.log(`ok (${Date.now() - t0}ms)`);
    return true;
  } catch (err) {
    console.log(`skipped: ${err.message.split("\n")[0]}`);
    return false;
  }
}

async function main() {
  console.log(`\nConnecting to ${NEO4J_URI}`);
  await driver.verifyConnectivity();
  console.log(`Loaded ${concepts.length} concepts from taxonomy\n`);

  await step("Constraint: Concept.id unique", () =>
    run(`CREATE CONSTRAINT concept_id_unique IF NOT EXISTS
         FOR (c:Concept) REQUIRE c.id IS UNIQUE`)
  );

  await step("Index: Concept.tier", () =>
    run(`CREATE INDEX concept_tier_idx IF NOT EXISTS
         FOR (c:Concept) ON (c.tier)`)
  );

  await step(`Upserting ${concepts.length} concept nodes`, async () => {
    for (const concept of concepts) {
      await run(
        `MERGE (c:Concept {id: $id})
         SET c.name = $name,
             c.tier = $tier,
             c.ratingMin = $ratingMin,
             c.ratingMax = $ratingMax,
             c.definition = $definition,
             c.lichessThemeAliases = $aliases,
             c.canonicalFens = $canonicalFens`,
        {
          id: concept.id,
          name: concept.name,
          tier: concept.tier,
          ratingMin: neo4j.int(concept.ratingBand[0]),
          ratingMax: neo4j.int(concept.ratingBand[1]),
          definition: concept.definition,
          aliases: concept.lichessThemeAliases,
          canonicalFens: concept.canonicalFens,
        }
      );
    }
  });

  await step("Building PREREQUISITE_OF edges", async () => {
    // Clear existing prereq edges so re-runs reflect taxonomy edits
    await run(`MATCH (:Concept)-[r:PREREQUISITE_OF]->(:Concept) DELETE r`);
    for (const concept of concepts) {
      for (const prereqId of concept.prerequisites) {
        await run(
          `MATCH (p:Concept {id: $prereqId}), (c:Concept {id: $id})
           MERGE (p)-[:PREREQUISITE_OF]->(c)`,
          { prereqId, id: concept.id }
        );
      }
    }
  });

  await step("Index: Puzzle.puzzleId", () =>
    run(`CREATE INDEX puzzle_id_idx IF NOT EXISTS
         FOR (p:Puzzle) ON (p.puzzleId)`)
  );

  await step("Index: Puzzle.rating", () =>
    run(`CREATE INDEX puzzle_rating_idx IF NOT EXISTS
         FOR (p:Puzzle) ON (p.rating)`)
  );

  await step("Index: EXERCISES.confidence (rel property index)", () =>
    run(`CREATE INDEX exercises_confidence_idx IF NOT EXISTS
         FOR ()-[r:EXERCISES]-() ON (r.confidence)`)
  );

  // Vector index is Aura 5.11+ / self-managed 5.15+. Soft-fail if unsupported.
  await stepSoft(
    `Vector index on Puzzle.positionEmbedding (${EMBEDDING_DIM}-dim, cosine)`,
    () =>
      run(
        `CREATE VECTOR INDEX puzzle_embedding_idx IF NOT EXISTS
         FOR (p:Puzzle) ON (p.positionEmbedding)
         OPTIONS { indexConfig: {
           \`vector.dimensions\`: $dim,
           \`vector.similarity_function\`: 'cosine'
         }}`,
        { dim: neo4j.int(EMBEDDING_DIM) }
      )
  );

  // Sanity: count what we wrote
  const { records } = await run(`
    MATCH (c:Concept)
    RETURN c.tier AS tier, count(c) AS n
    ORDER BY tier
  `);
  console.log("\nConcept counts by tier:");
  for (const r of records) {
    console.log(`  ${r.get("tier").padEnd(10)} ${r.get("n")}`);
  }

  const { records: prereqRecords } = await run(
    `MATCH ()-[r:PREREQUISITE_OF]->() RETURN count(r) AS n`
  );
  console.log(`\nPREREQUISITE_OF edges: ${prereqRecords[0].get("n")}`);

  console.log(`\nEmbedding schema version: ${EMBEDDING_VERSION}`);
  console.log("Schema migration complete.\n");
}

main()
  .catch((err) => {
    console.error("\nSchema migration failed:", err);
    process.exit(1);
  })
  .finally(() => driver.close());
