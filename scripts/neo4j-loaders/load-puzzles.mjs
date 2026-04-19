#!/usr/bin/env node
/**
 * Lichess Puzzle Dataset → Neo4j Loader (v3 — BATCH MODE)
 *
 * Loads Lichess puzzles into Neo4j using UNWIND+MERGE batches for ~100x speedup.
 * MERGE works fine with UNWIND on Aura 2026.02 — only CREATE was broken.
 *
 * Features:
 * - UNWIND + MERGE batches of 500 puzzles (~5000 puzzles/min vs 50/min)
 * - FEN analysis for specific tactical theme inference
 * - Contextual metadata extraction (evaluation, phase, length, difficulty)
 * - Configurable CSV path with --csv flag
 * - Skip already-loaded puzzles via MERGE idempotency
 *
 * Usage:
 *   node scripts/neo4j-loaders/load-puzzles.mjs --limit=100000 --csv=./data/lichess_puzzles_100k.csv
 */

import neo4j from "neo4j-driver";
import { createReadStream, existsSync } from "fs";
import { createInterface } from "readline";
import { analyzePuzzle } from "./fen-analyzer.mjs";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, "../../.env.local") });

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

const CSV_PATH = process.argv.find((a) => a.startsWith("--csv="))?.split("=")[1] || "./data/lichess_puzzles_100k.csv";
const LIMIT = parseInt(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1]) || 100000;
const BATCH_SIZE = parseInt(process.argv.find((a) => a.startsWith("--batch="))?.split("=")[1]) || 500;

if (!NEO4J_URI || !NEO4J_PASSWORD) {
  console.error("❌ Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD environment variables");
  process.exit(1);
}

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD));

// ── Parse Puzzle CSV ──────────────────────────────────────────────────────────

async function parsePuzzleCSV() {
  console.log(`\n📊 Parsing ${CSV_PATH} (limit: ${LIMIT.toLocaleString()})...`);

  if (!existsSync(CSV_PATH)) {
    console.error(`❌ CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const puzzles = [];
  const rl = createInterface({ input: createReadStream(CSV_PATH), crlfDelay: Infinity });

  let lineCount = 0;
  let headerSkipped = false;

  for await (const line of rl) {
    if (!headerSkipped) { headerSkipped = true; continue; }
    lineCount++;
    if (lineCount > LIMIT) break;

    const parts = line.split(",");
    if (parts.length < 9) continue;

    const [puzzleId, fen, moves, rating, ratingDev, popularity, nbPlays, themesStr, gameUrl, ...openingParts] = parts;

    puzzles.push({
      puzzleId,
      fen,
      moves,
      rating: parseInt(rating) || 0,
      ratingDeviation: parseInt(ratingDev) || 0,
      popularity: parseInt(popularity) || 0,
      nbPlays: parseInt(nbPlays) || 0,
      themes: themesStr.split(" ").filter((t) => t.length > 0),
      gameUrl: gameUrl || "",
      openingTags: openingParts.join(",") || "",
    });

    if (lineCount % 10000 === 0) {
      console.log(`   Parsed ${lineCount.toLocaleString()}...`);
    }
  }

  console.log(`✅ Parsed ${puzzles.length.toLocaleString()} puzzles`);
  return puzzles;
}

// ── FEN Analysis Phase ───────────────────────────────────────────────────────

function analyzeAllPuzzles(puzzles) {
  console.log(`\n🔬 Running FEN analysis on ${puzzles.length.toLocaleString()} puzzles...`);

  const allThemeIds = new Set();
  let fenAnalyzed = 0;

  const enriched = puzzles.map((puzzle, i) => {
    const { tacticalThemes, metadata } = analyzePuzzle(puzzle);
    tacticalThemes.forEach((t) => allThemeIds.add(t));
    if (tacticalThemes.length > 0) fenAnalyzed++;

    if ((i + 1) % 10000 === 0) {
      console.log(`   Analyzed ${(i + 1).toLocaleString()} / ${puzzles.length.toLocaleString()}...`);
    }

    return {
      puzzleId: puzzle.puzzleId,
      fen: puzzle.fen,
      moves: puzzle.moves,
      rating: puzzle.rating,
      ratingDeviation: puzzle.ratingDeviation,
      popularity: puzzle.popularity,
      nbPlays: puzzle.nbPlays,
      gameUrl: puzzle.gameUrl,
      openingTags: puzzle.openingTags,
      evaluation: metadata.evaluation || "",
      gamePhase: metadata.gamePhase || "",
      puzzleLength: metadata.puzzleLength || "",
      difficulty: metadata.difficulty || "",
      isMate: metadata.isMate || false,
      mateInMoves: metadata.mateInMoves || 0,
      moveCount: metadata.moveCount || 0,
      themes: tacticalThemes,  // array of theme IDs for this puzzle
    };
  });

  console.log(`✅ FEN analysis complete`);
  console.log(`   Puzzles with specific themes: ${fenAnalyzed.toLocaleString()} (${((fenAnalyzed / puzzles.length) * 100).toFixed(1)}%)`);
  console.log(`   Unique theme IDs: ${allThemeIds.size}`);

  return { enriched, allThemeIds: Array.from(allThemeIds) };
}

// ── Batch Load into Neo4j (UNWIND + MERGE) ──────────────────────────────────

async function loadThemeNodes(themeIds) {
  console.log(`\n📥 Ensuring ${themeIds.length} theme nodes exist...`);
  const session = driver.session();
  try {
    // Batch all themes in one UNWIND
    await session.run(
      `UNWIND $themes AS tid MERGE (t:Theme {id: tid})`,
      { themes: themeIds }
    );
    console.log("✅ Theme nodes ensured");
  } finally {
    await session.close();
  }
}

async function loadPuzzleBatch(batch, batchNum, totalBatches) {
  const session = driver.session();
  try {
    // Step 1: UNWIND MERGE all Position nodes
    await session.run(
      `UNWIND $rows AS r MERGE (pos:Position {fen: r.fen})`,
      { rows: batch }
    );

    // Step 2: UNWIND MERGE all Puzzle nodes with properties
    await session.run(
      `UNWIND $rows AS r
       MERGE (p:Puzzle {puzzleId: r.puzzleId})
       SET p.fen = r.fen,
           p.moves = r.moves,
           p.rating = r.rating,
           p.ratingDeviation = r.ratingDeviation,
           p.popularity = r.popularity,
           p.nbPlays = r.nbPlays,
           p.gameUrl = r.gameUrl,
           p.openingTags = r.openingTags,
           p.evaluation = r.evaluation,
           p.gamePhase = r.gamePhase,
           p.puzzleLength = r.puzzleLength,
           p.difficulty = r.difficulty,
           p.isMate = r.isMate,
           p.mateInMoves = r.mateInMoves,
           p.moveCount = r.moveCount`,
      { rows: batch }
    );

    // Step 3: UNWIND MERGE puzzle→position relationships
    await session.run(
      `UNWIND $rows AS r
       MATCH (p:Puzzle {puzzleId: r.puzzleId})
       MATCH (pos:Position {fen: r.fen})
       MERGE (p)-[:FROM_POSITION]->(pos)`,
      { rows: batch }
    );

    // Step 4: UNWIND MERGE puzzle→theme relationships
    // Flatten: each row becomes {puzzleId, themeId} pairs
    const themeLinks = [];
    for (const row of batch) {
      for (const tid of row.themes) {
        themeLinks.push({ puzzleId: row.puzzleId, themeId: tid });
      }
    }
    if (themeLinks.length > 0) {
      await session.run(
        `UNWIND $links AS l
         MATCH (p:Puzzle {puzzleId: l.puzzleId})
         MATCH (t:Theme {id: l.themeId})
         MERGE (p)-[:HAS_THEME]->(t)`,
        { links: themeLinks }
      );
    }

    return batch.length;
  } finally {
    await session.close();
  }
}

async function loadAllPuzzles(enriched) {
  const total = enriched.length;
  const totalBatches = Math.ceil(total / BATCH_SIZE);
  console.log(`\n📥 Loading ${total.toLocaleString()} puzzles in ${totalBatches} batches of ${BATCH_SIZE}...`);
  console.log(`   (UNWIND+MERGE — ~100x faster than single-row inserts)\n`);

  let loaded = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = enriched.slice(i, i + BATCH_SIZE);

    try {
      const count = await loadPuzzleBatch(batch, batchNum, totalBatches);
      loaded += count;

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = loaded / elapsed;
      const remaining = ((total - loaded) / rate).toFixed(0);
      const pct = ((loaded / total) * 100).toFixed(1);

      console.log(
        `   Batch ${batchNum}/${totalBatches}: ${loaded.toLocaleString()}/${total.toLocaleString()} (${pct}%) — ` +
        `${rate.toFixed(0)} puzzles/s — ETA ${remaining}s`
      );
    } catch (err) {
      errors++;
      console.error(`   ⚠️  Batch ${batchNum} error: ${err.message}`);
      // Retry with smaller sub-batches on failure
      if (batch.length > 50) {
        console.log(`   🔄 Retrying batch ${batchNum} in sub-batches of 50...`);
        for (let j = 0; j < batch.length; j += 50) {
          const subBatch = batch.slice(j, j + 50);
          try {
            const count = await loadPuzzleBatch(subBatch, batchNum, totalBatches);
            loaded += count;
          } catch (subErr) {
            errors++;
            console.error(`   ⚠️  Sub-batch error: ${subErr.message}`);
          }
        }
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Loaded ${loaded.toLocaleString()} puzzles in ${elapsed}s (${errors} errors)`);
  console.log(`   Average: ${(loaded / (elapsed || 1)).toFixed(0)} puzzles/s`);
}

// ── Statistics ────────────────────────────────────────────────────────────────

async function printStatistics() {
  const session = driver.session();
  try {
    console.log("\n📊 Database Statistics:");

    const nodeStats = await session.run(
      `MATCH (n) RETURN labels(n) AS label, count(n) AS count ORDER BY count DESC`
    );
    console.log("   Nodes:");
    nodeStats.records.forEach((r) => {
      console.log(`     ${r.get("label")[0]}: ${r.get("count").toNumber().toLocaleString()}`);
    });

    const relStats = await session.run(
      `MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count ORDER BY count DESC`
    );
    console.log("   Relationships:");
    relStats.records.forEach((r) => {
      console.log(`     ${r.get("type")}: ${r.get("count").toNumber().toLocaleString()}`);
    });

    const themeStats = await session.run(`
      MATCH (t:Theme)<-[:HAS_THEME]-()
      RETURN t.id AS theme, count(*) AS puzzles
      ORDER BY puzzles DESC LIMIT 15
    `);
    console.log("   Top 15 themes:");
    themeStats.records.forEach((r) => {
      console.log(`     ${r.get("theme")}: ${r.get("puzzles").toNumber().toLocaleString()} puzzles`);
    });
  } finally {
    await session.close();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Lichess Puzzle → Neo4j Loader (v3 — BATCH MODE)\n");
  console.log(`   CSV:        ${CSV_PATH}`);
  console.log(`   Limit:      ${LIMIT.toLocaleString()} puzzles`);
  console.log(`   Batch size: ${BATCH_SIZE}`);
  console.log(`   FEN analysis: ENABLED\n`);

  try {
    const puzzles = await parsePuzzleCSV();
    const { enriched, allThemeIds } = analyzeAllPuzzles(puzzles);
    await loadThemeNodes(allThemeIds);
    await loadAllPuzzles(enriched);
    await printStatistics();

    console.log("\n✅ Puzzle loading complete!");
  } catch (error) {
    console.error("\n❌ Fatal error:", error.message);
    throw error;
  } finally {
    await driver.close();
  }
}

main().catch(console.error);
