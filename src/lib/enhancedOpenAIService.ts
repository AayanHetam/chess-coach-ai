import { PositionData } from "./enhancedFenTracker";
import { getSystemPrompt } from "./chessPrinciples";
import { moveLineUciToSan } from "./chess";
import { Chess } from "chess.js";

export interface ChessAnalysisRequest {
  position: PositionData;
  gameHistory?: PositionData[];
  analysisType:
    | "move_explanation"
    | "position_evaluation"
    | "strategic_advice"
    | "opening_analysis"
    | "endgame_analysis"
    | "game_review";
  userMove?: string;
  engineEvaluation?: {
    centipawns?: number;
    mate?: number;
    bestMove?: string;
    depth?: number;
  };
  additionalContext?: string;
  systemPromptOverride?: string;
  userMessage?: string;
  model?: "gpt-4o" | "gpt-4o-high" | "gpt-4o-mini" | "gpt-4-turbo" | "gpt-3.5-turbo";
  responseFormat?: "text" | "json" | "structured";
  evaluationData?: {
    topMistakes: Array<{
      moveNumber: number;
      halfMoveNumber: number;
      move: string;
      playerColor: "w" | "b";
      evaluationBefore: number;
      evaluationAfter: number;
      evaluationChange: number;
      isMistake: boolean;
      mistakeSeverity: "small" | "medium" | "large" | "blunder";
    }>;
    evaluationAnalysis: Array<{
      moveNumber: number;
      halfMoveNumber: number;
      move: string;
      playerColor: "w" | "b";
      evaluationBefore: number;
      evaluationAfter: number;
      evaluationChange: number;
      isMistake: boolean;
      mistakeSeverity: "small" | "medium" | "large" | "blunder";
    }>;
  };
  maiaPredictions?: Array<{
    positionIndex: number;
    fen: string;
    moveNumber: number;
    maiaMove?: string;
    confidence?: number;
    error?: string;
  }>;
  openingInfo?: {
    name: string;
    eco?: string;
    moves: number;
    isEarlyOpening: boolean;
  };
  tacticalThemes?: string[];
  tacticalAnalysis?: string;
  similarPuzzles?: Array<{
    id: string;
    fen: string;
    themes: string[];
    rating: number;
    solution: string[];
  }>;
  userContext?: {
    username?: string;
    playerColor?: string;
    rating?: number;
  };
}

export interface ChessAnalysisResponse {
  analysis: string;
  structuredData?: {
    evaluation: number;
    bestMoves: Array<{
      move: string;
      reason: string;
      evaluation: number;
    }>;
    principles: string[];
    suggestions: string[];
  };
  confidence: number;
  modelUsed: string;
  processingTime: number;
}

export interface GameReviewRequest {
  positions: PositionData[];
  playerColor: "w" | "b";
  analysisDepth: "quick" | "detailed" | "comprehensive";
  focusAreas?: (
    | "opening"
    | "middlegame"
    | "endgame"
    | "tactics"
    | "strategy"
  )[];
  model?: "gpt-4o" | "gpt-4o-high" | "gpt-4o-mini" | "gpt-4-turbo";
}

export interface GameReviewResponse {
  overallAssessment: string;
  moveByMoveAnalysis: Array<{
    moveNumber: number;
    halfMoveNumber: number;
    move: string;
    evaluation: "excellent" | "good" | "inaccurate" | "blunder";
    explanation: string;
    betterAlternatives: string[];
    principles: string[];
  }>;
  keyMoments: Array<{
    moveNumber: number;
    description: string;
    impact: "positive" | "negative" | "neutral";
  }>;
  improvementAreas: string[];
  strengths: string[];
  modelUsed: string;
  processingTime: number;
}

export class EnhancedOpenAIService {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(
    apiKey: string,
    baseUrl: string = "https://api.openai.com/v1",
    defaultModel: string = "gpt-4o-high"
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  private async makeRequest(endpoint: string, data: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  private createPositionContext(position: PositionData): string {
    const metadata = position.positionMetadata;
    return `
Move Number: ${position.moveNumber}
Half Move: ${position.halfMoveNumber}
Turn: ${position.isWhiteToMove ? "White" : "Black"}
Game Phase: ${metadata.gamePhase}
Material Count:
  White: ${metadata.materialCount.white.pawns}P ${metadata.materialCount.white.knights}N ${metadata.materialCount.white.bishops}B ${metadata.materialCount.white.rooks}R ${metadata.materialCount.white.queens}Q
  Black: ${metadata.materialCount.black.pawns}P ${metadata.materialCount.black.knights}N ${metadata.materialCount.black.bishops}B ${metadata.materialCount.black.rooks}R ${metadata.materialCount.black.queens}Q
Castling Rights: ${JSON.stringify(metadata.castlingRights)}
En Passant: ${metadata.enPassantSquare || "None"}
In Check: ${metadata.isInCheck}
Legal Moves Available: ${metadata.legalMovesCount}
${position.movePlayed ? `Last Move: ${position.movePlayed.san} (${position.movePlayed.from}-${position.movePlayed.to})` : ""}
    `.trim();
  }

  private createGameHistoryContext(history: PositionData[]): string {
    if (!history || history.length === 0) return "";

    const moves = history
      .filter((pos) => pos.movePlayed)
      .map((pos, index) => {
        const moveNumber = Math.floor(index / 2) + 1;
        const isBlackMove = index % 2 === 1;
        return `move ${moveNumber}${isBlackMove ? "b" : "w"}: ${pos.movePlayed!.san}`;
      })
      .join("\n");

    return `Game moves:\n${moves}`;
  }

  private createEvaluationContext(
    evaluationData: ChessAnalysisRequest["evaluationData"]
  ): string {
    if (
      !evaluationData ||
      !evaluationData.topMistakes ||
      evaluationData.topMistakes.length === 0
    ) {
      return "";
    }

    const topMistakes = evaluationData.topMistakes
      .map((mistake) => {
        const player = mistake.playerColor === "w" ? "White" : "Black";
        const change =
          mistake.evaluationChange > 0
            ? `+${mistake.evaluationChange}`
            : `${mistake.evaluationChange}`;
        return `Move ${mistake.moveNumber} (${player}): ${mistake.move} - Evaluation changed from ${mistake.evaluationBefore} to ${mistake.evaluationAfter} (${change} centipawns) - ${mistake.mistakeSeverity} mistake`;
      })
      .join("\n");

    return `
## EVALUATION ANALYSIS (BIGGEST MISTAKES - USE THESE EXACT MOVES):
${topMistakes}

IMPORTANT: These moves are already sorted by biggest evaluation drops (biggest mistakes first).
Use ONLY these moves in your analysis - do not repeat moves or invent new ones.
Each move should appear only once in your response.
    `.trim();
  }

  private calculateMaterialDifference(
    materialCount: PositionData["positionMetadata"]["materialCount"]
  ): string {
    const whiteTotal =
      materialCount.white.pawns +
      materialCount.white.knights +
      materialCount.white.bishops +
      materialCount.white.rooks +
      materialCount.white.queens;
    const blackTotal =
      materialCount.black.pawns +
      materialCount.black.knights +
      materialCount.black.bishops +
      materialCount.black.rooks +
      materialCount.black.queens;
    const difference = whiteTotal - blackTotal;

    if (difference > 0) return `White +${difference}`;
    if (difference < 0) return `Black +${Math.abs(difference)}`;
    return "Equal";
  }

  public async analyzePosition(
    request: ChessAnalysisRequest
  ): Promise<ChessAnalysisResponse> {
    const startTime = Date.now();
    const model = request.model || this.defaultModel;

    // Use custom system prompt if provided, otherwise use default
    // Check explicitly for non-empty string to avoid using empty strings as valid prompts
    const hasCustomSystemPrompt =
      request.systemPromptOverride &&
      request.systemPromptOverride.trim() !== "";
    const systemPrompt = hasCustomSystemPrompt
      ? request.systemPromptOverride
      : this.getSystemPrompt(request.analysisType);

    // Debug logging
    console.log(
      "🔍 OpenAI Service - systemPromptOverride:",
      request.systemPromptOverride
    );
    console.log(
      "🔍 OpenAI Service - hasCustomSystemPrompt:",
      hasCustomSystemPrompt
    );
    console.log(
      "🔍 OpenAI Service - Final systemPrompt used:",
      systemPrompt?.substring(0, 100) + "..."
    );

    // If custom system prompt is provided, use a flexible user prompt that respects the system prompt
    // Otherwise, use the default principle violation analysis prompt
    const userPrompt = hasCustomSystemPrompt
      ? this.createFlexibleUserPrompt(request, request.userMessage)
      : this.createUserPrompt(request, request.userMessage);

    // Add Maia, opening, tactical theme, and puzzle dataset context to user prompt
    const maiaContext = this.createMaiaContext(
      request.maiaPredictions,
      request.gameHistory
    );
    const openingContext = this.createOpeningContext(request.openingInfo);
    const tacticalContext = this.createTacticalContext(
      request.tacticalThemes,
      request.tacticalAnalysis,
      request.similarPuzzles
    );
    
    // Append contexts to user prompt
    const enhancedUserPrompt = userPrompt + maiaContext + openingContext + tacticalContext;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: enhancedUserPrompt },
    ];

    const responseFormat =
      request.responseFormat === "json" ? { type: "json_object" } : undefined;

    try {
      const response = await this.makeRequest("/chat/completions", {
        model,
        messages,
        temperature: 0.7, // Higher temperature for more natural, reasoning-based responses
        max_tokens: 2000,
        response_format: responseFormat,
      });

      const processingTime = Date.now() - startTime;
      const content = response.choices[0].message.content;

      return {
        analysis: content,
        confidence: 0.85, // Placeholder - could be enhanced with model confidence scores
        modelUsed: model,
        processingTime,
      };
    } catch (error) {
      console.error("OpenAI API error:", error);
      throw error;
    }
  }

  public async reviewGame(
    request: GameReviewRequest
  ): Promise<GameReviewResponse> {
    const startTime = Date.now();
    const model = request.model || this.defaultModel;

    const systemPrompt = getSystemPrompt("game_review");

    const userPrompt = `
Game Analysis Request:
Player Color: ${request.playerColor === "w" ? "White" : "Black"}
Analysis Depth: ${request.analysisDepth}
Focus Areas: ${request.focusAreas?.join(", ") || "All areas"}

Game Positions:
${request.positions
  .map(
    (pos, index) => `
Position ${index + 1}:
${this.createPositionContext(pos)}
`
  )
  .join("\n")}

Please provide a comprehensive game review in JSON format with the following structure:
{
  "overallAssessment": "string",
  "moveByMoveAnalysis": [
    {
      "moveNumber": number,
      "halfMoveNumber": number,
      "move": "string",
      "evaluation": "excellent|good|inaccurate|blunder",
      "explanation": "string",
      "betterAlternatives": ["string"],
      "principles": ["string"]
    }
  ],
  "keyMoments": [
    {
      "moveNumber": number,
      "description": "string",
      "impact": "positive|negative|neutral"
    }
  ],
  "improvementAreas": ["string"],
  "strengths": ["string"]
}
`;

    try {
      const response = await this.makeRequest("/chat/completions", {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      });

      const processingTime = Date.now() - startTime;
      const content = JSON.parse(response.choices[0].message.content);

      return {
        ...content,
        modelUsed: model,
        processingTime,
      };
    } catch (error) {
      console.error("OpenAI API error:", error);
      throw error;
    }
  }

  private getSystemPrompt(analysisType: string): string {
    return getSystemPrompt(analysisType);
  }

  // Flexible user prompt that respects custom system prompts
  private createFlexibleUserPrompt(
    request: ChessAnalysisRequest,
    userMessage?: string
  ): string {
    const historyContext = request.gameHistory
      ? this.createGameHistoryContext(request.gameHistory)
      : "";

    // Build Stockfish evaluation context for each position, including current position and best moves for mistakes
    const stockfishContext = this.createStockfishEvaluationContext(
      request.gameHistory,
      request.position,
      request.evaluationData
    );

    // Build evaluation context as informational reference (not prescriptive)
    const evaluationContext = request.evaluationData
      ? this.createInformationalEvaluationContext(request.evaluationData)
      : "";

    // Build context - let ChatGPT use its reasoning to understand and fulfill the request
    let prompt = "";

    if (userMessage && userMessage.trim() !== "") {
      prompt += `## USER REQUEST:\n${userMessage}\n\n`;
      prompt += `Use your reasoning to understand what the user is asking for, then use the Stockfish evaluations and game data provided below to fulfill their request.\n`;
      prompt += `Think: What do they want? What information is available? How can you use it to answer their question?\n\n`;
    }

    if (historyContext) {
      prompt += `## GAME HISTORY:\n${historyContext}\n\n`;
    }

    if (stockfishContext) {
      prompt += `## STOCKFISH ENGINE ANALYSIS:\n${stockfishContext}\n\n`;
    }

    if (evaluationContext) {
      prompt += `${evaluationContext}\n\n`;
    }

    // Let ChatGPT use its reasoning to understand the request and provide an appropriate response
    prompt +=
      'Use the Stockfish engine analysis and game context provided above to answer the user\'s request intelligently.\n';
    prompt +=
      'When suggesting moves, use the exact moves shown in the Stockfish analysis (they are in SAN notation like "e4", "Nf3", "O-O", etc.).\n';
    prompt +=
      'When suggesting what move should have been played instead of a mistake, use the move from the "CORRECT MOVES FOR MISTAKES" section, which shows the best move from the position BEFORE the mistake was played.\n';
    prompt +=
      'Think through what the user is asking for, then use the available data to provide a helpful, direct answer.';

    return prompt.trim();
  }

  // Create informational evaluation context (non-prescriptive) for flexible prompts
  private createInformationalEvaluationContext(
    evaluationData: ChessAnalysisRequest["evaluationData"]
  ): string {
    if (
      !evaluationData ||
      !evaluationData.topMistakes ||
      evaluationData.topMistakes.length === 0
    ) {
      return "";
    }

    const topMistakes = evaluationData.topMistakes
      .map((mistake) => {
        const player = mistake.playerColor === "w" ? "White" : "Black";
        const change =
          mistake.evaluationChange > 0
            ? `+${mistake.evaluationChange}`
            : `${mistake.evaluationChange}`;
        return `Move ${mistake.moveNumber} (${player}): ${mistake.move} - Evaluation changed from ${mistake.evaluationBefore} to ${mistake.evaluationAfter} (${change} centipawns) - ${mistake.mistakeSeverity} mistake`;
      })
      .join("\n");

    return `
## EVALUATION DATA (For Reference):
${topMistakes}

Note: This evaluation data shows moves with significant evaluation changes. Use this information to inform your analysis, but respond according to what the user is asking for.
    `.trim();
  }

  // Create Maia prediction context
  private createMaiaContext(
    maiaPredictions?: ChessAnalysisRequest["maiaPredictions"],
    gameHistory?: PositionData[]
  ): string {
    if (!maiaPredictions || maiaPredictions.length === 0) {
      return "";
    }

    let context = "\n\n=== MAIA HUMAN-LIKE MOVE PREDICTIONS ===\n";
    context +=
      "Maia predicts what humans at your rating level would play. Use this to:\n";
    context +=
      "- Identify if the user played a common human move (even if not optimal)\n";
    context +=
      "- Explain why humans choose certain moves at this level\n";
    context +=
      "- Provide personalized feedback based on human tendencies\n\n";

    // Group predictions by move number
    const predictionsByMove: Record<
      number,
      Array<{
        maiaMove: string;
        confidence: number;
        userMove?: string;
      }>
    > = {};

    for (const pred of maiaPredictions) {
      if (pred.maiaMove && pred.confidence !== undefined) {
        if (!predictionsByMove[pred.moveNumber]) {
          predictionsByMove[pred.moveNumber] = [];
        }

        // Get user's actual move for this position
        let userMove: string | undefined;
        if (gameHistory && pred.positionIndex < gameHistory.length) {
          const position = gameHistory[pred.positionIndex];
          userMove = position.movePlayed?.san;
        }

        predictionsByMove[pred.moveNumber].push({
          maiaMove: pred.maiaMove,
          confidence: pred.confidence,
          userMove,
        });
      }
    }

    // Format predictions
    for (const [moveNumber, predictions] of Object.entries(predictionsByMove)) {
      const pred = predictions[0]; // Use first prediction for this move
      context += `Move ${moveNumber}: `;
      if (pred.userMove) {
        context += `User played: ${pred.userMove}, `;
        if (pred.userMove === pred.maiaMove) {
          context +=
            "Maia predicted this move (common human choice at your level). ";
        } else {
          context += `Maia predicted: ${pred.maiaMove} (confidence: ${(
            pred.confidence * 100
          ).toFixed(1)}%). `;
        }
      } else {
        context += `Maia predicts: ${pred.maiaMove} (confidence: ${(
          pred.confidence * 100
        ).toFixed(1)}%). `;
      }
      context += "\n";
    }

    return context;
  }

  // Create tactical theme context
  private createTacticalContext(
    tacticalThemes?: string[],
    tacticalAnalysis?: string,
    similarPuzzles?: Array<{
      id: string;
      fen: string;
      themes: string[];
      rating: number;
      solution: string[];
    }>
  ): string {
    let context = "\n\n=== TACTICAL THEME ANALYSIS (Based on Lichess Chess Puzzles Dataset) ===\n";
    
    if (tacticalThemes && tacticalThemes.length > 0) {
      if (tacticalAnalysis) {
        context += tacticalAnalysis;
      } else {
        context += `Identified tactical themes: ${tacticalThemes.join(", ")}\n`;
        context += "Use these themes to explain WHY Stockfish's suggested moves are strong. ";
        context += "Connect the tactical patterns to specific moves in the principal variation.\n";
      }
    } else {
      context += "No specific tactical themes identified in this position.\n";
    }

    // Add similar puzzles from Lichess dataset
    if (similarPuzzles && similarPuzzles.length > 0) {
      context += "\n=== SIMILAR PUZZLES FROM LICHESS DATASET ===\n";
      context += `Found ${similarPuzzles.length} similar puzzles from the Lichess chess puzzles dataset:\n\n`;
      
      similarPuzzles.forEach((puzzle, index) => {
        context += `Puzzle ${index + 1}:\n`;
        context += `- Themes: ${puzzle.themes.join(", ")}\n`;
        context += `- Rating: ${puzzle.rating}\n`;
        if (puzzle.solution && puzzle.solution.length > 0) {
          context += `- Solution: ${puzzle.solution.slice(0, 5).join(" ")}${puzzle.solution.length > 5 ? "..." : ""}\n`;
        }
        context += "\n";
      });
      
      context += "Use these similar puzzles to:\n";
      context += "1. Explain how the tactical patterns work in similar positions\n";
      context += "2. Reference common tactical themes that appear in puzzle positions\n";
      context += "3. Help users understand that these patterns occur frequently in real games\n";
      context += "4. Connect the current position to well-known puzzle patterns\n\n";
    }

    context += "When explaining moves, reference the specific tactical patterns identified. ";
    context += "For example, if a 'fork' theme is identified, explain how the move creates a fork ";
    context += "and why that's tactically advantageous. If similar puzzles are provided, reference ";
    context += "how the same tactical pattern appears in those puzzles. This helps users understand ";
    context += "the reasoning behind Stockfish's suggestions, not just that they're the 'best moves'.\n";

    return context;
  }

  // Create opening context
  private createOpeningContext(
    openingInfo?: ChessAnalysisRequest["openingInfo"]
  ): string {
    if (!openingInfo) {
      return "";
    }

    let context = "\n\n=== OPENING INFORMATION ===\n";
    context += `Opening: ${openingInfo.name}`;
    if (openingInfo.eco) {
      context += ` (${openingInfo.eco})`;
    }
    context += `\nOpening moves: ${openingInfo.moves}`;
    context += `\nIs early opening: ${openingInfo.isEarlyOpening}\n`;

    if (openingInfo.isEarlyOpening) {
      context +=
        "\nIMPORTANT: Do NOT critique opening moves. Instead, acknowledge the opening and analyze from move 11+.\n";
      context +=
        "Example: 'Let's analyze your Vienna game' instead of '2.Nc3 is a mistake'.\n";
    }

    return context;
  }

  // Create detailed Stockfish evaluation context from game history
  private createStockfishEvaluationContext(
    history?: PositionData[],
    currentPosition?: PositionData,
    evaluationData?: ChessAnalysisRequest["evaluationData"]
  ): string {
    const evaluations: string[] = [];

    // Create a map of halfMoveNumber to position for quick lookup
    const positionMap = new Map<number, PositionData>();
    if (history) {
      history.forEach((pos) => {
        positionMap.set(pos.halfMoveNumber, pos);
      });
    }

    // Add best moves for mistakes (from position BEFORE the mistake)
    if (evaluationData && evaluationData.topMistakes && history) {
      const mistakeEvals: string[] = [];
      evaluationData.topMistakes.forEach((mistake) => {
        // Get position BEFORE the mistake (halfMoveNumber - 1)
        const positionBeforeMistake = positionMap.get(
          mistake.halfMoveNumber - 1
        );
        if (positionBeforeMistake && positionBeforeMistake.evaluation) {
          const evaluation = positionBeforeMistake.evaluation;

          // Convert UCI bestMove to SAN (this is what the user SHOULD have played)
          let bestMoveSan = "N/A";
          if (evaluation.bestMove && evaluation.bestMove !== "N/A") {
            try {
              const uciToSan = moveLineUciToSan(positionBeforeMistake.fen);
              bestMoveSan = uciToSan(evaluation.bestMove);
            } catch {
              bestMoveSan = evaluation.bestMove; // Fallback to UCI if conversion fails
            }
          }

          const player = mistake.playerColor === "w" ? "White" : "Black";
          mistakeEvals.push(
            `Before move ${mistake.moveNumber} (${player} played ${mistake.move}): Best Move = ${bestMoveSan} (what ${player} should have played instead)`
          );
        }
      });

      if (mistakeEvals.length > 0) {
        evaluations.push("CORRECT MOVES FOR MISTAKES:");
        evaluations.push(...mistakeEvals);
        evaluations.push(""); // Empty line separator
      }
    }

    // Add evaluations from game history
    if (history && history.length > 0) {
      const historyEvals = history
        .filter((pos) => pos.evaluation)
        .map((pos) => {
          const evaluation = pos.evaluation!;
          const moveNum = pos.moveNumber;
          const move = pos.movePlayed?.san || "N/A";
          const centipawns = evaluation.centipawns ?? 0;
          const pawns = (centipawns / 100).toFixed(2);
          const mate = evaluation.mate;

          // Convert UCI bestMove to SAN
          let bestMoveSan = "N/A";
          if (evaluation.bestMove && evaluation.bestMove !== "N/A") {
            try {
              const uciToSan = moveLineUciToSan(pos.fen);
              bestMoveSan = uciToSan(evaluation.bestMove);
            } catch {
              bestMoveSan = evaluation.bestMove; // Fallback to UCI if conversion fails
            }
          }

          // Convert principal variation from UCI to SAN (must convert sequentially)
          let pvSan = "N/A";
          if (
            evaluation.principalVariation &&
            evaluation.principalVariation.length > 0
          ) {
            try {
              const tempGame = new Chess(pos.fen);
              const pvMoves: string[] = [];
              for (const uciMove of evaluation.principalVariation.slice(0, 3)) {
                try {
                  const move = tempGame.move({
                    from: uciMove.slice(0, 2),
                    to: uciMove.slice(2, 4),
                    promotion: uciMove.slice(4) || undefined,
                  });
                  if (move) {
                    pvMoves.push(move.san);
                  } else {
                    break;
                  }
                } catch {
                  break;
                }
              }
              pvSan = pvMoves.length > 0 ? pvMoves.join(" ") : "N/A";
            } catch {
              pvSan = evaluation.principalVariation.slice(0, 3).join(" "); // Fallback to UCI
            }
          }

          const depth = evaluation.depth || "N/A";

          let evalStr = "";
          if (mate !== undefined) {
            evalStr = `Mate in ${Math.abs(mate)} (${mate > 0 ? "White" : "Black"} wins)`;
          } else {
            const sign = centipawns >= 0 ? "+" : "";
            evalStr = `${sign}${pawns} pawns`;
          }

          return `After move ${moveNum} (${move}): Evaluation = ${evalStr}, Best Move = ${bestMoveSan}, Depth = ${depth}, Principal Variation = ${pvSan}`;
        });

      evaluations.push(...historyEvals);
    }

    // Add current position evaluation if available
    if (currentPosition && currentPosition.evaluation) {
      const evaluation = currentPosition.evaluation;
      const centipawns = evaluation.centipawns ?? 0;
      const pawns = (centipawns / 100).toFixed(2);
      const mate = evaluation.mate;

      // Convert UCI bestMove to SAN for current position
      let bestMoveSan = "N/A";
      if (evaluation.bestMove && evaluation.bestMove !== "N/A") {
        try {
          const uciToSan = moveLineUciToSan(currentPosition.fen);
          bestMoveSan = uciToSan(evaluation.bestMove);
        } catch {
          bestMoveSan = evaluation.bestMove; // Fallback to UCI if conversion fails
        }
      }

      // Convert principal variation from UCI to SAN (must convert sequentially)
      let pvSan = "N/A";
      if (
        evaluation.principalVariation &&
        evaluation.principalVariation.length > 0
      ) {
        try {
          const tempGame = new Chess(currentPosition.fen);
          const pvMoves: string[] = [];
          for (const uciMove of evaluation.principalVariation.slice(0, 3)) {
            try {
              const move = tempGame.move({
                from: uciMove.slice(0, 2),
                to: uciMove.slice(2, 4),
                promotion: uciMove.slice(4) || undefined,
              });
              if (move) {
                pvMoves.push(move.san);
              } else {
                break;
              }
            } catch {
              break;
            }
          }
          pvSan = pvMoves.length > 0 ? pvMoves.join(" ") : "N/A";
        } catch {
          pvSan = evaluation.principalVariation.slice(0, 3).join(" "); // Fallback to UCI
        }
      }

      const depth = evaluation.depth || "N/A";

      let evalStr = "";
      if (mate !== undefined) {
        evalStr = `Mate in ${Math.abs(mate)} (${mate > 0 ? "White" : "Black"} wins)`;
      } else {
        const sign = centipawns >= 0 ? "+" : "";
        evalStr = `${sign}${pawns} pawns`;
      }

      evaluations.push(
        `Current position: Evaluation = ${evalStr}, Best Move = ${bestMoveSan}, Depth = ${depth}, Principal Variation = ${pvSan}`
      );
    }

    if (evaluations.length === 0) return "";

    return `Stockfish engine evaluations:\n${evaluations.join("\n")}\n\nUse these engine evaluations to provide accurate move analysis and feedback. Always suggest the best moves shown by Stockfish.`;
  }

  private createUserPrompt(
    request: ChessAnalysisRequest,
    userMessage?: string
  ): string {
    const historyContext = request.gameHistory
      ? this.createGameHistoryContext(request.gameHistory)
      : "";
    const evaluationContext = request.evaluationData
      ? this.createEvaluationContext(request.evaluationData)
      : "";

    // If user provided a specific message/question, prioritize that over automatic analysis
    if (
      userMessage &&
      userMessage.trim() !== "" &&
      userMessage.toLowerCase() !== "analyze my game"
    ) {
      // User wants custom interaction - provide game context and let them ask questions
      return `
## USER QUESTION:
${userMessage}

## GAME CONTEXT:
${historyContext ? `\n${historyContext}` : ""}
${evaluationContext ? `\n${evaluationContext}` : ""}

Please respond to the user's question using the game context provided above. Be helpful and conversational.
      `.trim();
    }

    // Default: Automatic principle violation analysis (only if no custom user message)
    // Include user message if provided
    const userMessageSection =
      userMessage && userMessage.trim() !== ""
        ? `## USER QUESTION/MESSAGE:\n${userMessage}\n\n`
        : "";

    return `
${userMessageSection}Analyze this game and find the top 2-3 biggest principle violations based on EVALUATION CHANGES.

## GAME HISTORY:
${historyContext}

${evaluationContext}

## CRITICAL REQUIREMENTS:
- Focus ONLY on moves that caused evaluation drops of MORE THAN 1 POINT (100 centipawns)
- Analyze ONLY the USER'S moves (the player whose perspective the board is shown from)
- If board is oriented for White, analyze only White's mistakes
- If board is oriented for Black, analyze only Black's mistakes
- Any move by the user that worsens their position by more than 1 point is eligible for analysis
- Show the TOP 3 BIGGEST violations by the user (or fewer if there are fewer than 3)
- In high-level play, the user may have only 1 significant mistake
- For each: Move number, move played, principle violated, 10-15 word explanation, what should have been done
- ABSOLUTELY NO game review, key moments, strengths, weaknesses, or any other sections
- NO verbose analysis, NO game phases, NO jargon
- Make moves clickable by referencing as "move X" or "X."
- Keep it concise and actionable
- ONLY show principle violations by the user, nothing else
- IGNORE the move selection interface (brilliant, mistake, etc.) - rely SOLELY on evaluation changes
- Accuracy and valid feedback are more important than speed
- DO NOT repeat the same move multiple times - each move should appear only once
- Use ONLY the moves provided in the evaluation analysis - do not invent or guess moves
- The moves in the evaluation analysis are already sorted by biggest mistakes first



RESPONSE FORMAT (ONLY THIS):
Top 2-3 Principle Violations:
- Move X: [move played] - [Principle violated] - [10-15 word explanation] - [What should have been done]
- Move Y: [move played] - [Principle violated] - [10-15 word explanation] - [What should have been done]
- Move Z: [move played] - [Principle violated] - [10-15 word explanation] - [What should have been done]

DO NOT ADD ANY OTHER SECTIONS.
    `.trim();
  }

  public async generateTrainingData(positions: PositionData[]): Promise<{
    trainingExamples: Array<{
      input: string;
      output: string;
      metadata: any;
    }>;
  }> {
    const trainingExamples = [];

    for (const position of positions) {
      if (!position.movePlayed) continue;

      const input = this.createPositionContext(position);
      const output = `Move played: ${position.movePlayed.san}
Reason: [AI-generated explanation of why this move was played]
Evaluation: [AI-generated evaluation of the move quality]
Principles: [AI-generated list of chess principles that apply]`;

      trainingExamples.push({
        input,
        output,
        metadata: {
          moveNumber: position.moveNumber,
          halfMoveNumber: position.halfMoveNumber,
          move: position.movePlayed.san,
          fen: position.fen,
          gamePhase: position.positionMetadata.gamePhase,
        },
      });
    }

    return { trainingExamples };
  }

  public async batchAnalyze(
    requests: ChessAnalysisRequest[]
  ): Promise<ChessAnalysisResponse[]> {
    const results = [];

    for (const request of requests) {
      try {
        const result = await this.analyzePosition(request);
        results.push(result);
      } catch (error) {
        console.error(
          `Failed to analyze position ${request.position.fen}:`,
          error
        );
        results.push({
          analysis: "Analysis failed",
          confidence: 0,
          modelUsed: request.model || this.defaultModel,
          processingTime: 0,
        });
      }
    }

    return results;
  }
}
