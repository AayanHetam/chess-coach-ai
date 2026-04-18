import neo4j from "neo4j-driver";

const driver = neo4j.driver(
  "bolt+s://65a60e86.databases.neo4j.io",
  neo4j.auth.basic("65a60e86", "LpTAVsf47JkpwAbXglVUG_i5RK3pnMsoMBlZa8Vz25Q")
);

const session = driver.session();

try {
  const result = await session.run(`MATCH (n) RETURN count(n) AS count`);
  const count = result.records[0].get("count").toNumber();
  console.log(`✅ Total nodes in database: ${count}`);
  
  const themeResult = await session.run(`MATCH (t:Theme) RETURN count(t) AS count`);
  const themeCount = themeResult.records[0].get("count").toNumber();
  console.log(`✅ Theme nodes: ${themeCount}`);
} catch (error) {
  console.error("❌ Error:", error.message);
  console.error("Full error:", error);
} finally {
  await session.close();
  await driver.close();
}
