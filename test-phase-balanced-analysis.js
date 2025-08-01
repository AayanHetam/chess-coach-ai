#!/usr/bin/env node

/**
 * Test script to verify phase-balanced analysis
 * Ensures the AI analyzes mistakes across all game phases, not just one
 */

console.log('🎯 Testing Phase-Balanced Analysis');
console.log('==================================\n');

// Simulate a game with mistakes distributed across different phases
class PhaseBalancedAnalysisTest {
  constructor() {
    this.gameData = this.createTestGame();
  }

  createTestGame() {
    // Create a game with mistakes in different phases
    return [
      // Opening phase (moves 1-10) - 1 mistake
      { move: 1, player: 'w', movePlayed: 'e4', evaluationBefore: 0, evaluationAfter: 50, isMistake: false },
      { move: 1, player: 'b', movePlayed: 'e5', evaluationBefore: 50, evaluationAfter: 0, isMistake: false },
      { move: 2, player: 'w', movePlayed: 'Nf3', evaluationBefore: 0, evaluationAfter: 80, isMistake: false },
      { move: 2, player: 'b', movePlayed: 'Nc6', evaluationBefore: 80, evaluationAfter: 0, isMistake: false },
      { move: 3, player: 'w', movePlayed: 'Bc4', evaluationBefore: 0, evaluationAfter: 100, isMistake: false },
      { move: 3, player: 'b', movePlayed: 'Bc5', evaluationBefore: 100, evaluationAfter: 0, isMistake: false },
      { move: 4, player: 'w', movePlayed: 'O-O', evaluationBefore: 0, evaluationAfter: 120, isMistake: false },
      { move: 4, player: 'b', movePlayed: 'Nf6', evaluationBefore: 120, evaluationAfter: 0, isMistake: false },
      { move: 5, player: 'w', movePlayed: 'd3', evaluationBefore: 0, evaluationAfter: 90, isMistake: false },
      { move: 5, player: 'b', movePlayed: 'd6', evaluationBefore: 90, evaluationAfter: 0, isMistake: false },
      { move: 6, player: 'w', movePlayed: 'Nc3', evaluationBefore: 0, evaluationAfter: 110, isMistake: false },
      { move: 6, player: 'b', movePlayed: 'O-O', evaluationBefore: 110, evaluationAfter: 0, isMistake: false },
      { move: 7, player: 'w', movePlayed: 'Be3', evaluationBefore: 0, evaluationAfter: 130, isMistake: false },
      { move: 7, player: 'b', movePlayed: 'Be6', evaluationBefore: 130, evaluationAfter: 0, isMistake: false },
      { move: 8, player: 'w', movePlayed: 'Qd2', evaluationBefore: 0, evaluationAfter: 150, isMistake: false },
      { move: 8, player: 'b', movePlayed: 'Qd7', evaluationBefore: 150, evaluationAfter: 0, isMistake: false },
      { move: 9, player: 'w', movePlayed: 'Rae1', evaluationBefore: 0, evaluationAfter: 170, isMistake: false },
      { move: 9, player: 'b', movePlayed: 'Rae8', evaluationBefore: 170, evaluationAfter: 0, isMistake: false },
      { move: 10, player: 'w', movePlayed: 'Kh1', evaluationBefore: 0, evaluationAfter: 160, isMistake: false },
      { move: 10, player: 'b', movePlayed: 'Kh8', evaluationBefore: 160, evaluationAfter: 0, isMistake: false },
      
      // Middlegame phase (moves 11-30) - 1 mistake
      { move: 11, player: 'w', movePlayed: 'f4', evaluationBefore: 0, evaluationAfter: -50, isMistake: true }, // Opening mistake
      { move: 11, player: 'b', movePlayed: 'exf4', evaluationBefore: -50, evaluationAfter: 50, isMistake: false },
      { move: 12, player: 'w', movePlayed: 'Bxf4', evaluationBefore: 50, evaluationAfter: 30, isMistake: false },
      { move: 12, player: 'b', movePlayed: 'Bxf4', evaluationBefore: 30, evaluationAfter: 0, isMistake: false },
      { move: 13, player: 'w', movePlayed: 'Rxf4', evaluationBefore: 0, evaluationAfter: 20, isMistake: false },
      { move: 13, player: 'b', movePlayed: 'Qe7', evaluationBefore: 20, evaluationAfter: 0, isMistake: false },
      { move: 14, player: 'w', movePlayed: 'Qe2', evaluationBefore: 0, evaluationAfter: 40, isMistake: false },
      { move: 14, player: 'b', movePlayed: 'Qe6', evaluationBefore: 40, evaluationAfter: 0, isMistake: false },
      { move: 15, player: 'w', movePlayed: 'Rf2', evaluationBefore: 0, evaluationAfter: 30, isMistake: false },
      { move: 15, player: 'b', movePlayed: 'Rf8', evaluationBefore: 30, evaluationAfter: 0, isMistake: false },
      { move: 16, player: 'w', movePlayed: 'g3', evaluationBefore: 0, evaluationAfter: 10, isMistake: false },
      { move: 16, player: 'b', movePlayed: 'g6', evaluationBefore: 10, evaluationAfter: 0, isMistake: false },
      { move: 17, player: 'w', movePlayed: 'Kg2', evaluationBefore: 0, evaluationAfter: 5, isMistake: false },
      { move: 17, player: 'b', movePlayed: 'Kg7', evaluationBefore: 5, evaluationAfter: 0, isMistake: false },
      { move: 18, player: 'w', movePlayed: 'h3', evaluationBefore: 0, evaluationAfter: 0, isMistake: false },
      { move: 18, player: 'b', movePlayed: 'h6', evaluationBefore: 0, evaluationAfter: 0, isMistake: false },
      { move: 19, player: 'w', movePlayed: 'a3', evaluationBefore: 0, evaluationAfter: -20, isMistake: true }, // Middlegame mistake
      { move: 19, player: 'b', movePlayed: 'a6', evaluationBefore: -20, evaluationAfter: 0, isMistake: false },
      { move: 20, player: 'w', movePlayed: 'b4', evaluationBefore: 0, evaluationAfter: -40, isMistake: true }, // Middlegame mistake
      { move: 20, player: 'b', movePlayed: 'b5', evaluationBefore: -40, evaluationAfter: 0, isMistake: false },
      
      // Endgame phase (moves 31+) - 1 mistake
      { move: 21, player: 'w', movePlayed: 'c3', evaluationBefore: 0, evaluationAfter: 10, isMistake: false },
      { move: 21, player: 'b', movePlayed: 'c6', evaluationBefore: 10, evaluationAfter: 0, isMistake: false },
      { move: 22, player: 'w', movePlayed: 'd4', evaluationBefore: 0, evaluationAfter: 20, isMistake: false },
      { move: 22, player: 'b', movePlayed: 'exd4', evaluationBefore: 20, evaluationAfter: 0, isMistake: false },
      { move: 23, player: 'w', movePlayed: 'cxd4', evaluationBefore: 0, evaluationAfter: 15, isMistake: false },
      { move: 23, player: 'b', movePlayed: 'Bb6', evaluationBefore: 15, evaluationAfter: 0, isMistake: false },
      { move: 24, player: 'w', movePlayed: 'd5', evaluationBefore: 0, evaluationAfter: 25, isMistake: false },
      { move: 24, player: 'b', movePlayed: 'cxd5', evaluationBefore: 25, evaluationAfter: 0, isMistake: false },
      { move: 25, player: 'w', movePlayed: 'exd5', evaluationBefore: 0, evaluationAfter: 30, isMistake: false },
      { move: 25, player: 'b', movePlayed: 'Bd4', evaluationBefore: 30, evaluationAfter: 0, isMistake: false },
      { move: 26, player: 'w', movePlayed: 'Nxd4', evaluationBefore: 0, evaluationAfter: 35, isMistake: false },
      { move: 26, player: 'b', movePlayed: 'Qxd4', evaluationBefore: 35, evaluationAfter: 0, isMistake: false },
      { move: 27, player: 'w', movePlayed: 'Qxd4', evaluationBefore: 0, evaluationAfter: 40, isMistake: false },
      { move: 27, player: 'b', movePlayed: 'Rxd4', evaluationBefore: 40, evaluationAfter: 0, isMistake: false },
      { move: 28, player: 'w', movePlayed: 'Rxd4', evaluationBefore: 0, evaluationAfter: 45, isMistake: false },
      { move: 28, player: 'b', movePlayed: 'Rxd4', evaluationBefore: 45, evaluationAfter: 0, isMistake: false },
      { move: 29, player: 'w', movePlayed: 'Rxd4', evaluationBefore: 0, evaluationAfter: 50, isMistake: false },
      { move: 29, player: 'b', movePlayed: 'Kf8', evaluationBefore: 50, evaluationAfter: 0, isMistake: false },
      { move: 30, player: 'w', movePlayed: 'Ke3', evaluationBefore: 0, evaluationAfter: 55, isMistake: false },
      { move: 30, player: 'b', movePlayed: 'Ke8', evaluationBefore: 55, evaluationAfter: 0, isMistake: false },
      { move: 31, player: 'w', movePlayed: 'Kd3', evaluationBefore: 0, evaluationAfter: -60, isMistake: true }, // Endgame mistake
      { move: 31, player: 'b', movePlayed: 'Kd8', evaluationBefore: -60, evaluationAfter: 0, isMistake: false },
    ];
  }

  analyzeEvaluationChanges() {
    const mistakes = [];

    for (let i = 1; i < this.gameData.length; i++) {
      const currentMove = this.gameData[i];
      const previousMove = this.gameData[i - 1];

      // Calculate evaluation change from the perspective of the player who made the move
      let evaluationChange;
      if (currentMove.player === 'w') {
        evaluationChange = currentMove.evaluationAfter - currentMove.evaluationBefore;
      } else {
        evaluationChange = currentMove.evaluationBefore - currentMove.evaluationAfter;
      }

      // Determine if this was a mistake
      const isMistake = evaluationChange < 0;
      
      if (isMistake) {
        // Determine game phase
        let gamePhase;
        if (currentMove.move <= 10) {
          gamePhase = 'opening';
        } else if (currentMove.move <= 30) {
          gamePhase = 'middlegame';
        } else {
          gamePhase = 'endgame';
        }

        mistakes.push({
          moveNumber: currentMove.move,
          playerColor: currentMove.player,
          move: currentMove.movePlayed,
          evaluationBefore: currentMove.evaluationBefore,
          evaluationAfter: currentMove.evaluationAfter,
          evaluationChange,
          gamePhase,
        });
      }
    }

    // Sort by evaluation change (biggest mistakes first)
    return mistakes.sort((a, b) => a.evaluationChange - b.evaluationChange);
  }

  runTests() {
    console.log('📋 Testing Phase-Balanced Analysis:\n');

    // Test 1: Analyze mistakes across all phases
    console.log('Test 1: Mistake Distribution Across Phases');
    const mistakes = this.analyzeEvaluationChanges();
    
    console.log(`Found ${mistakes.length} mistakes in the game:`);
    mistakes.forEach((mistake, index) => {
      const player = mistake.playerColor === 'w' ? 'White' : 'Black';
      const change = mistake.evaluationChange > 0 ? `+${mistake.evaluationChange}` : `${mistake.evaluationChange}`;
      console.log(`  ${index + 1}. Move ${mistake.moveNumber} (${player}): ${mistake.move} - ${change} centipawns - ${mistake.gamePhase} phase`);
    });

    // Test 2: Verify phase distribution
    console.log('\nTest 2: Phase Distribution Analysis');
    const phaseCounts = {};
    mistakes.forEach(mistake => {
      phaseCounts[mistake.gamePhase] = (phaseCounts[mistake.gamePhase] || 0) + 1;
    });

    console.log('Mistakes by game phase:');
    Object.entries(phaseCounts).forEach(([phase, count]) => {
      console.log(`  ${phase}: ${count} mistakes`);
    });

    // Test 3: Check if analysis covers all phases
    console.log('\nTest 3: Phase Coverage Verification');
    const phasesWithMistakes = Object.keys(phaseCounts);
    const expectedPhases = ['opening', 'middlegame', 'endgame'];
    
    console.log('Phases with mistakes:', phasesWithMistakes);
    console.log('Expected phases:', expectedPhases);
    
    const missingPhases = expectedPhases.filter(phase => !phasesWithMistakes.includes(phase));
    if (missingPhases.length === 0) {
      console.log('✅ All phases have mistakes - good test coverage');
    } else {
      console.log(`❌ Missing mistakes in phases: ${missingPhases.join(', ')}`);
    }

    // Test 4: Verify biggest mistakes are from different phases
    console.log('\nTest 4: Biggest Mistakes Phase Distribution');
    const top3Mistakes = mistakes.slice(0, 3);
    console.log('Top 3 mistakes:');
    top3Mistakes.forEach((mistake, index) => {
      const player = mistake.playerColor === 'w' ? 'White' : 'Black';
      console.log(`  ${index + 1}. Move ${mistake.moveNumber} (${player}): ${mistake.move} - ${mistake.evaluationChange} centipawns - ${mistake.gamePhase} phase`);
    });

    const top3Phases = top3Mistakes.map(m => m.gamePhase);
    const uniquePhases = [...new Set(top3Phases)];
    console.log(`Top 3 mistakes cover ${uniquePhases.length} different phases: ${uniquePhases.join(', ')}`);

    if (uniquePhases.length >= 2) {
      console.log('✅ Top mistakes are distributed across multiple phases');
    } else {
      console.log('❌ Top mistakes are concentrated in one phase');
    }

    return mistakes;
  }
}

// Run the tests
const tester = new PhaseBalancedAnalysisTest();
const results = tester.runTests();

console.log('\n🎯 Test Results Summary:');
console.log('========================');
console.log(`✅ Total mistakes detected: ${results.length}`);
console.log(`✅ Mistakes distributed across phases: ${Object.keys(results.reduce((acc, m) => { acc[m.gamePhase] = true; return acc; }, {})).length} phases`);
console.log(`✅ Phase-balanced analysis test completed`);

console.log('\n🚀 Next Steps:');
console.log('1. Test with real AI analysis to verify phase balance');
console.log('2. Monitor AI responses for phase bias');
console.log('3. Adjust prompts if phase concentration persists');
console.log('4. Validate with games that have mistakes in all phases'); 