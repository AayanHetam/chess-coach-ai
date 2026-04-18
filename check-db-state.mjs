import neo4j from "neo4j-driver";
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, ".env.local") });

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);

const session = driver.session();

try {
  // Node counts
  const nodes = await session.run(`
    MATCH (n)
    RETURN labels(n)[0] as type, count(*) as count
    ORDER BY count DESC
  `);

  console.log("\n📊 Database Statistics:\n");
  console.log("   Node Counts:");
  nodes.records.forEach(r => {
    console.log(`     ${r.get('type')}: ${r.get('count').toNumber().toLocaleString()}`);
  });

  // Relationship counts
  const rels = await session.run(`
    MATCH ()-[r]->()
    RETURN type(r) as type, count(*) as count
    ORDER BY count DESC
  `);

  console.log("\n   Relationship Counts:");
  rels.records.forEach(r => {
    console.log(`     ${r.get('type')}: ${r.get('count').toNumber().toLocaleString()}`);
  });

  // Top themes
  const themes = await session.run(`
    MATCH (p:Puzzle)-[:HAS_THEME]->(t:Theme)
    RETURN t.name as theme, count(p) as puzzles
    ORDER BY puzzles DESC
    LIMIT 15
  `);

  console.log("\n   Top 15 Tactical Themes:");
  themes.records.forEach(r => {
    console.log(`     ${r.get('theme')}: ${r.get('puzzles').toNumber().toLocaleString()} puzzles`);
  });

  // Rating distribution
  const ratings = await session.run(`
    MATCH (p:Puzzle)
    WITH p.rating as rating
    RETURN
      min(rating) as min,
      max(rating) as max,
      avg(rating) as avg,
      percentileCont(rating, 0.5) as median
  `);

  console.log("\n   Puzzle Rating Distribution:");
  const r = ratings.records[0];
  console.log(`     Min: ${r.get('min')}`);
  console.log(`     Max: ${r.get('max')}`);
  console.log(`     Avg: ${Math.round(r.get('avg'))}`);
  console.log(`     Median: ${Math.round(r.get('median'))}`);

  console.log("\n✅ Database check complete!\n");

} catch (error) {
  console.error("❌ Error:", error.message);
} finally {
  await session.close();
  await driver.close();
}
