import { Chess } from 'chess.js';
import { PositionData } from './enhancedFenTracker';

export interface DepthAnalysis {
  depth: number;
  evaluation: number;
  bestMove: string;
  pv: string[];
  nodes: number;
  time: number;
}

export interface CriticalMoveAnalysis {
  position: string;
  criticalDepth: number;
  evaluationChange: number;
  moveChange: string;
  principleViolation?: string;
  explanation: string;
  fenDifferences: {
    material: { white: number; black: number };
    position: { center: number; development: number };
    safety: { kingSafety: number; pawnStructure: number };
  };
}

export interface PrincipleViolation {
  principle: string;
  severity: 'low' | 'medium' | 'high';
  explanation: string;
  suggestedCorrection: string;
  fenEvidence: string[];
}

export class PrincipleAnalysisEngine {
  private stockfish: any;
  private chess: Chess;

  constructor() {
    this.chess = new Chess();
  }

  /**
   * Analyze a position at multiple depths to identify critical moves
   */
  async analyzePositionAtDepths(fen: string, depths: number[] = [5, 10, 15, 20, 25]): Promise<DepthAnalysis[]> {
    const analyses: DepthAnalysis[] = [];
    
    for (const depth of depths) {
      const analysis = await this.getStockfishAnalysis(fen, depth);
      analyses.push(analysis);
    }
    
    return analyses;
  }

  /**
   * Identify critical moves based on evaluation changes
   */
  findCriticalMoves(analyses: DepthAnalysis[]): CriticalMoveAnalysis | null {
    let maxChange = 0;
    let criticalDepth = 0;
    let moveChange = '';

    for (let i = 1; i < analyses.length; i++) {
      const evalChange = Math.abs(analyses[i].evaluation - analyses[i-1].evaluation);
      const moveChanged = analyses[i].bestMove !== analyses[i-1].bestMove;
      
      if (evalChange > maxChange && moveChanged) {
        maxChange = evalChange;
        criticalDepth = analyses[i].depth;
        moveChange = `${analyses[i-1].bestMove} → ${analyses[i].bestMove}`;
      }
    }

    if (maxChange < 0.5) return null; // No significant change

    return {
      position: this.chess.fen(),
      criticalDepth,
      evaluationChange: maxChange,
      moveChange,
      explanation: this.generateExplanation(analyses, criticalDepth),
      fenDifferences: this.analyzeFenDifferences(analyses, criticalDepth)
    };
  }

  /**
   * Map FEN changes to chess principles
   */
  mapFenToPrinciples(fenBefore: string, fenAfter: string): PrincipleViolation[] {
    const violations: PrincipleViolation[] = [];
    
    // Load positions
    this.chess.load(fenBefore);
    const before = this.extractPositionFeatures();
    
    this.chess.load(fenAfter);
    const after = this.extractPositionFeatures();

    // Analyze material changes
    const materialDiff = this.analyzeMaterialDifference(before, after);
    if (materialDiff.significant) {
      violations.push({
        principle: 'material_conservation',
        severity: materialDiff.severity,
        explanation: `Material advantage changed by ${materialDiff.difference} pawns`,
        suggestedCorrection: materialDiff.suggestion,
        fenEvidence: [fenBefore, fenAfter]
      });
    }

    // Analyze positional changes
    const positionalDiff = this.analyzePositionalDifference(before, after);
    if (positionalDiff.significant) {
      violations.push({
        principle: 'positional_play',
        severity: positionalDiff.severity,
        explanation: positionalDiff.explanation,
        suggestedCorrection: positionalDiff.suggestion,
        fenEvidence: [fenBefore, fenAfter]
      });
    }

    // Analyze development
    const developmentDiff = this.analyzeDevelopmentDifference(before, after);
    if (developmentDiff.significant) {
      violations.push({
        principle: 'piece_development',
        severity: developmentDiff.severity,
        explanation: developmentDiff.explanation,
        suggestedCorrection: developmentDiff.suggestion,
        fenEvidence: [fenBefore, fenAfter]
      });
    }

    return violations;
  }

  /**
   * Generate training data for principle violation detection
   */
  generateTrainingData(positions: PositionData[]): Array<{
    input: string;
    output: string;
    metadata: {
      principle: string;
      violation: boolean;
      severity: string;
      fen: string;
    };
  }> {
    const trainingData = [];

    for (const position of positions) {
      const violations = this.detectPrincipleViolations(position);
      
      for (const violation of violations) {
        trainingData.push({
          input: `Position: ${position.fen}\nMove: ${position.movePlayed?.san || 'N/A'}`,
          output: `Principle Violation: ${violation.principle}\nSeverity: ${violation.severity}\nExplanation: ${violation.explanation}`,
          metadata: {
            principle: violation.principle,
            violation: true,
            severity: violation.severity,
            fen: position.fen
          }
        });
      }
    }

    return trainingData;
  }

  /**
   * Detect principle violations in a position
   */
  private detectPrincipleViolations(position: PositionData): PrincipleViolation[] {
    const violations: PrincipleViolation[] = [];
    const features = this.extractPositionFeatures();

    // Check for isolated pawns
    if (features.isolatedPawns > 2) {
      violations.push({
        principle: 'pawn_structure',
        severity: 'medium',
        explanation: `Too many isolated pawns (${features.isolatedPawns}) weaken the position`,
        suggestedCorrection: 'Maintain pawn structure and avoid creating isolated pawns',
        fenEvidence: [position.fen]
      });
    }

    // Check for undeveloped pieces
    if (features.undevelopedPieces > 3) {
      violations.push({
        principle: 'piece_development',
        severity: 'high',
        explanation: `Too many undeveloped pieces (${features.undevelopedPieces}) in the middlegame`,
        suggestedCorrection: 'Develop pieces to active squares early in the game',
        fenEvidence: [position.fen]
      });
    }

    // Check for king safety
    if (features.kingSafety < 0.3) {
      violations.push({
        principle: 'king_safety',
        severity: 'high',
        explanation: 'King is exposed and vulnerable to attack',
        suggestedCorrection: 'Castle early and maintain pawn shield around the king',
        fenEvidence: [position.fen]
      });
    }

    return violations;
  }

  /**
   * Extract features from current position
   */
  private extractPositionFeatures() {
    const board = this.chess.board();
    const turn = this.chess.turn();
    
    return {
      material: this.countMaterial(board),
      center: this.analyzeCenterControl(board),
      development: this.analyzeDevelopment(board, turn),
      kingSafety: this.analyzeKingSafety(board, turn),
      isolatedPawns: this.countIsolatedPawns(board),
      undevelopedPieces: this.countUndevelopedPieces(board, turn)
    };
  }

  /**
   * Mock Stockfish analysis (replace with actual Stockfish integration)
   */
  private async getStockfishAnalysis(fen: string, depth: number): Promise<DepthAnalysis> {
    // This would integrate with actual Stockfish
    // For now, return mock data
    return {
      depth,
      evaluation: Math.random() * 2 - 1, // Random evaluation between -1 and +1
      bestMove: ['e4', 'Nf3', 'd4', 'O-O'][Math.floor(Math.random() * 4)],
      pv: ['e4', 'e5', 'Nf3'],
      nodes: depth * 1000,
      time: depth * 100
    };
  }

  /**
   * Generate explanation for critical move
   */
  private generateExplanation(analyses: DepthAnalysis[], criticalDepth: number): string {
    const critical = analyses.find(a => a.depth === criticalDepth);
    const previous = analyses.find(a => a.depth === criticalDepth - 5);
    
    if (!critical || !previous) return 'Unable to generate explanation';
    
    const evalChange = critical.evaluation - previous.evaluation;
    const moveChange = critical.bestMove !== previous.bestMove;
    
    if (moveChange && Math.abs(evalChange) > 0.5) {
      return `At depth ${criticalDepth}, Stockfish switches from ${previous.bestMove} to ${critical.bestMove} due to a ${evalChange > 0 ? 'tactical' : 'positional'} consideration that becomes clear at higher depths.`;
    }
    
    return `Evaluation stabilizes at depth ${criticalDepth} with ${critical.bestMove} as the best move.`;
  }

  /**
   * Analyze differences between FEN positions
   */
  private analyzeFenDifferences(analyses: DepthAnalysis[], criticalDepth: number) {
    // This would analyze actual FEN differences
    return {
      material: { white: 0, black: 0 },
      position: { center: 0, development: 0 },
      safety: { kingSafety: 0, pawnStructure: 0 }
    };
  }

  /**
   * Helper methods for position analysis
   */
  private countMaterial(board: any[][]) {
    // Implementation for material counting
    return { white: 0, black: 0 };
  }

  private analyzeCenterControl(board: any[][]) {
    // Implementation for center control analysis
    return 0;
  }

  private analyzeDevelopment(board: any[][], turn: 'w' | 'b') {
    // Implementation for development analysis
    return 0;
  }

  private analyzeKingSafety(board: any[][], turn: 'w' | 'b') {
    // Implementation for king safety analysis
    return 0;
  }

  private countIsolatedPawns(board: any[][]) {
    // Implementation for isolated pawn counting
    return 0;
  }

  private countUndevelopedPieces(board: any[][], turn: 'w' | 'b') {
    // Implementation for undeveloped piece counting
    return 0;
  }

  private analyzeMaterialDifference(before: any, after: any) {
    // Implementation for material difference analysis
    return { significant: false, difference: 0, severity: 'low' as const, suggestion: '' };
  }

  private analyzePositionalDifference(before: any, after: any) {
    // Implementation for positional difference analysis
    return { significant: false, explanation: '', suggestion: '', severity: 'low' as const };
  }

  private analyzeDevelopmentDifference(before: any, after: any) {
    // Implementation for development difference analysis
    return { significant: false, explanation: '', suggestion: '', severity: 'low' as const };
  }
} 