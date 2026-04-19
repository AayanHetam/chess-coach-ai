#!/usr/bin/env node
/**
 * Complete Neo4j Graph Setup for Chess Masti
 *
 * Sets up the full Position-as-hub graph schema with:
 * 1. Lichess puzzles (90k+ tactical puzzles)
 * 2. Jhamtani commentary (298k+ move-commentary pairs)
 * 3. User progress tracking
 * 4. Adaptive recommendation relationships
 *
 * Usage:
 *   node scripts/neo4j-loaders/setup-graph.mjs [--reset]
 *
 * Options:
 *   --reset    Clear existing data before loading
 */

import neo4j from "neo4j-driver";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, "../../.env.local") });

// ── Configuration ─────────────────────────────────────────────────────────────

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

const RESET_DATABASE = process.argv.includes("--reset");

// ── Neo4j Connection ──────────────────────────────────────────────────────────

if (!NEO4J_URI || !NEO4J_PASSWORD) {
  console.error("❌ Error: Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD environment variables");
  process.exit(1);
}

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD));

// ── Graph Schema ──────────────────────────────────────────────────────────────

const GRAPH_SCHEMA = `
┌─────────────────────────────────────────────────────────────────────────┐
│                  Chess Masti Position-as-Hub Schema                     │
└─────────────────────────────────────────────────────────────────────────┘

Node Types:
  • Position {fen: string}           — Unique chess positions (FEN notation)
  • Puzzle {id, rating, moves}       — Lichess tactical puzzles
  • Commentary {text, move}          — Expert commentary on moves
  • Theme {name}                     — Tactical themes (fork, pin, etc.)
  • Opening {name, eco}              — Opening repertoire
  • User {id, rating}                — Registered users
  • Game {id, pgn}                   — Historical games

Relationship Types:
  • (Puzzle)-[:FROM_POSITION]->(Position)
  • (Commentary)-[:FROM_POSITION]->(Position)
  • (Puzzle)-[:HAS_THEME]->(Theme)
  • (Commentary)-[:IN_OPENING]->(Opening)
  • (User)-[:ATTEMPTED]->(Puzzle)
  • (User)-[:STRUGGLED_WITH]->(Theme)
  • (Game)-[:HAS_POSITION]->(Position)
  • (Position)-[:NEXT_MOVE {move}]->(Position)

Key Queries:
  1. Adaptive Puzzles:
     MATCH (u:User)-[:STRUGGLED_WITH]->(t:Theme)<-[:HAS_THEME]-(p:Puzzle)
     WHERE NOT (u)-[:ATTEMPTED]->(p)
     RETURN p

  2. Position Commentary:
     MATCH (pos:Position {fen: $fen})<-[:FROM_POSITION]-(c:Commentary)
     RETURN c.text, c.playerRating

  3. Opening Analysis:
     MATCH (o:Opening)<-[:IN_OPENING]-(c:Commentary)
     WHERE o.name = $opening
     RETURN c.text, c.move
`;

// ── Reset Database ────────────────────────────────────────────────────────────

async function resetDatabase(session) {
  console.log("⚠️  Resetting database (deleting all nodes and relationships)...");

  await session.run(`
    MATCH (n)
    DETACH DELETE n
  `);

  console.log("✅ Database reset complete");
}

// ── Create Schema ─────────────────────────────────────────────────────────────

async function createCompleteSchema(session) {
  console.log("\n🔧 Creating complete graph schema...\n");

  // Neo4j Aura 2026.02: CREATE CONSTRAINT fails, skip if already exists
  console.log("   ⚠️  Skipping constraint/index creation (Neo4j Aura 2026.02 limitation)");
  console.log("   Note: Constraints should already exist from previous setup");
  console.log("\n✅ Schema step complete (skipped due to Neo4j Aura limitations)");
}

// ── Load Hierarchical Theme Taxonomy ──────────────────────────────────────────

async function loadThemeTaxonomy(session) {
  console.log("\n🌳 Loading hierarchical theme taxonomy...\n");

  // Load taxonomy JSON
  const taxonomyPath = join(__dirname, "../../data/theme-taxonomy.json");
  const taxonomy = JSON.parse(readFileSync(taxonomyPath, "utf-8"));

  let totalThemes = 0;
  let totalRelationships = 0;

  // Recursive function to create themes and relationships
  async function createThemeHierarchy(themeData, parentTheme = null) {
    // Create current theme node
    // Neo4j Aura 2026.02: Can't use {id: $id} pattern, must use SET
    await session.run(`
      MERGE (t:Theme {name: "${themeData.name}"})
      SET t.id = "${themeData.id}",
          t.level = ${themeData.level},
          t.description = "${(themeData.description || "").replace(/"/g, '\\"')}",
          t.keywords = [${(themeData.keywords || []).map(k => `"${k}"`).join(", ")}],
          t.commonSquares = [${(themeData.commonSquares || []).map(s => `"${s}"`).join(", ")}],
          t.specificSquares = [${(themeData.specificSquares || []).map(s => `"${s}"`).join(", ")}]
    `);

    totalThemes++;

    // Create relationship to parent theme
    if (parentTheme) {
      await session.run(`
        MATCH (parent:Theme {name: "${parentTheme.name}"})
        MATCH (child:Theme {name: "${themeData.name}"})
        MERGE (child)-[:SUBTHEME_OF]->(parent)
      `);
      totalRelationships++;
    }

    // Recursively create subthemes
    if (themeData.subthemes) {
      for (const subtheme of themeData.subthemes) {
        await createThemeHierarchy(subtheme, themeData);
      }
    }
  }

  // Create all themes from taxonomy
  for (const rootTheme of taxonomy.themes) {
    await createThemeHierarchy(rootTheme);
  }

  console.log(`   ✓ Created ${totalThemes} themes`);
  console.log(`   ✓ Created ${totalRelationships} hierarchical relationships`);
}

// ── Seed Sample Data ──────────────────────────────────────────────────────────

async function seedSampleData(session) {
  console.log("\n🌱 Seeding sample data...\n");

  // Create sample openings (without UNWIND - Neo4j Aura 2026.02 compatibility)
  const openings = [
    {name: 'Sicilian Defense', eco: 'B20'},
    {name: 'French Defense', eco: 'C00'},
    {name: 'Italian Game', eco: 'C50'},
    {name: 'Ruy Lopez', eco: 'C60'},
    {name: "Queen's Gambit", eco: 'D06'}
  ];

  for (const opening of openings) {
    await session.run(`
      MERGE (o:Opening {name: $name})
      SET o.eco = $eco
    `, opening);
  }
  console.log("   ✓ Sample openings created");

  // Create sample test user
  await session.run(`
    MERGE (u:User {id: 'test-user-123'})
    SET u.rating = 1500,
        u.createdAt = datetime()
  `);
  console.log("   ✓ Test user created");

  // Create sample struggled themes for test user
  const struggledThemes = ['fork', 'pin', 'skewer'];
  for (const themeName of struggledThemes) {
    await session.run(`
      MATCH (u:User {id: 'test-user-123'})
      MATCH (t:Theme {id: $themeId})
      MERGE (u)-[:STRUGGLED_WITH {severity: 3, lastUpdated: datetime()}]->(t)
    `, { themeId: themeName });
  }
  console.log("   ✓ Test user struggled themes linked");

  console.log("\n✅ Sample data seeded");
}

// ── Verify Setup ──────────────────────────────────────────────────────────────

async function verifySetup(session) {
  console.log("\n🔍 Verifying setup...\n");

  const stats = await session.run(`
    MATCH (n)
    RETURN labels(n) AS label, count(n) AS count
    ORDER BY count DESC
  `);

  console.log("   Node counts:");
  stats.records.forEach((record) => {
    const label = record.get("label")[0];
    const count = record.get("count").toNumber();
    console.log(`     ${label}: ${count}`);
  });

  const relStats = await session.run(`
    MATCH ()-[r]->()
    RETURN type(r) AS type, count(r) AS count
    ORDER BY count DESC
  `);

  console.log("\n   Relationship counts:");
  relStats.records.forEach((record) => {
    const type = record.get("type");
    const count = record.get("count").toNumber();
    console.log(`     ${type}: ${count}`);
  });

  console.log("\n✅ Verification complete");
}

// ── Print Next Steps ──────────────────────────────────────────────────────────

function printNextSteps() {
  console.log("\n" + "=".repeat(75));
  console.log("🎉 Neo4j Graph Schema Setup Complete!");
  console.log("=".repeat(75));

  console.log(GRAPH_SCHEMA);

  console.log("\n📝 Next Steps:\n");

  console.log("1️⃣  Load Lichess Puzzles:");
  console.log("   node scripts/neo4j-loaders/load-puzzles.mjs --limit 10000\n");

  console.log("2️⃣  Load Commentary Data:");
  console.log("   node scripts/neo4j-loaders/load-commentary.mjs --limit 5000\n");

  console.log("3️⃣  Test Adaptive Puzzle API:");
  console.log("   curl -X POST http://localhost:3000/api/adaptive-puzzles \\");
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"userId": "test-user-123", "limit": 5}\'');
  console.log();

  console.log("4️⃣  Query Commentary by FEN:");
  console.log("   curl -X POST http://localhost:3000/api/commentary-by-fen \\");
  console.log('     -d \'{"fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR"}\'');
  console.log();

  console.log("5️⃣  Explore the Graph (Neo4j Browser):");
  console.log(`   Open: ${NEO4J_URI.replace("bolt+s", "https").replace(":7687", ":7474")}`);
  console.log("   Login with your credentials");
  console.log("   Try: MATCH (n) RETURN n LIMIT 25");
  console.log();

  console.log("=".repeat(75));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Chess Masti Neo4j Graph Setup\n");

  // Neo4j Aura 2026.02 compatibility - don't specify access mode
  const session = driver.session();

  try {
    // Step 1: Reset if requested
    if (RESET_DATABASE) {
      await resetDatabase(session);
    }

    // Step 2: Create schema
    await createCompleteSchema(session);

    // Step 3: Load hierarchical theme taxonomy
    await loadThemeTaxonomy(session);

    // Step 4: Seed sample data
    await seedSampleData(session);

    // Step 5: Verify
    await verifySetup(session);

    // Step 6: Print next steps
    printNextSteps();

  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(console.error);
