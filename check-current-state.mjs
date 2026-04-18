import neo4j from "neo4j-driver";

const driver = neo4j.driver(
  "bolt+s://65a60e86.databases.neo4j.io",
  neo4j.auth.basic("65a60e86", "LpTAVsf47JkpwAbXglVUG_i5RK3pnMsoMBlZa8Vz25Q")
);

const session = driver.session();

console.log("📊 Current Database State\n");
console.log("═".repeat(70));

try {
  // 1. Count puzzles
  const puzzleCount = await session.run(`
    MATCH (p:Puzzle) RETURN count(p) as count
  `);
  console.log(`\n1️⃣  Puzzles: ${puzzleCount.records[0].get("count").toNumber()}`);

  // 2. Count themes by level
  const themeLevels = await session.run(`
    MATCH (t:Theme)
    RETURN t.level as level, count(t) as count
    ORDER BY level
  `);
  console.log(`\n2️⃣  Themes by Level:`);
  themeLevels.records.forEach(r => {
    const level = r.get("level").toNumber();
    const count = r.get("count").toNumber();
    console.log(`     Level ${level}: ${count} themes`);
  });

  // 3. Sample of Lichess themes in puzzles
  const lichessThemes = await session.run(`
    MATCH (p:Puzzle)-[:HAS_THEME]->(t:Theme)
    RETURN DISTINCT t.name as theme
    LIMIT 20
  `);
  console.log(`\n3️⃣  Sample Lichess Themes Currently Linked to Puzzles:`);
  lichessThemes.records.forEach(r => {
    console.log(`     • ${r.get("theme")}`);
  });

  // 4. Check if puzzles link to hierarchical themes
  const hierarchyLinks = await session.run(`
    MATCH (p:Puzzle)-[:HAS_THEME]->(child:Theme)-[:SUBTHEME_OF]->(parent:Theme)
    RETURN count(DISTINCT p) as puzzlesWithHierarchy
  `);
  const hierarchyCount = hierarchyLinks.records[0].get("puzzlesWithHierarchy").toNumber();
  console.log(`\n4️⃣  Puzzles Linked to Hierarchical Themes: ${hierarchyCount}`);

  // 5. Sample puzzle data
  const samplePuzzle = await session.run(`
    MATCH (p:Puzzle)
    OPTIONAL MATCH (p)-[:HAS_THEME]->(t:Theme)
    RETURN p.puzzleId as id, p.rating as rating, collect(t.name) as themes
    LIMIT 1
  `);
  if (samplePuzzle.records.length > 0) {
    const record = samplePuzzle.records[0];
    console.log(`\n5️⃣  Sample Puzzle:`);
    console.log(`     ID: ${record.get("id")}`);
    console.log(`     Rating: ${record.get("rating").toNumber()}`);
    console.log(`     Themes: ${record.get("themes").join(", ")}`);
  }

  // 6. Check raw Lichess theme names from CSV
  console.log(`\n6️⃣  Checking what Lichess theme format looks like...`);
  console.log(`     (Lichess uses tags like: 'crushing hangingPiece long middlegame')`);

} catch (error) {
  console.error("❌ Error:", error.message);
} finally {
  await session.close();
  await driver.close();
}

console.log("\n" + "═".repeat(70));
