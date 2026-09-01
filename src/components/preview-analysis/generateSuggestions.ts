/**
 * Per-game suggestion-pill generator for the /preview/analysis CoachPanel.
 *
 * Replaces the static SUGGESTION_PILLS constant with rules that read the
 * actual game state (move classifications, opening, ply count, current
 * mistake context) and return a fresh, relevant set on every game.
 *
 * Design rules
 * ────────────
 *   • PINNED: "Analyze my game" is always first, in the ember accent.
 *     Always useful regardless of game state; pinned so the user never
 *     has to scan for it.
 *   • Up to MAX_GENERATED additional suggestions, in priority order.
 *     Each rule produces at most one suggestion; rules later in the list
 *     are skipped once we've hit the cap.
 *   • Pure function — no React, no side effects. The caller wraps it in
 *     useMemo against (loadedGame.history, enginePositions, mistakeContext).
 *
 * Why rule-based instead of LLM-driven
 * ────────────────────────────────────
 * An LLM call would produce more natural-sounding questions but adds
 * ~500ms latency and ~$0.0002 per analysis. Rule-based is instant, free,
 * deterministic, and easy to unit-test. If a future iteration wants
 * LLM-generated variants, this helper is the right seam to extend
 * (return SuggestionSource: "rule" | "llm" and dedupe).
 */

import type { Chess, Move } from "chess.js";
import { MoveClassification } from "@/types/enums";
import type { PositionEval } from "@/types/eval";

export interface Suggestion {
  /** What the chat sends when the user clicks the pill. */
  text: string;
  /** Pinned suggestions render in ember accent; generated ones in muted. */
  pinned?: boolean;
}

export interface SuggestionInput {
  loadedGame: Chess | null | undefined;
  enginePositions?: PositionEval[] | null;
  /** Mirrors the CoachPanel's mistakeContext prop — set when the cursor
   *  is on a Mistake/Blunder/Miss ply. */
  mistakeContext?:
    | {
        movePlayed: string;
        classification?: string;
      }
    | null;
  /** Opening name if known (header tag OR detectOpening result). */
  openingName?: string | null;
}

const PINNED_SUGGESTION: Suggestion = {
  text: "Analyze my game",
  pinned: true,
};

const MAX_GENERATED = 3;

/**
 * Static fallbacks shown when the game has no analysis yet OR when rules
 * don't fire enough suggestions to fill the slot count. Generic enough to
 * make sense before Stockfish has populated `enginePositions`.
 */
const FALLBACKS: string[] = [
  "What's the most important moment in this game?",
  "Show me one improvement to study",
  "What's my biggest weakness here?",
];

/**
 * Format a ply (1-indexed engine position index) to a human move label
 * like "12.Nf6" or "12...Nf6" (black). Returns the SAN unchanged if we
 * can't infer the move number.
 */
function moveLabel(ply: number, san: string): string {
  if (ply <= 0) return san;
  const moveNum = Math.ceil(ply / 2);
  const isWhite = ply % 2 === 1;
  return isWhite ? `${moveNum}.${san}` : `${moveNum}...${san}`;
}

/** Rough "endgame" heuristic: ≤ 14 total pieces (incl. kings) on the
 *  final position. Bishops + pawns endings still count as endgame. */
function isEndgame(loadedGame: Chess): boolean {
  // Walk the final position's board cells, count non-empty.
  let count = 0;
  for (const row of loadedGame.board()) {
    for (const sq of row) {
      if (sq) count++;
    }
  }
  return count > 0 && count <= 14;
}

/**
 * Find the ply with the biggest eval drop on a blunder. Falls back to
 * the LAST blunder/mistake/miss in classification order when eval data
 * isn't available.
 */
function findWorstMistakePly(
  enginePositions: PositionEval[] | null | undefined,
): number | null {
  if (!enginePositions || enginePositions.length === 0) return null;
  let worstPly: number | null = null;
  for (let i = 0; i < enginePositions.length; i++) {
    const c = enginePositions[i].moveClassification;
    if (
      c === MoveClassification.Blunder ||
      c === MoveClassification.Mistake ||
      c === MoveClassification.Miss
    ) {
      worstPly = i;
      // Prefer the earliest blunder so the suggestion is about the
      // turning point, not the post-collapse cleanup.
      if (c === MoveClassification.Blunder) break;
    }
  }
  return worstPly;
}

function findFirstBrilliantPly(
  enginePositions: PositionEval[] | null | undefined,
): number | null {
  if (!enginePositions) return null;
  for (let i = 0; i < enginePositions.length; i++) {
    if (enginePositions[i].moveClassification === MoveClassification.Brilliant) {
      return i;
    }
  }
  return null;
}

/**
 * Main entry. Returns the pinned suggestion first, then up to
 * MAX_GENERATED rule-derived suggestions. The total array length is
 * bounded by 1 + MAX_GENERATED.
 */
export function generateSuggestions(input: SuggestionInput): Suggestion[] {
  const generated: Suggestion[] = [];
  const seen = new Set<string>();

  const add = (text: string) => {
    if (generated.length >= MAX_GENERATED) return;
    if (seen.has(text)) return;
    seen.add(text);
    generated.push({ text });
  };

  const { loadedGame, enginePositions, mistakeContext, openingName } = input;

  // Rule 1: active mistake context (highest priority — the user is
  // staring at this exact move right now).
  if (mistakeContext?.movePlayed) {
    const cls = (mistakeContext.classification || "mistake").toLowerCase();
    add(`Why was ${mistakeContext.movePlayed} a ${cls}?`);
  }

  // Rule 2: worst blunder/mistake in the game.
  const worstPly = findWorstMistakePly(enginePositions);
  if (worstPly !== null && loadedGame) {
    const moves = loadedGame.history({ verbose: true }) as Move[];
    // enginePositions[i] corresponds to the position AFTER the i'th move
    // (i=0 is the starting position; i=1 is after move 1, etc.). So the
    // move that PRODUCED that position is at moves[worstPly - 1].
    const san = moves[worstPly - 1]?.san;
    if (san) {
      add(`Walk me through the blunder at ${moveLabel(worstPly, san)}`);
    }
  }

  // Rule 2b: piece functionality on the CURRENT position — works on any
  // loaded game regardless of analysis/classification state, so it fires
  // unconditionally rather than depending on enginePositions. Answered by
  // the existing coach chat with no prompt or route changes: the position
  // context every turn already carries is enough for the model to describe
  // what each piece is doing.
  if (loadedGame) {
    add("What is each of my pieces doing right now?");
  }

  // Rule 3: first brilliant move.
  const brilliantPly = findFirstBrilliantPly(enginePositions);
  if (brilliantPly !== null && loadedGame) {
    const moves = loadedGame.history({ verbose: true }) as Move[];
    const san = moves[brilliantPly - 1]?.san;
    if (san) {
      add(`Why was ${moveLabel(brilliantPly, san)} brilliant?`);
    }
  }

  // Rule 4: opening — only mention when we have a reasonably specific
  // name (not the generic "Opening" placeholder).
  if (openingName && openingName.toLowerCase() !== "opening") {
    add(`Tell me about the ${openingName}`);
  }

  // Rule 5: endgame phase fallback.
  if (loadedGame && isEndgame(loadedGame)) {
    add("What was the key endgame idea?");
  }

  // Rule 6: classification-distribution fillers — only fire if the game
  // had analysis and we still have room.
  if (enginePositions && enginePositions.length > 0) {
    const hasInaccuracy = enginePositions.some(
      (p) => p.moveClassification === MoveClassification.Inaccuracy,
    );
    if (hasInaccuracy) {
      add("Which inaccuracies hurt me the most?");
    }
  }

  // Generic fallbacks — drop in deterministically until we hit the cap.
  for (const f of FALLBACKS) {
    add(f);
  }

  return [PINNED_SUGGESTION, ...generated];
}
