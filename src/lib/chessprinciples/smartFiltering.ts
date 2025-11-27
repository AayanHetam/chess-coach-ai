import { Chess } from "chess.js";
import { ChessPrinciple, ChessPrincipleViolation } from "./index";
import { PositionEval } from "@/types/eval";

export interface FilteredAnalysis {
  violations: ChessPrincipleViolation[];
  missedOpportunities: ChessPrinciple[];
  assessment: "excellent" | "good" | "inaccurate" | "mistake" | "blunder";
  explanation: string;
  shouldShowFeedback: boolean;
}

export interface AccuracyBasedFiltering {
  minAccuracyForNoViolations: number; // 95% = no violations shown
  maxViolationsPerGame: number;
  severityThresholds: {
    excellent: number;
    good: number;
    inaccurate: number;
    mistake: number;
    blunder: number;
  };
  principleConfidenceThreshold: number; // Only flag principles we're confident about
}

export function createAccuracyBasedFiltering(
  playerAccuracy: number
): AccuracyBasedFiltering {
  if (playerAccuracy >= 95) {
    return {
      minAccuracyForNoViolations: 98, // Much higher threshold - only show violations for near-perfect play
      maxViolationsPerGame: 3, // Cap at 3 violations maximum
      severityThresholds: {
        excellent: 0,
        good: 0,
        inaccurate: 1,
        mistake: 2,
        blunder: 3,
      },
      principleConfidenceThreshold: 0.7, // Lower confidence threshold to catch more violations
    };
  } else if (playerAccuracy >= 85) {
    return {
      minAccuracyForNoViolations: 92, // Higher threshold
      maxViolationsPerGame: 3, // Cap at 3 violations maximum
      severityThresholds: {
        excellent: 0,
        good: 0,
        inaccurate: 1,
        mistake: 2,
        blunder: 3,
      },
      principleConfidenceThreshold: 0.6, // Lower confidence threshold
    };
  } else if (playerAccuracy >= 70) {
    return {
      minAccuracyForNoViolations: 85, // Higher threshold
      maxViolationsPerGame: 3, // Cap at 3 violations maximum
      severityThresholds: {
        excellent: 0,
        good: 0,
        inaccurate: 1,
        mistake: 2,
        blunder: 3,
      },
      principleConfidenceThreshold: 0.5, // Much lower confidence threshold
    };
  } else {
    return {
      minAccuracyForNoViolations: 75, // Higher threshold
      maxViolationsPerGame: 3, // Cap at 3 violations maximum
      severityThresholds: {
        excellent: 0,
        good: 0,
        inaccurate: 1,
        mistake: 2,
        blunder: 3,
      },
      principleConfidenceThreshold: 0.4, // Very low confidence threshold to catch more violations
    };
  }
}

export function filterPrincipleViolations(
  violations: ChessPrincipleViolation[],
  missedOpportunities: ChessPrinciple[],
  playerAccuracy: number,
  gamePhase: "opening" | "middlegame" | "endgame",
  position: Chess,
  evaluation?: PositionEval
): FilteredAnalysis {
  const filtering = createAccuracyBasedFiltering(playerAccuracy);

  // If player has very high accuracy, don't show violations unless they're major
  if (playerAccuracy >= filtering.minAccuracyForNoViolations) {
    const majorViolations = violations.filter((v) => v.severity === "major");
    if (majorViolations.length === 0) {
      return {
        violations: [],
        missedOpportunities: [],
        assessment: "excellent",
        explanation: "Excellent play with no significant errors!",
        shouldShowFeedback: false,
      };
    }
  }

  // Filter violations based on confidence and soundness
  const confidentViolations = violations.filter(
    (violation) =>
      isPrincipleViolationSound(violation, position, evaluation) &&
      getPrincipleConfidence(violation, gamePhase) >=
        filtering.principleConfidenceThreshold
  );

  // Sort by importance (severity + principle priority)
  const sortedViolations = confidentViolations.sort((a, b) => {
    const severityOrder = { major: 3, moderate: 2, minor: 1 };
    const aScore = severityOrder[a.severity] + a.principle.priority / 10;
    const bScore = severityOrder[b.severity] + b.principle.priority / 10;
    return bScore - aScore;
  });

  // Limit violations based on player accuracy
  const limitedViolations = sortedViolations.slice(
    0,
    filtering.maxViolationsPerGame
  );

  // Filter missed opportunities (only show if they're significant)
  const significantOpportunities = missedOpportunities.filter((opportunity) =>
    isOpportunitySignificant(opportunity, position, evaluation)
  );

  // Determine assessment
  const assessment = determineAssessment(
    limitedViolations,
    significantOpportunities,
    filtering
  );

  // Generate explanation
  const explanation = generateFilteredExplanation(
    limitedViolations,
    significantOpportunities,
    assessment
  );

  // Determine if feedback should be shown - be more permissive
  const shouldShowFeedback =
    limitedViolations.length > 0 ||
    (significantOpportunities.length > 0 && playerAccuracy < 95);

  return {
    violations: limitedViolations,
    missedOpportunities: significantOpportunities,
    assessment,
    explanation,
    shouldShowFeedback,
  };
}

function isPrincipleViolationSound(
  violation: ChessPrincipleViolation,
  position: Chess,
  evaluation?: PositionEval
): boolean {
  // Check if the violation actually makes sense in the context
  const moveDetails = getLastMoveDetails(position);
  if (!moveDetails) return true; // Be more permissive - don't reject just because we can't get move details

  // Validate based on principle type - but be more permissive
  switch (violation.principle.id) {
    case "dont-hang-pieces":
      return isPieceActuallyHanging(moveDetails.to, position);

    case "maintain-king-safety":
      return isKingActuallyInDanger(position);

    case "control-center-pawns":
      return isCenterControlActuallyImportant(position);

    case "develop-knights-bishops":
      return isDevelopmentActuallyNeeded(position);

    case "look-for-basic-tactics":
      return areTacticsActuallyAvailable(position);

    case "calculate-accurately":
      return isCalculationErrorActuallySignificant(position, evaluation);

    default:
      return true; // Allow other violations - be more permissive
  }
}

function getPrincipleConfidence(
  violation: ChessPrincipleViolation,
  gamePhase: "opening" | "middlegame" | "endgame"
): number {
  // Higher confidence for principles that are more universally applicable
  const baseConfidence = {
    "dont-hang-pieces": 0.95,
    "maintain-king-safety": 0.9,
    "look-for-basic-tactics": 0.85,
    "calculate-accurately": 0.8,
    "control-center-pawns": 0.75,
    "develop-knights-bishops": 0.7,
    "maximize-piece-activity": 0.7,
    "activate-king": 0.8,
    "support-passed-pawns": 0.75,
  };

  const confidence =
    baseConfidence[violation.principle.id as keyof typeof baseConfidence] ||
    0.6;

  // Adjust confidence based on game phase - but be less restrictive
  if (violation.principle.category === gamePhase) {
    return confidence;
  } else if (violation.principle.category === "general") {
    return confidence * 0.95; // Less penalty for general principles
  } else {
    return confidence * 0.85; // Less penalty for phase-specific principles in wrong phase
  }
}

function isOpportunitySignificant(
  opportunity: ChessPrinciple,
  position: Chess,
  evaluation?: PositionEval
): boolean {
  // Only show missed opportunities if they would have made a significant difference
  if (evaluation?.lines?.[0]?.cp) {
    const evalDiff = Math.abs(evaluation.lines[0].cp);
    return evalDiff > 50; // Only significant if evaluation difference is > 50 centipawns
  }

  // For principles without clear evaluation, use heuristics
  const significantPrinciples = [
    "dont-hang-pieces",
    "maintain-king-safety",
    "look-for-basic-tactics",
    "activate-king",
    "support-passed-pawns",
  ];

  return significantPrinciples.includes(opportunity.id);
}

function determineAssessment(
  violations: ChessPrincipleViolation[],
  missedOpportunities: ChessPrinciple[],
  filtering: AccuracyBasedFiltering
): "excellent" | "good" | "inaccurate" | "mistake" | "blunder" {
  const majorViolations = violations.filter(
    (v) => v.severity === "major"
  ).length;
  const moderateViolations = violations.filter(
    (v) => v.severity === "moderate"
  ).length;
  const totalIssues = violations.length + missedOpportunities.length;

  if (majorViolations >= filtering.severityThresholds.blunder) return "blunder";
  if (
    majorViolations >= filtering.severityThresholds.mistake ||
    totalIssues >= 3
  )
    return "mistake";
  if (
    moderateViolations >= filtering.severityThresholds.inaccurate ||
    totalIssues >= 2
  )
    return "inaccurate";
  if (totalIssues >= filtering.severityThresholds.good) return "good";
  return "excellent";
}

function generateFilteredExplanation(
  violations: ChessPrincipleViolation[],
  missedOpportunities: ChessPrinciple[],
  assessment: string
): string {
  if (violations.length === 0 && missedOpportunities.length === 0) {
    return "Excellent play with no significant errors!";
  }

  const mainViolation = violations[0];
  if (mainViolation) {
    return `${mainViolation.principle.name}: ${mainViolation.description}`;
  }

  const mainOpportunity = missedOpportunities[0];
  if (mainOpportunity) {
    return `Missed opportunity: ${mainOpportunity.name}`;
  }

  return `Game had some areas for improvement.`;
}

// Helper functions for validation
function getLastMoveDetails(position: Chess): any {
  const history = position.history({ verbose: true });
  return history[history.length - 1];
}

function isPieceActuallyHanging(square: string, position: Chess): boolean {
  // Check if piece on square is actually hanging (can be captured for free or with advantage)
  const board = position.board();
  const [file, rank] = [square.charCodeAt(0) - 97, parseInt(square[1]) - 1];
  const piece = board[rank][file];

  if (!piece) return false;

  // Check if piece can be captured for free
  const moves = position.moves();
  const captures = moves.filter(
    (move) => move.includes("x") && move.includes(square)
  );

  return captures.some((capture) => {
    try {
      const testPosition = new Chess(position.fen());
      testPosition.move(capture);
      return !testPosition.isCheck(); // Not a check, so it's a free capture
    } catch {
      return false;
    }
  });
}

function isKingActuallyInDanger(position: Chess): boolean {
  return position.isCheck() || position.isCheckmate();
}

function isCenterControlActuallyImportant(position: Chess): boolean {
  const moveCount = position.history().length;
  return moveCount < 20; // More permissive - important in opening and early middlegame
}

function isDevelopmentActuallyNeeded(position: Chess): boolean {
  const moveCount = position.history().length;
  return moveCount < 15; // More permissive - important in opening and early middlegame
}

function areTacticsActuallyAvailable(position: Chess): boolean {
  const moves = position.moves();
  return moves.some((move) => {
    try {
      const testPosition = new Chess(position.fen());
      testPosition.move(move);
      return testPosition.isCheck() || move.includes("x") || move.includes("+"); // Check, capture, or check
    } catch {
      return false;
    }
  });
}

function isCalculationErrorActuallySignificant(
  position: Chess,
  evaluation?: PositionEval
): boolean {
  if (!evaluation?.lines?.[0]?.cp) return true; // If no evaluation available, assume it might be significant
  return Math.abs(evaluation.lines[0].cp) > 50; // More permissive - lower threshold for significant evaluation difference
}

// Export for use in other modules
export function shouldShowMoveFeedback(
  moveNumber: number,
  totalMoves: number,
  playerAccuracy: number,
  violationCount: number
): boolean {
  const filtering = createAccuracyBasedFiltering(playerAccuracy);

  // Don't show feedback if player has very high accuracy
  if (playerAccuracy >= filtering.minAccuracyForNoViolations) {
    return false;
  }

  // Limit feedback frequency
  const maxFeedbackMoves = Math.min(
    filtering.maxViolationsPerGame,
    Math.ceil(totalMoves * 0.3)
  );

  return violationCount <= maxFeedbackMoves;
}
