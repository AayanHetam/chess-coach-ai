import neo4j from "neo4j-driver";

const driver = neo4j.driver(
  "bolt+s://65a60e86.databases.neo4j.io",
  neo4j.auth.basic("65a60e86", "LpTAVsf47JkpwAbXglVUG_i5RK3pnMsoMBlZa8Vz25Q")
);

const session = driver.session();

try {
  // Test creating a theme with SET
  const result = await session.run(`
    MERGE (t:Theme {id: $id})
    SET t.name = $name,
        t.level = $level,
        t.description = $description
    RETURN t
  `, {
    id: "test-fork",
    name: "Test Fork",
    level: 0,
    description: "Test theme"
  });
  
  console.log("✅ Successfully created theme with SET!");
  console.log("Theme:", result.records[0].get("t").properties);
} catch (error) {
  console.error("❌ Error:", error.message);
}

await session.close();
await driver.close();
