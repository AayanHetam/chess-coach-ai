import type { AttemptStatus } from "@/lib/puzzle/attemptStatus";

/**
 * When the Analyse tool is allowed to run on /puzzles.
 *
 * This is a correctness gate, not a UI nicety. Stockfish's top move in a
 * tactics position **is the puzzle's answer** — an Analyse button that works
 * while the puzzle is unsolved is a cheat button, and it would quietly hollow
 * out the training value of the whole page.
 *
 * So the rule is: analysis unlocks only once the answer is no longer a secret.
 * That means solved, or the solution explicitly revealed. Everything else stays
 * shut.
 *
 * Kept pure and separate from the component precisely because it is the part
 * that must not be got wrong by accident while someone is moving JSX around.
 */

export interface AnalysisGateInput {
  status: AttemptStatus;
  /** True once "Show solution" has been used on THIS puzzle. */
  solutionRevealed: boolean;
  /** False while the feed is still loading. */
  hasPuzzle: boolean;
}

export type AnalysisAvailability =
  | { available: true }
  | { available: false; reason: string };

/**
 * Copy shown on the disabled button. A dead control with no explanation reads
 * as broken; saying why also teaches the rule.
 */
export const LOCKED_REASON =
  "Unlocks once you solve it or show the solution — the engine's top move is the answer.";

const NO_PUZZLE_REASON = "Waiting for a puzzle.";

export function analysisAvailability(
  input: AnalysisGateInput
): AnalysisAvailability {
  if (!input.hasPuzzle) {
    return { available: false, reason: NO_PUZZLE_REASON };
  }
  // Solved, or they asked to be shown — either way the answer is already out.
  if (input.status === "solved" || input.solutionRevealed) {
    return { available: true };
  }
  // NOTE "wrong" deliberately does NOT unlock. A wrong attempt is retryable —
  // the board resets and the user tries again — so the answer is still live.
  // Unlocking here would turn one deliberate miss into a legal way to ask the
  // engine for the solution, which is the exact hole this gate exists to close.
  return { available: false, reason: LOCKED_REASON };
}
