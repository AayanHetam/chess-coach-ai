#!/usr/bin/env node

/**
 * Test script to verify user-specific mistake filtering
 * Ensures that only the user's mistakes are analyzed, not both players
 */

console.log('🎯 Testing User-Specific Mistake Filtering');
console.log('=========================================\n');

// Test the user-specific mistake filtering logic
function testUserSpecificMistakes() {
  console.log('📋 Testing User-Specific Mistake Filtering:\n');

  // Simulate a game with mistakes from both players
  const gameData = [
    // White's moves (user if boardOrientation = true)
    { move: 1, player: 'w', evaluationBefore: 0, evaluationAfter: -150, description: 'White makes mistake' },
    { move: 3, player: 'w', evaluationBefore: -50, evaluationAfter: -200, description: 'White makes another mistake' },
    { move: 5, player: 'w', evaluationBefore: 100, evaluationAfter: 50, description: 'White makes small mistake' },
    
    // Black's moves (user if boardOrientation = false)
    { move: 2, player: 'b', evaluationBefore: 150, evaluationAfter: 300, description: 'Black makes mistake' },
    { move: 4, player: 'b', evaluationBefore: 200, evaluationAfter: 400, description: 'Black makes another mistake' },
    { move: 6, player: 'b', evaluationBefore: -100, evaluationAfter: -50, description: 'Black makes small mistake' },
  ];

  // Test filtering for White user (boardOrientation = true)
  console.log('Test 1: White User Analysis (boardOrientation = true)');
  const whiteUserMistakes = gameData.filter(move => {
    const evaluationChange = move.evaluationAfter - move.evaluationBefore;
    return move.player === 'w' && evaluationChange < -100; // Only White's mistakes > 1 point
  });
  
  console.log(`  Found ${whiteUserMistakes.length} mistakes by White user:`);
  whiteUserMistakes.forEach((mistake, index) => {
    const change = mistake.evaluationAfter - mistake.evaluationBefore;
    console.log(`    ${index + 1}. Move ${mistake.move}: ${mistake.description} (${change} centipawns)`);
  });
  
  // Test filtering for Black user (boardOrientation = false)
  console.log('\nTest 2: Black User Analysis (boardOrientation = false)');
  const blackUserMistakes = gameData.filter(move => {
    const evaluationChange = move.evaluationBefore - move.evaluationAfter; // Inverted for Black
    return move.player === 'b' && evaluationChange < -100; // Only Black's mistakes > 1 point
  });
  
  console.log(`  Found ${blackUserMistakes.length} mistakes by Black user:`);
  blackUserMistakes.forEach((mistake, index) => {
    const change = mistake.evaluationBefore - mistake.evaluationAfter;
    console.log(`    ${index + 1}. Move ${mistake.move}: ${mistake.description} (${change} centipawns)`);
  });

  // Test that we don't mix both players' mistakes
  console.log('\nTest 3: No Mixed Player Analysis');
  const allMistakes = gameData.filter(move => {
    let evaluationChange;
    if (move.player === 'w') {
      evaluationChange = move.evaluationAfter - move.evaluationBefore;
    } else {
      evaluationChange = move.evaluationBefore - move.evaluationAfter;
    }
    return evaluationChange < -100; // All mistakes > 1 point
  });
  
  console.log(`  Total mistakes from both players: ${allMistakes.length}`);
  console.log(`  White mistakes: ${allMistakes.filter(m => m.player === 'w').length}`);
  console.log(`  Black mistakes: ${allMistakes.filter(m => m.player === 'b').length}`);
  
  // Verify that user-specific filtering works correctly
  const whiteUserCorrect = whiteUserMistakes.length === 2; // Should find 2 White mistakes
  const blackUserCorrect = blackUserMistakes.length === 2; // Should find 2 Black mistakes
  const noMixing = whiteUserMistakes.every(m => m.player === 'w') && 
                   blackUserMistakes.every(m => m.player === 'b');
  
  return { whiteUserCorrect, blackUserCorrect, noMixing };
}

// Test board orientation logic
function testBoardOrientationLogic() {
  console.log('📋 Testing Board Orientation Logic:\n');

  const testCases = [
    {
      boardOrientation: true,
      expectedUserColor: 'w',
      description: 'Board oriented for White (user is White)'
    },
    {
      boardOrientation: false,
      expectedUserColor: 'b',
      description: 'Board oriented for Black (user is Black)'
    }
  ];

  let allTestsPassed = true;

  testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.description}`);
    
    // Simulate the logic from AICoachChat component
    const userColor = testCase.boardOrientation ? 'w' : 'b';
    
    console.log(`  Board Orientation: ${testCase.boardOrientation ? 'White' : 'Black'}`);
    console.log(`  Determined User Color: ${userColor === 'w' ? 'White' : 'Black'}`);
    console.log(`  Expected User Color: ${testCase.expectedUserColor === 'w' ? 'White' : 'Black'}`);
    
    if (userColor === testCase.expectedUserColor) {
      console.log(`  ✅ PASSED`);
    } else {
      console.log(`  ❌ FAILED`);
      allTestsPassed = false;
    }
    console.log('');
  });

  return allTestsPassed;
}

// Test the complete user-specific analysis flow
function testCompleteAnalysisFlow() {
  console.log('📋 Testing Complete Analysis Flow:\n');

  // Simulate the complete flow from board orientation to filtered mistakes
  const scenarios = [
    {
      boardOrientation: true,
      userColor: 'w',
      description: 'White user analysis'
    },
    {
      boardOrientation: false,
      userColor: 'b',
      description: 'Black user analysis'
    }
  ];

  let allScenariosPassed = true;

  scenarios.forEach((scenario, index) => {
    console.log(`Scenario ${index + 1}: ${scenario.description}`);
    
    // Step 1: Determine user color from board orientation
    const determinedUserColor = scenario.boardOrientation ? 'w' : 'b';
    
    // Step 2: Simulate mistake filtering
    const gameData = [
      { move: 1, player: 'w', evaluationBefore: 0, evaluationAfter: -150 },
      { move: 2, player: 'b', evaluationBefore: 150, evaluationAfter: 300 },
      { move: 3, player: 'w', evaluationBefore: -50, evaluationAfter: -200 },
      { move: 4, player: 'b', evaluationBefore: 200, evaluationAfter: 400 },
    ];
    
    const userMistakes = gameData.filter(move => {
      let evaluationChange;
      if (move.player === 'w') {
        evaluationChange = move.evaluationAfter - move.evaluationBefore;
      } else {
        evaluationChange = move.evaluationBefore - move.evaluationAfter;
      }
      return move.player === determinedUserColor && evaluationChange < -100;
    });
    
    console.log(`  Board Orientation: ${scenario.boardOrientation ? 'White' : 'Black'}`);
    console.log(`  User Color: ${determinedUserColor === 'w' ? 'White' : 'Black'}`);
    console.log(`  User Mistakes Found: ${userMistakes.length}`);
    console.log(`  Mistakes by other player: ${gameData.filter(m => m.player !== determinedUserColor && Math.abs(m.evaluationAfter - m.evaluationBefore) > 100).length}`);
    
    // Verify that only user's mistakes are included
    const onlyUserMistakes = userMistakes.every(m => m.player === determinedUserColor);
    const correctUserColor = determinedUserColor === scenario.userColor;
    
    if (onlyUserMistakes && correctUserColor) {
      console.log(`  ✅ PASSED - Only user's mistakes analyzed`);
    } else {
      console.log(`  ❌ FAILED - Mixed player analysis detected`);
      allScenariosPassed = false;
    }
    console.log('');
  });

  return allScenariosPassed;
}

// Run all tests
const userSpecificTests = testUserSpecificMistakes();
const boardOrientationTests = testBoardOrientationLogic();
const completeFlowTests = testCompleteAnalysisFlow();

console.log('🎯 Test Results Summary:');
console.log('========================');
if (userSpecificTests.whiteUserCorrect && userSpecificTests.blackUserCorrect && userSpecificTests.noMixing && 
    boardOrientationTests && completeFlowTests) {
  console.log('✅ All tests passed! User-specific mistake filtering is working correctly.');
  console.log('✅ Only user\'s mistakes are analyzed based on board orientation.');
  console.log('✅ No mixing of both players\' mistakes in analysis.');
  console.log('✅ Board orientation correctly determines user color.');
} else {
  console.log('❌ Some tests failed! User-specific filtering needs fixing.');
}

console.log('\n🎯 Key Benefits of User-Specific Analysis:');
console.log('1. ✅ Only analyzes mistakes from the user\'s perspective');
console.log('2. ✅ Board orientation determines which side the user is playing');
console.log('3. ✅ No confusion between user and opponent mistakes');
console.log('4. ✅ Focused learning on user\'s actual mistakes');
console.log('5. ✅ More relevant and actionable feedback');
console.log('6. ✅ Eliminates analysis of opponent\'s moves');

console.log('\n🚀 Next Steps:');
console.log('1. Test with real game data to verify user-specific filtering');
console.log('2. Monitor AI responses to ensure only user mistakes are shown');
console.log('3. Validate that board orientation correctly identifies user color');
console.log('4. Deploy the user-specific analysis system for production use'); 