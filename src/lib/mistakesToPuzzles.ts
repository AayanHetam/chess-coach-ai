import { Chess } from "chess.js";
import type { ChessPuzzle } from "./chessPuzzlesService";

/**
 * Extracts "practice puzzles" from a finished game by finding positions
 * where the user made significant mistakes (eval drop).
 *
 * Each mistake position becomes a puzzle where the correct move is the
 * engine's best move (the move the user should have played).
 */

export interface MistakePosition {
  /** FEN of the position before the user's mistake */
  fen: string;
  /** The move the user played (SAN) */
  userMove: string;
  /** The best move according to the engine (UCI) */
  bestMoveUci: string;
  /** The best move in SAN */
  bestMoveSan: string;
  /** Move number */
  moveNumber: number;
  /** Eval before the user's move */
  evalBefore: number;
  /** Eval after the user's move */
  evalAfter: number;
  /** Severity: inaccuracy, mistake, blunder */
  severity: "inaccuracy" | "mistake" | "blunder";
}

/**
 * Classify move quality based on eval delta (centipawns).
 * Positive delta means the user lost advantage.
 */
export function classifyMoveQuality(evalDelta: number): {
  label: string;
  color: string;
  severity?: "inaccuracy" | "mistake" | "blunder";
} {
  const absDelta = Math.abs(evalDelta);
  if (absDelta < 30) return { label: "Good", color: "#66bb6a" };
  if (absDelta < 80) return { label: "Inaccuracy", color: "#ffa726", severity: "inaccuracy" };
  if (absDelta < 200) return { label: "Mistake", color: "#ef5350", severity: "mistake" };
  return { label: "Blunder", color: "#d32f2f", severity: "blunder" };
}

/**
 * Convert mistake positions into ChessPuzzle format for the practice system.
 */
export function mistakesToPuzzles(mistakes: MistakePosition[]): ChessPuzzle[] {
  return mistakes
    .filter((m) => m.severity === "mistake" || m.severity === "blunder")
    .map((m, idx) => {
      // The puzzle setup: the position is already the FEN.
      // The "solution" is the engine's best move.
      // We format it as a single-move puzzle (the user should find the best move).
      return {
        id: `mistake-${idx}-${Date.now()}`,
        fen: m.fen,
        moves: [m.bestMoveUci],
        rating: 0, // Not rated — it's from the user's game
        themes: [`from-game`, m.severity],
        solution: [m.bestMoveUci],
      };
    });
}

/**
 * Analyze a game and extract positions where the user made mistakes.
 * This is a simplified version that uses the eval data from analysis.
 *
 * @param pgn - The game PGN
 * @param userColor - Which color the user played ("w" or "b")
 * @param evalData - Array of {fen, eval, bestMove} for each position
 */
export function extractMistakes(
  evalData: { fen: string; eval: number; bestMoveUci?: string; bestMoveSan?: string; moveSan?: string }[],
  userColor: "w" | "b"
): MistakePosition[] {
  const mistakes: MistakePosition[] = [];

  for (let i = 1; i < evalData.length; i++) {
    const prev = evalData[i - 1];
    const curr = evalData[i];

    // Determine which color made this move
    // Even indices (0, 2, 4...) = positions after white's move
    // Odd indices (1, 3, 5...) = positions after black's move
    const movedColor = i % 2 === 1 ? "w" : "b";
    if (movedColor !== userColor) continue;

    // Calculate eval delta from the user's perspective
    const sign = userColor === "w" ? 1 : -1;
    const evalBefore = prev.eval * sign;
    const evalAfter = curr.eval * sign;
    const delta = evalBefore - evalAfter; // positive = user lost advantage

    const classification = classifyMoveQuality(delta);
    if (!classification.severity) continue;

    mistakes.push({
      fen: prev.fen,
      userMove: curr.moveSan || "?",
      bestMoveUci: prev.bestMoveUci || "",
      bestMoveSan: prev.bestMoveSan || "",
      moveNumber: Math.floor(i / 2) + 1,
      evalBefore: prev.eval,
      evalAfter: curr.eval,
      severity: classification.severity,
    });
  }

  // Sort by severity (blunders first) then by eval delta
  return mistakes.sort((a, b) => {
    const severityOrder = { blunder: 0, mistake: 1, inaccuracy: 2 };
    const diff = severityOrder[a.severity] - severityOrder[b.severity];
    if (diff !== 0) return diff;
    const aDelta = Math.abs(a.evalBefore - a.evalAfter);
    const bDelta = Math.abs(b.evalBefore - b.evalAfter);
    return bDelta - aDelta;
  });
}
