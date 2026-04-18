import neo4j from "neo4j-driver";
import { config } from "dotenv";
config({ path: ".env.local" });

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);

try {
  const session = driver.session();
  console.log("Testing connection...");
  const result = await session.run("RETURN 1 as test");
  console.log("✅ Connection successful!");
  console.log("Test result:", result.records[0].get("test"));
  await session.close();
} catch (error) {
  console.log("❌ Connection failed:", error.message);
  console.log("URI:", process.env.NEO4J_URI);
  console.log("Username:", process.env.NEO4J_USERNAME);
  console.log("Password length:", process.env.NEO4J_PASSWORD?.length);
} finally {
  await driver.close();
}
