/**
 * User Prompt Builders
 * Functions to construct user prompts for different analysis types
 */

import { PositionData } from "../enhancedFenTracker";
import { ChessAnalysisRequest } from "../enhancedOpenAIService";

/**
 * Build a user prompt for game review analysis
 */
export const buildGameReviewPrompt = (
  gameHistory: PositionData[],
  userMessage?: string,
  evaluationData?: ChessAnalysisRequest["evaluationData"]
): string => {
  let prompt = "";

  if (userMessage && userMessage.trim() !== "") {
    prompt += `## USER QUESTION/MESSAGE:\n${userMessage}\n\n`;
  }

  // Add game history context
  if (gameHistory && gameHistory.length > 0) {
    const moves = gameHistory
      .filter((pos) => pos.movePlayed)
      .map((pos, index) => {
        const moveNumber = Math.floor(index / 2) + 1;
        const isBlackMove = index % 2 === 1;
        return `move ${moveNumber}${isBlackMove ? "b" : "w"}: ${pos.movePlayed!.san}`;
      })
      .join("\n");
    prompt += `## GAME HISTORY:\n${moves}\n\n`;
  }

  // Add evaluation data if available
  if (
    evaluationData &&
    evaluationData.topMistakes &&
    evaluationData.topMistakes.length > 0
  ) {
    const topMistakes = evaluationData.topMistakes
      .map((mistake) => {
        const player = mistake.playerColor === "w" ? "White" : "Black";
        const change =
          mistake.evaluationChange > 0
            ? `+${mistake.evaluationChange}`
            : `${mistake.evaluationChange}`;
        return `Move ${mistake.moveNumber} (${player}): ${mistake.move} - Evaluation changed from ${mistake.evaluationBefore} to ${mistake.evaluationAfter} (${change} centipawns) - ${mistake.mistakeSeverity} mistake`;
      })
      .join("\n");

    prompt += `## EVALUATION DATA (For Reference):\n${topMistakes}\n\n`;
    prompt +=
      "Note: This evaluation data shows moves with significant evaluation changes. Use this information to inform your analysis.\n\n";
  }

  return prompt.trim();
};

/**
 * Build a user prompt for move-specific analysis
 */
export const buildMoveAnalysisPrompt = (
  moveNumber: number,
  move: string,
  gameHistory: PositionData[]
): string => {
  return `Analyze move ${moveNumber} (${move}) in detail.

## MOVE TO ANALYZE:
Move ${moveNumber}: ${move}

## GAME CONTEXT:
${
  gameHistory && gameHistory.length > 0
    ? gameHistory
        .filter((pos) => pos.movePlayed)
        .map((pos, index) => {
          const moveNum = Math.floor(index / 2) + 1;
          const isBlackMove = index % 2 === 1;
          return `move ${moveNum}${isBlackMove ? "b" : "w"}: ${pos.movePlayed!.san}`;
        })
        .join("\n")
    : "No game history available"
}

Please provide:
1. Short-term consequences of this move
2. Long-term strategic implications
3. Alternative moves and why they might be better or worse
4. Which chess principles were followed or violated
5. What the player should have considered before playing this move`;
};
