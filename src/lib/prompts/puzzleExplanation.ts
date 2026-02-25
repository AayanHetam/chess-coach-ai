/**
 * Prompt templates for AI coach puzzle explanations.
 * Used after a user solves or fails a puzzle.
 */

import { Chess } from "chess.js";

// Convert UCI moves (e.g. "e2e4", "g1f3") to SAN (e.g. "e4", "Nf3") from a given FEN
function uciMovesToSan(fen: string, uciMoves: string[]): string[] {
  const result: string[] = [];
  try {
    const game = new Chess(fen);
    for (const uci of uciMoves) {
      if (uci.length < 4) {
        result.push(uci); // Already SAN or invalid, pass through
        continue;
      }
      try {
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci.slice(4) : undefined;
        const moveResult = game.move({ from, to, promotion });
        if (moveResult) {
          result.push(moveResult.san);
        } else {
          result.push(uci); // Fallback
        }
      } catch {
        result.push(uci); // Fallback
      }
    }
  } catch {
    return uciMoves; // If FEN is invalid, return originals
  }
  return result;
}

// Format SAN moves with move numbers for readability
function formatMovesNumbered(fen: string, sanMoves: string[]): string {
  try {
    const game = new Chess(fen);
    const isBlackToMove = game.turn() === "b";
    let moveNum = parseInt(fen.split(" ")[5] || "1");
    let isWhiteTurn = !isBlackToMove;
    const parts: string[] = [];

    for (const san of sanMoves) {
      if (isWhiteTurn) {
        parts.push(`${moveNum}. ${san}`);
      } else {
        if (parts.length === 0) parts.push(`${moveNum}... ${san}`);
        else parts.push(san);
        moveNum++;
      }
      isWhiteTurn = !isWhiteTurn;
    }
    return parts.join(" ");
  } catch {
    return sanMoves.join(" ");
  }
}

export const PUZZLE_EXPLANATION_SYSTEM_PROMPT = `You are a friendly chess coach explaining a tactical puzzle to a student.
Be concise but thorough (4-8 sentences). Use standard algebraic notation (SAN) for moves.
Focus on the KEY idea — why the tactic works, what pattern to recognize.
For each move in the solution, briefly explain WHY it's the best choice.
If the student failed, be encouraging and explain what they should look for next time.
Name the tactical theme(s) involved (fork, pin, discovered attack, etc.) and explain the pattern.`;

export function buildPuzzleExplanationPrompt({
  fen,
  themes,
  solutionMoves,
  puzzleRating,
  solved,
  userAttemptedMove,
}: {
  fen: string;
  themes: string[];
  solutionMoves: string[];
  puzzleRating: number;
  solved: boolean;
  userAttemptedMove?: string;
}): string {
  const themeList = themes.length > 0 ? themes.join(", ") : "general tactics";

  // Convert UCI moves to SAN for the LLM
  const sanMoves = uciMovesToSan(fen, solutionMoves);
  const numberedMoves = formatMovesNumbered(fen, sanMoves);

  // Determine whose turn it is
  let sideToMove = "White";
  try {
    const game = new Chess(fen);
    sideToMove = game.turn() === "w" ? "White" : "Black";
  } catch { /* default to White */ }

  let prompt = `## Puzzle (Rating ${puzzleRating})
FEN: ${fen}
Side to move: ${sideToMove}
Themes: ${themeList}
Solution: ${numberedMoves}
`;

  if (solved) {
    prompt += `\nThe student SOLVED the puzzle correctly. Briefly explain WHY the combination works — what's the key tactical idea? Keep it encouraging and educational.`;
  } else {
    prompt += `\nThe student FAILED the puzzle.`;
    if (userAttemptedMove) {
      prompt += ` They tried: ${userAttemptedMove}.`;
    }
    prompt += `\nExplain the correct idea in a kind way. What should they look for to spot this pattern in future games?`;
  }

  return prompt;
}
