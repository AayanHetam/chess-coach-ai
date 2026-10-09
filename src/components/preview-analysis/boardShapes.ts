/**
 * What the board on /analysis draws, and in what order.
 *
 * Three kinds of drawing share the board. The Masters view's own arrows
 * (its fan-out of the masters' moves and the gold arrow of the move it is
 * previewing) come first. Then one of Masti's marks (boardAnnotations.ts):
 * a line's ply the reader tapped or is playing, else the move the strip
 * under the board is about. Then the four arrow toggles from the board
 * menu. Two arrows on the same squares are drawn once, the first kept.
 *
 * A mark is drawn only on the position it was computed for (the first four
 * FEN fields), never in a drill (a drill can start on a game position, and
 * the mark would give its answer away) and never in the Masters view, whose
 * arrows own the board there. The reader can turn the marks off from the
 * board menu.
 *
 * Pure: the page computes its inputs and hands the result to the board.
 */
import { Chess } from "chess.js";
import type { DrawShape } from "@/components/ui/ChessgroundBoard";
import type { ArrowToggleState } from "@/components/ui/BoardArrowToggles";
import type { LineCaption } from "@/lib/coach/lineCaptions";
import {
  ANNOTATION_SQUARE_CLASS,
  ANNOTATION_STYLE,
  buildBoardAnnotation,
  samePosition,
  type AnnotationSource,
  type BoardAnnotation,
} from "@/lib/coach/boardAnnotations";
import type { CoachLine } from "./coachLines";

/** Flipped on in its own one-line PR. */
export const BOARD_ANNOTATIONS_DEFAULT = false;

/**
 * Read once at module level by the analysis page. `NEXT_PUBLIC_` values are
 * inlined at build time, and only for this literal spelling of the name.
 */
export function isBoardAnnotationsEnabledPublic(): boolean {
  const v = (process.env.NEXT_PUBLIC_COACH_BOARD_ANNOTATIONS ?? "")
    .trim()
    .toLowerCase();
  if (v === "1" || v === "on" || v === "true") return true;
  if (v === "0" || v === "off" || v === "false") return false;
  return BOARD_ANNOTATIONS_DEFAULT;
}

export function uciToShape(uci: string, brush: string): DrawShape {
  return { orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush };
}

/**
 * Resolve a SAN move (e.g. "Nc4") against a FEN into the {from, to} squares
 * a board arrow needs. /api/maia-predict returns SAN, not UCI (the Maia-2
 * service converts server-side, see maia-service/maia_server.py's
 * `best_move_san = board.san(move_obj)`), and feeding a SAN string straight
 * into uciToShape's character-slicing produced garbage square keys (e.g.
 * "Nc4".slice(0,2) === "Nc"), which chessground then rendered as an arrow
 * shooting off the board instead of failing loudly. Returns null on an
 * illegal or unparseable move so the caller can just skip drawing rather
 * than crash: chess.js throws on bad input instead of returning null itself.
 */
export function sanToShape(
  fen: string,
  san: string,
  brush: string
): DrawShape | null {
  try {
    const g = new Chess(fen);
    const result = g.move(san);
    if (!result) return null;
    return { orig: result.from, dest: result.to, brush };
  } catch {
    return null;
  }
}

/** The toggles' brushes, ARROW_PALETTE's own (boardShapes.test.ts holds them in step). */
export const TOGGLE_BRUSH = {
  best: "green",
  common: "blue",
  game: "yellow",
  maia: "purple",
} as const;

export interface BaseShapesInput {
  /** The Masters view is open. */
  takeoverMode: boolean;
  /** The move being previewed (a master move, an explored line). */
  takeoverPreview: { from: string; to: string } | null;
  /** The Masters view's candidates, most played first. */
  takeoverCandidates: ReadonlyArray<{ uci?: string }>;
  toggles: ArrowToggleState;
  displayFen: string;
  /** The board shows a position off the mainline the cursor points at. */
  exploring: boolean;
  /** The engine's best move for the position shown (UCI). */
  bestUci: string | null;
  /** The masters' most played move for the position shown (UCI). */
  commonUci: string | null;
  /** The game's next move from the cursor. */
  nextMove: { from: string; to: string } | null;
  /** Maia's move for the position shown and the chosen Elo (SAN). */
  maiaSan: string | null;
}

/**
 * The board's arrows before Masti's marks: the Masters fan-out and the gold
 * preview arrow, then the toggles in order (engine best, most common, game
 * played, Maia).
 */
export function computeBaseShapes(i: BaseShapesInput): {
  preview: DrawShape[];
  toggles: DrawShape[];
} {
  const preview: DrawShape[] = [];
  // In the Masters view with no move previewed yet: the top three master
  // moves as a fan-out, brightest for the most played.
  if (i.takeoverMode && !i.takeoverPreview && i.takeoverCandidates.length > 0) {
    i.takeoverCandidates.slice(0, 3).forEach((c, idx) => {
      if (!c.uci || c.uci.length < 4) return;
      preview.push({
        orig: c.uci.slice(0, 2),
        dest: c.uci.slice(2, 4),
        brush: idx === 0 ? "green" : "paleGreen",
      });
    });
  }
  // The previewed move always shows, in gold.
  if (i.takeoverPreview) {
    preview.push({
      orig: i.takeoverPreview.from,
      dest: i.takeoverPreview.to,
      brush: "gold",
    });
  }

  // The toggles describe the position on the board, never the mainline's
  // position when the board shows another.
  const toggles: DrawShape[] = [];
  if (i.toggles.best && i.bestUci && i.bestUci.length >= 4) {
    toggles.push(uciToShape(i.bestUci, TOGGLE_BRUSH.best));
  }
  if (i.toggles.common && i.commonUci) {
    toggles.push(uciToShape(i.commonUci, TOGGLE_BRUSH.common));
  }
  // Off the mainline nothing was played.
  if (i.toggles.game && !i.exploring && i.nextMove) {
    toggles.push({
      orig: i.nextMove.from,
      dest: i.nextMove.to,
      brush: TOGGLE_BRUSH.game,
    });
  }
  if (i.toggles.maia && i.maiaSan) {
    const shape = sanToShape(i.displayFen, i.maiaSan, TOGGLE_BRUSH.maia);
    if (shape) toggles.push(shape);
  }
  return { preview, toggles };
}

export interface MergeInput {
  displayFen: string;
  base: { preview: DrawShape[]; toggles: DrawShape[] };
  /** The Masters view owns the board's arrows. */
  takeoverMode: boolean;
  /** A drill owns the board. A mark would give its answer away. */
  drill: boolean;
  /** The board menu's "Masti's marks". */
  annotationsOn: boolean;
  /** A line's ply, tapped or playing. */
  line: BoardAnnotation | null;
  /** The strip's move. */
  strip: BoardAnnotation | null;
}

export interface MergedShapes {
  autoShapes: DrawShape[];
  /** Square to class, for chessground's custom highlight. */
  squareClasses: Map<string, string>;
  /** Which mark is drawn, or null for none. */
  source: AnnotationSource | null;
}

export function mergeBoardShapes(i: MergeInput): MergedShapes {
  const annotation =
    i.drill || i.takeoverMode || !i.annotationsOn
      ? null
      : ([i.line, i.strip].find(
          (a): a is BoardAnnotation =>
            a !== null && samePosition(a.fen, i.displayFen)
        ) ?? null);
  const marks: DrawShape[] = (annotation?.arrows ?? []).map((a) => ({
    orig: a.orig,
    dest: a.dest,
    brush: ANNOTATION_STYLE[a.tag].brush,
  }));
  const drawn = new Set<string>();
  const autoShapes: DrawShape[] = [];
  for (const shape of [...i.base.preview, ...marks, ...i.base.toggles]) {
    const key = `${shape.orig}${shape.dest ?? ""}`;
    if (drawn.has(key)) continue;
    drawn.add(key);
    autoShapes.push(shape);
  }
  const squareClasses = new Map<string, string>();
  for (const sq of annotation?.squares ?? []) {
    squareClasses.set(sq.square, ANNOTATION_SQUARE_CLASS[sq.tag]);
  }
  return { autoShapes, squareClasses, source: annotation?.source ?? null };
}

/**
 * The mark for the `k`th ply of a line (1-based), from the line's own
 * caption of that ply. No move arrows: the preview arrow and the last-move
 * squares already show the move. A caption for another move is not used.
 */
export function lineAnnotationAt(
  line: Pick<CoachLine, "startFen" | "sans">,
  k: number,
  ply: LineCaption | null | undefined
): BoardAnnotation | null {
  if (!Number.isInteger(k) || k < 1 || k > line.sans.length) return null;
  let fenBefore: string;
  try {
    const g = new Chess(line.startFen);
    for (let j = 0; j < k - 1; j++) g.move(line.sans[j]);
    fenBefore = g.fen();
  } catch {
    return null;
  }
  const played = line.sans[k - 1];
  const facts = ply?.san === played ? ply.facts : undefined;
  return buildBoardAnnotation({
    source: "line",
    fenBefore,
    played,
    facts,
    moveArrows: false,
  });
}

/**
 * The eval bar's White share: the last settled value while the next one is
 * pending (50 before the first), so the bar swings from where it was
 * instead of dropping to the middle and back.
 */
export function heldEvalShare(
  pending: boolean,
  whitePercentage: number,
  held: number | null
): number {
  if (pending) return held ?? 50;
  return Math.max(0, Math.min(100, whitePercentage));
}
