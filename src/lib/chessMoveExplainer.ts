/**
 * Chess Masti AI
 * Copyright (C) 2024-2026 Aayan Hetamsaria
 *
 * This work is licensed under CC BY-NC 4.0
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Commercial use requires explicit written permission.
 * For commercial licensing inquiries: https://github.com/AayanHetam
 */

export interface MoveExplanation {
  eval_change: number;
  violated_principles: string[];
  explanation: string;
}

export interface PrincipleFunction {
  (fenBefore: string, fenAfter: string, move: string): boolean;
}

export interface Principles {
  [name: string]: PrincipleFunction;
}

export function explainMove(
  fenBefore: string,
  move: string,
  fenAfter: string,
  evalBefore: number,
  evalAfter: number,
  principles: Principles
): MoveExplanation {
  /**
   * Explain a chess move by analyzing evaluation changes and principle violations.
   *
   * @param fenBefore - FEN string before the move
   * @param move - Move in PGN format (e.g., "15...h6")
   * @param fenAfter - FEN string after the move
   * @param evalBefore - Engine evaluation before the move
   * @param evalAfter - Engine evaluation after the move
   * @param principles - Dictionary of principle functions {name: function(FEN_before, FEN_after, move) -> bool}
   *
   * @returns JSON object with explanation
   */

  // Calculate evaluation change
  const evalChange = evalAfter - evalBefore;

  // If evaluation improved or stayed the same, no significant mistake
  if (evalChange >= 0) {
    return {
      eval_change: Math.round(evalChange * 100) / 100,
      violated_principles: [],
      explanation: "No significant mistake",
    };
  }

  // Check which principles are violated
  const violatedPrinciples: string[] = [];
  for (const [principleName, principleFunc] of Object.entries(principles)) {
    try {
      if (principleFunc(fenBefore, fenAfter, move)) {
        violatedPrinciples.push(principleName);
      }
    } catch (error) {
      // Skip principles that fail to evaluate
      console.warn(`Principle ${principleName} failed to evaluate:`, error);
      continue;
    }
  }

  // Sort by principle index (assuming names contain numbers)
  const getPrincipleIndex = (name: string): number => {
    try {
      // Extract number from principle name (e.g., "1. Control the Center" -> 1)
      const match = name.match(/^(\d+)/);
      return match ? parseInt(match[1], 10) : 999;
    } catch {
      return 999;
    }
  };

  violatedPrinciples.sort(
    (a, b) => getPrincipleIndex(a) - getPrincipleIndex(b)
  );

  // Limit to top 3 most severe (lowest indexed) if more than 4
  if (violatedPrinciples.length > 4) {
    violatedPrinciples.splice(3);
  }

  // Generate natural language explanation
  const explanation = generateExplanation(violatedPrinciples, evalChange, move);

  return {
    eval_change: Math.round(evalChange * 100) / 100,
    violated_principles: violatedPrinciples,
    explanation: explanation,
  };
}

function generateExplanation(
  violatedPrinciples: string[],
  evalChange: number,
  move: string
): string {
  /**
   * Generate natural language explanation combining violated principles.
   *
   * @param violatedPrinciples - List of principle names that were violated
   * @param evalChange - Numerical evaluation change
   * @param move - The move that was played
   *
   * @returns Natural language explanation string
   */

  if (violatedPrinciples.length === 0) {
    return "No significant mistake";
  }

  // Define principle explanations for 1700-rated players
  const principleExplanations: { [key: string]: string } = {
    "Control the Center": "fails to control the center squares",
    "Develop Pieces": "leaves pieces undeveloped",
    "King Safety": "compromises king safety",
    "Pawn Structure": "creates pawn weaknesses",
    "Piece Coordination": "disrupts piece coordination",
    Material: "loses material advantage",
    Tactics: "misses tactical opportunities",
    Positional: "weakens the position",
    Time: "wastes valuable time",
    Space: "gives up space advantage",
  };

  // Map principle names to explanations
  const explanations: string[] = [];
  for (const principle of violatedPrinciples) {
    // Try to find a matching explanation
    let found = false;
    for (const [key, explanation] of Object.entries(principleExplanations)) {
      if (principle.toLowerCase().includes(key.toLowerCase())) {
        explanations.push(explanation);
        found = true;
        break;
      }
    }
    if (!found) {
      // If no specific explanation found, use a generic one
      explanations.push(`violates ${principle.toLowerCase()}`);
    }
  }

  // Combine explanations smoothly
  let explanation: string;
  if (explanations.length === 1) {
    explanation = explanations[0];
  } else if (explanations.length === 2) {
    explanation = `${explanations[0]} and ${explanations[1]}`;
  } else {
    explanation = `${explanations.slice(0, -1).join(", ")}, and ${explanations[explanations.length - 1]}`;
  }

  // Add evaluation context
  let severity: string;
  if (evalChange > -0.5) {
    severity = "slightly weakens";
  } else if (evalChange > -1.0) {
    severity = "weakens";
  } else if (evalChange > -2.0) {
    severity = "significantly weakens";
  } else {
    severity = "seriously weakens";
  }

  return `This move ${severity} your position because it ${explanation}.`;
}

// Example principle functions (simplified for demonstration)
export function principle1ControlCenter(
  fenBefore: string,
  fenAfter: string,
  move: string
): boolean {
  /** Principle 1: Control the Center */
  // Simplified check - in real implementation, analyze piece positions
  return move.includes("e4") || move.includes("d4");
}

export function principle2DevelopPieces(
  fenBefore: string,
  fenAfter: string,
  move: string
): boolean {
  /** Principle 2: Develop Pieces */
  // Simplified check - in real implementation, analyze piece development
  return move.includes("N") || move.includes("B");
}

export function principle3KingSafety(
  fenBefore: string,
  fenAfter: string,
  move: string
): boolean {
  /** Principle 3: King Safety */
  // Simplified check - in real implementation, analyze king exposure
  return !move.includes("O-O") && !move.includes("O-O-O");
}

// Example principles dictionary
export const examplePrinciples: Principles = {
  "1. Control the Center": principle1ControlCenter,
  "2. Develop Pieces": principle2DevelopPieces,
  "3. King Safety": principle3KingSafety,
};

// Example usage and testing
export function testMoveExplainer(): void {
  const testResult = explainMove(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "1.e4",
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    0.0,
    -0.5,
    examplePrinciples
  );

  console.log("Example output:");
  console.log(JSON.stringify(testResult, null, 2));
}

// Export for use in other modules
export default {
  explainMove,
  generateExplanation,
  examplePrinciples,
  testMoveExplainer,
};
