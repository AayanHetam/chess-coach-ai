import neo4j from "neo4j-driver";

const driver = neo4j.driver(
  "bolt+s://65a60e86.databases.neo4j.io",
  neo4j.auth.basic("65a60e86", "LpTAVsf47JkpwAbXglVUG_i5RK3pnMsoMBlZa8Vz25Q")
);

// Try with explicit database name
const session = driver.session({
  database: "65a60e86",
  defaultAccessMode: neo4j.session.WRITE
});

try {
  const result = await session.run(`
    CREATE (p:Puzzle {
      puzzleId: "test001",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      rating: 1500
    })
    RETURN p
  `);
  
  console.log("✅ Successfully created puzzle node!");
  console.log("Result:", result.records[0].get("p").properties);
} catch (error) {
  console.error("❌ Error:", error.message);
} finally {
  await session.close();
  await driver.close();
}
