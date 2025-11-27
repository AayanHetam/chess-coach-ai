import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { EnhancedFenTracker } from "@/lib/enhancedFenTracker";
import { EnhancedOpenAIService } from "@/lib/enhancedOpenAIService";
import { MockEvaluationService } from "@/lib/mockEvaluationService";
import { detectOpening } from "@/lib/openingDetector";
import { identifyTacticalThemes, getTacticalPatterns, formatTacticalThemesForPrompt } from "@/lib/chessPuzzlesService";
import { join } from "path";

export async function POST(req: Request) {
  try {
    const {
      fen,
      moveHistory,
      analysisType = "comprehensive",
      model = "gpt-4o-high",
      includePositionHistory = true,
      includeAIAnalysis = true,
      playerColor = "w",
      systemPrompt,
      userMessage,
      gameEval, // Real Stockfish evaluation data
      username, // User's username
      playerColorName, // "white" or "black"
      userRating, // User's rating for Maia model selection
    } = await req.json();

    // Debug logging
    console.log("🔍 API Route - Received systemPrompt:", systemPrompt);
    console.log("🔍 API Route - Received userMessage:", userMessage);
    console.log(
      "🔍 API Route - Received gameEval:",
      gameEval ? `Yes (${gameEval.positions?.length || 0} positions)` : "No"
    );

    // Check if OpenAI API key is available
    if (includeAIAnalysis && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
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
        gameSource = "MoveHistory";
      } catch (error) {
        console.error("Move history error:", error);
        return NextResponse.json(
          {
            error: "Invalid move history",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 400 }
        );
      }
    } else if (fen) {
      // Fallback to FEN position only
      try {
        chess = new Chess(fen);
        gameSource = "FEN";
      } catch (error) {
        console.error("FEN parsing error:", error);
        return NextResponse.json(
          {
            error: "Invalid FEN format",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Either move history or FEN position must be provided" },
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
      console.error("Error reconstructing game history:", error);
      // Continue with current position only
    }

    // Get comprehensive position data
    const positions = tracker.getPositions();
    const currentPosition = tracker.getCurrentPosition();
    const gameSummary = tracker.getGameSummary();
    const moveSequence = tracker.getMoveSequence();

    // Use real Stockfish evaluations if available, otherwise fall back to mock
    if (gameEval && gameEval.positions && gameEval.positions.length > 0) {
      console.log("✅ Using real Stockfish evaluations from gameEval");
      // Map Stockfish evaluations to positions
      // gameEval.positions[i] corresponds to position after move i
      for (
        let i = 0;
        i < positions.length && i < gameEval.positions.length;
        i++
      ) {
        const stockfishEval = gameEval.positions[i];
        if (
          stockfishEval &&
          stockfishEval.lines &&
          stockfishEval.lines.length > 0
        ) {
          const firstLine = stockfishEval.lines[0];
          const centipawns =
            firstLine.cp ??
            (firstLine.mate ? (firstLine.mate > 0 ? 10000 : -10000) : 0);
          const evaluation = {
            centipawns: centipawns,
            mate: firstLine.mate,
            bestMove:
              stockfishEval.bestMove ||
              (firstLine.pv && firstLine.pv.length > 0
                ? firstLine.pv[0]
                : undefined),
            depth: firstLine.depth || gameEval.settings?.depth || 16,
            principalVariation: firstLine.pv || [],
          };
          tracker.setEvaluationAtPosition(i, evaluation);
        }
      }
    } else {
      console.log("⚠️ No Stockfish data available, using mock evaluations");
      // Fall back to mock evaluation service
      const evaluationService = new MockEvaluationService();
      for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        evaluationService.setPosition(position.fen);
        const evaluation = await evaluationService.getEvaluation();
        tracker.setEvaluationAtPosition(i, evaluation);
      }
    }

    // Determine user color from board orientation
    // boardOrientation = true means user is White, false means user is Black
    const userColor = playerColor || "w"; // Default to white if not specified

    // Detect opening
    const openingInfo = detectOpening(chess);

    // Get evaluation-based mistake analysis filtered by user color
    const topMistakes = tracker.getTopMistakes(3, userColor);
    const evaluationAnalysis = tracker.analyzeEvaluationChanges();

    // Get tactical theme analysis for current position (if Stockfish data available)
    let tacticalThemes: string[] = [];
    let tacticalAnalysis: string | undefined;
    let similarPuzzles: any[] = [];
    
    if (gameEval && gameEval.positions && gameEval.positions.length > 0) {
      const currentStockfishEval = gameEval.positions[gameEval.positions.length - 1];
      if (currentStockfishEval && currentStockfishEval.lines && currentStockfishEval.lines.length > 0) {
        const firstLine = currentStockfishEval.lines[0];
        const principalVariation = firstLine.pv || [];
        const bestMove = currentStockfishEval.bestMove || (principalVariation.length > 0 ? principalVariation[0] : "");
        
        if (currentPosition) {
          try {
            // Identify tactical themes
            tacticalThemes = identifyTacticalThemes(
              currentPosition,
              principalVariation,
              bestMove
            );
            const patterns = getTacticalPatterns(tacticalThemes);
            tacticalAnalysis = formatTacticalThemesForPrompt(tacticalThemes, patterns);
            console.log(`✅ Identified tactical themes: ${tacticalThemes.join(", ")}`);
            
            // Query Lichess puzzles dataset for similar puzzles
            try {
              const { spawn } = await import("child_process");
              const { promisify } = await import("util");
              const scriptPath = join(process.cwd(), "scripts", "chess_puzzles_service.py");
              
              const args = [
                "find_similar",
                currentPosition,
                ...(tacticalThemes.length > 0 ? [tacticalThemes.join(",")] : []),
                "5",
              ];
              
              const pythonProcess = spawn("python3", [scriptPath, ...args]);
              let stdout = "";
              let stderr = "";
              
              pythonProcess.stdout.on("data", (data) => {
                stdout += data.toString();
              });
              
              pythonProcess.stderr.on("data", (data) => {
                stderr += data.toString();
              });
              
              await new Promise<void>((resolve, reject) => {
                pythonProcess.on("close", (code) => {
                  if (code === 0) {
                    try {
                      const result = JSON.parse(stdout);
                      similarPuzzles = result.puzzles || [];
                      console.log(`✅ Found ${similarPuzzles.length} similar puzzles from Lichess dataset`);
                      resolve();
                    } catch (error) {
                      console.warn("Failed to parse puzzle data:", error);
                      resolve(); // Continue without puzzle data
                    }
                  } else {
                    console.warn("Python script failed:", stderr);
                    resolve(); // Continue without puzzle data
                  }
                });
                
                pythonProcess.on("error", (error) => {
                  console.warn("Failed to start Python process:", error.message);
                  resolve(); // Continue without puzzle data
                });
              });
            } catch (puzzleError) {
              console.warn("Failed to query Lichess puzzles dataset:", puzzleError);
              // Continue without puzzle data - not critical
            }
          } catch (error) {
            console.warn("Failed to identify tactical themes:", error);
          }
        }
      }
    }

    // Get Maia predictions for each position (if Maia is available)
    const maiaPredictions: Array<{
      positionIndex: number;
      fen: string;
      moveNumber: number;
      maiaMove?: string;
      confidence?: number;
      error?: string;
    }> = [];

    // Try to get Maia predictions (non-blocking - continue if Maia fails)
    // Uses server-side service that auto-downloads weights
    try {
      const { MaiaServerService } = await import(
        "@/lib/engine/maiaServerService"
      );
      const weightsDir =
        process.env.MAIA_WEIGHTS_PATH ||
        join(process.cwd(), "maia-weights");
      const maiaService = MaiaServerService.getInstance(weightsDir);

      // Initialize Maia (will auto-download weights if needed)
      try {
        await maiaService.initialize(userRating || 1500);
        console.log("✅ Maia engine initialized (weights auto-downloaded if needed)");

        // Get predictions for each position (limit to avoid timeout)
        const maxPositions = 20; // Limit predictions to avoid timeout
        const positionsToAnalyze = positions.slice(0, maxPositions);

        for (let i = 0; i < positionsToAnalyze.length; i++) {
          const position = positionsToAnalyze[i];
          try {
            const prediction = await maiaService.predictMove(
              position.fen,
              userRating || 1500
            );
            maiaPredictions.push({
              positionIndex: i,
              fen: position.fen,
              moveNumber: position.moveNumber,
              maiaMove: prediction.humanLikeMove,
              confidence: prediction.confidence,
            });
          } catch (error) {
            console.warn(`Maia prediction failed for position ${i}:`, error);
            maiaPredictions.push({
              positionIndex: i,
              fen: position.fen,
              moveNumber: position.moveNumber,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }
      } catch (error) {
        console.warn(
          "Maia engine not available, continuing without Maia predictions:",
          error
        );
      }
    } catch (error) {
      console.warn("Maia service initialization failed:", error);
    }

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

    // Include opening information
    if (openingInfo) {
      responseData.openingInfo = openingInfo;
    }

    // Include Maia predictions
    if (maiaPredictions.length > 0) {
      responseData.maiaPredictions = maiaPredictions;
    }

    // Perform AI analysis if requested
    if (includeAIAnalysis && process.env.OPENAI_API_KEY) {
      try {
        const openAIService = new EnhancedOpenAIService(
          process.env.OPENAI_API_KEY
        );

        // Analyze current position with FULL game history
        if (currentPosition) {
          const positionAnalysis = await openAIService.analyzePosition({
            position: currentPosition,
            gameHistory: positions, // Send ALL positions for complete game analysis
            analysisType: "position_evaluation",
            model: model as any,
            responseFormat: "text",
            systemPromptOverride: systemPrompt,
            userMessage: userMessage,
            evaluationData: {
              topMistakes,
              evaluationAnalysis,
            },
            maiaPredictions: maiaPredictions.length > 0 ? maiaPredictions : undefined,
            openingInfo: openingInfo || undefined,
            tacticalThemes: tacticalThemes.length > 0 ? tacticalThemes : undefined,
            tacticalAnalysis: tacticalAnalysis,
            similarPuzzles: similarPuzzles.length > 0 ? similarPuzzles : undefined,
            userContext: {
              username: username,
              playerColor: playerColorName,
              rating: userRating,
            },
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
            analysisType: "game_review",
            model: model as any,
            responseFormat: "text",
            systemPromptOverride: systemPrompt,
            userMessage: userMessage,
            evaluationData: {
              topMistakes,
              evaluationAnalysis,
            },
            maiaPredictions: maiaPredictions.length > 0 ? maiaPredictions : undefined,
            openingInfo: openingInfo || undefined,
            tacticalThemes: tacticalThemes.length > 0 ? tacticalThemes : undefined,
            tacticalAnalysis: tacticalAnalysis,
            similarPuzzles: similarPuzzles.length > 0 ? similarPuzzles : undefined,
            userContext: {
              username: username,
              playerColor: playerColorName,
              rating: userRating,
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
        const trainingData =
          await openAIService.generateTrainingData(positions);
        responseData.trainingData = {
          totalExamples: trainingData.trainingExamples.length,
          examples: trainingData.trainingExamples.slice(0, 10), // Include first 10 examples
        };
      } catch (aiError) {
        console.error("AI analysis failed:", aiError);
        responseData.aiAnalysisError =
          "AI analysis failed, but position data is available";
      }
    }

    // Add export data for training (FEN-based)
    responseData.exportData = {
      positions: tracker.getPositions(),
      gameMetadata: {
        fen: chess.fen(),
        result: chess.isCheckmate()
          ? "checkmate"
          : chess.isDraw()
            ? "draw"
            : "ongoing",
        totalMoves: chess.history().length,
        totalPositions: tracker.getPositions().length,
      },
    };

    // Add position sequence for easy access
    responseData.positionSequence = tracker.getPositionSequence();

    // Add metadata
    responseData.metadata = {
      generatedAt: new Date().toISOString(),
      analysisVersion: "2.0",
      features: {
        enhancedFenTracking: true,
        aiAnalysis: includeAIAnalysis,
        positionHistory: includePositionHistory,
        trainingDataGeneration: includeAIAnalysis,
      },
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Enhanced analysis error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  // Return API documentation
  return NextResponse.json({
    name: "Enhanced Chess Analysis API",
    version: "2.0",
    description:
      "Comprehensive chess analysis with enhanced FEN tracking and AI analysis",
    endpoints: {
      POST: {
        description:
          "Analyze chess game with enhanced FEN tracking and AI analysis",
        body: {
          fen: "string (required) - FEN position",
          analysisType: "string (optional) - Type of analysis",
          model: "string (optional) - OpenAI model to use",
          includePositionHistory:
            "boolean (optional) - Include full position history",
          includeAIAnalysis: "boolean (optional) - Include AI analysis",
          playerColor: "string (optional) - Player color for analysis",
          focusAreas: "array (optional) - Areas to focus analysis on",
        },
        response: {
          gameSource: 'string - Always "FEN"',
          analysisType: "string - Type of analysis performed",
          gameSummary: "object - Game summary statistics",
          currentPosition: "object - Current position data",
          positionHistory: "array - Full position history",
          moveSequence: "array - Move sequence with FEN data",
          currentPositionAnalysis: "object - AI analysis of current position",
          gameReview: "object - Comprehensive game review",
          moveByMoveAnalysis: "array - Move-by-move analysis",
          trainingData: "object - Generated training data",
          exportData: "object - Complete export data",
          positionSequence: "array - FEN position sequence",
          metadata: "object - Analysis metadata",
        },
      },
    },
    features: [
      "Enhanced FEN tracking for every position",
      "Comprehensive position metadata",
      "AI-powered move and position analysis",
      "Game review with key moments identification",
      "Training data generation for chess models",
      "Multiple analysis types and focus areas",
      "Real-time position tracking capabilities",
    ],
  });
}
