import neo4j from "neo4j-driver";

const driver = neo4j.driver(
  "bolt+s://65a60e86.databases.neo4j.io",
  neo4j.auth.basic("65a60e86", "LpTAVsf47JkpwAbXglVUG_i5RK3pnMsoMBlZa8Vz25Q")
);

const session = driver.session();

console.log("🔍 Testing Hierarchical Theme Queries\n");

try {
  // Query 1: Show theme hierarchy
  console.log("1️⃣  Fork Theme Hierarchy:");
  console.log("═".repeat(60));
  const hierarchy = await session.run(`
    MATCH path = (specific:Theme)-[:SUBTHEME_OF*0..4]->(root:Theme)
    WHERE root.name = "Fork"
    RETURN specific.name as theme, specific.level as level, length(path) as depth
    ORDER BY depth ASC, level ASC
  `);
  
  hierarchy.records.forEach(record => {
    const indent = "  ".repeat(record.get("depth").toNumber());
    const theme = record.get("theme");
    const level = record.get("level").toNumber();
    console.log(`${indent}${theme} (level ${level})`);
  });

  // Query 2: Find all puzzles related to fork (at any level)
  console.log("\n\n2️⃣  Puzzles Related to Fork Themes:");
  console.log("═".repeat(60));
  const puzzles = await session.run(`
    MATCH (forkTheme:Theme)<-[:SUBTHEME_OF*0..3]-(theme:Theme)
    WHERE forkTheme.name = "Fork"
    MATCH (theme)<-[:HAS_THEME]-(puzzle:Puzzle)
    RETURN DISTINCT puzzle.puzzleId as id, puzzle.rating as rating,
           collect(DISTINCT theme.name) as themes
    LIMIT 5
  `);
  
  puzzles.records.forEach(record => {
    const id = record.get("id");
    const rating = record.get("rating").toNumber();
    const themes = record.get("themes");
    console.log(`  Puzzle ${id} (${rating}) - Themes: ${themes.join(", ")}`);
  });

  // Query 3: Progressive learning path (specific → general)
  console.log("\n\n3️⃣  Progressive Learning Path (Knight Fork):");
  console.log("═".repeat(60));
  const learning = await session.run(`
    MATCH (specific:Theme)
    WHERE specific.name = "Knight Fork"
    MATCH path = (specific)-[:SUBTHEME_OF*0..2]->(broader:Theme)
    RETURN broader.name as theme,
           broader.description as description,
           length(path) as abstraction
    ORDER BY abstraction ASC
  `);

  learning.records.forEach(record => {
    const theme = record.get("theme");
    const desc = record.get("description");
    const level = record.get("abstraction").toNumber();
    console.log(`  Level ${level}: ${theme}`);
    console.log(`           ${desc}\n`);
  });

  // Query 4: Find sibling themes (same parent)
  console.log("\n4️⃣  Sibling Themes (Other types of forks):");
  console.log("═".repeat(60));
  const siblings = await session.run(`
    MATCH (theme:Theme)-[:SUBTHEME_OF]->(parent:Theme)
    WHERE theme.name = "Knight Fork"
    MATCH (sibling:Theme)-[:SUBTHEME_OF]->(parent)
    WHERE theme <> sibling
    RETURN sibling.name as name, sibling.description as description
  `);
  
  siblings.records.forEach(record => {
    const name = record.get("name");
    const desc = record.get("description");
    console.log(`  • ${name}`);
    console.log(`    ${desc}\n`);
  });

  console.log("✅ All queries successful!\n");

} catch (error) {
  console.error("❌ Error:", error.message);
} finally {
  await session.close();
  await driver.close();
}
