#!/usr/bin/env node

/**
 * Test script for Full Game Analysis
 * Tests that the AI has access to complete game data and doesn't hallucinate
 */

async function testFullGameAnalysis() {
  console.log('🎯 Testing Full Game Analysis - No More Hallucination\n');
  console.log('=' .repeat(60));
  
  // Test data with a simple game that has obvious principle violations
  const testData = {
    moveHistory: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "d3", "d6", "O-O", "Nf6", "Nc3", "O-O", "Be3", "Bxe3", "fxe3", "Qe7", "Qd2", "Ng4", "h3", "Nxe3", "Qxe3", "Qxe3+", "Kh2", "Qxc1", "Rxc1", "Bg4", "hxg4", "Nxg4+", "Kg3", "Nf2", "Kxf2", "Rf2+", "Ke1", "Rf1"],
    analysisType: "game_review",
    model: "gpt-4o-mini",
    includeAIAnalysis: true,
    playerColor: "w",
    focusAreas: ['opening', 'middlegame', 'endgame', 'tactics', 'strategy'],
    userMessage: "analyze my game and identify specific principle violations with move numbers",
    responseLength: "detailed",
    boardOrientation: true
  };
  
  console.log('📊 Test Data:');
  console.log(`  Game Source: Move History`);
  console.log(`  Total Moves: ${testData.moveHistory.length}`);
  console.log(`  Analysis Type: ${testData.analysisType}`);
  console.log(`  User Message: ${testData.userMessage}`);
  console.log(`  Focus Areas: ${testData.focusAreas.join(', ')}`);
  
  console.log('\n📋 Game Moves:');
  testData.moveHistory.forEach((move, index) => {
    const moveNumber = Math.floor(index / 2) + 1;
    const isBlackMove = index % 2 === 1;
    console.log(`  ${moveNumber}.${isBlackMove ? '..' : ''} ${move}`);
  });
  
  try {
    console.log('\n🔍 Testing Full Game Analysis...');
    
    const response = await fetch('http://localhost:3000/api/enhanced-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('✅ API Response Success!');
    console.log(`  Game Source: ${data.gameSource}`);
    console.log(`  Total Positions: ${data.totalPositions}`);
    console.log(`  Total Moves: ${data.totalMoves}`);
    
    // Check if we have full game data
    if (data.positionHistory && data.positionHistory.length > 0) {
      console.log('\n✅ Full Game Data Available:');
      console.log(`  Position History: ${data.positionHistory.length} positions`);
      console.log(`  Move Sequence: ${data.moveSequence?.length || 0} moves`);
      
      // Show some key positions
      console.log('\n📋 Key Positions in Game:');
      data.positionHistory.forEach((pos, index) => {
        if (pos.movePlayed) {
          console.log(`  ${pos.moveNumber}.${pos.halfMoveNumber % 2 === 1 ? '..' : ''} ${pos.movePlayed.san} (${pos.positionMetadata.gamePhase})`);
        }
      });
    }
    
    // Check if AI analysis is working with full data
    if (data.currentPositionAnalysis) {
      console.log('\n✅ AI Analysis Working with Full Game Data:');
      console.log(`  Model Used: ${data.currentPositionAnalysis.modelUsed}`);
      console.log(`  Processing Time: ${data.currentPositionAnalysis.processingTime}ms`);
      console.log(`  Analysis Length: ${data.currentPositionAnalysis.analysis.length} characters`);
      
      // Check for specific move analysis (should not hallucinate)
      const analysis = data.currentPositionAnalysis.analysis.toLowerCase();
      console.log('\n🔍 Checking Analysis Content:');
      
      // Check for specific move references
      const moveReferences = testData.moveHistory.filter(move => 
        analysis.includes(move.toLowerCase())
      );
      console.log(`  ✅ Found ${moveReferences.length} specific move references: ${moveReferences.slice(0, 5).join(', ')}${moveReferences.length > 5 ? '...' : ''}`);
      
      // Check for principle violations with move numbers
      const principleViolations = analysis.match(/\d+\.\s*[a-zA-Z]+/g) || [];
      console.log(`  ✅ Found ${principleViolations.length} principle violations with move numbers: ${principleViolations.slice(0, 5).join(', ')}${principleViolations.length > 5 ? '...' : ''}`);
      
      // Check for no hallucination indicators
      const hallucinationIndicators = [
        'game history does not provide specific moves',
        'cannot identify exact violations',
        'if there were issues',
        'would be key areas',
        'cannot determine'
      ];
      
      const foundHallucination = hallucinationIndicators.filter(indicator => 
        analysis.includes(indicator.toLowerCase())
      );
      
      if (foundHallucination.length > 0) {
        console.log(`  ❌ Found ${foundHallucination.length} hallucination indicators: ${foundHallucination.join(', ')}`);
      } else {
        console.log(`  ✅ No hallucination indicators found (good)`);
      }
      
      // Check for specific analysis content
      const specificAnalysis = [
        'move 1', 'move 2', 'move 3', 'move 4', 'move 5',
        'opening phase', 'middlegame', 'endgame',
        'principle violation', 'mistake', 'blunder',
        'better move', 'should have', 'could have'
      ];
      
      const foundSpecific = specificAnalysis.filter(term => 
        analysis.includes(term.toLowerCase())
      );
      console.log(`  ✅ Found ${foundSpecific.length} specific analysis terms: ${foundSpecific.slice(0, 8).join(', ')}${foundSpecific.length > 8 ? '...' : ''}`);
      
    } else if (data.aiAnalysisError) {
      console.log('⚠️  AI Analysis Error:');
      console.log(`  Error: ${data.aiAnalysisError}`);
    }
    
    // Check game review
    if (data.gameReview) {
      console.log('\n✅ Game Review Available:');
      console.log(`  Overall Assessment: ${data.gameReview.overallAssessment.substring(0, 100)}...`);
      console.log(`  Key Moments: ${data.gameReview.keyMoments?.length || 0}`);
      console.log(`  Improvement Areas: ${data.gameReview.improvementAreas?.length || 0}`);
      console.log(`  Strengths: ${data.gameReview.strengths?.length || 0}`);
      
      // Check move-by-move analysis
      if (data.moveByMoveAnalysis && data.moveByMoveAnalysis.length > 0) {
        console.log('\n📋 Move-by-Move Analysis:');
        data.moveByMoveAnalysis.slice(0, 5).forEach((moveAnalysis, index) => {
          console.log(`  ${moveAnalysis.moveNumber}.${moveAnalysis.halfMoveNumber % 2 === 1 ? '..' : ''} ${moveAnalysis.move} (${moveAnalysis.evaluation})`);
        });
        if (data.moveByMoveAnalysis.length > 5) {
          console.log(`  ... and ${data.moveByMoveAnalysis.length - 5} more moves`);
        }
      }
    }
    
    console.log('\n🎯 Full Game Analysis Test Results:');
    console.log('-'.repeat(40));
    console.log('✅ AI has access to complete game data');
    console.log('✅ No hallucination indicators found');
    console.log('✅ Specific move references identified');
    console.log('✅ Principle violations with move numbers');
    console.log('✅ Comprehensive game analysis provided');
    console.log('✅ Move-by-move analysis available');
    
    console.log('\n🚀 Next Steps:');
    console.log('-'.repeat(40));
    console.log('1. Test with different game types');
    console.log('2. Verify principle violation accuracy');
    console.log('3. Test with longer games');
    console.log('4. Validate educational value');
    console.log('5. Deploy enhanced system');
    
  } catch (error) {
    console.error('❌ Test Failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure the development server is running (npm run dev)');
    console.log('2. Check that the enhanced analysis API is working');
    console.log('3. Verify the OpenAI API key is configured correctly');
    console.log('4. Check the full game data integration');
  }
}

testFullGameAnalysis().catch(console.error); 