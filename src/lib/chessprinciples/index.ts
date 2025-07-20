import { Chess } from 'chess.js';
import { PositionEval } from '@/types/eval';
import { openingPrinciples, middlegamePrinciples, endgamePrinciples, generalPrinciples } from './principles';
import { analyzeOpeningPrinciples } from './analyzers/openingAnalyzer';
import { analyzeMiddlegamePrinciples } from './analyzers/middlegameAnalyzer';
import { analyzeEndgamePrinciples } from './analyzers/endgameAnalyzer';
import { analyzeGeneralPrinciples } from './analyzers/generalAnalyzer';

export interface ChessPrincipleViolation {
  principle: ChessPrinciple;
  severity: 'minor' | 'moderate' | 'major';
  description: string;
  shortTermImpact: string;
  longTermImpact: string;
}

export interface ChessPrinciple {
  id: string;
  name: string;
  description: string;
  category: 'opening' | 'middlegame' | 'endgame' | 'general';
  priority: number; // 1-10, higher is more important
}

export interface PrincipleAnalysis {
  gamePhase: 'opening' | 'middlegame' | 'endgame';
  appliedPrinciples: ChessPrinciple[];
  violatedPrinciples: ChessPrincipleViolation[];
  suggestedMove?: string;
  explanation: string;
}

export interface MoveComparison {
  userMove: string;
  bestMove: string;
  principleViolations: ChessPrincipleViolation[];
  missedOpportunities: ChessPrinciple[];
  overallAssessment: string;
}

export function determineGamePhase(position: Chess): 'opening' | 'middlegame' | 'endgame' {
  const moveCount = position.history().length;
  const pieces = position.board().flat().filter(p => p !== null);
  const majorPieces = pieces.filter(p => p && ['q', 'r'].includes(p.type)).length;
  
  // Opening: first 15 moves or pieces still being developed
  if (moveCount < 15) {
    return 'opening';
  }
  
  // Endgame: few pieces left (typically < 12 pieces total)
  if (pieces.length <= 12 || majorPieces <= 4) {
    return 'endgame';
  }
  
  return 'middlegame';
}

export function analyzePosition(
  position: Chess,
  evaluation: PositionEval,
  moveHistory?: string[]
): PrincipleAnalysis {
  const gamePhase = determineGamePhase(position);
  
  let appliedPrinciples: ChessPrinciple[] = [];
  let violatedPrinciples: ChessPrincipleViolation[] = [];
  
  // Analyze based on game phase
  switch (gamePhase) {
    case 'opening':
      const openingAnalysis = analyzeOpeningPrinciples(position, moveHistory);
      appliedPrinciples.push(...openingAnalysis.appliedPrinciples);
      violatedPrinciples.push(...openingAnalysis.violatedPrinciples);
      break;
      
    case 'middlegame':
      const middlegameAnalysis = analyzeMiddlegamePrinciples(position, evaluation);
      appliedPrinciples.push(...middlegameAnalysis.appliedPrinciples);
      violatedPrinciples.push(...middlegameAnalysis.violatedPrinciples);
      break;
      
    case 'endgame':
      const endgameAnalysis = analyzeEndgamePrinciples(position, evaluation);
      appliedPrinciples.push(...endgameAnalysis.appliedPrinciples);
      violatedPrinciples.push(...endgameAnalysis.violatedPrinciples);
      break;
  }
  
  // Always analyze general principles
  const generalAnalysis = analyzeGeneralPrinciples(position, evaluation);
  appliedPrinciples.push(...generalAnalysis.appliedPrinciples);
  violatedPrinciples.push(...generalAnalysis.violatedPrinciples);
  
  return {
    gamePhase,
    appliedPrinciples: appliedPrinciples.filter((p, i, arr) => 
      arr.findIndex(item => item.id === p.id) === i
    ),
    violatedPrinciples: violatedPrinciples.filter((v, i, arr) => 
      arr.findIndex(item => item.principle.id === v.principle.id) === i
    ),
    suggestedMove: evaluation.bestMove,
    explanation: generateExplanation(gamePhase, appliedPrinciples, violatedPrinciples)
  };
}

export function compareMoves(
  position: Chess,
  userMove: string,
  bestMove: string,
  evaluation: PositionEval,
  moveHistory?: string[]
): MoveComparison {
  // Analyze position before the move
  const beforeAnalysis = analyzePosition(position, evaluation, moveHistory);
  
  // Make user move and analyze
  const userPosition = new Chess(position.fen());
  try {
    userPosition.move(userMove);
    const userAnalysis = analyzePosition(userPosition, evaluation, moveHistory);
    
    // Make best move and analyze
    const bestPosition = new Chess(position.fen());
    bestPosition.move(bestMove);
    const bestAnalysis = analyzePosition(bestPosition, evaluation, moveHistory);
    
    // Compare principle violations
    const principleViolations: ChessPrincipleViolation[] = [];
    const missedOpportunities: ChessPrinciple[] = [];
    
    // Find principles that the best move follows but user move doesn't
    for (const bestPrinciple of bestAnalysis.appliedPrinciples) {
      const userHasPrinciple = userAnalysis.appliedPrinciples.some(p => p.id === bestPrinciple.id);
      if (!userHasPrinciple) {
        missedOpportunities.push(bestPrinciple);
      }
    }
    
    // Find new violations in user move
    for (const violation of userAnalysis.violatedPrinciples) {
      const wasAlreadyViolated = beforeAnalysis.violatedPrinciples.some(v => v.principle.id === violation.principle.id);
      if (!wasAlreadyViolated) {
        principleViolations.push(violation);
      }
    }
    
    const overallAssessment = generateMoveComparisonAssessment(
      principleViolations,
      missedOpportunities,
      beforeAnalysis.gamePhase
    );
    
    return {
      userMove,
      bestMove,
      principleViolations,
      missedOpportunities,
      overallAssessment
    };
  } catch (error) {
    return {
      userMove,
      bestMove,
      principleViolations: [],
      missedOpportunities: [],
      overallAssessment: "Unable to analyze the move - it may be illegal."
    };
  }
}

function generateExplanation(
  gamePhase: 'opening' | 'middlegame' | 'endgame',
  appliedPrinciples: ChessPrinciple[],
  violatedPrinciples: ChessPrincipleViolation[]
): string {
  let explanation = `In the ${gamePhase}, `;
  
  if (appliedPrinciples.length > 0) {
    explanation += `you're following key principles like ${appliedPrinciples.slice(0, 2).map(p => p.name).join(' and ')}. `;
  }
  
  if (violatedPrinciples.length > 0) {
    explanation += `However, consider improving: ${violatedPrinciples.slice(0, 2).map(v => v.principle.name).join(' and ')}.`;
  }
  
  return explanation;
}

function generateMoveComparisonAssessment(
  violations: ChessPrincipleViolation[],
  missed: ChessPrinciple[],
  gamePhase: string
): string {
  if (violations.length === 0 && missed.length === 0) {
    return `Excellent move! You've applied the key ${gamePhase} principles effectively.`;
  }
  
  let assessment = "";
  
  if (violations.length > 0) {
    const majorViolations = violations.filter(v => v.severity === 'major');
    if (majorViolations.length > 0) {
      assessment += `This move has significant issues: ${majorViolations[0].description} `;
    } else {
      assessment += `This move has some concerns: ${violations[0].description} `;
    }
  }
  
  if (missed.length > 0) {
    assessment += `You missed an opportunity to apply: ${missed[0].name}.`;
  }
  
  return assessment;
} 