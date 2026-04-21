import { Chess } from "chess.js";

/**
 * Client-safe chess-puzzles service.
 *
 * Tactical theme taxonomy + helper that fetches puzzles from the Neo4j-backed
 * /api/chess-puzzles-dataset endpoint (~200k puzzles). Server-side code should
 * import from "@/lib/puzzleRepository" instead of going through fetch.
 */

export interface ChessPuzzle {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  solution: string[];
}

export interface TacticalPattern {
  theme: string;
  description: string;
  example: string;
  commonPatterns: string[];
}

/**
 * Tactical themes from the Lichess puzzles dataset
 * These help identify what type of tactic Stockfish is suggesting
 */
export const TACTICAL_THEMES: Record<string, TacticalPattern> = {
  backRankMate: {
    theme: "Back Rank Mate",
    description: "Checkmate on the back rank (first rank for White, eighth rank for Black) when the king is trapped by its own pawns",
    example: "Rook or Queen delivers checkmate on the back rank",
    commonPatterns: ["Back rank weakness", "Trapped king", "Rook/Queen on back rank"],
  },
  bishopEndgame: {
    theme: "Bishop Endgame",
    description: "Tactical patterns involving bishops in the endgame",
    example: "Bishop and pawn endgames, bishop vs knight",
    commonPatterns: ["Bishop pair", "Bishop activity", "Color complex control"],
  },
  castling: {
    theme: "Castling",
    description: "Tactical opportunities related to castling or preventing castling",
    example: "Preventing opponent's castling, exploiting weak castled position",
    commonPatterns: ["Castling rights", "King safety", "Weak castled king"],
  },
  clearance: {
    theme: "Clearance",
    description: "Moving a piece to clear a square or line for another piece",
    example: "Moving a pawn to open a diagonal for the bishop",
    commonPatterns: ["Line clearance", "Square clearance", "Opening lines"],
  },
  defensiveMove: {
    theme: "Defensive Move",
    description: "A move that defends against a threat or prevents a tactical blow",
    example: "Blocking a check, defending a piece, preventing mate",
    commonPatterns: ["Defending pieces", "Blocking threats", "Preventing mate"],
  },
  discoveredAttack: {
    theme: "Discovered Attack",
    description: "Moving a piece reveals an attack by another piece behind it",
    example: "Moving a knight reveals a rook's attack on the queen",
    commonPatterns: ["Revealed attacks", "Line opening", "Double attack"],
  },
  doubleCheck: {
    theme: "Double Check",
    description: "A check delivered by two pieces simultaneously",
    example: "Knight and bishop both check the king",
    commonPatterns: ["Two pieces checking", "Forced moves", "King must move"],
  },
  endgame: {
    theme: "Endgame",
    description: "Tactical patterns in the endgame phase",
    example: "King and pawn endgames, piece endgames",
    commonPatterns: ["King activity", "Pawn promotion", "Zugzwang"],
  },
  exposedKing: {
    theme: "Exposed King",
    description: "Tactical opportunities when the opponent's king is exposed",
    example: "Attacking an uncastled or exposed king",
    commonPatterns: ["King in center", "Weak king position", "Mating attacks"],
  },
  fork: {
    theme: "Fork",
    description: "A single piece attacks two or more enemy pieces simultaneously",
    example: "Knight forks king and queen, pawn forks two pieces",
    commonPatterns: ["Knight forks", "Pawn forks", "Double attack"],
  },
  hangingPiece: {
    theme: "Hanging Piece",
    description: "A piece that is undefended and can be captured",
    example: "Capturing an undefended piece",
    commonPatterns: ["Undefended pieces", "Tactical shots", "Material gain"],
  },
  intermezzo: {
    theme: "Intermezzo (Zwischenzug)",
    description: "An intermediate move that changes the situation before completing a sequence",
    example: "Instead of recapturing immediately, making a stronger intermediate move",
    commonPatterns: ["Intermediate moves", "Delayed recapture", "Tactical interlude"],
  },
  knightEndgame: {
    theme: "Knight Endgame",
    description: "Tactical patterns involving knights in the endgame",
    example: "Knight and pawn endgames",
    commonPatterns: ["Knight activity", "Outposts", "Knight vs bishop"],
  },
  mate: {
    theme: "Checkmate",
    description: "A sequence leading to checkmate",
    example: "Mating attacks, forced mate sequences",
    commonPatterns: ["Mating nets", "Forced mate", "Mating patterns"],
  },
  mateIn2: {
    theme: "Mate in 2",
    description: "A sequence that leads to checkmate in exactly 2 moves",
    example: "Forced mate in two moves",
    commonPatterns: ["Two-move mate", "Forced sequence", "Mating pattern"],
  },
  mateIn3: {
    theme: "Mate in 3",
    description: "A sequence that leads to checkmate in exactly 3 moves",
    example: "Forced mate in three moves",
    commonPatterns: ["Three-move mate", "Complex mating sequence"],
  },
  mateIn4: {
    theme: "Mate in 4",
    description: "A sequence that leads to checkmate in exactly 4 moves",
    example: "Forced mate in four moves",
    commonPatterns: ["Four-move mate", "Long mating sequence"],
  },
  pin: {
    theme: "Pin",
    description: "A piece is pinned when it cannot move without exposing a more valuable piece behind it",
    example: "Bishop pins knight to king, rook pins queen to king",
    commonPatterns: ["Absolute pin", "Relative pin", "Exploiting pins"],
  },
  promotion: {
    theme: "Promotion",
    description: "Tactical opportunities involving pawn promotion",
    example: "Promoting a pawn to a queen or other piece",
    commonPatterns: ["Pawn promotion", "Queening", "Underpromotion"],
  },
  queenEndgame: {
    theme: "Queen Endgame",
    description: "Tactical patterns involving queens in the endgame",
    example: "Queen and pawn endgames",
    commonPatterns: ["Queen activity", "Mating attacks", "Perpetual check"],
  },
  queenRookEndgame: {
    theme: "Queen and Rook Endgame",
    description: "Tactical patterns with queen and rook in the endgame",
    example: "Queen and rook coordination",
    commonPatterns: ["Heavy piece coordination", "Mating attacks"],
  },
  quietMove: {
    theme: "Quiet Move",
    description: "A non-forcing move that improves the position or sets up tactics",
    example: "A quiet move that prepares a tactical blow",
    commonPatterns: ["Positional improvement", "Tactical preparation"],
  },
  rookEndgame: {
    theme: "Rook Endgame",
    description: "Tactical patterns involving rooks in the endgame",
    example: "Rook and pawn endgames",
    commonPatterns: ["Rook activity", "Back rank", "Rook behind passed pawn"],
  },
  sacrifice: {
    theme: "Sacrifice",
    description: "Giving up material for a tactical or positional advantage",
    example: "Sacrificing a piece for a mating attack or material gain",
    commonPatterns: ["Piece sacrifice", "Pawn sacrifice", "Tactical sacrifice"],
  },
  short: {
    theme: "Short Puzzle",
    description: "A puzzle that can be solved in a few moves",
    example: "Quick tactical shots",
    commonPatterns: ["Quick tactics", "Immediate threats"],
  },
  skewer: {
    theme: "Skewer",
    description: "A piece is attacked and forced to move, exposing a more valuable piece behind it",
    example: "Rook skewers king and queen, bishop skewers two pieces",
    commonPatterns: ["Line attacks", "Forced moves", "Exposed pieces"],
  },
  smotheredMate: {
    theme: "Smothered Mate",
    description: "Checkmate delivered by a knight when the king is surrounded by its own pieces",
    example: "Knight delivers checkmate on a smothered king",
    commonPatterns: ["Knight mate", "Trapped king", "Smothered position"],
  },
  trappingPiece: {
    theme: "Trapping Piece",
    description: "A sequence that traps an opponent's piece",
    example: "Trapping a knight, bishop, or other piece",
    commonPatterns: ["Piece entrapment", "Limiting mobility"],
  },
  underPromotion: {
    theme: "Underpromotion",
    description: "Promoting a pawn to a piece other than a queen",
    example: "Promoting to knight, bishop, or rook for tactical reasons",
    commonPatterns: ["Non-queen promotion", "Tactical promotion"],
  },
  veryLong: {
    theme: "Very Long Puzzle",
    description: "A puzzle requiring many moves to solve",
    example: "Complex tactical sequences",
    commonPatterns: ["Long sequences", "Complex tactics"],
  },
  xRayAttack: {
    theme: "X-Ray Attack",
    description: "An attack through an enemy piece",
    example: "Rook attacks through an enemy piece to target a piece behind it",
    commonPatterns: ["Through-piece attacks", "Line attacks"],
  },
  zugzwang: {
    theme: "Zugzwang",
    description: "A situation where any move worsens the position",
    example: "Forced to make a bad move",
    commonPatterns: ["No good moves", "Forced weakening"],
  },
};

/**
 * Identify tactical themes in a position based on Stockfish's principal variation
 */
export function identifyTacticalThemes(
  fen: string,
  principalVariation: string[],
  bestMove: string
): string[] {
  const themes: string[] = [];
  const game = new Chess(fen);

  // Analyze the principal variation to identify tactical patterns
  const pvGame = new Chess(fen);
  
  for (let i = 0; i < Math.min(principalVariation.length, 5); i++) {
    const move = principalVariation[i];
    try {
      const moveObj = pvGame.move(move);
      if (!moveObj) continue;

      // Check for checkmate
      if (pvGame.isCheckmate()) {
        if (i === 1) themes.push("mateIn2");
        else if (i === 2) themes.push("mateIn3");
        else if (i === 3) themes.push("mateIn4");
        else themes.push("mate");
        break;
      }

      // Check for checks
      if (pvGame.isCheck()) {
        if (i === 0) {
          // Check if it's a double check
          const legalMoves = pvGame.moves({ verbose: true });
          if (legalMoves.length === 0) {
            themes.push("doubleCheck");
          }
        }
      }

      // Check for captures (material gain)
      if (moveObj.captured) {
        if (i === 0) {
          // Check if the captured piece was hanging
          const beforeGame = new Chess(fen);
          const beforeMove = beforeGame.move(move);
          if (beforeMove && !beforeGame.isCheck()) {
            themes.push("hangingPiece");
          }
        }
        themes.push("sacrifice");
      }

      // Check for discovered attacks
      if (moveObj.piece !== "p" && moveObj.piece !== "k") {
        // Moving a piece might reveal an attack
        const beforeGame = new Chess(fen);
        const beforeFen = beforeGame.fen();
        beforeGame.move(move);
        // Simple heuristic: if moving a piece creates a check or strong threat
        if (beforeGame.isCheck()) {
          themes.push("discoveredAttack");
        }
      }

      // Enhanced fork detection: Check if the moved piece attacks two or more enemy pieces
      const moveSquare = moveObj.to;
      const attackedSquares = pvGame.moves({ square: moveSquare, verbose: true });
      const attackedPieces = attackedSquares.filter((m) => {
        const piece = pvGame.get(m.to);
        return piece && piece.color !== moveObj.color;
      });
      if (attackedPieces.length >= 2) {
        themes.push("fork");
        // Check if it's a knight fork (most common)
        if (moveObj.piece === "n") {
          themes.push("knightFork");
        }
        // Check if it's a pawn fork
        if (moveObj.piece === "p") {
          themes.push("pawnFork");
        }
      }

      // Enhanced pin detection: Check if a piece is actually pinned
      const beforeGame = new Chess(fen);
      const board = beforeGame.board();
      const moveFrom = moveObj.from;
      const moveTo = moveObj.to;
      
      // Check if the move creates a pin by checking if any enemy piece is now pinned
      beforeGame.move(move);
      const allPieces = board.flat().filter((p) => p !== null && p.color !== moveObj.color);
      
      for (const piece of allPieces) {
        if (!piece) continue;
        const pieceSquare = board.flat().findIndex((p) => p === piece);
        if (pieceSquare === -1) continue;
        
        const square = Object.keys(beforeGame.board())[pieceSquare] as any;
        const pieceMoves = beforeGame.moves({ square, verbose: true });
        
        // Check if moving this piece would expose the king (absolute pin)
        const tempGame = new Chess(beforeGame.fen());
        const pieceObj = tempGame.get(square);
        if (pieceObj && pieceMoves.length > 0) {
          // Try moving the piece and see if it exposes the king
          const testMove = pieceMoves[0];
          try {
            tempGame.move(testMove);
            if (tempGame.isCheck()) {
              themes.push("pin");
              break;
            }
          } catch {
            // Invalid move, continue
          }
        }
      }

      // Enhanced skewer detection: Similar to pin but more valuable piece is in front
      // Check if a line piece (bishop, rook, queen) attacks through a less valuable piece to a more valuable one
      if (moveObj.piece === "b" || moveObj.piece === "r" || moveObj.piece === "q") {
        const afterBoard = pvGame.board();
        const moveSquareAfter = moveTo;
        
        // Check all squares in the line of attack
        const directions = moveObj.piece === "b" 
          ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] // Diagonal
          : moveObj.piece === "r"
          ? [[1, 0], [-1, 0], [0, 1], [0, -1]] // Horizontal/vertical
          : [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]; // All
        
        for (const [dx, dy] of directions) {
          let foundLessValuable = false;
          let foundMoreValuable = false;
          
          for (let dist = 1; dist < 8; dist++) {
            const file = moveSquareAfter.charCodeAt(0) - 97 + dx * dist;
            const rank = parseInt(moveSquareAfter[1]) + dy * dist;
            
            if (file < 0 || file > 7 || rank < 1 || rank > 8) break;
            
            const square = String.fromCharCode(97 + file) + rank;
            const piece = afterBoard[8 - rank][file];
            
            if (piece) {
              if (piece.color !== moveObj.color) {
                const value = piece.type === "q" ? 9 : piece.type === "r" ? 5 : piece.type === "b" || piece.type === "n" ? 3 : 1;
                if (!foundLessValuable) {
                  foundLessValuable = true;
                } else if (value > 3) {
                  foundMoreValuable = true;
                  break;
                }
              } else {
                break;
              }
            }
          }
          
          if (foundLessValuable && foundMoreValuable) {
            themes.push("skewer");
            break;
          }
        }
      }

      // Double attack detection: Move attacks two targets simultaneously
      if (attackedPieces.length >= 2) {
        themes.push("doubleAttack");
      }

      // Check for promotion
      if (moveObj.promotion) {
        themes.push("promotion");
        if (moveObj.promotion !== "q") {
          themes.push("underPromotion");
        }
      }
    } catch (error) {
      // Invalid move, skip
      continue;
    }
  }

  // Check position characteristics
  if (game.isCheck()) {
    themes.push("exposedKing");
  }

  // Check for endgame
  const pieces = game.board().flat().filter((p) => p !== null);
  const pieceCount = pieces.length;
  if (pieceCount <= 12) {
    themes.push("endgame");
    // Check for specific endgame types
    const hasQueen = pieces.some((p) => p?.type === "q");
    const hasRook = pieces.some((p) => p?.type === "r");
    const hasBishop = pieces.some((p) => p?.type === "b");
    const hasKnight = pieces.some((p) => p?.type === "n");

    if (hasQueen && hasRook) themes.push("queenRookEndgame");
    else if (hasQueen) themes.push("queenEndgame");
    else if (hasRook) themes.push("rookEndgame");
    else if (hasBishop) themes.push("bishopEndgame");
    else if (hasKnight) themes.push("knightEndgame");
  }

  // Remove duplicates
  return Array.from(new Set(themes));
}

/**
 * Get tactical pattern descriptions for identified themes
 */
export function getTacticalPatterns(themes: string[]): TacticalPattern[] {
  return themes
    .map((theme) => TACTICAL_THEMES[theme])
    .filter((pattern): pattern is TacticalPattern => pattern !== undefined);
}

/**
 * Format tactical themes for AI coach prompt
 */
export function formatTacticalThemesForPrompt(
  themes: string[],
  patterns: TacticalPattern[]
): string {
  if (themes.length === 0) {
    return "No specific tactical themes identified in this position.";
  }

  let description = "TACTICAL THEMES IDENTIFIED:\n";
  description += `The position contains the following tactical themes: ${themes.join(", ")}\n\n`;

  description += "TACTICAL PATTERN EXPLANATIONS:\n";
  patterns.forEach((pattern) => {
    description += `- **${pattern.theme}**: ${pattern.description}\n`;
    description += `  Example: ${pattern.example}\n`;
    description += `  Common patterns: ${pattern.commonPatterns.join(", ")}\n\n`;
  });

  description +=
    "Use these tactical themes to explain WHY Stockfish's suggested moves are strong. " +
    "Connect the tactical patterns to the specific moves in the principal variation. " +
    "For example, if a 'fork' theme is identified, explain how the suggested move creates a fork " +
    "and why that's tactically advantageous.";

  return description;
}

/**
 * Client-side: query puzzles by theme via the Neo4j-backed dataset API.
 * Server-side callers should import from "@/lib/puzzleRepository" directly.
 */
export async function getPuzzlesByTheme(
  themes: string[],
  limit: number = 20,
  difficulty?: string
): Promise<ChessPuzzle[]> {
  try {
    const body: Record<string, unknown> = {
      command: "by_theme",
      themes,
      limit,
    };
    if (difficulty) {
      body.difficulty = difficulty;
    }

    const response = await fetch("/api/chess-puzzles-dataset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error("Failed to fetch puzzles by theme:", response.statusText);
      return [];
    }

    const data = await response.json();
    if (data.success && Array.isArray(data.puzzles)) {
      return data.puzzles as ChessPuzzle[];
    }
    return [];
  } catch (error) {
    console.error("Error fetching puzzles by theme:", error);
    return [];
  }
}

/**
 * Normalize theme name to match dataset theme format
 * Converts human-readable theme names to dataset format
 */
export function normalizeThemeName(theme: string): string {
  const themeMap: Record<string, string> = {
    // ── Core Tactical Themes ──
    "fork": "fork",
    "fork patterns": "fork",
    "forks": "fork",
    "knight fork": "knight-fork",
    "bishop fork": "bishop-fork",
    "queen fork": "queen-fork",
    "rook fork": "rook-fork",
    "pawn fork": "pawn-fork",

    "pin": "pin",
    "pins": "pin",
    "pinning": "pin",
    "absolute pin": "absolute-pin",
    "relative pin": "relative-pin",

    "skewer": "skewer",
    "skewers": "skewer",

    "sacrifice": "sacrifice",
    "sacrifices": "sacrifice",
    "queen sacrifice": "queen-sacrifice",
    "rook sacrifice": "rook-sacrifice",
    "minor piece sacrifice": "minor-piece-sacrifice",
    "bishop sacrifice": "bishop-sacrifice",
    "knight sacrifice": "knight-sacrifice",
    "pawn sacrifice": "pawn-sacrifice",
    "exchange sacrifice": "exchange-sacrifice",

    "discovered attack": "discovered-attack",
    "discovered attacks": "discovered-attack",
    "discovered attack on queen": "discovered-attack-on-queen",
    "discovered check": "discovered-check",

    "double attack": "double-attack",
    "double check": "double-check",
    "check and attack": "check-and-attack",

    "hanging piece": "hanging-piece",
    "hanging pieces": "hanging-piece",

    "trapped piece": "trapped-piece",
    "trapping piece": "trapped-piece",

    "exposed king": "exposed-king",
    "king safety": "exposed-king",
    "weak king": "exposed-king",

    // ── Mating Attacks ──
    "mate": "mating-attack",
    "checkmate": "mating-attack",
    "mating attack": "mating-attack",
    "mate in 1": "mate-in-1",
    "mate in 2": "mate-in-2",
    "mate in 3": "mate-in-3",
    "mate in 4": "mate-in-4",
    "mate in 5": "mate-in-5",
    "mate in one": "mate-in-1",
    "mate in two": "mate-in-2",

    "back rank": "back-rank",
    "back rank mate": "back-rank-mate",
    "back rank weakness": "back-rank-weakness",
    "backrank": "back-rank-mate",

    "smothered mate": "smothered-mate",
    "boden mate": "boden-mate",
    "boden's mate": "boden-mate",
    "arabian mate": "arabian-mate",
    "dovetail mate": "dovetail-mate",
    "hook mate": "hook-mate",
    "corner mate": "corner-mate",
    "opera mate": "opera-mate",
    "anastasia mate": "anastasias-mate",
    "anastasia's mate": "anastasias-mate",
    "balestra mate": "balestra-mate",
    "blind swine mate": "blind-swine-mate",
    "double bishop mate": "double-bishop-mate",

    // ── Defender Tactics ──
    "removal of defender": "removal-of-defender",
    "capture defender": "capture-defender",
    "deflect defender": "deflect-defender",
    "deflection from defense": "deflection-from-defense",
    "deflection from key square": "deflection-from-key-square",

    // ── Positional Tactics ──
    "defensive move": "defensive-move",
    "defensive": "defensive-move",
    "quiet move": "quiet-move",
    "intermediate move": "intermediate-move",
    "zwischenzug": "intermediate-move",
    "deflection": "deflection",
    "attraction": "attraction",
    "clearance": "clearance",
    "interference": "interference",
    "zugzwang": "zugzwang",
    "x-ray": "x-ray",
    "x-ray attack": "x-ray",
    "xray": "x-ray",
    "collinear move": "collinear-move",

    // ── Pawn Tactics ──
    "pawn tactics": "pawn-tactics",
    "advanced pawn": "advanced-pawn",
    "passed pawn": "passed-pawn",
    "promotion": "promotion",
    "pawn promotion": "promotion",
    "under promotion": "under-promotion",
    "underpromotion": "under-promotion",
    "en passant": "en-passant",

    // ── Attack Patterns ──
    "kingside attack": "kingside-attack",
    "queenside attack": "queenside-attack",
    "attacking f2 f7": "attacking-f2-f7",
    "attacking f2/f7": "attacking-f2-f7",
    "attacking f7": "attacking-f2-f7",
    "attacking patterns": "attacking-patterns",

    // ── Endgames ──
    "endgame": "endgame",
    "end game": "endgame",
    "bishop endgame": "bishop-endgame",
    "knight endgame": "knight-endgame",
    "rook endgame": "rook-endgame",
    "queen endgame": "queen-endgame",
    "queen rook endgame": "queen-rook-endgame",
    "pawn endgame": "pawn-endgame",

    // ── Positional ──
    "rook activation": "rook-activation",
    "rook lift": "rook-activation",
    "piece activation": "piece-activation",
    "castling": "castling",

    // ── Game Phase ──
    "middlegame": "middlegame",
    "middle game": "middlegame",
    "opening": "opening",
  };

  const normalized = theme.toLowerCase().trim();
  // Convert to kebab-case if not in map (e.g., "King Safety" → "king-safety")
  return themeMap[normalized] || normalized.toLowerCase().replace(/\s+/g, '-');
}

