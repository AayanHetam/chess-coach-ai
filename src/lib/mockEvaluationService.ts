import { Chess } from 'chess.js';

/**
 * Mock evaluation service that simulates Stockfish evaluations
 * This is used for testing the evaluation-based mistake detection system
 * In production, this would be replaced with actual Stockfish integration
 */
export class MockEvaluationService {
  private game: Chess;

  constructor(fen?: string) {
    this.game = new Chess(fen);
  }

  /**
   * Get evaluation for the current position
   * Simulates Stockfish evaluation with some randomness to create realistic scenarios
   */
  public async getEvaluation(depth: number = 15): Promise<{
    centipawns: number;
    mate?: number;
    bestMove?: string;
    depth: number;
  }> {
    // Simulate evaluation based on material and position
    const evaluation = this.calculateMockEvaluation();
    
    // Add some randomness to simulate realistic evaluation variations
    const randomVariation = (Math.random() - 0.5) * 100; // ±50 centipawns
    const finalEvaluation = Math.round(evaluation + randomVariation);

    return {
      centipawns: finalEvaluation,
      depth,
      bestMove: this.getMockBestMove(),
    };
  }

  /**
   * Calculate a mock evaluation based on material and basic positional factors
   */
  private calculateMockEvaluation(): number {
    const fen = this.game.fen();
    const piecePlacement = fen.split(' ')[0];
    
    // Material evaluation
    let evaluation = 0;
    
    // Count pieces and assign values
    const pieceValues: { [key: string]: number } = {
      'P': 100,  // Pawn
      'N': 320,  // Knight
      'B': 330,  // Bishop
      'R': 500,  // Rook
      'Q': 900,  // Queen
      'K': 20000, // King
    };

    for (let i = 0; i < piecePlacement.length; i++) {
      const char = piecePlacement[i];
      if (char === '/') continue;
      
      if (char >= '1' && char <= '8') {
        // Skip empty squares
        continue;
      }
      
      const value = pieceValues[char.toUpperCase()] || 0;
      if (char === char.toUpperCase()) {
        // White piece
        evaluation += value;
      } else {
        // Black piece
        evaluation -= value;
      }
    }

    // Add positional bonuses
    evaluation += this.calculatePositionalBonus();

    return evaluation;
  }

  /**
   * Calculate positional bonuses based on basic chess principles
   */
  private calculatePositionalBonus(): number {
    let bonus = 0;
    const fen = this.game.fen();
    const piecePlacement = fen.split(' ')[0];
    const rows = piecePlacement.split('/');

    // Center control bonus
    const centerSquares = ['d4', 'e4', 'd5', 'e5'];
    for (const square of centerSquares) {
      const piece = this.game.get(square);
      if (piece) {
        if (piece.color === 'w') {
          bonus += 10;
        } else {
          bonus -= 10;
        }
      }
    }

    // Development bonus (pieces on their starting squares)
    bonus += this.calculateDevelopmentBonus();

    // King safety bonus
    bonus += this.calculateKingSafetyBonus();

    return bonus;
  }

  /**
   * Calculate development bonus
   */
  private calculateDevelopmentBonus(): number {
    let bonus = 0;
    
    // Check if pieces are still on starting squares
    const startingSquares = {
      'w': {
        'P': ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'],
        'N': ['b1', 'g1'],
        'B': ['c1', 'f1'],
        'R': ['a1', 'h1'],
        'Q': ['d1'],
        'K': ['e1']
      },
      'b': {
        'P': ['a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7'],
        'N': ['b8', 'g8'],
        'B': ['c8', 'f8'],
        'R': ['a8', 'h8'],
        'Q': ['d8'],
        'K': ['e8']
      }
    };

    for (const color of ['w', 'b'] as const) {
      for (const [piece, squares] of Object.entries(startingSquares[color])) {
        for (const square of squares) {
          const pieceOnSquare = this.game.get(square);
          if (pieceOnSquare && pieceOnSquare.type.toUpperCase() === piece && pieceOnSquare.color === color) {
            // Piece still on starting square (negative bonus)
            if (color === 'w') {
              bonus -= 5;
            } else {
              bonus += 5;
            }
          }
        }
      }
    }

    return bonus;
  }

  /**
   * Calculate king safety bonus
   */
  private calculateKingSafetyBonus(): number {
    let bonus = 0;
    
    // Check if kings have castled
    const whiteKing = this.game.get('e1');
    const blackKing = this.game.get('e8');
    
    if (whiteKing && whiteKing.type === 'k' && whiteKing.color === 'w') {
      // White king still on e1 (not castled)
      bonus -= 20;
    }
    
    if (blackKing && blackKing.type === 'k' && blackKing.color === 'b') {
      // Black king still on e8 (not castled)
      bonus += 20;
    }

    return bonus;
  }

  /**
   * Get a mock best move
   */
  private getMockBestMove(): string {
    const legalMoves = this.game.moves();
    if (legalMoves.length === 0) return '';
    
    // Return a random legal move
    return legalMoves[Math.floor(Math.random() * legalMoves.length)];
  }

  /**
   * Set the game position
   */
  public setPosition(fen: string): void {
    this.game = new Chess(fen);
  }

  /**
   * Make a move
   */
  public makeMove(move: string): void {
    this.game.move(move);
  }

  /**
   * Get the current FEN
   */
  public getFen(): string {
    return this.game.fen();
  }

  /**
   * Get the current game
   */
  public getGame(): Chess {
    return this.game;
  }
} 