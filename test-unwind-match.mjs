import neo4j from "neo4j-driver";

const driver = neo4j.driver(
  "bolt+s://65a60e86.databases.neo4j.io",
  neo4j.auth.basic("65a60e86", "LpTAVsf47JkpwAbXglVUG_i5RK3pnMsoMBlZa8Vz25Q")
);

const session = driver.session();

try {
  const themes = ["fork", "pin", "discovered-attack"];
  
  const result = await session.run(`
    MATCH (t:Theme)
    RETURN t.name AS name
  `);
  
  console.log(`✅ Found ${result.records.length} theme nodes!`);
  result.records.forEach(r => console.log("  - " + r.get("name")));
} catch (error) {
  console.error("❌ Error:", error.message);
} finally {
  await session.close();
  await driver.close();
}
