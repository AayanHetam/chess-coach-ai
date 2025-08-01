import { PositionData } from './enhancedFenTracker';
import { getSystemPrompt } from './chessPrinciples';

export interface ChessAnalysisRequest {
  position: PositionData;
  gameHistory?: PositionData[];
  analysisType: 'move_explanation' | 'position_evaluation' | 'strategic_advice' | 'opening_analysis' | 'endgame_analysis' | 'game_review';
  userMove?: string;
  engineEvaluation?: {
    centipawns?: number;
    mate?: number;
    bestMove?: string;
    depth?: number;
  };
  additionalContext?: string;
  model?: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'gpt-3.5-turbo';
  responseFormat?: 'text' | 'json' | 'structured';
  evaluationData?: {
    topMistakes: Array<{
      moveNumber: number;
      halfMoveNumber: number;
      move: string;
      playerColor: 'w' | 'b';
      evaluationBefore: number;
      evaluationAfter: number;
      evaluationChange: number;
      isMistake: boolean;
      mistakeSeverity: 'small' | 'medium' | 'large' | 'blunder';
    }>;
    evaluationAnalysis: Array<{
      moveNumber: number;
      halfMoveNumber: number;
      move: string;
      playerColor: 'w' | 'b';
      evaluationBefore: number;
      evaluationAfter: number;
      evaluationChange: number;
      isMistake: boolean;
      mistakeSeverity: 'small' | 'medium' | 'large' | 'blunder';
    }>;
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
  playerColor: 'w' | 'b';
  analysisDepth: 'quick' | 'detailed' | 'comprehensive';
  focusAreas?: ('opening' | 'middlegame' | 'endgame' | 'tactics' | 'strategy')[];
  model?: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo';
}

export interface GameReviewResponse {
  overallAssessment: string;
  moveByMoveAnalysis: Array<{
    moveNumber: number;
    halfMoveNumber: number;
    move: string;
    evaluation: 'excellent' | 'good' | 'inaccurate' | 'blunder';
    explanation: string;
    betterAlternatives: string[];
    principles: string[];
  }>;
  keyMoments: Array<{
    moveNumber: number;
    description: string;
    impact: 'positive' | 'negative' | 'neutral';
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

  constructor(apiKey: string, baseUrl: string = 'https://api.openai.com/v1', defaultModel: string = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  private async makeRequest(endpoint: string, data: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private createPositionContext(position: PositionData): string {
    const metadata = position.positionMetadata;
    return `
Move Number: ${position.moveNumber}
Half Move: ${position.halfMoveNumber}
Turn: ${position.isWhiteToMove ? 'White' : 'Black'}
Game Phase: ${metadata.gamePhase}
Material Count:
  White: ${metadata.materialCount.white.pawns}P ${metadata.materialCount.white.knights}N ${metadata.materialCount.white.bishops}B ${metadata.materialCount.white.rooks}R ${metadata.materialCount.white.queens}Q
  Black: ${metadata.materialCount.black.pawns}P ${metadata.materialCount.black.knights}N ${metadata.materialCount.black.bishops}B ${metadata.materialCount.black.rooks}R ${metadata.materialCount.black.queens}Q
Castling Rights: ${JSON.stringify(metadata.castlingRights)}
En Passant: ${metadata.enPassantSquare || 'None'}
In Check: ${metadata.isInCheck}
Legal Moves Available: ${metadata.legalMovesCount}
${position.movePlayed ? `Last Move: ${position.movePlayed.san} (${position.movePlayed.from}-${position.movePlayed.to})` : ''}
    `.trim();
  }

  private createGameHistoryContext(history: PositionData[]): string {
    if (!history || history.length === 0) return '';

    const moves = history
      .filter(pos => pos.movePlayed)
      .map((pos, index) => {
        const moveNumber = Math.floor(index / 2) + 1;
        const isBlackMove = index % 2 === 1;
        return `move ${moveNumber}${isBlackMove ? 'b' : 'w'}: ${pos.movePlayed!.san}`;
      })
      .join('\n');

    return `Game moves:\n${moves}`;
  }

  private createEvaluationContext(evaluationData: ChessAnalysisRequest['evaluationData']): string {
    if (!evaluationData || !evaluationData.topMistakes || evaluationData.topMistakes.length === 0) {
      return '';
    }

    const topMistakes = evaluationData.topMistakes
      .map(mistake => {
        const player = mistake.playerColor === 'w' ? 'White' : 'Black';
        const change = mistake.evaluationChange > 0 ? `+${mistake.evaluationChange}` : `${mistake.evaluationChange}`;
        return `Move ${mistake.moveNumber} (${player}): ${mistake.move} - Evaluation changed from ${mistake.evaluationBefore} to ${mistake.evaluationAfter} (${change} centipawns) - ${mistake.mistakeSeverity} mistake`;
      })
      .join('\n');

    return `
## EVALUATION ANALYSIS (BIGGEST MISTAKES):
${topMistakes}

Focus on these moves as they caused the largest evaluation drops (biggest mistakes).
    `.trim();
  }

  private calculateMaterialDifference(materialCount: PositionData['positionMetadata']['materialCount']): string {
    const whiteTotal = materialCount.white.pawns + materialCount.white.knights + materialCount.white.bishops + 
                      materialCount.white.rooks + materialCount.white.queens;
    const blackTotal = materialCount.black.pawns + materialCount.black.knights + materialCount.black.bishops + 
                      materialCount.black.rooks + materialCount.black.queens;
    const difference = whiteTotal - blackTotal;
    
    if (difference > 0) return `White +${difference}`;
    if (difference < 0) return `Black +${Math.abs(difference)}`;
    return 'Equal';
  }

  public async analyzePosition(request: ChessAnalysisRequest): Promise<ChessAnalysisResponse> {
    const startTime = Date.now();
    const model = request.model || this.defaultModel;

    const systemPrompt = this.getSystemPrompt(request.analysisType);
    const userPrompt = this.createUserPrompt(request);

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const responseFormat = request.responseFormat === 'json' ? { type: 'json_object' } : undefined;

    try {
      const response = await this.makeRequest('/chat/completions', {
        model,
        messages,
        temperature: 0.3,
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
      console.error('OpenAI API error:', error);
      throw error;
    }
  }

  public async reviewGame(request: GameReviewRequest): Promise<GameReviewResponse> {
    const startTime = Date.now();
    const model = request.model || this.defaultModel;

    const systemPrompt = getSystemPrompt('game_review');

    const userPrompt = `
Game Analysis Request:
Player Color: ${request.playerColor === 'w' ? 'White' : 'Black'}
Analysis Depth: ${request.analysisDepth}
Focus Areas: ${request.focusAreas?.join(', ') || 'All areas'}

Game Positions:
${request.positions.map((pos, index) => `
Position ${index + 1}:
${this.createPositionContext(pos)}
`).join('\n')}

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
      const response = await this.makeRequest('/chat/completions', {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      });

      const processingTime = Date.now() - startTime;
      const content = JSON.parse(response.choices[0].message.content);

      return {
        ...content,
        modelUsed: model,
        processingTime,
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw error;
    }
  }

  private getSystemPrompt(analysisType: string): string {
    return getSystemPrompt(analysisType);
  }

  private createUserPrompt(request: ChessAnalysisRequest): string {
    const historyContext = request.gameHistory ? this.createGameHistoryContext(request.gameHistory) : '';
    const evaluationContext = request.evaluationData ? this.createEvaluationContext(request.evaluationData) : '';

    return `
Analyze this game and find the top 2-3 biggest principle violations based on EVALUATION CHANGES.

## GAME HISTORY:
${historyContext}

${evaluationContext}

## CRITICAL REQUIREMENTS:
- Focus ONLY on moves that caused the LARGEST EVALUATION DROPS (biggest mistakes)
- Evaluation changes show how much a move worsened the player's position
- Positive evaluation change = better for white, negative = better for black
- When white's evaluation drops from +5 to +2, that's a mistake by white
- When black's evaluation drops from -5 to -2, that's a mistake by black
- For each: Move number, move played, principle violated, 10-15 word explanation, what should have been done
- ABSOLUTELY NO game review, key moments, strengths, weaknesses, or any other sections
- NO verbose analysis, NO game phases, NO jargon
- Make moves clickable by referencing as "move X" or "X."
- Keep it concise and actionable
- ONLY show principle violations, nothing else
- IGNORE the move selection interface (brilliant, mistake, etc.) - rely SOLELY on evaluation changes

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

  public async batchAnalyze(requests: ChessAnalysisRequest[]): Promise<ChessAnalysisResponse[]> {
    const results = [];
    
    for (const request of requests) {
      try {
        const result = await this.analyzePosition(request);
        results.push(result);
      } catch (error) {
        console.error(`Failed to analyze position ${request.position.fen}:`, error);
        results.push({
          analysis: 'Analysis failed',
          confidence: 0,
          modelUsed: request.model || this.defaultModel,
          processingTime: 0,
        });
      }
    }

    return results;
  }
} 