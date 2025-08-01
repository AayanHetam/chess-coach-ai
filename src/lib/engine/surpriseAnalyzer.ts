import { Chess } from 'chess.js';
import { PositionEval } from '@/types/eval';
import { getSurpriseEngineService } from './surpriseEngineService';

export interface SurpriseAnalysis {
  move: string;
  moveNumber: number;
  surpriseScore: number;
  lowDepthEval: number;
  highDepthEval: number;
  bestMove: string;
  movePurpose: 'tactical' | 'positional' | 'defensive' | 'development' | 'preventive' | 'unknown';
  explanation: string;
  severity: 'minor' | 'moderate' | 'major';
}

export interface GameSurpriseAnalysis {
  moves: SurpriseAnalysis[];
  overallAssessment: string;
  keyInsights: string[];
}

/**
 * Chess Surprise Analysis based on CYHSM/chess-surprise-analysis repository
 * 
 * Core methodology:
 * 1. Compare low-depth (human-like) vs high-depth (engine-like) evaluations
 * 2. Calculate "surprise score" as the difference
 * 3. Classify moves based on surprise score and characteristics
 * 4. Generate explanations for why moves are surprising
 */
export async function analyzeGameSurprises(
  gameHistory: string[],
  userColor: 'white' | 'black',
  engineAnalysis?: PositionEval
): Promise<GameSurpriseAnalysis> {
  console.log('🎯 Starting surprise analysis for game with', gameHistory.length, 'moves');
  const chess = new Chess();
  const moves: SurpriseAnalysis[] = [];
  const keyInsights: string[] = [];
  
  // Initialize the engine service
  const engineService = getSurpriseEngineService();
  console.log('🔄 Initializing engine service for surprise analysis...');
  try {
    await engineService.initialize();
    console.log('✅ Engine service initialized for surprise analysis');
  } catch (error) {
    console.error('❌ Failed to initialize engine service for surprise analysis:', error);
    // Return empty analysis if engine fails
    return {
      moves: [],
      overallAssessment: 'Engine analysis unavailable',
      keyInsights: []
    };
  }
  
  for (let i = 0; i < gameHistory.length; i++) {
    const move = gameHistory[i];
    const moveNumber = Math.floor(i / 2) + 1;
    const isUserMove = (userColor === 'white' && i % 2 === 0) || (userColor === 'black' && i % 2 === 1);
    
    if (isUserMove) {
      console.log(`🔄 Analyzing move ${moveNumber}. ${move} (user move)`);
      const positionBefore = new Chess(chess.fen());
      const analysis = await analyzeSingleMoveSurprise(
        move, 
        moveNumber, 
        positionBefore, 
        gameHistory.slice(0, i),
        engineService
      );
      moves.push(analysis);
      
      // Collect key insights for significant surprises
      if (analysis.surpriseScore > 1.0) {
        keyInsights.push(`Move ${moveNumber}. ${move}: ${analysis.explanation}`);
        console.log(`🚨 Significant surprise found: Move ${moveNumber}. ${move} (score: ${analysis.surpriseScore.toFixed(2)})`);
      }
    }
    
    // Make the move
    chess.move(move);
  }
  
  console.log('✅ Surprise analysis completed:', {
    totalMoves: moves.length,
    significantSurprises: keyInsights.length,
    overallAssessment: generateSurpriseAssessment(moves)
  });
  
  return {
    moves,
    overallAssessment: generateSurpriseAssessment(moves),
    keyInsights
  };
}

/**
 * Analyzes a single move using the surprise analysis methodology
 * Based on chess-surprise-analysis/csa/csa.py
 */
async function analyzeSingleMoveSurprise(
  move: string,
  moveNumber: number,
  positionBefore: Chess,
  previousMoves: string[],
  engineService: any
): Promise<SurpriseAnalysis> {
  console.log(`  🔍 Getting multi-depth evaluation for move ${moveNumber}. ${move}...`);
  
  // 1. Get multi-depth evaluation using real Stockfish engine
  const { lowDepthEval, highDepthEval, bestMove } = await engineService.getMultiDepthEvaluation(positionBefore);
  
  console.log(`  📊 Evaluation results:`, {
    lowDepth: lowDepthEval,
    highDepth: highDepthEval,
    bestMove: bestMove
  });
  
  // 2. Calculate surprise score (core of chess-surprise-analysis)
  const surpriseScore = Math.abs(highDepthEval - lowDepthEval) / 100; // Convert to centipawns
  
  console.log(`  🎯 Surprise score: ${surpriseScore.toFixed(2)}`);
  
  // 3. Determine move purpose based on surprise score and characteristics
  const movePurpose = determineMovePurposeFromSurprise(move, surpriseScore, lowDepthEval, highDepthEval);
  
  // 4. Generate explanation based on surprise analysis
  const explanation = generateSurpriseExplanation(move, moveNumber, surpriseScore, bestMove, movePurpose);
  
  // 5. Determine severity based on surprise score
  const severity = determineSeverity(surpriseScore);
  
  return {
    move,
    moveNumber,
    surpriseScore,
    lowDepthEval,
    highDepthEval,
    bestMove,
    movePurpose,
    explanation,
    severity
  };
}

/**
 * Determines move purpose based on surprise score and move characteristics
 * Based on chess-surprise-analysis methodology
 */
function determineMovePurposeFromSurprise(
  move: string, 
  surpriseScore: number, 
  lowDepthEval: number, 
  highDepthEval: number
): SurpriseAnalysis['movePurpose'] {
  // High surprise score indicates tactical mistake (from chess-surprise-analysis)
  if (surpriseScore > 1.0) {
    return 'tactical';
  }
  
  // Medium surprise score with specific characteristics
  if (surpriseScore > 0.5) {
    if (move.includes('Q') && !move.includes('x')) {
      return 'positional'; // Queen moves without capture
    }
    if (move.includes('p') && !isCenterPawnMove(move)) {
      return 'development'; // Non-central pawn moves
    }
    if (move.includes('K') && !move.includes('O')) {
      return 'defensive'; // King moves (not castling)
    }
  }
  
  // Low surprise score - likely good move
  if (surpriseScore < 0.2) {
    if (move.includes('O')) {
      return 'defensive'; // Castling
    }
    if (move.includes('N') || move.includes('B')) {
      return 'development'; // Piece development
    }
    if (move.includes('x')) {
      return 'tactical'; // Captures
    }
  }
  
  return 'unknown';
}

/**
 * Generates explanation based on surprise analysis
 * Based on chess-surprise-analysis explanation methodology
 */
function generateSurpriseExplanation(
  move: string,
  moveNumber: number,
  surpriseScore: number,
  bestMove: string,
  purpose: SurpriseAnalysis['movePurpose']
): string {
  let explanation = `Move ${moveNumber}. ${move}: `;
  
  if (surpriseScore > 1.0) {
    explanation += `This was a significant tactical mistake. The engine expected ${bestMove} which would be ${surpriseScore.toFixed(1)} centipawns better. `;
  } else if (surpriseScore > 0.5) {
    explanation += `This move was suboptimal. The engine preferred ${bestMove} by ${surpriseScore.toFixed(1)} centipawns. `;
  } else {
    explanation += `This was a reasonable move. `;
  }
  
  explanation += `The move's purpose was ${purpose}. `;
  
  // Add specific tactical insights based on move characteristics
  if (move.includes('+')) {
    explanation += `The move gives check. `;
  }
  if (move.includes('x')) {
    explanation += `The move captures material. `;
  }
  if (move.includes('O')) {
    explanation += `The move castles for king safety. `;
  }
  
  return explanation;
}

/**
 * Determines severity based on surprise score
 * Based on chess-surprise-analysis severity classification
 */
function determineSeverity(surpriseScore: number): SurpriseAnalysis['severity'] {
  if (surpriseScore > 2.0) {
    return 'major';
  } else if (surpriseScore > 1.0) {
    return 'moderate';
  } else {
    return 'minor';
  }
}

/**
 * Generates overall assessment based on surprise analysis
 * Based on chess-surprise-analysis assessment methodology
 */
function generateSurpriseAssessment(moves: SurpriseAnalysis[]): string {
  const majorSurprises = moves.filter(m => m.severity === 'major').length;
  const moderateSurprises = moves.filter(m => m.severity === 'moderate').length;
  const tacticalMistakes = moves.filter(m => m.movePurpose === 'tactical' && m.surpriseScore > 1.0).length;
  
  if (majorSurprises > 2) {
    return 'Multiple major tactical mistakes indicate need for better calculation and tactical awareness.';
  } else if (moderateSurprises > 3) {
    return 'Multiple moderate mistakes suggest need for better positional understanding.';
  } else if (tacticalMistakes > 2) {
    return 'Several tactical mistakes indicate need for better tactical calculation.';
  } else {
    return 'Generally good play with few significant surprises.';
  }
}

/**
 * Helper function to check if a pawn move is central
 */
function isCenterPawnMove(move: string): boolean {
  return move.includes('e4') || move.includes('e5') || move.includes('d4') || move.includes('d5');
} 