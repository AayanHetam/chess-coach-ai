import neo4j from "neo4j-driver";

const driver = neo4j.driver(
  "bolt+s://65a60e86.databases.neo4j.io",
  neo4j.auth.basic("65a60e86", "LpTAVsf47JkpwAbXglVUG_i5RK3pnMsoMBlZa8Vz25Q")
);

const session = driver.session();

try {
  const result = await session.run(`SHOW CONSTRAINTS`);
  console.log(`✅ Found ${result.records.length} constraints:`);
  result.records.forEach(r => {
    console.log(`  - ${r.get("name")}: ${r.get("type")}`);
  });
} catch (error) {
  console.error("❌ Error:", error.message);
} finally {
  await session.close();
  await driver.close();
}
