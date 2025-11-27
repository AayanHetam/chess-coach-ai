import { Chess } from "chess.js";

export interface OpeningInfo {
  name: string;
  eco?: string;
  moves: number; // Number of moves in the opening
  isEarlyOpening: boolean; // True if within first 10 moves
}

/**
 * Common chess openings database
 * Maps move sequences to opening names
 */
const OPENING_DATABASE: Array<{
  moves: string[];
  name: string;
  eco?: string;
}> = [
  // Vienna Game
  { moves: ["e4", "e5", "Nc3"], name: "Vienna Game", eco: "C26" },
  { moves: ["e4", "e5", "Nc3", "Nf6"], name: "Vienna Game", eco: "C26" },
  { moves: ["e4", "e5", "Nc3", "Nf6", "f4"], name: "Vienna Gambit", eco: "C26" },

  // Ruy Lopez
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"], name: "Ruy Lopez", eco: "C60" },
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"], name: "Ruy Lopez", eco: "C60" },

  // Sicilian Defense
  { moves: ["e4", "c5"], name: "Sicilian Defense", eco: "B20" },
  { moves: ["e4", "c5", "Nf3"], name: "Sicilian Defense", eco: "B20" },
  { moves: ["e4", "c5", "Nf3", "d6"], name: "Sicilian Defense", eco: "B20" },
  { moves: ["e4", "c5", "Nf3", "d6", "d4"], name: "Sicilian Defense", eco: "B20" },

  // French Defense
  { moves: ["e4", "e6"], name: "French Defense", eco: "C00" },
  { moves: ["e4", "e6", "d4"], name: "French Defense", eco: "C00" },
  { moves: ["e4", "e6", "d4", "d5"], name: "French Defense", eco: "C00" },

  // Caro-Kann
  { moves: ["e4", "c6"], name: "Caro-Kann Defense", eco: "B10" },
  { moves: ["e4", "c6", "d4"], name: "Caro-Kann Defense", eco: "B10" },
  { moves: ["e4", "c6", "d4", "d5"], name: "Caro-Kann Defense", eco: "B10" },

  // Italian Game
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"], name: "Italian Game", eco: "C50" },
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"], name: "Italian Game", eco: "C50" },

  // King's Gambit
  { moves: ["e4", "e5", "f4"], name: "King's Gambit", eco: "C30" },

  // Queen's Gambit
  { moves: ["d4", "d5", "c4"], name: "Queen's Gambit", eco: "D06" },
  { moves: ["d4", "d5", "c4", "e6"], name: "Queen's Gambit Declined", eco: "D30" },
  { moves: ["d4", "d5", "c4", "c6"], name: "Slav Defense", eco: "D10" },

  // English Opening
  { moves: ["c4"], name: "English Opening", eco: "A10" },
  { moves: ["c4", "e5"], name: "English Opening", eco: "A10" },

  // Dutch Defense
  { moves: ["d4", "f5"], name: "Dutch Defense", eco: "A80" },

  // Pirc Defense
  { moves: ["e4", "d6"], name: "Pirc Defense", eco: "B07" },
  { moves: ["e4", "d6", "d4"], name: "Pirc Defense", eco: "B07" },
  { moves: ["e4", "d6", "d4", "Nf6"], name: "Pirc Defense", eco: "B07" },

  // Alekhine Defense
  { moves: ["e4", "Nf6"], name: "Alekhine Defense", eco: "B02" },

  // Scandinavian Defense
  { moves: ["e4", "d5"], name: "Scandinavian Defense", eco: "B01" },
];

/**
 * Normalize move notation for comparison
 * Removes check/checkmate symbols and standardizes format
 */
function normalizeMove(move: string): string {
  return move.replace(/[+#]/g, "").trim();
}

/**
 * Detect chess opening from move sequence
 */
export function detectOpening(game: Chess): OpeningInfo | null {
  const history = game.history();
  if (history.length === 0) {
    return null;
  }

  // Try to match against opening database
  for (const opening of OPENING_DATABASE) {
    if (history.length >= opening.moves.length) {
      const gameMoves = history.slice(0, opening.moves.length).map(normalizeMove);
      const openingMoves = opening.moves.map(normalizeMove);

      // Check if moves match
      let matches = true;
      for (let i = 0; i < openingMoves.length; i++) {
        if (gameMoves[i] !== openingMoves[i]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return {
          name: opening.name,
          eco: opening.eco,
          moves: opening.moves.length,
          isEarlyOpening: history.length <= 10,
        };
      }
    }
  }

  // If no specific opening found, return generic info
  if (history.length <= 10) {
    return {
      name: "Opening",
      moves: history.length,
      isEarlyOpening: true,
    };
  }

  return null;
}

/**
 * Check if a move is in the opening phase
 */
export function isOpeningMove(moveNumber: number): boolean {
  return moveNumber <= 10;
}

/**
 * Get opening phase information
 */
export function getOpeningPhase(moveNumber: number): {
  phase: "opening" | "early-middlegame" | "middlegame" | "endgame";
  shouldSkipCritique: boolean;
} {
  if (moveNumber <= 10) {
    return { phase: "opening", shouldSkipCritique: true };
  } else if (moveNumber <= 20) {
    return { phase: "early-middlegame", shouldSkipCritique: false };
  } else if (moveNumber <= 40) {
    return { phase: "middlegame", shouldSkipCritique: false };
  } else {
    return { phase: "endgame", shouldSkipCritique: false };
  }
}

