import neo4j from 'neo4j-driver';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '.env.local') });

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USERNAME;
const password = process.env.NEO4J_PASSWORD;

console.log('Testing Neo4j connection...');
console.log(`URI: ${uri}`);
console.log(`Username: ${user}`);
console.log(`Password: ${password ? '***' + password.slice(-4) : 'NOT SET'}\n`);

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

(async () => {
  const session = driver.session();
  try {
    console.log('Attempting connection...');
    const result = await session.run('RETURN 1 AS num');
    console.log('✅ Connection successful!');
    console.log(`   Test query returned: ${result.records[0].get('num')}\n`);

    // Check current node count
    const countResult = await session.run('MATCH (n) RETURN count(n) AS nodeCount');
    console.log(`Current database state:`);
    console.log(`   Nodes: ${countResult.records[0].get('nodeCount').toString()}`);

    console.log('\n✅ Ready to load puzzles!');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    if (error.code === 'Neo.ClientError.Security.Unauthorized') {
      console.error('\n   Check your password in .env.local');
    }
  } finally {
    await session.close();
    await driver.close();
  }
})();
