import { Chess, Move } from "chess.js";

export interface PositionData {
  fen: string;
  moveNumber: number;
  halfMoveNumber: number;
  isWhiteToMove: boolean;
  movePlayed?: {
    san: string;
    uci: string;
    from: string;
    to: string;
    piece: string;
    color: "w" | "b";
    captured?: string;
    promotion?: string;
    isCheck: boolean;
    isCheckmate: boolean;
    isDraw: boolean;
  };
  positionMetadata: {
    castlingRights: {
      whiteKingside: boolean;
      whiteQueenside: boolean;
      blackKingside: boolean;
      blackQueenside: boolean;
    };
    enPassantSquare: string | null;
    halfMoveClock: number;
    fullMoveNumber: number;
    materialCount: {
      white: {
        pawns: number;
        knights: number;
        bishops: number;
        rooks: number;
        queens: number;
      };
      black: {
        pawns: number;
        knights: number;
        bishops: number;
        rooks: number;
        queens: number;
      };
    };
    gamePhase: "opening" | "middlegame" | "endgame";
    isInCheck: boolean;
    legalMovesCount: number;
  };
  evaluation?: {
    centipawns?: number;
    mate?: number;
    bestMove?: string;
    depth?: number;
    principalVariation?: string[]; // Stockfish principal variation (best line)
  };
  evaluationChange?: {
    beforeMove: number; // Evaluation before the move was played
    afterMove: number; // Evaluation after the move was played
    change: number; // Change in evaluation (positive = better for white, negative = better for black)
    playerColor: "w" | "b"; // Color of the player who made the move
    isMistake: boolean; // Whether this move was a mistake for the player
    mistakeSeverity: "small" | "medium" | "large" | "blunder"; // Severity of the mistake
  };
}

export class EnhancedFenTracker {
  private positions: PositionData[] = [];
  private game: Chess;

  constructor(initialFen?: string) {
    this.game = new Chess(initialFen);
    this.initializePosition();
  }

  private initializePosition(): void {
    const fen = this.game.fen();
    const positionData: PositionData = {
      fen,
      moveNumber: 0,
      halfMoveNumber: 0,
      isWhiteToMove: this.game.turn() === "w",
      positionMetadata: this.extractPositionMetadata(fen),
    };
    this.positions.push(positionData);
  }

  private extractPositionMetadata(
    fen: string
  ): PositionData["positionMetadata"] {
    const parts = fen.split(" ");
    const piecePlacement = parts[0];
    const castlingRights = parts[2];
    const enPassantSquare = parts[3] === "-" ? null : parts[3];
    const halfMoveClock = parseInt(parts[4]);
    const fullMoveNumber = parseInt(parts[5]);

    // Count material
    const materialCount = this.countMaterial(piecePlacement);

    // Determine game phase
    const totalPieces =
      Object.values(materialCount.white).reduce((a, b) => a + b, 0) +
      Object.values(materialCount.black).reduce((a, b) => a + b, 0);
    let gamePhase: "opening" | "middlegame" | "endgame";
    if (totalPieces >= 24) gamePhase = "opening";
    else if (totalPieces >= 12) gamePhase = "middlegame";
    else gamePhase = "endgame";

    return {
      castlingRights: {
        whiteKingside: castlingRights.includes("K"),
        whiteQueenside: castlingRights.includes("Q"),
        blackKingside: castlingRights.includes("k"),
        blackQueenside: castlingRights.includes("q"),
      },
      enPassantSquare,
      halfMoveClock,
      fullMoveNumber,
      materialCount,
      gamePhase,
      isInCheck: this.game.isCheck(),
      legalMovesCount: this.game.moves().length,
    };
  }

  private countMaterial(
    piecePlacement: string
  ): PositionData["positionMetadata"]["materialCount"] {
    const counts = {
      white: { pawns: 0, knights: 0, bishops: 0, rooks: 0, queens: 0 },
      black: { pawns: 0, knights: 0, bishops: 0, rooks: 0, queens: 0 },
    };

    for (const char of piecePlacement) {
      if (char === "/") continue;
      if (/\d/.test(char)) continue;

      const isWhite = char === char.toUpperCase();
      const piece = char.toLowerCase();
      const color = isWhite ? "white" : "black";

      switch (piece) {
        case "p":
          counts[color].pawns++;
          break;
        case "n":
          counts[color].knights++;
          break;
        case "b":
          counts[color].bishops++;
          break;
        case "r":
          counts[color].rooks++;
          break;
        case "q":
          counts[color].queens++;
          break;
      }
    }

    return counts;
  }

  public makeMove(move: string | Move): PositionData | null {
    try {
      const result = this.game.move(move);
      if (!result) return null;

      const fen = this.game.fen();
      const moveNumber = Math.floor(this.game.history().length / 2) + 1;
      const halfMoveNumber = this.game.history().length;

      const positionData: PositionData = {
        fen,
        moveNumber,
        halfMoveNumber,
        isWhiteToMove: this.game.turn() === "w",
        movePlayed: {
          san: result.san,
          uci: result.from + result.to + (result.promotion || ""),
          from: result.from,
          to: result.to,
          piece: result.piece,
          color: result.color,
          captured: result.captured,
          promotion: result.promotion,
          isCheck: result.san.includes("+"),
          isCheckmate: result.san.includes("#"),
          isDraw: this.game.isDraw(),
        },
        positionMetadata: this.extractPositionMetadata(fen),
      };

      this.positions.push(positionData);
      return positionData;
    } catch (error) {
      console.error("Invalid move:", error);
      return null;
    }
  }

  public undoMove(): PositionData | null {
    try {
      this.game.undo();
      this.positions.pop(); // Remove the last position
      return this.positions[this.positions.length - 1] || null;
    } catch (error) {
      console.error("Cannot undo move:", error);
      return null;
    }
  }

  public getPositions(): PositionData[] {
    return [...this.positions];
  }

  public getCurrentPosition(): PositionData | null {
    return this.positions[this.positions.length - 1] || null;
  }

  public getPositionAtMove(
    moveNumber: number,
    halfMove: boolean = false
  ): PositionData | null {
    if (halfMove) {
      return this.positions[moveNumber] || null;
    } else {
      // Find position at the end of the specified move number
      const targetHalfMove = moveNumber * 2;
      return (
        this.positions.find((p) => p.halfMoveNumber === targetHalfMove) || null
      );
    }
  }

  public getGameSummary(): {
    totalMoves: number;
    totalPositions: number;
    gameResult: string;
    finalPosition: string;
  } {
    return {
      totalMoves: this.game.history().length,
      totalPositions: this.positions.length,
      gameResult: this.game.isCheckmate()
        ? "checkmate"
        : this.game.isDraw()
          ? "draw"
          : "ongoing",
      finalPosition: this.game.fen(),
    };
  }

  public exportForTraining(): {
    positions: PositionData[];
    gameMetadata: {
      fen: string;
      result: string;
      totalMoves: number;
      totalPositions: number;
    };
  } {
    return {
      positions: this.positions,
      gameMetadata: {
        fen: this.game.fen(),
        result: this.game.isCheckmate()
          ? "checkmate"
          : this.game.isDraw()
            ? "draw"
            : "ongoing",
        totalMoves: this.game.history().length,
        totalPositions: this.positions.length,
      },
    };
  }

  private reconstructPositions(): void {
    const history = this.game.history({ verbose: true });
    this.positions = [];

    // Add initial position
    this.initializePosition();

    // Reconstruct each position after each move
    for (const move of history) {
      this.makeMove(move);
    }
  }

  public getPositionSequence(): string[] {
    return this.positions.map((p) => p.fen);
  }

  public getMoveSequence(): Array<{
    moveNumber: number;
    halfMoveNumber: number;
    move: PositionData["movePlayed"];
    fenBefore: string;
    fenAfter: string;
  }> {
    return this.positions
      .filter((p) => p.movePlayed)
      .map((p, index) => ({
        moveNumber: p.moveNumber,
        halfMoveNumber: p.halfMoveNumber,
        move: p.movePlayed!,
        fenBefore: this.positions[index - 1]?.fen || "",
        fenAfter: p.fen,
      }));
  }

  /**
   * Analyze evaluation changes to identify the biggest mistakes
   * Returns moves sorted by evaluation drop (biggest mistakes first)
   */
  public analyzeEvaluationChanges(): Array<{
    moveNumber: number;
    halfMoveNumber: number;
    move: string;
    playerColor: "w" | "b";
    evaluationBefore: number;
    evaluationAfter: number;
    evaluationChange: number;
    isMistake: boolean;
    mistakeSeverity: "small" | "medium" | "large" | "blunder";
    principleViolation?: string;
  }> {
    const movesWithEvaluations = [];

    for (let i = 1; i < this.positions.length; i++) {
      const currentPos = this.positions[i];
      const previousPos = this.positions[i - 1];

      if (
        !currentPos.movePlayed ||
        !currentPos.evaluation ||
        !previousPos.evaluation
      ) {
        continue;
      }

      const evaluationBefore = previousPos.evaluation.centipawns || 0;
      const evaluationAfter = currentPos.evaluation.centipawns || 0;
      const playerColor = currentPos.movePlayed.color;

      // Calculate evaluation change from the perspective of the player who made the move
      // Evaluation is always from White's perspective (positive = good for white, negative = good for black)
      let evaluationChange: number;
      if (playerColor === "w") {
        // White made the move - positive change means better for white, negative means worse for white
        evaluationChange = evaluationAfter - evaluationBefore;
      } else {
        // Black made the move - positive change means worse for black, negative means better for black
        // Since evaluation is from White's perspective, we need to invert the change for Black
        evaluationChange = evaluationBefore - evaluationAfter;
      }

      // Determine if this was a mistake using relative threshold
      // Any evaluation change that worsens the position by more than 1 point (100 centipawns) is eligible
      // For White: negative change (evaluation goes down) = mistake
      // For Black: positive change (evaluation goes up for White, down for Black) = mistake
      const absChange = Math.abs(evaluationChange);
      const isMistake = evaluationChange < -100; // More than 1 point worse for the player

      // Calculate relative severity based on the magnitude of the change
      // This is now relative rather than fixed thresholds
      let mistakeSeverity: "small" | "medium" | "large" | "blunder";
      if (absChange <= 100) {
        mistakeSeverity = "small";
      } else if (absChange <= 300) {
        mistakeSeverity = "medium";
      } else if (absChange <= 600) {
        mistakeSeverity = "large";
      } else {
        mistakeSeverity = "blunder";
      }

      movesWithEvaluations.push({
        moveNumber: currentPos.moveNumber,
        halfMoveNumber: currentPos.halfMoveNumber,
        move: currentPos.movePlayed.san,
        playerColor,
        evaluationBefore,
        evaluationAfter,
        evaluationChange,
        isMistake,
        mistakeSeverity,
      });
    }

    // Sort by mistake severity (biggest mistakes first)
    // For mistakes: sort by absolute evaluation change (biggest drops first)
    // For non-mistakes: sort by smallest improvements (least good moves first)
    return movesWithEvaluations.sort((a, b) => {
      if (a.isMistake && b.isMistake) {
        // Both are mistakes - sort by biggest evaluation drops
        return Math.abs(b.evaluationChange) - Math.abs(a.evaluationChange);
      } else if (a.isMistake && !b.isMistake) {
        // a is mistake, b is not - a comes first
        return -1;
      } else if (!a.isMistake && b.isMistake) {
        // a is not mistake, b is - b comes first
        return 1;
      } else {
        // Neither are mistakes - sort by smallest improvements
        return Math.abs(a.evaluationChange) - Math.abs(b.evaluationChange);
      }
    });
  }

  /**
   * Get the top N biggest mistakes based on evaluation changes
   * Only includes moves that worsen the position by more than 1 point (100 centipawns)
   * Optionally filters by user color to show only user's mistakes
   */
  public getTopMistakes(
    count: number = 3,
    userColor?: "w" | "b"
  ): Array<{
    moveNumber: number;
    halfMoveNumber: number;
    move: string;
    playerColor: "w" | "b";
    evaluationBefore: number;
    evaluationAfter: number;
    evaluationChange: number;
    isMistake: boolean;
    mistakeSeverity: "small" | "medium" | "large" | "blunder";
  }> {
    const allMoves = this.analyzeEvaluationChanges();
    let mistakes = allMoves.filter((move) => move.isMistake); // Only include actual mistakes

    // Filter by user color if specified
    if (userColor) {
      mistakes = mistakes.filter((move) => move.playerColor === userColor);
    }

    // Sort by absolute evaluation change (biggest mistakes first - largest drops)
    const sortedMistakes = mistakes.sort(
      (a, b) => Math.abs(b.evaluationChange) - Math.abs(a.evaluationChange)
    );

    // Return top N mistakes (or all if fewer than N)
    return sortedMistakes.slice(0, count);
  }

  /**
   * Get mistakes made by a specific player color
   * Convenience method for user-specific analysis
   */
  public getUserMistakes(
    userColor: "w" | "b",
    count: number = 3
  ): Array<{
    moveNumber: number;
    halfMoveNumber: number;
    move: string;
    playerColor: "w" | "b";
    evaluationBefore: number;
    evaluationAfter: number;
    evaluationChange: number;
    isMistake: boolean;
    mistakeSeverity: "small" | "medium" | "large" | "blunder";
  }> {
    return this.getTopMistakes(count, userColor);
  }

  /**
   * Set evaluation for the current position
   */
  public setEvaluation(evaluation: {
    centipawns?: number;
    mate?: number;
    bestMove?: string;
    depth?: number;
  }): void {
    if (this.positions.length > 0) {
      this.positions[this.positions.length - 1].evaluation = evaluation;
    }
  }

  /**
   * Set evaluation for a specific position
   */
  public setEvaluationAtPosition(
    index: number,
    evaluation: {
      centipawns?: number;
      mate?: number;
      bestMove?: string;
      depth?: number;
    }
  ): void {
    if (index >= 0 && index < this.positions.length) {
      this.positions[index].evaluation = evaluation;
    }
  }
}
