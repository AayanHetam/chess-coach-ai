import { analyzeGameSurprises } from './surpriseAnalyzer';

/**
 * Test function to verify surprise analyzer integration
 */
export async function testSurpriseAnalyzer() {
  console.log('🧪 Testing Chess Surprise Analysis Integration...');
  
  // Test with a simple game
  const testGame = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6'];
  const userColor: 'white' | 'black' = 'white';
  
  try {
    const analysis = await analyzeGameSurprises(testGame, userColor);
    
    console.log('✅ Surprise Analysis Results:');
    console.log(`Overall Assessment: ${analysis.overallAssessment}`);
    console.log(`Key Insights: ${analysis.keyInsights.length}`);
    
    analysis.moves.forEach(move => {
      if (move.surpriseScore > 0.5) {
        console.log(`Move ${move.moveNumber}. ${move.move}: Surprise Score = ${move.surpriseScore.toFixed(2)}, Purpose = ${move.movePurpose}`);
      }
    });
    
    return true;
  } catch (error) {
    console.error('❌ Surprise Analysis Test Failed:', error);
    return false;
  }
}

/**
 * Test with a specific problematic move (like 10... c5)
 */
export async function testSpecificMove() {
  console.log('🧪 Testing Specific Move Analysis (10... c5)...');
  
  // Create a position where c5 would be a mistake
  const testGame = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6', 'd3', 'O-O', 'Nc3', 'c5'];
  const userColor: 'white' | 'black' = 'black';
  
  try {
    const analysis = await analyzeGameSurprises(testGame, userColor);
    
    const c5Move = analysis.moves.find(m => m.move === 'c5');
    if (c5Move) {
      console.log('✅ c5 Move Analysis:');
      console.log(`Surprise Score: ${c5Move.surpriseScore.toFixed(2)}`);
      console.log(`Purpose: ${c5Move.movePurpose}`);
      console.log(`Explanation: ${c5Move.explanation}`);
      console.log(`Severity: ${c5Move.severity}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Specific Move Test Failed:', error);
    return false;
  }
}

// Export for use in development
if (typeof window === 'undefined') {
  // Node.js environment
  console.log('Surprise Analyzer test module loaded');
} 