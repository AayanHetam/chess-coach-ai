/**
 * Real analysis of EVERY move, from the engine data the client already holds.
 *
 * The review's key-moment cards cover three moves of a forty-move game; the
 * other seventy-odd got a verdict glyph and nothing else. This is the analysis
 * for the rest, and for those three as well: for the move on the board, what
 * it does (chess.js facts through lineStory), what it cost or gained (the
 * engine's evaluation before and after), what the engine preferred and what
 * that line does, and a plain sentence saying why the move works or does not.
 *
 * Nothing here is written by a model. It is available for every ply the
 * moment Stockfish has finished, for the player's moves and the opponent's,
 * and it is what the coach's own explanation for a move is built on when the
 * player asks.
 */
import { MoveClassification } from "@/types/enums";
import type { PositionEval } from "@/types/eval";
import { captionLine } from "@/lib/coach/lineCaptions";
import { engineLineAt, playedLineAt, type CoachLine } from "./coachLines";

export interface MoveAnalysis {
  /** Half-moves on the board after the move (the cursor value). */
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  /** "8. Nc7+" / "8... Kd8" */
  label: string;
  san: string;
  /** Whether the reader played this move. Null when their side is unknown. */
  byPlayer: boolean | null;
  classification: MoveClassification | null;
  evalBefore: string | null;
  evalAfter: string | null;
  /** What the move does, in the line story's words ("" for a quiet move). */
  caption: string;
  /** All of the move's facts, for a tooltip. */
  captionFull: string;
  /** The engine's first choice at that point, when it differs from the move played. */
  bestSan: string | null;
  /** The engine's line from before the move, when its first move differs from the one played. */
  engineLine: CoachLine | null;
  /** What the engine's first move does. */
  bestCaption: string;
  /** The game from this move on, for "what happened". */
  playedLine: CoachLine | null;
  /** The plain-words verdict: why the move works, or does not. */
  sentence: string;
}

const NEGATIVE = new Set<string>([
  MoveClassification.Blunder,
  MoveClassification.Mistake,
  MoveClassification.Inaccuracy,
  MoveClassification.Miss,
]);

function formatEval(
  line: { cp?: number; mate?: number; depth?: number } | undefined
): string | null {
  if (!line || line.depth === 0) return null;
  if (typeof line.mate === "number")
    return `M${line.mate > 0 ? "+" : ""}${line.mate}`;
  if (typeof line.cp === "number")
    return `${line.cp >= 0 ? "+" : ""}${(line.cp / 100).toFixed(2)}`;
  return null;
}

const strip = (s: string) => s.replace(/[+#!?]/g, "");

function labelFor(moveNumber: number, color: "w" | "b", san: string): string {
  return `${moveNumber}${color === "w" ? "." : "..."} ${san}`;
}

/**
 * Analyse the move that produced the position after `ply` half-moves.
 * Null at the start position, off the end of the game, or without engine
 * data for the move.
 */
export function analyzeMoveAt(
  gameSans: readonly string[],
  positions: readonly PositionEval[] | null | undefined,
  ply: number,
  rootFen: string | undefined,
  playerColor: "w" | "b" | null
): MoveAnalysis | null {
  if (!positions || ply < 1 || ply > gameSans.length) return null;
  const index = ply - 1;
  const san = gameSans[index];
  const color: "w" | "b" = index % 2 === 0 ? "w" : "b";
  const moveNumber = Math.floor(index / 2) + 1;
  const before = positions[index];
  const after = positions[ply];
  if (!before?.lines?.[0] && !after?.lines?.[0]) return null;

  const played = playedLineAt(
    gameSans,
    moveNumber,
    color,
    rootFen,
    6,
    positions
  );
  const playedCaptions = played
    ? captionLine(played.startFen, played.sans, playerColor)
    : null;
  const first = playedCaptions?.plies[0];

  let engineLine = engineLineAt(
    positions,
    gameSans,
    moveNumber,
    color,
    rootFen
  );
  let bestSan: string | null = engineLine?.sans[0] ?? null;
  if (bestSan && strip(bestSan) === strip(san)) {
    bestSan = null;
    engineLine = null;
  }
  const bestCaption = engineLine
    ? (captionLine(engineLine.startFen, engineLine.sans, playerColor).plies[0]
        ?.caption ?? "")
    : "";

  const classification = (after?.moveClassification ??
    null) as MoveClassification | null;
  const analysis: MoveAnalysis = {
    ply,
    moveNumber,
    color,
    label: labelFor(moveNumber, color, san),
    san,
    byPlayer: playerColor ? playerColor === color : null,
    classification,
    evalBefore: formatEval(before?.lines?.[0]),
    evalAfter: formatEval(after?.lines?.[0]),
    caption: first?.caption ?? "",
    captionFull: first?.full ?? "",
    bestSan,
    engineLine,
    bestCaption,
    playedLine: played,
    sentence: "",
  };
  analysis.sentence = describeMove(analysis);
  return analysis;
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Why the move works or does not, in one or two plain sentences. Every clause
 * is a fact from the analysis: what the move does, whether it was the
 * engine's choice, and what the engine preferred instead.
 */
export function describeMove(a: MoveAnalysis): string {
  const who =
    a.byPlayer === null
      ? a.color === "w"
        ? "White"
        : "Black"
      : a.byPlayer
        ? "You"
        : "Your opponent";
  const does = a.caption ? `${capitalize(a.caption)}.` : "A quiet move.";
  const bestLabel = a.bestSan
    ? labelFor(a.moveNumber, a.color, a.bestSan)
    : null;
  const instead = bestLabel
    ? `The engine preferred ${bestLabel}${a.bestCaption ? `, which ${a.bestCaption}` : ""}.`
    : "";
  const cls = a.classification;

  if (cls === MoveClassification.Forced) {
    return `${does} The only move here.`;
  }
  if (cls === MoveClassification.Opening) {
    return `${does} A known opening move.`;
  }
  if (
    cls === MoveClassification.Brilliant ||
    cls === MoveClassification.Great
  ) {
    return `${does} ${who === "You" ? "You found" : `${who} found`} the move the engine rates highest — a hard one to see.`;
  }
  if (cls === MoveClassification.Best) {
    return `${does} The engine's first choice.`;
  }
  if (
    cls === MoveClassification.Excellent ||
    cls === MoveClassification.Good ||
    cls === MoveClassification.Okay
  ) {
    return instead
      ? `${does} Sound. ${instead}`
      : `${does} Sound, and the engine agrees.`;
  }
  if (cls && NEGATIVE.has(cls)) {
    // The evaluation swing sits in the card's header; the sentence carries
    // the reason, not the number.
    const verdict =
      cls === MoveClassification.Miss
        ? "A chance went by"
        : cls === MoveClassification.Blunder
          ? "This is where it went wrong"
          : cls === MoveClassification.Mistake
            ? "This costs real ground"
            : "A small slip";
    return `${does} ${verdict}. ${instead}`.trim();
  }
  return instead ? `${does} ${instead}` : does;
}
