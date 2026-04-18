#!/usr/bin/env node
/**
 * Jhamtani Chess Commentary Dataset → Neo4j Loader (v2)
 *
 * Downloads and loads chess move-commentary pairs into Neo4j graph.
 * Creates Position-as-hub schema: Position ← Commentary → Opening
 *
 * Neo4j Aura 2026.02 Compatibility:
 * - Uses MERGE only (CREATE fails with "Database not found")
 * - Uses fresh sessions per operation (failed queries corrupt session)
 * - No UNWIND, no defaultAccessMode, no database parameter
 *
 * Data source: https://github.com/harsh19/ChessCommentaryGeneration
 * Paper: https://aclanthology.org/P18-1154/
 *
 * Usage:
 *   node scripts/neo4j-loaders/load-commentary.mjs [--limit=N]
 */

import neo4j from "neo4j-driver";
import { createWriteStream, createReadStream, existsSync, mkdirSync } from "fs";
import { createInterface } from "readline";
import https from "https";
import { exec } from "child_process";
import { promisify } from "util";
import { Chess } from "chess.js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, "../../.env.local") });

const execAsync = promisify(exec);

// ── Configuration ─────────────────────────────────────────────────────────────

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

const GITHUB_REPO = "https://github.com/harsh19/ChessCommentaryGeneration";
const DATA_DIR = "./data/chess-commentary";
const LIMIT = parseInt(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1]) || 500;

// ── Neo4j Connection ──────────────────────────────────────────────────────────

if (!NEO4J_URI || !NEO4J_PASSWORD) {
  console.error("❌ Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD environment variables");
  process.exit(1);
}

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD));

function freshSession() {
  return driver.session(); // No options — Aura 2026.02 compatibility
}

// ── Download Commentary Dataset ───────────────────────────────────────────────

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", reject);
  });
}

async function downloadCommentaryDataset() {
  console.log("📦 Downloading Jhamtani Chess Commentary dataset...");
  console.log(`   Repository: ${GITHUB_REPO}`);

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!existsSync(`${DATA_DIR}/.git`)) {
    console.log("📥 Cloning repository (this may take a few minutes)...");
    try {
      await execAsync(`git clone --depth 1 ${GITHUB_REPO} ${DATA_DIR}`);
      console.log("✅ Repository cloned");
    } catch (error) {
      console.error("❌ Git clone failed. Using synthetic sample...");
    }
  } else {
    console.log("✅ Using existing repository");
  }
}

// ── Parse Commentary Data ─────────────────────────────────────────────────────

async function parseCommentaryData() {
  console.log("\n📊 Parsing commentary data...");

  const commentaries = [];
  const openings = new Set();

  const possiblePaths = [
    `${DATA_DIR}/data/sample_data.json`,
    `${DATA_DIR}/sample_data.json`,
    `${DATA_DIR}/data/train.json`,
    `${DATA_DIR}/train.json`,
  ];

  let dataPath = null;
  for (const path of possiblePaths) {
    if (existsSync(path)) { dataPath = path; break; }
  }

  if (!dataPath) {
    console.log("⚠️  No data files found. Using synthetic sample...");
    return generateSyntheticSample();
  }

  console.log(`   Reading from: ${dataPath}`);

  const rl = createInterface({
    input: createReadStream(dataPath),
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  for await (const line of rl) {
    if (lineCount >= LIMIT) break;
    try {
      const entry = JSON.parse(line.trim());
      let fen = entry.fen;
      if (!fen && entry.moves) fen = computeFenFromMoves(entry.moves);
      if (!fen) continue;

      const opening = entry.opening || "Unknown";
      openings.add(opening);

      commentaries.push({
        id: `commentary_${lineCount}`,
        move: entry.move || "",
        fen,
        commentary: entry.commentary || entry.text || "",
        gameId: entry.game_id || `game_${Math.floor(lineCount / 100)}`,
        moveNumber: entry.move_number || 0,
        playerRating: entry.player_rating || 0,
        opening,
      });
      lineCount++;

      if (lineCount % 5000 === 0) {
        console.log(`   Parsed ${lineCount.toLocaleString()}...`);
      }
    } catch { continue; }
  }

  console.log(`✅ Parsed ${commentaries.length.toLocaleString()} commentary entries`);
  return { commentaries, openings: Array.from(openings) };
}

function computeFenFromMoves(movesStr) {
  try {
    const chess = new Chess();
    for (const move of movesStr.split(" ")) chess.move(move);
    return chess.fen();
  } catch { return null; }
}

function generateSyntheticSample() {
  console.log("🔧 Generating synthetic sample commentary...");

  const samples = [
    { move: "e4", commentary: "White controls the center with the king's pawn, opening lines for the queen and bishop", opening: "King's Pawn Opening", rating: 1800 },
    { move: "Nf3", commentary: "Developing the knight to its natural square, controlling the center and preparing castling", opening: "King's Knight Opening", rating: 1900 },
    { move: "d4", commentary: "White stakes a claim in the center with the queen's pawn, a solid positional choice", opening: "Queen's Pawn Opening", rating: 2000 },
    { move: "c5", commentary: "Black challenges White's central pawn with the Sicilian Defense, aiming for dynamic counterplay", opening: "Sicilian Defense", rating: 2100 },
    { move: "Nc3", commentary: "Developing the queenside knight, supporting the center and preparing for further piece development", opening: "Various", rating: 1850 },
    { move: "Bb5", commentary: "The Ruy Lopez bishop pins the knight and puts pressure on Black's center", opening: "Ruy Lopez", rating: 2000 },
    { move: "Bc4", commentary: "The Italian Game bishop targets the weak f7 pawn, a classic attacking setup", opening: "Italian Game", rating: 1900 },
    { move: "d5", commentary: "Black immediately strikes at the center, challenging White's pawn structure", opening: "Scandinavian Defense", rating: 1700 },
    { move: "e5", commentary: "Black mirrors White's central pawn push, leading to open game possibilities", opening: "Open Game", rating: 1600 },
    { move: "c4", commentary: "The English Opening aims for a flexible pawn structure and queenside control", opening: "English Opening", rating: 2100 },
  ];

  const commentaries = [];
  const openings = new Set();

  for (let i = 0; i < Math.min(LIMIT, 500); i++) {
    const sample = samples[i % samples.length];
    const chess = new Chess();
    try { chess.move(sample.move); } catch { continue; }

    openings.add(sample.opening);
    commentaries.push({
      id: `commentary_${i}`,
      move: sample.move,
      fen: chess.fen(),
      commentary: sample.commentary,
      gameId: `synthetic_game_${Math.floor(i / 10)}`,
      moveNumber: (i % 10) + 1,
      playerRating: Math.round(sample.rating + (Math.random() * 200 - 100)),
      opening: sample.opening,
    });
  }

  console.log(`✅ Generated ${commentaries.length} synthetic commentary entries`);
  return { commentaries, openings: Array.from(openings) };
}

// ── Load into Neo4j (MERGE-only, fresh sessions) ─────────────────────────────

async function loadCommentaries(commentaries) {
  console.log(`\n� Loading ${commentaries.length.toLocaleString()} commentaries into Neo4j...`);
  console.log(`   (MERGE-only, one at a time — Neo4j Aura 2026.02 compatible)`);

  let loaded = 0;
  let errors = 0;

  for (const comm of commentaries) {
    const session = freshSession();
    try {
      // 1. MERGE Position
      await session.run(
        `MERGE (pos:Position {fen: $fen})`,
        { fen: comm.fen }
      );

      // 2. MERGE Game
      await session.run(
        `MERGE (g:Game {id: $gameId})`,
        { gameId: comm.gameId }
      );

      // 3. MERGE Commentary with all properties
      await session.run(
        `MERGE (c:Commentary {id: $id})
         SET c.text = $text,
             c.move = $move,
             c.moveNumber = $moveNumber,
             c.playerRating = $playerRating,
             c.opening = $opening`,
        {
          id: comm.id,
          text: comm.commentary,
          move: comm.move,
          moveNumber: comm.moveNumber,
          playerRating: comm.playerRating,
          opening: comm.opening,
        }
      );

      // 4. Link commentary → position
      await session.run(
        `MATCH (c:Commentary {id: $id})
         MATCH (pos:Position {fen: $fen})
         MERGE (c)-[:FROM_POSITION]->(pos)`,
        { id: comm.id, fen: comm.fen }
      );

      // 5. Link commentary → game
      await session.run(
        `MATCH (c:Commentary {id: $id})
         MATCH (g:Game {id: $gameId})
         MERGE (c)-[:IN_GAME]->(g)`,
        { id: comm.id, gameId: comm.gameId }
      );

      // 6. Link to opening if known
      if (comm.opening && comm.opening !== "Unknown") {
        await session.run(
          `MATCH (c:Commentary {id: $id})
           MERGE (o:Opening {name: $opening})
           MERGE (c)-[:IN_OPENING]->(o)`,
          { id: comm.id, opening: comm.opening }
        );
      }

      loaded++;
      if (loaded % 50 === 0 || loaded === commentaries.length) {
        const pct = ((loaded / commentaries.length) * 100).toFixed(1);
        console.log(`   ${loaded.toLocaleString()} / ${commentaries.length.toLocaleString()} (${pct}%)${errors > 0 ? ` [${errors} errors]` : ""}`);
      }
    } catch (err) {
      errors++;
      if (errors <= 3) {
        console.error(`   ⚠️  Error on ${comm.id}: ${err.message}`);
      }
    } finally {
      await session.close();
    }
  }

  console.log(`✅ Loaded ${loaded.toLocaleString()} commentaries (${errors} errors)`);
}

// ── Statistics ────────────────────────────────────────────────────────────────

async function printStatistics() {
  const session = freshSession();
  try {
    console.log("\n📊 Database Statistics:");

    const nodeStats = await session.run(`
      MATCH (n) RETURN labels(n) AS label, count(n) AS count ORDER BY count DESC
    `);
    console.log("   Nodes:");
    nodeStats.records.forEach((r) => {
      console.log(`     ${r.get("label")[0]}: ${r.get("count").toNumber().toLocaleString()}`);
    });

    const relStats = await session.run(`
      MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count ORDER BY count DESC
    `);
    console.log("   Relationships:");
    relStats.records.forEach((r) => {
      console.log(`     ${r.get("type")}: ${r.get("count").toNumber().toLocaleString()}`);
    });
  } finally {
    await session.close();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Jhamtani Chess Commentary → Neo4j Loader (v2)\n");
  console.log(`   Limit: ${LIMIT.toLocaleString()} commentaries\n`);

  try {
    // Step 1: Download dataset
    await downloadCommentaryDataset();

    // Step 2: Parse data
    const { commentaries, openings } = await parseCommentaryData();

    // Step 3: Load commentaries (schema creation skipped — done by setup-graph.mjs)
    await loadCommentaries(commentaries);

    // Step 4: Print statistics
    await printStatistics();

    console.log("\n✅ Commentary loading complete!");
    console.log("\n💡 Query commentary by FEN:");
    console.log('   MATCH (pos:Position {fen: $fen})<-[:FROM_POSITION]-(c:Commentary)');
    console.log('   RETURN c.text, c.playerRating ORDER BY c.playerRating DESC LIMIT 5');

  } catch (error) {
    console.error("\n❌ Fatal error:", error.message);
    throw error;
  } finally {
    await driver.close();
  }
}

main().catch(console.error);
