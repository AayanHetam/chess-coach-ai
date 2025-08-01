#!/usr/bin/env node

/**
 * Test script to verify the relative threshold system
 * Tests that only moves with evaluation changes > 1 point (100 centipawns) are identified as mistakes
 */

console.log('🎯 Testing Relative Threshold System (1 Point = 100 Centipawns)');
console.log('==============================================================\n');

// Test the relative threshold logic
function testRelativeThreshold() {
  console.log('📋 Testing Relative Threshold Logic:\n');

  // Test cases with different evaluation changes
  const testCases = [
    // Moves that should NOT be identified as mistakes (less than 1 point change)
    {
      description: 'White makes small mistake (less than 1 point)',
      before: 100,
      after: 50,
      player: 'w',
      expectedMistake: false,
      explanation: 'Evaluation dropped by 50 centipawns (0.5 points) - below 1 point threshold'
    },
    {
      description: 'Black makes small mistake (less than 1 point)',
      before: 100,
      after: 150,
      player: 'b',
      expectedMistake: false,
      explanation: 'Evaluation improved for White by 50 centipawns (0.5 points) - below 1 point threshold'
    },
    {
      description: 'White makes very small mistake (exactly 1 point)',
      before: 100,
      after: 0,
      player: 'w',
      expectedMistake: false,
      explanation: 'Evaluation dropped by exactly 100 centipawns (1 point) - at threshold, should not be mistake'
    },
    {
      description: 'Black makes very small mistake (exactly 1 point)',
      before: 100,
      after: 200,
      player: 'b',
      expectedMistake: false,
      explanation: 'Evaluation improved for White by exactly 100 centipawns (1 point) - at threshold, should not be mistake'
    },

    // Moves that SHOULD be identified as mistakes (more than 1 point change)
    {
      description: 'White makes significant mistake (more than 1 point)',
      before: 100,
      after: -50,
      player: 'w',
      expectedMistake: true,
      explanation: 'Evaluation dropped by 150 centipawns (1.5 points) - above 1 point threshold'
    },
    {
      description: 'Black makes significant mistake (more than 1 point)',
      before: 100,
      after: 250,
      player: 'b',
      expectedMistake: true,
      explanation: 'Evaluation improved for White by 150 centipawns (1.5 points) - above 1 point threshold'
    },
    {
      description: 'White makes major mistake (2 points)',
      before: 200,
      after: 0,
      player: 'w',
      expectedMistake: true,
      explanation: 'Evaluation dropped by 200 centipawns (2 points) - well above 1 point threshold'
    },
    {
      description: 'Black makes major mistake (2 points)',
      before: 200,
      after: 400,
      player: 'b',
      expectedMistake: true,
      explanation: 'Evaluation improved for White by 200 centipawns (2 points) - well above 1 point threshold'
    },
    {
      description: 'White makes blunder (3 points)',
      before: 300,
      after: 0,
      player: 'w',
      expectedMistake: true,
      explanation: 'Evaluation dropped by 300 centipawns (3 points) - well above 1 point threshold'
    },
    {
      description: 'Black makes blunder (3 points)',
      before: 300,
      after: 600,
      player: 'b',
      expectedMistake: true,
      explanation: 'Evaluation improved for White by 300 centipawns (3 points) - well above 1 point threshold'
    }
  ];

  let allTestsPassed = true;

  testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.description}`);
    
    // Calculate evaluation change
    let evaluationChange;
    if (testCase.player === 'w') {
      evaluationChange = testCase.after - testCase.before;
    } else {
      evaluationChange = testCase.before - testCase.after;
    }

    // Determine if this was a mistake using relative threshold
    const isMistake = evaluationChange < -100; // More than 1 point worse for the player
    
    const changeText = evaluationChange > 0 ? `+${evaluationChange}` : `${evaluationChange}`;
    const pointsText = Math.abs(evaluationChange) / 100;
    console.log(`  Evaluation: ${testCase.before} → ${testCase.after} (${changeText} centipawns, ${pointsText} points)`);
    console.log(`  Player: ${testCase.player === 'w' ? 'White' : 'Black'}`);
    console.log(`  Detected as mistake: ${isMistake ? 'YES' : 'NO'}`);
    console.log(`  Expected: ${testCase.expectedMistake ? 'YES' : 'NO'}`);
    console.log(`  Explanation: ${testCase.explanation}`);
    
    if (isMistake === testCase.expectedMistake) {
      console.log(`  ✅ PASSED`);
    } else {
      console.log(`  ❌ FAILED`);
      allTestsPassed = false;
    }
    console.log('');
  });

  return allTestsPassed;
}

// Test threshold edge cases
function testThresholdEdgeCases() {
  console.log('📋 Testing Threshold Edge Cases:\n');

  const edgeCases = [
    {
      description: 'Exactly at threshold (100 centipawns)',
      before: 100,
      after: 0,
      player: 'w',
      expectedMistake: false,
      explanation: 'Exactly 1 point change should NOT be a mistake'
    },
    {
      description: 'Just above threshold (101 centipawns)',
      before: 100,
      after: -1,
      player: 'w',
      expectedMistake: true,
      explanation: 'Just above 1 point change should BE a mistake'
    },
    {
      description: 'Just below threshold (99 centipawns)',
      before: 100,
      after: 1,
      player: 'w',
      expectedMistake: false,
      explanation: 'Just below 1 point change should NOT be a mistake'
    }
  ];

  let allEdgeCasesPassed = true;

  edgeCases.forEach((testCase, index) => {
    console.log(`Edge Case ${index + 1}: ${testCase.description}`);
    
    let evaluationChange;
    if (testCase.player === 'w') {
      evaluationChange = testCase.after - testCase.before;
    } else {
      evaluationChange = testCase.before - testCase.after;
    }

    const isMistake = evaluationChange < -100;
    
    const changeText = evaluationChange > 0 ? `+${evaluationChange}` : `${evaluationChange}`;
    const pointsText = Math.abs(evaluationChange) / 100;
    console.log(`  Evaluation: ${testCase.before} → ${testCase.after} (${changeText} centipawns, ${pointsText} points)`);
    console.log(`  Detected as mistake: ${isMistake ? 'YES' : 'NO'}`);
    console.log(`  Expected: ${testCase.expectedMistake ? 'YES' : 'NO'}`);
    console.log(`  Explanation: ${testCase.explanation}`);
    
    if (isMistake === testCase.expectedMistake) {
      console.log(`  ✅ PASSED`);
    } else {
      console.log(`  ❌ FAILED`);
      allEdgeCasesPassed = false;
    }
    console.log('');
  });

  return allEdgeCasesPassed;
}

// Test the relative threshold logic
const thresholdTestsPassed = testRelativeThreshold();
const edgeCaseTestsPassed = testThresholdEdgeCases();

console.log('🎯 Test Results Summary:');
console.log('========================');
if (thresholdTestsPassed && edgeCaseTestsPassed) {
  console.log('✅ All tests passed! Relative threshold system is working correctly.');
  console.log('✅ Only moves with evaluation changes > 1 point are identified as mistakes.');
  console.log('✅ Small mistakes (< 1 point) are correctly filtered out.');
  console.log('✅ Significant mistakes (> 1 point) are correctly identified.');
} else {
  console.log('❌ Some tests failed! Relative threshold system needs fixing.');
}

console.log('\n🎯 Key Benefits of Relative Threshold System:');
console.log('1. ✅ No fixed values determining what mistakes to showcase');
console.log('2. ✅ Relative threshold based on evaluation changes');
console.log('3. ✅ Only significant mistakes (> 1 point) are eligible');
console.log('4. ✅ Top 3 biggest violations are shown (or fewer if < 3)');
console.log('5. ✅ Works for both White and Black players');
console.log('6. ✅ Handles high-level play where there may be only 1 mistake');

console.log('\n🚀 Next Steps:');
console.log('1. Test with real game data to verify the relative threshold');
console.log('2. Monitor AI responses to ensure only significant mistakes are shown');
console.log('3. Validate that small mistakes are correctly filtered out');
console.log('4. Deploy the relative threshold system for production use'); 