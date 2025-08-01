#!/usr/bin/env node

/**
 * Test script to verify OpenAI API key integration
 */

require('dotenv').config({ path: '.env.local' });

async function testOpenAIKey() {
  console.log('🔑 Testing OpenAI API Key Integration\n');
  
  // Check if API key is loaded
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY not found in environment variables');
    return;
  }
  
  console.log('✅ OpenAI API Key loaded successfully');
  console.log(`Key prefix: ${apiKey.substring(0, 20)}...`);
  
  // Test basic API call
  try {
    console.log('\n🧪 Testing OpenAI API call...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: 'Say "Hello from OpenAI API test!"'
          }
        ],
        max_tokens: 50,
        temperature: 0.1,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ OpenAI API error: ${response.status} ${response.statusText}`);
      console.error(`Error details: ${errorText}`);
      return;
    }
    
    const data = await response.json();
    console.log('✅ OpenAI API call successful!');
    console.log(`Response: ${data.choices[0].message.content}`);
    
  } catch (error) {
    console.error('❌ Error testing OpenAI API:', error.message);
  }
  
  // Test enhanced analysis service
  try {
    console.log('\n🧪 Testing Enhanced OpenAI Service...');
    
    const { EnhancedOpenAIService } = require('./src/lib/enhancedOpenAIService');
    const openAI = new EnhancedOpenAIService(apiKey);
    
    // Create a mock position
    const mockPosition = {
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      moveNumber: 1,
      halfMoveNumber: 1,
      isWhiteToMove: false,
      positionMetadata: {
        gamePhase: 'opening',
        materialCount: {
          white: { pawns: 8, knights: 2, bishops: 2, rooks: 2, queens: 1 },
          black: { pawns: 8, knights: 2, bishops: 2, rooks: 2, queens: 1 }
        },
        isInCheck: false,
        legalMovesCount: 20
      }
    };
    
    const analysis = await openAI.analyzePosition({
      position: mockPosition,
      analysisType: 'position_evaluation',
      model: 'gpt-4o-mini',
      responseFormat: 'text',
    });
    
    console.log('✅ Enhanced OpenAI Service working!');
    console.log(`Analysis: ${analysis.analysis.substring(0, 100)}...`);
    console.log(`Model used: ${analysis.modelUsed}`);
    console.log(`Processing time: ${analysis.processingTime}ms`);
    
  } catch (error) {
    console.error('❌ Error testing Enhanced OpenAI Service:', error.message);
  }
}

testOpenAIKey().catch(console.error); 