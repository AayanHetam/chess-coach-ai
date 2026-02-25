import { Chess } from "chess.js";

/**
 * Phase-based accuracy scoring for game analysis.
 * Classifies each move into opening/middlegame/endgame and calculates
 * per-phase accuracy percentages.
 */

export type GamePhase = "opening" | "middlegame" | "endgame";

export interface PhaseAccuracyResult {
  opening: { moves: number; accuracy: number; avgCpLoss: number };
  middlegame: { moves: number; accuracy: number; avgCpLoss: number };
  endgame: { moves: number; accuracy: number; avgCpLoss: number };
  overall: { moves: number; accuracy: number; avgCpLoss: number };
}

/**
 * Determine the game phase for a given position.
 *
 * Heuristics:
 * - Opening: first 10 moves (20 half-moves)
 * - Endgame: <= 12 total pieces, or no queens + <= 14 pieces
 * - Middlegame: everything else
 */
export function classifyPhase(fen: string, halfMoveNumber: number): GamePhase {
  // Opening: first 10 moves
  if (halfMoveNumber < 20) return "opening";

  // Count pieces
  const boardPart = fen.split(" ")[0];
  let totalPieces = 0;
  let hasWhiteQueen = false;
  let hasBlackQueen = false;

  for (const ch of boardPart) {
    if (ch === "/" || (ch >= "1" && ch <= "8")) continue;
    totalPieces++;
    if (ch === "Q") hasWhiteQueen = true;
    if (ch === "q") hasBlackQueen = true;
  }

  // Endgame: few pieces
  if (totalPieces <= 12) return "endgame";
  // Endgame: no queens and relatively few pieces
  if (!hasWhiteQueen && !hasBlackQueen && totalPieces <= 14) return "endgame";

  return "middlegame";
}

/**
 * Convert centipawn loss to an accuracy percentage.
 * Uses the Lichess-style formula: accuracy = 103.1668 * exp(-0.04354 * cpLoss) - 3.1668
 * Clamped to [0, 100].
 */
export function cpLossToAccuracy(cpLoss: number): number {
  const accuracy = 103.1668 * Math.exp(-0.04354 * Math.abs(cpLoss)) - 3.1668;
  return Math.max(0, Math.min(100, accuracy));
}

/**
 * Calculate phase-based accuracy from eval data.
 *
 * @param evalData - Array of position data with evals, indexed by half-move number
 * @param userColor - "w" or "b"
 */
export function calculatePhaseAccuracy(
  evalData: { fen: string; eval: number }[],
  userColor: "w" | "b"
): PhaseAccuracyResult {
  const phases: Record<GamePhase, { cpLosses: number[]; count: number }> = {
    opening: { cpLosses: [], count: 0 },
    middlegame: { cpLosses: [], count: 0 },
    endgame: { cpLosses: [], count: 0 },
  };

  for (let i = 1; i < evalData.length; i++) {
    // Determine who made this move
    const movedColor = i % 2 === 1 ? "w" : "b";
    if (movedColor !== userColor) continue;

    const prev = evalData[i - 1];
    const curr = evalData[i];

    // Calculate centipawn loss from the user's perspective
    const sign = userColor === "w" ? 1 : -1;
    const evalBefore = prev.eval * sign;
    const evalAfter = curr.eval * sign;
    const cpLoss = Math.max(0, evalBefore - evalAfter);

    const phase = classifyPhase(prev.fen, i - 1);
    phases[phase].cpLosses.push(cpLoss);
    phases[phase].count++;
  }

  const computePhase = (data: { cpLosses: number[]; count: number }) => {
    if (data.count === 0) return { moves: 0, accuracy: 100, avgCpLoss: 0 };
    const avgCpLoss = data.cpLosses.reduce((a, b) => a + b, 0) / data.count;
    const accuracy = Math.round(cpLossToAccuracy(avgCpLoss) * 10) / 10;
    return {
      moves: data.count,
      accuracy,
      avgCpLoss: Math.round(avgCpLoss),
    };
  };

  const opening = computePhase(phases.opening);
  const middlegame = computePhase(phases.middlegame);
  const endgame = computePhase(phases.endgame);

  // Overall
  const allCpLosses = [
    ...phases.opening.cpLosses,
    ...phases.middlegame.cpLosses,
    ...phases.endgame.cpLosses,
  ];
  const totalMoves = opening.moves + middlegame.moves + endgame.moves;
  const overallAvgCpLoss =
    totalMoves > 0 ? allCpLosses.reduce((a, b) => a + b, 0) / totalMoves : 0;

  return {
    opening,
    middlegame,
    endgame,
    overall: {
      moves: totalMoves,
      accuracy: Math.round(cpLossToAccuracy(overallAvgCpLoss) * 10) / 10,
      avgCpLoss: Math.round(overallAvgCpLoss),
    },
  };
}
