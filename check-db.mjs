import neo4j from 'neo4j-driver';

const uri = 'bolt+s://f90119e8.databases.neo4j.io';
const user = 'f90119e8';
const password = 'p7A6hemmP0Qnbi4ldGiyRgqRaJMbfxLXFlpHaygH3f8';

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

(async () => {
  // Try default database (neo4j)
  console.log('Checking default database (neo4j)...');
  let session = driver.session({ database: 'neo4j' });
  try {
    const result = await session.run('MATCH (p:Puzzle) RETURN count(p) AS puzzleCount');
    console.log('  Puzzles in "neo4j" database:', result.records[0].get('puzzleCount').toString());
  } catch (e) {
    console.log('  Error:', e.message);
  } finally {
    await session.close();
  }

  // Try database matching instance ID
  console.log('\nChecking database "f90119e8"...');
  session = driver.session({ database: 'f90119e8' });
  try {
    const result = await session.run('MATCH (p:Puzzle) RETURN count(p) AS puzzleCount');
    console.log('  Puzzles in "f90119e8" database:', result.records[0].get('puzzleCount').toString());
  } catch (e) {
    console.log('  Error:', e.message);
  } finally {
    await session.close();
  }

  // Try without specifying database (uses server default)
  console.log('\nChecking server default database...');
  session = driver.session();
  try {
    const result = await session.run('MATCH (p:Puzzle) RETURN count(p) AS puzzleCount');
    console.log('  Puzzles in default database:', result.records[0].get('puzzleCount').toString());
  } catch (e) {
    console.log('  Error:', e.message);
  } finally {
    await session.close();
    await driver.close();
  }
})();
