import neo4j from 'neo4j-driver';

const uri = 'bolt+s://f90119e8.databases.neo4j.io';
const user = 'f90119e8';
const password = 'p7A6hemmP0Qnbi4ldGiyRgqRaJMbfxLXFlpHaygH3f8';

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

(async () => {
  const session = driver.session();
  try {
    const result = await session.run('MATCH (p:Puzzle) RETURN count(p) AS puzzleCount');
    console.log('Total puzzles:', result.records[0].get('puzzleCount').toNumber());

    const themeResult = await session.run('MATCH (t:Theme) RETURN count(t) AS themeCount');
    console.log('Total themes:', themeResult.records[0].get('themeCount').toNumber());

    const posResult = await session.run('MATCH (pos:Position) RETURN count(pos) AS positionCount');
    console.log('Total positions:', posResult.records[0].get('positionCount').toNumber());

    // Sample a puzzle to verify data structure
    const sampleResult = await session.run('MATCH (p:Puzzle)-[:HAS_THEME]->(t:Theme) RETURN p.puzzleId, p.rating, collect(t.name) AS themes LIMIT 1');
    if (sampleResult.records.length > 0) {
      const record = sampleResult.records[0];
      console.log('\nSample puzzle:');
      console.log('  Puzzle ID:', record.get('p.puzzleId'));
      console.log('  Rating:', record.get('p.rating').toNumber());
      console.log('  Themes:', record.get('themes'));
    }

    console.log('\n✅ Database verification complete!');
  } finally {
    await session.close();
    await driver.close();
  }
})();
