/**
 * Game Phase Analysis — Score each game by phase (opening, middlegame, endgame).
 * Uses Stockfish eval data to compute per-phase accuracy and identify
 * which phase the player needs to improve most.
 */

import { Chess } from "chess.js";

export interface GamePhaseScore {
  opening: PhaseScore;
  middlegame: PhaseScore;
  endgame: PhaseScore;
  overallAccuracy: number;
  weakestPhase: "opening" | "middlegame" | "endgame";
  summary: string;
}

export interface PhaseScore {
  startMove: number;
  endMove: number;
  totalMoves: number;
  mistakes: number;
  accuracy: number;
  biggestMistake: {
    moveNumber: number;
    movePlayed: string;
    bestMove: string;
    evalDrop: number;
  } | null;
}

interface MoveEvalData {
  moveSan: string;
  evalBefore: number; // centipawns
  evalAfter: number;  // centipawns
  bestMove?: string;
}

/**
 * Analyze a game and produce per-phase accuracy scores.
 * @param moveHistory - Array of SAN moves
 * @param evalData - Array of centipawn evaluations (one per half-move, evalData[i] = eval AFTER move i)
 * @param playerColor - "w" or "b" — which side to score
 */
export function analyzeGamePhases(
  moveHistory: string[],
  evalData: Array<{ cpAfter: number; cpBefore: number; bestMove?: string }>,
  playerColor: "w" | "b"
): GamePhaseScore {
  // Determine phase boundaries
  const phaseBoundaries = detectPhaseBoundaries(moveHistory);

  const opening: PhaseScore = createEmptyPhaseScore(1, phaseBoundaries.middlegameStart - 1);
  const middlegame: PhaseScore = createEmptyPhaseScore(phaseBoundaries.middlegameStart, phaseBoundaries.endgameStart - 1);
  const endgame: PhaseScore = createEmptyPhaseScore(phaseBoundaries.endgameStart, Math.ceil(moveHistory.length / 2));

  // Analyze each move
  for (let i = 0; i < moveHistory.length; i++) {
    const isPlayerMove = (i % 2 === 0 && playerColor === "w") || (i % 2 === 1 && playerColor === "b");
    if (!isPlayerMove) continue;

    const moveNum = Math.floor(i / 2) + 1;
    const moveSan = moveHistory[i];

    if (i >= evalData.length) continue;
    const evalEntry = evalData[i];

    // Calculate eval drop from player's perspective
    let drop = 0;
    if (playerColor === "w") {
      drop = evalEntry.cpBefore - evalEntry.cpAfter;
    } else {
      drop = evalEntry.cpAfter - evalEntry.cpBefore;
    }

    // Determine which phase this move belongs to
    let phase: PhaseScore;
    if (moveNum < phaseBoundaries.middlegameStart) {
      phase = opening;
    } else if (moveNum < phaseBoundaries.endgameStart) {
      phase = middlegame;
    } else {
      phase = endgame;
    }

    phase.totalMoves++;

    // Count as mistake if drop > 50 centipawns (0.5 pawns)
    if (drop > 50) {
      phase.mistakes++;

      // Track biggest mistake
      if (!phase.biggestMistake || drop > phase.biggestMistake.evalDrop) {
        phase.biggestMistake = {
          moveNumber: moveNum,
          movePlayed: moveSan,
          bestMove: evalEntry.bestMove || "N/A",
          evalDrop: drop,
        };
      }
    }
  }

  // Calculate accuracy percentages
  opening.accuracy = computeAccuracy(opening);
  middlegame.accuracy = computeAccuracy(middlegame);
  endgame.accuracy = computeAccuracy(endgame);

  const totalMoves = opening.totalMoves + middlegame.totalMoves + endgame.totalMoves;
  const totalMistakes = opening.mistakes + middlegame.mistakes + endgame.mistakes;
  const overallAccuracy = totalMoves > 0 ? ((totalMoves - totalMistakes) / totalMoves) * 100 : 100;

  // Determine weakest phase
  let weakestPhase: "opening" | "middlegame" | "endgame" = "opening";
  let lowestAccuracy = opening.accuracy;
  if (middlegame.accuracy < lowestAccuracy && middlegame.totalMoves > 0) {
    weakestPhase = "middlegame";
    lowestAccuracy = middlegame.accuracy;
  }
  if (endgame.accuracy < lowestAccuracy && endgame.totalMoves > 0) {
    weakestPhase = "endgame";
  }

  const summary = buildPhaseSummary(opening, middlegame, endgame, weakestPhase);

  return {
    opening,
    middlegame,
    endgame,
    overallAccuracy,
    weakestPhase,
    summary,
  };
}

/**
 * Detect the approximate boundaries between opening, middlegame, and endgame.
 * Uses piece count heuristics on the actual board state.
 */
function detectPhaseBoundaries(moveHistory: string[]): {
  middlegameStart: number; // full move number
  endgameStart: number;
} {
  const game = new Chess();
  let middlegameStart = 15; // Default: opening ends at move 15
  let endgameStart = 999;   // Default: no endgame detected

  for (let i = 0; i < moveHistory.length; i++) {
    try {
      game.move(moveHistory[i]);
    } catch {
      break;
    }

    const moveNum = Math.floor(i / 2) + 1;
    const board = game.board();
    let totalPieces = 0;
    let queens = 0;

    for (const row of board) {
      for (const sq of row) {
        if (sq && sq.type !== "k" && sq.type !== "p") {
          totalPieces++;
          if (sq.type === "q") queens++;
        }
      }
    }

    // Opening ends when significant pieces have been traded
    if (totalPieces <= 10 && middlegameStart === 15 && moveNum > 10) {
      middlegameStart = Math.min(moveNum - 2, 15);
    }

    // Endgame starts when few pieces remain or no queens
    if (endgameStart === 999) {
      if (totalPieces <= 6 || (queens === 0 && totalPieces <= 8)) {
        endgameStart = moveNum;
      }
    }
  }

  // Ensure reasonable boundaries
  if (middlegameStart >= endgameStart) {
    middlegameStart = Math.max(10, endgameStart - 5);
  }

  return { middlegameStart, endgameStart };
}

function createEmptyPhaseScore(startMove: number, endMove: number): PhaseScore {
  return {
    startMove,
    endMove: Math.max(startMove, endMove),
    totalMoves: 0,
    mistakes: 0,
    accuracy: 100,
    biggestMistake: null,
  };
}

function computeAccuracy(phase: PhaseScore): number {
  if (phase.totalMoves === 0) return 100;
  return ((phase.totalMoves - phase.mistakes) / phase.totalMoves) * 100;
}

function buildPhaseSummary(
  opening: PhaseScore,
  middlegame: PhaseScore,
  endgame: PhaseScore,
  weakestPhase: string
): string {
  const parts: string[] = [];

  if (opening.totalMoves > 0) {
    parts.push(`Opening: ${opening.accuracy.toFixed(0)}% accuracy (${opening.mistakes} mistake${opening.mistakes !== 1 ? "s" : ""})`);
  }
  if (middlegame.totalMoves > 0) {
    parts.push(`Middlegame: ${middlegame.accuracy.toFixed(0)}% accuracy (${middlegame.mistakes} mistake${middlegame.mistakes !== 1 ? "s" : ""})`);
  }
  if (endgame.totalMoves > 0) {
    parts.push(`Endgame: ${endgame.accuracy.toFixed(0)}% accuracy (${endgame.mistakes} mistake${endgame.mistakes !== 1 ? "s" : ""})`);
  }

  parts.push(`Focus area: ${weakestPhase}`);

  return parts.join(". ");
}

/**
 * Convert a GamePhaseScore into a prompt-injectable context string.
 */
export function phaseScoreToPromptContext(score: GamePhaseScore): string {
  let context = "\n\n=== GAME PHASE ANALYSIS ===\n";
  context += `${score.summary}\n\n`;

  if (score.opening.biggestMistake) {
    const m = score.opening.biggestMistake;
    context += `Opening biggest mistake: Move ${m.moveNumber} (${m.movePlayed}), best was ${m.bestMove}, lost ${(m.evalDrop / 100).toFixed(1)} pawns\n`;
  }
  if (score.middlegame.biggestMistake) {
    const m = score.middlegame.biggestMistake;
    context += `Middlegame biggest mistake: Move ${m.moveNumber} (${m.movePlayed}), best was ${m.bestMove}, lost ${(m.evalDrop / 100).toFixed(1)} pawns\n`;
  }
  if (score.endgame.biggestMistake) {
    const m = score.endgame.biggestMistake;
    context += `Endgame biggest mistake: Move ${m.moveNumber} (${m.movePlayed}), best was ${m.bestMove}, lost ${(m.evalDrop / 100).toFixed(1)} pawns\n`;
  }

  context += `\nWeakest phase: ${score.weakestPhase} — prioritize coaching for this phase.\n`;

  return context;
}
