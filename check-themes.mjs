import neo4j from 'neo4j-driver';

const uri = 'bolt+s://f90119e8.databases.neo4j.io';
const user = 'f90119e8';
const password = 'p7A6hemmP0Qnbi4ldGiyRgqRaJMbfxLXFlpHaygH3f8';

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

(async () => {
  const session = driver.session();
  try {
    // Get all themes with puzzle counts
    const result = await session.run(`
      MATCH (t:Theme)<-[:HAS_THEME]-(p:Puzzle)
      RETURN t.name AS theme, count(p) AS puzzleCount
      ORDER BY puzzleCount DESC
      LIMIT 30
    `);

    console.log('Top 30 themes in database:\n');
    result.records.forEach(r => {
      console.log(`  ${r.get('theme').padEnd(30)} ${r.get('puzzleCount').toString()} puzzles`);
    });

    // Check for specific tactical themes
    const tacticalThemes = ['fork', 'pin', 'skewer', 'discovered-attack', 'back-rank', 'deflection'];
    console.log('\n\nChecking for common tactical themes:');
    for (const theme of tacticalThemes) {
      const res = await session.run(
        'MATCH (t:Theme)<-[:HAS_THEME]-(p:Puzzle) WHERE toLower(t.name) CONTAINS $theme OR toLower(t.id) CONTAINS $theme RETURN count(p) AS count',
        { theme: theme.toLowerCase() }
      );
      console.log(`  ${theme}: ${res.records[0].get('count').toString()} puzzles`);
    }
  } finally {
    await session.close();
    await driver.close();
  }
})();
