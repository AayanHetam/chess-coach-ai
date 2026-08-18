/**
 * One diagram per goal option on the "What do you want to improve?" step.
 *
 * These are CHESS-CORRECT, not decorative arrangements of glyphs. Chess
 * correctness is non-negotiable in this product (CLAUDE.md), and it applies to
 * a 4×4 teaching crop as much as to an engine line — a "fork" diagram whose
 * knight doesn't actually attack both pieces teaches the wrong shape to exactly
 * the beginner who came here to learn it.
 *
 * Coordinates are [col, row], 0-indexed from the TOP-LEFT of the crop, so row 0
 * is the far rank from White's view. Each entry below states the geometry it
 * relies on, so a future edit that breaks the tactic is obvious in review.
 */

import type { DiagramSpec } from "./TacticDiagram";

/**
 * Knight on [1,2] attacks [2,0] and [3,1] — both legal knight moves
 * (±1/±2 offsets). King and rook on those squares = a genuine royal fork.
 */
const FORK: DiagramSpec = {
  size: 4,
  pieces: [
    { at: [2, 0], glyph: "king", side: "b" },
    { at: [3, 1], glyph: "rook", side: "b" },
    { at: [1, 2], glyph: "knight", side: "w" },
  ],
  arrows: [
    { from: [1, 2], to: [2, 0] },
    { from: [1, 2], to: [3, 1] },
  ],
};

/**
 * Bishop [0,3] → knight [1,2] → king [2,1] all lie on one diagonal, so the
 * knight cannot legally move without exposing the king. That is the pin.
 */
const PIN: DiagramSpec = {
  size: 4,
  pieces: [
    { at: [2, 1], glyph: "king", side: "b" },
    { at: [1, 2], glyph: "knight", side: "b" },
    { at: [0, 3], glyph: "bishop", side: "w" },
  ],
  arrows: [{ from: [0, 3], to: [2, 1] }],
  marks: [{ at: [1, 2], tone: "target" }],
};

/**
 * Black bishop on [3,3] has no defender and sits on the white rook's file
 * ([3,0] → [3,3] is a clear rank/file line). Undefended and attacked = hanging.
 */
const HANGING: DiagramSpec = {
  size: 4,
  pieces: [
    { at: [3, 0], glyph: "rook", side: "w" },
    { at: [3, 3], glyph: "bishop", side: "b" },
  ],
  arrows: [{ from: [3, 0], to: [3, 3] }],
  marks: [{ at: [3, 3], tone: "danger" }],
};

/**
 * Exposed king on [2,1] with a queen on the same diagonal ([0,3]) and a rook on
 * the same rank ([0,1]) — two real attacking lines converging on the king.
 */
const KING_SAFETY: DiagramSpec = {
  size: 4,
  pieces: [
    { at: [2, 1], glyph: "king", side: "b" },
    { at: [0, 1], glyph: "rook", side: "w" },
    { at: [0, 3], glyph: "queen", side: "w" },
  ],
  arrows: [
    { from: [0, 1], to: [2, 1] },
    { from: [0, 3], to: [2, 1] },
  ],
  marks: [{ at: [2, 1], tone: "danger" }],
};

/**
 * King-and-pawn ending, the classic shape: the white king LEADS the pawn rather
 * than pushing it, and the kings stand two squares apart on the same file —
 * the opposition. The arrow is the king stepping up, which is the whole
 * technique. (Rows increase downward, so [1,2] → [1,1] is White advancing.)
 */
const ENDGAME: DiagramSpec = {
  size: 4,
  pieces: [
    { at: [1, 0], glyph: "king", side: "b" },
    { at: [1, 2], glyph: "king", side: "w" },
    { at: [1, 3], glyph: "pawn", side: "w" },
  ],
  arrows: [{ from: [1, 2], to: [1, 1], tone: "quiet" }],
};

/**
 * Opening development: a central pawn duo and a knight coming out to its
 * natural square. Quiet arrow — nothing is being attacked, which is the point.
 */
const OPENING: DiagramSpec = {
  size: 4,
  pieces: [
    { at: [1, 1], glyph: "pawn", side: "b" },
    { at: [2, 2], glyph: "pawn", side: "w" },
    { at: [1, 3], glyph: "knight", side: "w" },
  ],
  arrows: [{ from: [1, 3], to: [2, 1], tone: "quiet" }],
};

/** No single tactic — a balanced board standing for "all of it". */
const GENERAL: DiagramSpec = {
  size: 4,
  pieces: [
    { at: [1, 0], glyph: "king", side: "b" },
    { at: [3, 1], glyph: "pawn", side: "b" },
    { at: [0, 2], glyph: "knight", side: "w" },
    { at: [2, 3], glyph: "queen", side: "w" },
  ],
};

/**
 * Keyed by `QuizGoalOption.key` in quizThemes.ts — now five phases rather than
 * seven individual motifs.
 *
 * `FORK` represents Tactics because it is the motif every improving player
 * meets first, and `KING_SAFETY` represents Middlegame because an attack on a
 * loose king is the most legible "here is a plan" picture available on a 4×4
 * crop. `HANGING` and `PIN` are still exported and still tested — PIN is used
 * by the "can you spot a fork or a pin" question.
 */
export const GOAL_DIAGRAMS: Record<string, DiagramSpec> = {
  tactics: FORK,
  openings: OPENING,
  middlegame: KING_SAFETY,
  endgame: ENDGAME,
  general: GENERAL,
};

/** Plain-language caption, so the diagram is never the only carrier of meaning. */
export const GOAL_DIAGRAM_ALT: Record<string, string> = {
  tactics: "A knight attacking a king and a rook at the same time",
  openings: "Central pawns out and a knight developing",
  middlegame: "A rook and queen converging on an exposed king",
  endgame: "A king escorting a pawn up the board",
  general: "A balanced middlegame position",
};

/** Still used by the self-assessment "spot a fork or a pin" question. */
export const SPOT_DIAGRAMS = { fork: FORK, pin: PIN, hanging: HANGING } as const;
