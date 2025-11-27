/**
 * Prompt Helper Utilities
 * Utility functions for prompt construction and validation
 */

/**
 * Validate that a prompt is not empty and has minimum length
 */
export const validatePrompt = (
  prompt: string,
  minLength: number = 10
): boolean => {
  return prompt.trim().length >= minLength;
};

/**
 * Extract move numbers from text
 */
export const extractMoveNumbers = (text: string): number[] => {
  const movePattern = /move\s+(\d+)/gi;
  const matches = Array.from(text.matchAll(movePattern));
  const moveNumbers: number[] = [];

  for (const match of matches) {
    const moveNumber = parseInt(match[1]);
    if (!isNaN(moveNumber)) {
      moveNumbers.push(moveNumber);
    }
  }

  return Array.from(new Set(moveNumbers)).sort((a, b) => a - b);
};

/**
 * Extract position references from text
 */
export const extractPositionReferences = (text: string): number[] => {
  const positionPattern = /(?:position|Position)\s+(\d+)/gi;
  const matches = Array.from(text.matchAll(positionPattern));
  const positions: number[] = [];

  for (const match of matches) {
    const position = parseInt(match[1]);
    if (!isNaN(position)) {
      positions.push(position);
    }
  }

  return Array.from(new Set(positions)).sort((a, b) => a - b);
};

/**
 * Check if prompt contains Stockfish references
 */
export const hasStockfishReferences = (prompt: string): boolean => {
  const stockfishKeywords = [
    "stockfish",
    "evaluation",
    "best move",
    "principal variation",
    "depth",
  ];
  const lowerPrompt = prompt.toLowerCase();
  return stockfishKeywords.some((keyword) => lowerPrompt.includes(keyword));
};

/**
 * Estimate token count (rough approximation)
 */
export const estimateTokenCount = (text: string): number => {
  // Rough approximation: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
};
