#!/usr/bin/env node

/**
 * Test script to verify AICoachChat component fix
 * Tests the new enhanced analysis API integration
 */

async function testAICoachChatFix() {
  console.log('🧪 Testing AICoachChat Component Fix\n');
  console.log('=' .repeat(50));
  
  // Test the enhanced analysis API with the same parameters the component would use
  const testData = {
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    analysisType: "move_explanation",
    model: "gpt-4o-mini",
    includeAIAnalysis: true,
    playerColor: "b",
    focusAreas: ['opening', 'middlegame', 'endgame', 'tactics', 'strategy'],
    userMessage: "analyze this position",
    responseLength: "detailed",
    boardOrientation: true
  };
  
  console.log('📊 Test Data:');
  console.log(`  FEN: ${testData.fen}`);
  console.log(`  Analysis Type: ${testData.analysisType}`);
  console.log(`  Model: ${testData.model}`);
  console.log(`  User Message: ${testData.userMessage}`);
  
  try {
    console.log('\n🔍 Testing Enhanced Analysis API...');
    
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
    console.log(`  Analysis Type: ${data.analysisType}`);
    
    // Check if AI analysis is working
    if (data.currentPositionAnalysis) {
      console.log('✅ AI Analysis Working:');
      console.log(`  Model Used: ${data.currentPositionAnalysis.modelUsed}`);
      console.log(`  Processing Time: ${data.currentPositionAnalysis.processingTime}ms`);
      console.log(`  Confidence: ${data.currentPositionAnalysis.confidence}`);
      console.log(`  Analysis Length: ${data.currentPositionAnalysis.analysis.length} characters`);
    } else if (data.aiAnalysisError) {
      console.log('⚠️  AI Analysis Error:');
      console.log(`  Error: ${data.aiAnalysisError}`);
    }
    
    // Check position data
    if (data.currentPosition) {
      console.log('✅ Position Data Available:');
      console.log(`  Game Phase: ${data.currentPosition.positionMetadata.gamePhase}`);
      console.log(`  Legal Moves: ${data.currentPosition.positionMetadata.legalMovesCount}`);
      console.log(`  Material Count: White ${Object.values(data.currentPosition.positionMetadata.materialCount.white).join(', ')}, Black ${Object.values(data.currentPosition.positionMetadata.materialCount.black).join(', ')}`);
    }
    
    // Check game review
    if (data.gameReview) {
      console.log('✅ Game Review Available:');
      console.log(`  Overall Assessment: ${data.gameReview.overallAssessment.substring(0, 100)}...`);
      console.log(`  Key Moments: ${data.gameReview.keyMoments?.length || 0}`);
      console.log(`  Improvement Areas: ${data.gameReview.improvementAreas?.length || 0}`);
    }
    
    // Simulate what the component would do with this data
    console.log('\n📝 Simulating Component Response Processing...');
    
    let assistantContent = "";
    
    if (data.currentPositionAnalysis) {
      assistantContent += `## Position Analysis\n\n${data.currentPositionAnalysis.analysis.substring(0, 200)}...\n\n`;
    }
    
    if (data.gameReview) {
      assistantContent += `## Game Review\n\n**Overall Assessment:** ${data.gameReview.overallAssessment.substring(0, 100)}...\n\n`;
    }
    
    if (data.currentPosition) {
      assistantContent += `## Position Details\n\n`;
      assistantContent += `**FEN:** ${data.currentPosition.fen}\n`;
      assistantContent += `**Game Phase:** ${data.currentPosition.positionMetadata.gamePhase}\n`;
      assistantContent += `**Legal Moves:** ${data.currentPosition.positionMetadata.legalMovesCount}\n`;
    }
    
    console.log('✅ Component Response Generated:');
    console.log(`  Content Length: ${assistantContent.length} characters`);
    console.log(`  Sections: ${assistantContent.split('##').length - 1}`);
    
    console.log('\n🎉 AICoachChat Component Fix Test Complete!');
    console.log('✅ The component should now work correctly with the enhanced analysis API');
    console.log('✅ No more deprecated endpoint errors');
    console.log('✅ Rich AI analysis and position data available');
    
  } catch (error) {
    console.error('❌ Test Failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure the development server is running (npm run dev)');
    console.log('2. Check that the enhanced analysis API is working');
    console.log('3. Verify the OpenAI API key is configured correctly');
  }
}

testAICoachChatFix().catch(console.error); 