import neo4j from "neo4j-driver";
import { config } from "dotenv";

config({ path: ".env.local" });

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);

console.log(`Testing connection to: ${process.env.NEO4J_URI}`);
console.log(`Username: ${process.env.NEO4J_USERNAME}`);

const session = driver.session();

try {
  // Test 1: Simple MERGE
  const result = await session.run(`
    MERGE (p:Puzzle {puzzleId: "test001"})
    SET p.fen = "test", p.rating = 1500
    RETURN p
  `);
  
  console.log("✅ MERGE successful!");
  console.log(`   Created/merged puzzle: ${result.records[0].get("p").properties.puzzleId}`);
  
  // Test 2: Query it back
  const query = await session.run(`
    MATCH (p:Puzzle {puzzleId: "test001"})
    RETURN p
  `);
  
  console.log("✅ MATCH successful!");
  console.log(`   Found puzzle with rating: ${query.records[0].get("p").properties.rating}`);
  
} catch (error) {
  console.error("❌ Error:", error.message);
  console.error("   Full error:", error);
} finally {
  await session.close();
  await driver.close();
}
