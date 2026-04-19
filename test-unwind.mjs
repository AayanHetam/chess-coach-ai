import neo4j from "neo4j-driver";

const driver = neo4j.driver(
  "bolt+s://65a60e86.databases.neo4j.io",
  neo4j.auth.basic("65a60e86", "LpTAVsf47JkpwAbXglVUG_i5RK3pnMsoMBlZa8Vz25Q")
);

const session = driver.session();

try {
  const themes = ["fork", "pin", "discovered-attack"];
  
  const result = await session.run(`
    UNWIND $themes AS themeName
    MERGE (t:Theme {name: themeName})
    RETURN t
  `, { themes });
  
  console.log(`✅ Successfully created/merged ${result.records.length} theme nodes!`);
} catch (error) {
  console.error("❌ Error:", error.message);
  console.error("Full error:", error);
} finally {
  await session.close();
  await driver.close();
}
