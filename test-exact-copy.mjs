import neo4j from "neo4j-driver";

const driver = neo4j.driver(
  "bolt+s://65a60e86.databases.neo4j.io",
  neo4j.auth.basic("65a60e86", "LpTAVsf47JkpwAbXglVUG_i5RK3pnMsoMBlZa8Vz25Q")
);

const session = driver.session();

try {
  const result = await session.run(`
    MERGE (t:Theme {name: "fork-test"})
    SET t.description = "test", t.level = 0
    RETURN t
  `);
  
  console.log("✅ Successfully created/merged theme node!");
} catch (error) {
  console.error("❌ Error:", error.message);
} finally {
  await session.close();
  await driver.close();
}
