/**
 * Test the 3 mistakes from DEMO_GAME.pgn to verify puzzle recommendations
 */

const testCases = [
  {
    name: "Move 13 - PIN Mistake",
    fen: "r2q1rk1/ppp2ppp/2n5/3n3b/2BP4/1Q1N1N1P/PP1N1PP1/R3R1K1 w - - 5 13",
    themes: ["pin"],
    expectedThemes: ["Pin", "Absolute Pin"],
  },
  {
    name: "Move 16 - KNIGHT FORK Mistake",
    fen: "r4rk1/ppp2ppp/2n5/3q3b/2BP4/1Q3N1P/PP3PP1/R3R1K1 w - - 1 16",
    themes: ["knight-fork", "fork"],
    expectedThemes: ["Knight Fork", "Fork"],
  },
  {
    name: "Move 21 - BACK RANK Mistake",
    fen: "4r1k1/ppp2ppp/2n3b1/8/3P4/3B1N1P/PP3qP1/R5K1 w - - 0 21",
    themes: ["back-rank-mate", "mate"],
    expectedThemes: ["Back Rank Mate", "Mate"],
  },
];

const HOST = process.argv.find(a => a.startsWith('--host='))?.split('=')[1] || 'http://localhost:3000';

console.log('🧪 Testing Demo Game Mistakes\n');
console.log(`   Target: ${HOST}/api/similar-puzzles\n`);

for (const test of testCases) {
  try {
    const response = await fetch(`${HOST}/api/similar-puzzles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        themes: test.themes,
        fen: test.fen,
        userRating: 1500,
        limit: 5,
      }),
    });

    if (!response.ok) {
      console.log(`  [${test.name}] ❌ FAIL - HTTP ${response.status}`);
      continue;
    }

    const data = await response.json();
    const puzzles = data.puzzles || [];

    if (puzzles.length === 0) {
      console.log(`  [${test.name}] ❌ FAIL - No puzzles returned`);
      continue;
    }

    // Check if puzzles have the expected themes
    const hasCorrectTheme = puzzles.every(p =>
      test.expectedThemes.some(expectedTheme =>
        p.themes.some(t => t.toLowerCase().includes(expectedTheme.toLowerCase()))
      )
    );

    const avgFenSim = (puzzles.reduce((sum, p) => sum + (p.fenSimilarity || 0), 0) / puzzles.length).toFixed(2);

    if (hasCorrectTheme) {
      console.log(`  [${test.name}] ✅ PASS`);
      console.log(`     Puzzles: ${puzzles.length}`);
      console.log(`     Avg FEN similarity: ${avgFenSim}`);
      console.log(`     Sample themes: ${puzzles[0].themes.slice(0, 3).join(', ')}`);
    } else {
      console.log(`  [${test.name}] ⚠️  WARN - Wrong themes`);
      console.log(`     Expected: ${test.expectedThemes.join(' or ')}`);
      console.log(`     Got: ${puzzles[0].themes.slice(0, 3).join(', ')}`);
    }
  } catch (error) {
    console.log(`  [${test.name}] ❌ ERROR - ${error.message}`);
  }
  console.log('');
}

console.log('Done! If all 3 passed, the demo game will work perfectly in the UI.\n');
