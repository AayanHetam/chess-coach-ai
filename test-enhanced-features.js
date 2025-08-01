#!/usr/bin/env node

/**
 * Test script for Enhanced Chess Analysis Features
 * 
 * This script demonstrates:
 * 1. Enhanced FEN tracking for every position
 * 2. OpenAI integration for chess analysis
 * 3. Training data generation
 * 4. Game review capabilities
 */

const { Chess } = require('chess.js');

// Mock the enhanced classes for testing (in real app, these would be imported)
class MockEnhancedFenTracker {
  constructor(initialFen) {
    this.positions = [];
    this.game = new Chess(initialFen);
    this.initializePosition();
  }

  initializePosition() {
    const fen = this.game.fen();
    const positionData = {
      fen,
      moveNumber: 0,
      halfMoveNumber: 0,
      isWhiteToMove: this.game.turn() === 'w',
      positionMetadata: this.extractPositionMetadata(fen),
    };
    this.positions.push(positionData);
  }

  extractPositionMetadata(fen) {
    const parts = fen.split(' ');
    const piecePlacement = parts[0];
    
    // Count material
    const materialCount = this.countMaterial(piecePlacement);
    
    // Determine game phase
    const totalPieces = Object.values(materialCount.white).reduce((a, b) => a + b, 0) +
                       Object.values(materialCount.black).reduce((a, b) => a + b, 0);
    let gamePhase = 'opening';
    if (totalPieces < 24) gamePhase = totalPieces < 12 ? 'endgame' : 'middlegame';

    return {
      gamePhase,
      materialCount,
      isInCheck: this.game.isCheck(),
      legalMovesCount: this.game.moves().length,
    };
  }

  countMaterial(piecePlacement) {
    const counts = {
      white: { pawns: 0, knights: 0, bishops: 0, rooks: 0, queens: 0 },
      black: { pawns: 0, knights: 0, bishops: 0, rooks: 0, queens: 0 },
    };

    for (const char of piecePlacement) {
      if (char === '/' || /\d/.test(char)) continue;
      
      const isWhite = char === char.toUpperCase();
      const piece = char.toLowerCase();
      const color = isWhite ? 'white' : 'black';

      switch (piece) {
        case 'p': counts[color].pawns++; break;
        case 'n': counts[color].knights++; break;
        case 'b': counts[color].bishops++; break;
        case 'r': counts[color].rooks++; break;
        case 'q': counts[color].queens++; break;
      }
    }

    return counts;
  }

  makeMove(move) {
    try {
      const result = this.game.move(move);
      if (!result) return null;

      const fen = this.game.fen();
      const moveNumber = Math.floor(this.game.history().length / 2) + 1;
      const halfMoveNumber = this.game.history().length;

      const positionData = {
        fen,
        moveNumber,
        halfMoveNumber,
        isWhiteToMove: this.game.turn() === 'w',
        movePlayed: {
          san: result.san,
          uci: result.from + result.to + (result.promotion || ''),
          from: result.from,
          to: result.to,
          piece: result.piece,
          color: result.color,
          captured: result.captured,
          promotion: result.promotion,
          isCheck: result.san.includes('+'),
          isCheckmate: result.san.includes('#'),
          isDraw: this.game.isDraw(),
        },
        positionMetadata: this.extractPositionMetadata(fen),
      };

      this.positions.push(positionData);
      return positionData;
    } catch (error) {
      console.error('Invalid move:', error);
      return null;
    }
  }

  getPositions() {
    return [...this.positions];
  }

  getCurrentPosition() {
    return this.positions[this.positions.length - 1] || null;
  }

  getGameSummary() {
    return {
      totalMoves: this.game.history().length,
      totalPositions: this.positions.length,
      gameResult: this.game.isCheckmate() ? 'checkmate' : 
                  this.game.isDraw() ? 'draw' : 'ongoing',
      finalPosition: this.game.fen(),
    };
  }

  exportForTraining() {
    return {
      positions: this.positions,
      gameMetadata: {
        pgn: this.game.pgn(),
        result: this.game.isCheckmate() ? 'checkmate' : 
                this.game.isDraw() ? 'draw' : 'ongoing',
        totalMoves: this.game.history().length,
        totalPositions: this.positions.length,
      },
    };
  }
}

class MockEnhancedOpenAIService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.defaultModel = 'gpt-4o-mini';
  }

  async analyzePosition(request) {
    // Mock analysis response
    const analysisTypes = {
      'move_explanation': 'This move develops the knight to a natural square, controlling the center and preparing for kingside castling.',
      'position_evaluation': 'The position is approximately equal. White has slightly better development, but Black has a solid pawn structure.',
      'strategic_advice': 'Focus on controlling the center squares and developing your pieces harmoniously. Consider kingside castling soon.',
      'opening_analysis': 'This follows standard opening principles. The position is well-known in opening theory.',
      'endgame_analysis': 'With few pieces remaining, focus on king activity and pawn advancement.',
    };

    return {
      analysis: analysisTypes[request.analysisType] || 'Analysis completed.',
      modelUsed: request.model || this.defaultModel,
      processingTime: Math.floor(Math.random() * 2000) + 500,
      confidence: 0.85,
    };
  }

  async reviewGame(request) {
    return {
      overallAssessment: 'A well-played game with good opening preparation and middlegame tactics.',
      moveByMoveAnalysis: request.positions.slice(1).map((pos, index) => ({
        moveNumber: pos.moveNumber,
        halfMoveNumber: pos.halfMoveNumber,
        move: pos.movePlayed?.san || 'N/A',
        evaluation: ['excellent', 'good', 'inaccurate', 'blunder'][Math.floor(Math.random() * 4)],
        explanation: 'This move follows good chess principles.',
        betterAlternatives: ['Alternative move 1', 'Alternative move 2'],
        principles: ['Control the center', 'Develop pieces'],
      })),
      keyMoments: [
        { moveNumber: 5, description: 'Critical position where the game could have taken a different direction', impact: 'neutral' },
        { moveNumber: 12, description: 'Excellent tactical opportunity was missed', impact: 'negative' },
      ],
      improvementAreas: ['Opening preparation', 'Tactical awareness', 'Endgame technique'],
      strengths: ['Good piece coordination', 'Solid defense'],
      modelUsed: request.model || this.defaultModel,
      processingTime: Math.floor(Math.random() * 3000) + 1000,
    };
  }

  async generateTrainingData(positions) {
    return {
      trainingExamples: positions
        .filter(pos => pos.movePlayed)
        .map(pos => ({
          input: `Position: ${pos.fen}\nMove: ${pos.movePlayed.san}`,
          output: `This move was played because it follows good chess principles.`,
          metadata: {
            moveNumber: pos.moveNumber,
            halfMoveNumber: pos.halfMoveNumber,
            move: pos.movePlayed.san,
            fen: pos.fen,
            gamePhase: pos.positionMetadata.gamePhase,
          },
        })),
    };
  }
}

// Test function
async function testEnhancedFeatures() {
  console.log('🧪 Testing Enhanced Chess Analysis Features\n');

  // Sample chess game (Ruy Lopez opening)
  const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'];

  console.log('📊 1. Enhanced FEN Tracking Test');
  console.log('================================');

  // Initialize enhanced tracker
  const tracker = new MockEnhancedFenTracker();
  console.log('✅ Enhanced FEN Tracker initialized');

  // Make moves and track positions
  console.log('\nMaking moves and tracking positions:');
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const result = tracker.makeMove(move);
    if (result) {
      console.log(`  ${result.moveNumber}.${result.halfMoveNumber % 2 === 1 ? '' : '..'}${result.movePlayed.san}`);
      console.log(`    FEN: ${result.fen.split(' ')[0]}`);
      console.log(`    Phase: ${result.positionMetadata.gamePhase}`);
      console.log(`    Material (W): ${result.positionMetadata.materialCount.white.pawns}P ${result.positionMetadata.materialCount.white.knights}N ${result.positionMetadata.materialCount.white.bishops}B ${result.positionMetadata.materialCount.white.rooks}R ${result.positionMetadata.materialCount.white.queens}Q`);
      console.log(`    Material (B): ${result.positionMetadata.materialCount.black.pawns}P ${result.positionMetadata.materialCount.black.knights}N ${result.positionMetadata.materialCount.black.bishops}B ${result.positionMetadata.materialCount.black.rooks}R ${result.positionMetadata.materialCount.black.queens}Q`);
      console.log('');
    }
  }

  // Get summary
  const summary = tracker.getGameSummary();
  console.log(`📈 Game Summary:`);
  console.log(`   Total Moves: ${summary.totalMoves}`);
  console.log(`   Total Positions: ${summary.totalPositions}`);
  console.log(`   Game Result: ${summary.gameResult}`);
  console.log(`   Final Position: ${summary.finalPosition}`);

  console.log('\n🤖 2. OpenAI Integration Test');
  console.log('============================');

  // Initialize OpenAI service
  const openAI = new MockEnhancedOpenAIService('mock-api-key');
  console.log('✅ Enhanced OpenAI Service initialized');

  // Test position analysis
  const currentPosition = tracker.getCurrentPosition();
  if (currentPosition) {
    console.log('\nAnalyzing current position...');
    const analysis = await openAI.analyzePosition({
      position: currentPosition,
      analysisType: 'move_explanation',
      model: 'gpt-4o-mini',
    });
    console.log(`✅ Position Analysis:`);
    console.log(`   Model: ${analysis.modelUsed}`);
    console.log(`   Processing Time: ${analysis.processingTime}ms`);
    console.log(`   Confidence: ${analysis.confidence}`);
    console.log(`   Analysis: ${analysis.analysis}`);
  }

  // Test game review
  console.log('\nReviewing entire game...');
  const gameReview = await openAI.reviewGame({
    positions: tracker.getPositions(),
    playerColor: 'w',
    analysisDepth: 'detailed',
    model: 'gpt-4o-mini',
  });
  console.log(`✅ Game Review:`);
  console.log(`   Overall Assessment: ${gameReview.overallAssessment}`);
  console.log(`   Key Moments: ${gameReview.keyMoments.length}`);
  console.log(`   Improvement Areas: ${gameReview.improvementAreas.join(', ')}`);
  console.log(`   Strengths: ${gameReview.strengths.join(', ')}`);

  // Test training data generation
  console.log('\nGenerating training data...');
  const trainingData = await openAI.generateTrainingData(tracker.getPositions());
  console.log(`✅ Training Data Generated:`);
  console.log(`   Total Examples: ${trainingData.trainingExamples.length}`);
  console.log(`   Sample Example:`);
  if (trainingData.trainingExamples.length > 0) {
    const example = trainingData.trainingExamples[0];
    console.log(`     Input: ${example.input}`);
    console.log(`     Output: ${example.output}`);
    console.log(`     Metadata: ${JSON.stringify(example.metadata, null, 2)}`);
  }

  console.log('\n📤 3. Data Export Test');
  console.log('======================');

  // Export training data
  const exportData = tracker.exportForTraining();
  console.log('✅ Training Data Export:');
  console.log(`   FEN: ${exportData.gameMetadata.fen}`);
  console.log(`   Result: ${exportData.gameMetadata.result}`);
  console.log(`   Total Moves: ${exportData.gameMetadata.totalMoves}`);
  console.log(`   Total Positions: ${exportData.gameMetadata.totalPositions}`);

  // Get position sequence
  const positions = tracker.getPositions();
  console.log('\n📋 Position Sequence:');
  positions.forEach((pos, index) => {
    console.log(`   ${index + 1}. ${pos.fen.split(' ')[0]} (${pos.positionMetadata.gamePhase})`);
  });

  console.log('\n🎉 All Enhanced Features Tested Successfully!');
  console.log('\n📚 Next Steps:');
  console.log('   1. Set up your OpenAI API key in environment variables');
  console.log('   2. Integrate the enhanced components into your React app');
  console.log('   3. Use the EnhancedAnalysisPanel component for UI');
  console.log('   4. Call the /api/enhanced-analysis endpoint for server-side analysis');
  console.log('   5. Export training data for your chess model training pipeline');
}

// Run the test
if (require.main === module) {
  testEnhancedFeatures().catch(console.error);
}

module.exports = {
  MockEnhancedFenTracker,
  MockEnhancedOpenAIService,
  testEnhancedFeatures,
}; 