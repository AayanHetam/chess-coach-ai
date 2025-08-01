// Simple test to verify engine integration
const { Chess } = require('chess.js');

console.log('🧪 Testing Engine Integration...');

// Test basic chess.js functionality
const chess = new Chess();
console.log('✅ Chess.js working:', chess.fen());

// Test if we can import our engine service
try {
  const { getSurpriseEngineService } = require('./src/lib/engine/surpriseEngineService.ts');
  console.log('✅ Engine service import successful');
  
  // Test engine initialization
  const engineService = getSurpriseEngineService();
  console.log('✅ Engine service instance created');
  
  // Test with a simple position
  const testPosition = new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  console.log('✅ Test position created:', testPosition.fen());
  
} catch (error) {
  console.error('❌ Engine integration test failed:', error.message);
}

console.log('🏁 Test completed'); 