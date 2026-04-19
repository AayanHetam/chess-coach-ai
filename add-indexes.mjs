#!/usr/bin/env node
import neo4j from "neo4j-driver";
import { config } from "dotenv";
config({ path: ".env.local" });

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);

const indexes = [
  "CREATE INDEX puzzle_id IF NOT EXISTS FOR (p:Puzzle) ON (p.puzzleId)",
  "CREATE INDEX position_fen IF NOT EXISTS FOR (pos:Position) ON (pos.fen)",
  "CREATE INDEX theme_id IF NOT EXISTS FOR (t:Theme) ON (t.id)",
  "CREATE INDEX theme_name IF NOT EXISTS FOR (t:Theme) ON (t.name)",
  "CREATE INDEX puzzle_rating IF NOT EXISTS FOR (p:Puzzle) ON (p.rating)",
];

const session = driver.session();
try {
  for (const idx of indexes) {
    try {
      await session.run(idx);
      console.log(`✅ ${idx.split("IF NOT EXISTS")[0].trim()}`);
    } catch (e) {
      console.log(`⚠️  ${e.message.slice(0, 80)}`);
    }
  }

  // Verify
  const result = await session.run("SHOW INDEXES");
  console.log(`\n📊 Total indexes: ${result.records.length}`);
  result.records.forEach(r => {
    console.log(`   ${r.get("name")} — ${r.get("labelsOrTypes")} (${r.get("state")})`);
  });
} finally {
  await session.close();
  await driver.close();
}
