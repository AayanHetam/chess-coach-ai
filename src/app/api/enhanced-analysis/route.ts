import { NextResponse } from 'next/server';
import { Chess } from 'chess.js';
import { EnhancedFenTracker } from '@/lib/enhancedFenTracker';
import { EnhancedOpenAIService } from '@/lib/enhancedOpenAIService';
import { MockEvaluationService } from '@/lib/mockEvaluationService';

export async function POST(req: Request) {
  try {
    const { 
      fen, 
      moveHistory,
      analysisType = 'comprehensive',
      model = 'gpt-4o-mini',
      includePositionHistory = true,
      includeAIAnalysis = true,
      playerColor = 'w',

    } = await req.json();

    // Check if OpenAI API key is available
    if (includeAIAnalysis && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Initialize chess game with full game data
    let chess: Chess;
    let gameSource: string;

    // Initialize chess game with move history or FEN
    if (moveHistory && moveHistory.length > 0) {
      // Use move history to reconstruct game (most reliable)
      try {
        chess = new Chess();
        for (const move of moveHistory) {
          const result = chess.move(move);
          if (!result) {
            throw new Error(`Invalid move: ${move}`);
          }
        }
        gameSource = 'MoveHistory';
      } catch (error) {
        console.error('Move history error:', error);
        return NextResponse.json(
          { error: 'Invalid move history', details: error instanceof Error ? error.message : 'Unknown error' },
          { status: 400 }
        );
      }
    } else if (fen) {
      // Fallback to FEN position only
      try {
        chess = new Chess(fen);
        gameSource = 'FEN';
      } catch (error) {
        console.error('FEN parsing error:', error);
        return NextResponse.json(
          { error: 'Invalid FEN format', details: error instanceof Error ? error.message : 'Unknown error' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Either move history or FEN position must be provided' },
        { status: 400 }
      );
    }

    // Initialize enhanced FEN tracker with full game
    const tracker = new EnhancedFenTracker();
    
    // Reconstruct positions from game history
    try {
      const history = chess.history({ verbose: true });
      for (const move of history) {
        const result = tracker.makeMove(move);
        if (!result) {
          console.warn(`Failed to track move: ${move.san}`);
        }
      }
    } catch (error) {
      console.error('Error reconstructing game history:', error);
      // Continue with current position only
    }

    // Get comprehensive position data
    const positions = tracker.getPositions();
    const currentPosition = tracker.getCurrentPosition();
    const gameSummary = tracker.getGameSummary();
    const moveSequence = tracker.getMoveSequence();
    
    // Populate evaluations for each position using mock evaluation service
    const evaluationService = new MockEvaluationService();
    for (let i = 0; i < positions.length; i++) {
      const position = positions[i];
      evaluationService.setPosition(position.fen);
      const evaluation = await evaluationService.getEvaluation();
      tracker.setEvaluationAtPosition(i, evaluation);
    }
    
    // Determine user color from board orientation
    // boardOrientation = true means user is White, false means user is Black
    const userColor = playerColor || 'w'; // Default to white if not specified
    
    // Get evaluation-based mistake analysis filtered by user color
    const topMistakes = tracker.getTopMistakes(3, userColor);
    const evaluationAnalysis = tracker.analyzeEvaluationChanges();

    // Prepare response data
    const responseData: any = {
      gameSource,
      analysisType,
      gameSummary,
      currentPosition,
      totalPositions: positions.length,
      totalMoves: gameSummary.totalMoves,
    };

    // Include position history if requested
    if (includePositionHistory) {
      responseData.positionHistory = positions.map((pos, index) => ({
        index,
        fen: pos.fen,
        moveNumber: pos.moveNumber,
        halfMoveNumber: pos.halfMoveNumber,
        isWhiteToMove: pos.isWhiteToMove,
        movePlayed: pos.movePlayed,
        positionMetadata: {
          gamePhase: pos.positionMetadata.gamePhase,
          materialCount: pos.positionMetadata.materialCount,
          isInCheck: pos.positionMetadata.isInCheck,
          legalMovesCount: pos.positionMetadata.legalMovesCount,
        },
      }));
    }

    // Include move sequence
    responseData.moveSequence = moveSequence;
    
    // Include evaluation-based analysis
    responseData.topMistakes = topMistakes;
    responseData.evaluationAnalysis = evaluationAnalysis;

    // Perform AI analysis if requested
    if (includeAIAnalysis && process.env.OPENAI_API_KEY) {
      try {
        const openAIService = new EnhancedOpenAIService(process.env.OPENAI_API_KEY);

        // Analyze current position with FULL game history
        if (currentPosition) {
          const positionAnalysis = await openAIService.analyzePosition({
            position: currentPosition,
            gameHistory: positions, // Send ALL positions for complete game analysis
            analysisType: 'position_evaluation',
            model: model as any,
            responseFormat: 'text',
          });

          responseData.currentPositionAnalysis = {
            analysis: positionAnalysis.analysis,
            modelUsed: positionAnalysis.modelUsed,
            processingTime: positionAnalysis.processingTime,
            confidence: positionAnalysis.confidence,
          };
        }

        // Perform simplified game analysis if multiple positions exist
        if (positions.length > 1) {
                  const gameAnalysis = await openAIService.analyzePosition({
          position: currentPosition!,
          gameHistory: positions, // Send ALL positions for complete game analysis
          analysisType: 'game_review',
          model: model as any,
          responseFormat: 'text',
          evaluationData: {
            topMistakes,
            evaluationAnalysis,
          },
        });

          responseData.gameAnalysis = {
            analysis: gameAnalysis.analysis,
            modelUsed: gameAnalysis.modelUsed,
            processingTime: gameAnalysis.processingTime,
            confidence: gameAnalysis.confidence,
          };
        }

        // Generate training data
        const trainingData = await openAIService.generateTrainingData(positions);
        responseData.trainingData = {
          totalExamples: trainingData.trainingExamples.length,
          examples: trainingData.trainingExamples.slice(0, 10), // Include first 10 examples
        };

      } catch (aiError) {
        console.error('AI analysis failed:', aiError);
        responseData.aiAnalysisError = 'AI analysis failed, but position data is available';
      }
    }

    // Add export data for training (FEN-based)
    responseData.exportData = {
      positions: tracker.getPositions(),
      gameMetadata: {
        fen: chess.fen(),
        result: chess.isCheckmate() ? 'checkmate' : 
                chess.isDraw() ? 'draw' : 'ongoing',
        totalMoves: chess.history().length,
        totalPositions: tracker.getPositions().length,
      },
    };

    // Add position sequence for easy access
    responseData.positionSequence = tracker.getPositionSequence();

    // Add metadata
    responseData.metadata = {
      generatedAt: new Date().toISOString(),
      analysisVersion: '2.0',
      features: {
        enhancedFenTracking: true,
        aiAnalysis: includeAIAnalysis,
        positionHistory: includePositionHistory,
        trainingDataGeneration: includeAIAnalysis,
      },
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Enhanced analysis error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  // Return API documentation
  return NextResponse.json({
    name: 'Enhanced Chess Analysis API',
    version: '2.0',
    description: 'Comprehensive chess analysis with enhanced FEN tracking and AI analysis',
    endpoints: {
      POST: {
        description: 'Analyze chess game with enhanced FEN tracking and AI analysis',
        body: {
          fen: 'string (required) - FEN position',
          analysisType: 'string (optional) - Type of analysis',
          model: 'string (optional) - OpenAI model to use',
          includePositionHistory: 'boolean (optional) - Include full position history',
          includeAIAnalysis: 'boolean (optional) - Include AI analysis',
          playerColor: 'string (optional) - Player color for analysis',
          focusAreas: 'array (optional) - Areas to focus analysis on',
        },
                  response: {
            gameSource: 'string - Always "FEN"',
          analysisType: 'string - Type of analysis performed',
          gameSummary: 'object - Game summary statistics',
          currentPosition: 'object - Current position data',
          positionHistory: 'array - Full position history',
          moveSequence: 'array - Move sequence with FEN data',
          currentPositionAnalysis: 'object - AI analysis of current position',
          gameReview: 'object - Comprehensive game review',
          moveByMoveAnalysis: 'array - Move-by-move analysis',
          trainingData: 'object - Generated training data',
          exportData: 'object - Complete export data',
          positionSequence: 'array - FEN position sequence',
          metadata: 'object - Analysis metadata',
        },
      },
    },
    features: [
      'Enhanced FEN tracking for every position',
      'Comprehensive position metadata',
      'AI-powered move and position analysis',
      'Game review with key moments identification',
      'Training data generation for chess models',
      'Multiple analysis types and focus areas',
      'Real-time position tracking capabilities',
    ],
  });
} 