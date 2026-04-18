import neo4j from "neo4j-driver";

const driver = neo4j.driver(
  "bolt+s://65a60e86.databases.neo4j.io",
  neo4j.auth.basic("65a60e86", "LpTAVsf47JkpwAbXglVUG_i5RK3pnMsoMBlZa8Vz25Q")
);

const session = driver.session();

try {
  // Test creating a theme WITHOUT RETURN
  await session.run(`
    MERGE (t:Theme {id: $id})
    SET t.name = $name,
        t.level = $level,
        t.description = $description
  `, {
    id: "test-fork-2",
    name: "Test Fork 2",
    level: 0,
    description: "Test theme without return"
  });
  
  console.log("✅ Successfully created theme WITHOUT RETURN!");
} catch (error) {
  console.error("❌ Error:", error.message);
}

await session.close();
await driver.close();
