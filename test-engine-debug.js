// Test script to debug engine integration
const { Chess } = require('chess.js');

console.log('🧪 Testing Engine Integration Debug...');

// Test with a simple game that should have violations
const testGame = [
  'e4', 'e5',    // 1. e4 e5
  'Nf3', 'Nc6',  // 2. Nf3 Nc6  
  'Bc4', 'Nf6',  // 3. Bc4 Nf6
  'd3', 'd6',    // 4. d3 d6
  'O-O', 'Be7',  // 5. O-O Be7
  'Re1', 'O-O',  // 6. Re1 O-O
  'c3', 'a6',    // 7. c3 a6 (this should be a bad move - allows Qb3)
  'Qb3', 'Na5',  // 8. Qb3 Na5 (this should be a good move)
  'Qa4', 'Nxc4'  // 9. Qa4 Nxc4
];

console.log('📊 Test game moves:', testGame);
console.log('🎯 Expected: Move 7... a6 should be flagged as bad (allows Qb3)');

// Test the chess.js functionality
const chess = new Chess();
for (let i = 0; i < testGame.length; i++) {
  const move = chess.move(testGame[i]);
  if (!move) {
    console.error(`❌ Invalid move at index ${i}: ${testGame[i]}`);
    console.log('Current position:', chess.fen());
    console.log('Legal moves:', chess.moves());
    break;
  }
  console.log(`Move ${Math.floor(i/2) + 1}. ${testGame[i]}: ${chess.fen()}`);
}

console.log('✅ Chess.js test completed');
console.log('🏁 Now test the actual application at http://localhost:3000');
console.log('📝 Load this game and ask "analyze my game" to see the debug output'); 