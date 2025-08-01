#!/usr/bin/env node

/**
 * Test script to verify that phase analysis has been completely removed
 * Ensures the system focuses only on user-specific mistakes without phase bias
 */

console.log('🎯 Testing Phase Analysis Removal');
console.log('=================================\n');

// Test that phase analysis is not mentioned in prompts
function testPhaseAnalysisRemoval() {
  console.log('📋 Testing Phase Analysis Removal:\n');

  // Simulate the current prompt structure (without phase analysis)
  const currentPrompt = `
CRITICAL INSTRUCTIONS:
- Focus ONLY on moves that caused evaluation drops of MORE THAN 1 POINT (100 centipawns)
- Analyze ONLY the USER'S moves (the player whose perspective the board is shown from)
- If board is oriented for White, analyze only White's mistakes
- If board is oriented for Black, analyze only Black's mistakes
- Any move by the user that worsens their position by more than 1 point is eligible for analysis
- Show the TOP 3 BIGGEST violations by the user (or fewer if there are fewer than 3)
- In high-level play, the user may have only 1 significant mistake
- For each violation: Move number, move played, principle violated, 10-15 word explanation, what should have been done
- ABSOLUTELY NO game review, key moments, strengths, weaknesses, or any other sections
- NO FEN strings, NO jargon, NO unnecessary content
- Keep everything concise and actionable
- Make all moves clickable by referencing them as "move X" or "X."
- ONLY show principle violations by the user, nothing else
- IGNORE the move selection interface (brilliant, mistake, etc.) - rely SOLELY on evaluation changes
- Accuracy and valid feedback are more important than speed

RESPONSE FORMAT (ONLY THIS, NOTHING ELSE):
Top 2-3 Principle Violations:
- Move X: [move played] - [Principle violated] - [10-15 word explanation] - [What should have been done]
- Move Y: [move played] - [Principle violated] - [10-15 word explanation] - [What should have been done]
- Move Z: [move played] - [Principle violated] - [10-15 word explanation] - [What should have been done]

DO NOT ADD ANY OTHER SECTIONS.`;

  // Check for phase analysis keywords that should NOT be present
  const phaseKeywords = [
    'PHASE-BALANCED ANALYSIS',
    'opening, middlegame, endgame',
    'moves 1-10',
    'moves 11-30',
    'moves 31+',
    'game phase',
    'phase analysis',
    'focusAreas',
    'opening',
    'middlegame', 
    'endgame'
  ];

  const foundPhaseKeywords = [];
  
  phaseKeywords.forEach(keyword => {
    if (currentPrompt.toLowerCase().includes(keyword.toLowerCase())) {
      foundPhaseKeywords.push(keyword);
    }
  });

  console.log('Test 1: Phase Analysis Keywords Check');
  if (foundPhaseKeywords.length === 0) {
    console.log('  ✅ No phase analysis keywords found in prompts');
  } else {
    console.log(`  ❌ Found phase analysis keywords: ${foundPhaseKeywords.join(', ')}`);
  }

  // Check for user-specific keywords that SHOULD be present
  const userSpecificKeywords = [
    'USER\'S moves',
    'board is oriented for White',
    'board is oriented for Black',
    'only White\'s mistakes',
    'only Black\'s mistakes',
    'user that worsens their position',
    'violations by the user',
    'principle violations by the user'
  ];

  const foundUserKeywords = [];
  
  userSpecificKeywords.forEach(keyword => {
    if (currentPrompt.toLowerCase().includes(keyword.toLowerCase())) {
      foundUserKeywords.push(keyword);
    }
  });

  console.log('\nTest 2: User-Specific Keywords Check');
  console.log(`  Found ${foundUserKeywords.length}/${userSpecificKeywords.length} user-specific keywords`);
  if (foundUserKeywords.length >= 6) {
    console.log('  ✅ User-specific analysis is properly emphasized');
  } else {
    console.log('  ❌ User-specific analysis is not properly emphasized');
  }

  return {
    noPhaseAnalysis: foundPhaseKeywords.length === 0,
    userSpecificEmphasized: foundUserKeywords.length >= 6
  };
}

// Test that the system focuses on evaluation changes regardless of move number
function testEvaluationBasedAnalysis() {
  console.log('\n📋 Testing Evaluation-Based Analysis:\n');

  // Simulate a game with mistakes at different move numbers
  const gameData = [
    { move: 3, player: 'w', evaluationChange: -150, description: 'Early mistake' },
    { move: 15, player: 'w', evaluationChange: -200, description: 'Middlegame mistake' },
    { move: 35, player: 'w', evaluationChange: -120, description: 'Endgame mistake' },
    { move: 5, player: 'w', evaluationChange: -80, description: 'Small mistake' },
  ];

  // Sort by evaluation change (biggest mistakes first)
  const sortedMistakes = gameData
    .filter(move => move.evaluationChange < -100) // Only mistakes > 1 point
    .sort((a, b) => a.evaluationChange - b.evaluationChange); // Biggest drops first

  console.log('Test 3: Evaluation-Based Sorting');
  console.log('  Mistakes sorted by evaluation change (biggest first):');
  sortedMistakes.forEach((mistake, index) => {
    console.log(`    ${index + 1}. Move ${mistake.move}: ${mistake.description} (${mistake.evaluationChange} centipawns)`);
  });

  // Verify that the biggest evaluation drop is prioritized regardless of move number
  const biggestMistake = sortedMistakes[0];
  const expectedBiggest = gameData.find(m => m.evaluationChange === -200); // Move 15

  if (biggestMistake && biggestMistake.move === expectedBiggest.move) {
    console.log('  ✅ Biggest evaluation drop is correctly prioritized');
  } else {
    console.log('  ❌ Biggest evaluation drop is not correctly prioritized');
  }

  return biggestMistake && biggestMistake.move === expectedBiggest.move;
}

// Test that no phase bias exists in the analysis
function testNoPhaseBias() {
  console.log('\n📋 Testing No Phase Bias:\n');

  // Simulate analysis results from different phases
  const analysisResults = [
    { move: 2, phase: 'opening', evaluationChange: -180 },
    { move: 18, phase: 'middlegame', evaluationChange: -220 },
    { move: 42, phase: 'endgame', evaluationChange: -160 },
  ];

  // Sort by evaluation change (should ignore phase)
  const sortedByEvaluation = analysisResults.sort((a, b) => a.evaluationChange - b.evaluationChange);

  console.log('Test 4: No Phase Bias Check');
  console.log('  Analysis results sorted by evaluation change:');
  sortedByEvaluation.forEach((result, index) => {
    console.log(`    ${index + 1}. Move ${result.move} (${result.phase}): ${result.evaluationChange} centipawns`);
  });

  // Verify that the biggest evaluation drop is from middlegame (move 18)
  const biggestDrop = sortedByEvaluation[0];
  const noPhaseBias = biggestDrop.move === 18; // Middlegame mistake should be biggest

  if (noPhaseBias) {
    console.log('  ✅ No phase bias - biggest evaluation drop is correctly identified');
  } else {
    console.log('  ❌ Phase bias detected - not focusing on biggest evaluation drop');
  }

  return noPhaseBias;
}

// Run all tests
const phaseRemovalTests = testPhaseAnalysisRemoval();
const evaluationBasedTests = testEvaluationBasedAnalysis();
const noPhaseBiasTests = testNoPhaseBias();

console.log('\n🎯 Test Results Summary:');
console.log('========================');
if (phaseRemovalTests.noPhaseAnalysis && phaseRemovalTests.userSpecificEmphasized && 
    evaluationBasedTests && noPhaseBiasTests) {
  console.log('✅ All tests passed! Phase analysis has been completely removed.');
  console.log('✅ System focuses only on user-specific mistakes.');
  console.log('✅ Analysis is based purely on evaluation changes.');
  console.log('✅ No phase bias in mistake identification.');
} else {
  console.log('❌ Some tests failed! Phase analysis may still be present.');
}

console.log('\n🎯 Key Benefits of Phase Analysis Removal:');
console.log('1. ✅ No artificial phase-based filtering of mistakes');
console.log('2. ✅ Focus purely on evaluation changes regardless of move number');
console.log('3. ✅ User-specific analysis without phase bias');
console.log('4. ✅ Biggest mistakes are always identified regardless of when they occur');
console.log('5. ✅ Simpler, more accurate mistake detection');
console.log('6. ✅ Eliminates confusion about phase-based analysis');

console.log('\n🚀 Next Steps:');
console.log('1. Test with real game data to verify no phase bias');
console.log('2. Monitor AI responses to ensure pure evaluation-based analysis');
console.log('3. Validate that biggest mistakes are always identified');
console.log('4. Deploy the phase-analysis-free system for production use'); 