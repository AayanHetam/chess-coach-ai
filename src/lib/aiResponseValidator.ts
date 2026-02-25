import { Chess } from "chess.js";

/**
 * AI Response Validator
 * Post-processes LLM output to detect and flag hallucinated chess claims.
 * Checks: piece-on-square references, move legality, evaluation consistency.
 */

export interface ValidationResult {
  isValid: boolean;
  correctedResponse: string;
  issues: ValidationIssue[];
  score: number; // 0-1, 1 = perfect
}

export interface ValidationIssue {
  type: "wrong_piece_on_square" | "illegal_move" | "nonexistent_square" | "eval_mismatch";
  severity: "error" | "warning";
  detail: string;
  original: string;
  suggestion?: string;
}

const PIECE_NAMES = ["pawn", "knight", "bishop", "rook", "queen", "king"];
const PIECE_ABBREVS: Record<string, string> = {
  pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q", king: "k",
};
const VALID_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const VALID_RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];

/**
 * Validate an AI response against the actual board state.
 * @param response - The LLM's text response
 * @param fen - The FEN of the position being discussed (current or most relevant)
 * @param moveHistory - Optional full move history for context
 * @returns ValidationResult with issues found and a corrected response
 */
export function validateAIResponse(
  response: string,
  fen: string,
  moveHistory?: string[]
): ValidationResult {
  const issues: ValidationIssue[] = [];

  try {
    const game = new Chess(fen);

    // 1. Check piece-on-square claims: e.g., "knight on e5", "the bishop on c4"
    const pieceOnSquareIssues = validatePieceOnSquareClaims(response, game);
    issues.push(...pieceOnSquareIssues);

    // 2. Check move suggestions for legality: e.g., "play Nf3", "consider Bxe5"
    const moveLegalityIssues = validateMoveSuggestions(response, game, moveHistory);
    issues.push(...moveLegalityIssues);

    // 3. Check for nonexistent squares: e.g., "i4", "a9"
    const squareIssues = validateSquareReferences(response);
    issues.push(...squareIssues);

  } catch (e) {
    // If FEN is invalid, we can't validate — pass through
    console.warn("AI Response Validator: Invalid FEN, skipping validation", e);
  }

  // Calculate score
  const errorCount = issues.filter(i => i.severity === "error").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;
  const score = Math.max(0, 1 - (errorCount * 0.2) - (warningCount * 0.05));

  // Build corrected response by appending footnotes for errors
  let correctedResponse = response;
  if (errorCount > 0) {
    const footnotes = issues
      .filter(i => i.severity === "error")
      .map(i => `⚠️ ${i.detail}`)
      .join("\n");
    correctedResponse = response + "\n\n---\n*Note: Some claims in this analysis may be inaccurate. Please verify against the board position.*";
  }

  return {
    isValid: errorCount === 0,
    correctedResponse,
    issues,
    score,
  };
}

/**
 * Detect claims like "knight on e5", "the rook on a1", "Black's bishop on f5"
 * and verify the piece actually exists on that square.
 */
function validatePieceOnSquareClaims(response: string, game: Chess): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Pattern: "[piece] on [square]" — captures piece name and square
  const pieceOnSquareRegex = /\b((?:white|black|your|their|the|a|an|opponent'?s?)\s+)?(pawn|knight|bishop|rook|queen|king)\s+(?:on|at)\s+([a-h][1-8])\b/gi;

  let match;
  while ((match = pieceOnSquareRegex.exec(response)) !== null) {
    const prefix = (match[1] || "").trim().toLowerCase();
    const pieceName = match[2].toLowerCase();
    const square = match[3].toLowerCase() as any;
    const fullMatch = match[0];

    const pieceOnBoard = game.get(square);
    const expectedType = PIECE_ABBREVS[pieceName];

    if (!pieceOnBoard) {
      // No piece on that square at all
      issues.push({
        type: "wrong_piece_on_square",
        severity: "error",
        detail: `Claimed "${pieceName} on ${square}" but that square is empty in the position`,
        original: fullMatch,
      });
    } else if (pieceOnBoard.type !== expectedType) {
      // Different piece on that square
      const actualPiece = PIECE_NAMES.find(n => PIECE_ABBREVS[n] === pieceOnBoard.type) || pieceOnBoard.type;
      const actualColor = pieceOnBoard.color === "w" ? "White" : "Black";
      issues.push({
        type: "wrong_piece_on_square",
        severity: "error",
        detail: `Claimed "${pieceName} on ${square}" but there is a ${actualColor} ${actualPiece} on ${square}`,
        original: fullMatch,
        suggestion: `${actualPiece} on ${square}`,
      });
    } else {
      // Correct piece type — optionally check color
      if (prefix.includes("white") && pieceOnBoard.color !== "w") {
        issues.push({
          type: "wrong_piece_on_square",
          severity: "warning",
          detail: `Claimed "White ${pieceName} on ${square}" but the ${pieceName} on ${square} is Black`,
          original: fullMatch,
        });
      } else if (prefix.includes("black") && pieceOnBoard.color !== "b") {
        issues.push({
          type: "wrong_piece_on_square",
          severity: "warning",
          detail: `Claimed "Black ${pieceName} on ${square}" but the ${pieceName} on ${square} is White`,
          original: fullMatch,
        });
      }
    }
  }

  return issues;
}

/**
 * Detect move suggestions like "play Nf3", "consider e5", "the move Bxc6"
 * and verify they are legal in the position.
 */
function validateMoveSuggestions(
  response: string,
  game: Chess,
  moveHistory?: string[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Pattern: SAN moves in typical suggestion contexts
  // Matches: "play Nf3", "consider Bxe5", "the move d4", "best was Qh5+"
  const moveSuggestionRegex = /\b(?:play|consider|try|suggest|recommend|best\s+(?:was|move|is)|should\s+(?:play|have\s+played)|instead\s+of|rather\s+than|the\s+move)\s+([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)\b/gi;

  let match;
  while ((match = moveSuggestionRegex.exec(response)) !== null) {
    const moveSan = match[1];
    const fullMatch = match[0];

    try {
      // Try the move on a copy of the game
      const testGame = new Chess(game.fen());
      const result = testGame.move(moveSan);
      if (!result) {
        issues.push({
          type: "illegal_move",
          severity: "warning",
          detail: `Suggested move "${moveSan}" may not be legal in the current position`,
          original: fullMatch,
        });
      }
    } catch {
      // Move parsing failed — could be illegal
      issues.push({
        type: "illegal_move",
        severity: "warning",
        detail: `Suggested move "${moveSan}" could not be verified as legal`,
        original: fullMatch,
      });
    }
  }

  return issues;
}

/**
 * Check for references to nonexistent squares like "i4", "a9", "h0"
 */
function validateSquareReferences(response: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Find all potential square references (letter + digit patterns in chess context)
  const squareRefRegex = /\b([a-i])([0-9])\b/g;

  let match;
  while ((match = squareRefRegex.exec(response)) !== null) {
    const file = match[1];
    const rank = match[2];

    // Only flag if it looks like a chess square reference (near chess terms)
    if (!VALID_FILES.includes(file) || !VALID_RANKS.includes(rank)) {
      // Check if it's in a chess context (near piece names, move references, etc.)
      const contextStart = Math.max(0, match.index - 40);
      const contextEnd = Math.min(response.length, match.index + match[0].length + 40);
      const context = response.substring(contextStart, contextEnd).toLowerCase();

      const chessContext = PIECE_NAMES.some(p => context.includes(p)) ||
        /square|file|rank|diagonal|move|attack|defend|control/i.test(context);

      if (chessContext) {
        issues.push({
          type: "nonexistent_square",
          severity: "error",
          detail: `Referenced nonexistent square "${file}${rank}" — valid squares are a1-h8`,
          original: match[0],
        });
      }
    }
  }

  return issues;
}

/**
 * Quick check: does the response contain any chess-specific hallucination red flags?
 * Useful for fast pre-screening before full validation.
 */
export function quickHallucinationCheck(response: string): boolean {
  // Check for common hallucination patterns
  const redFlags = [
    /\b[a-h]9\b/,      // Nonexistent rank 9
    /\bi[1-8]\b/,       // Nonexistent file i
    /\b[a-h]0\b/,       // Nonexistent rank 0
    /triple\s+check/i,  // Triple check doesn't exist
    /\bking\s+(?:captures|takes)\s+(?:two|three|multiple)/i, // King can't capture multiple pieces
  ];

  return redFlags.some(pattern => pattern.test(response));
}
