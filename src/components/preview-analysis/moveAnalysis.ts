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
import type { LineEval, PositionEval } from "@/types/eval";
import { getLineWinPercentage } from "@/lib/engine/helpers/winPercentage";
import {
  missedMate,
  recheckedPair,
  type GameEvalRecheck,
} from "@/lib/coach/deepRecheck";
import { captionLine, type LineCaption } from "@/lib/coach/lineCaptions";
import { isClaimVerifierEnabled } from "@/lib/coach/claimVerifierFlag";
import { verifyClaims } from "@/lib/coach/verifyClaims";
import { factSayable, type StoryFact } from "@/lib/contract/lineStory";
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
  /**
   * COACH_CLAIM_VERIFIER: how deep the evals beside the move were searched
   * ("d20" for a re-checked move, "d16" for the review pass), so a depth-16
   * number never reads as a depth-20 one. Null with the flag off.
   */
  depthLabel: string | null;
  /** COACH_CLAIM_VERIFIER: the mover had mate in N before this move and let it go. */
  missedMateIn: number | null;
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

/** What a move leaves to be taken: the facts that turn a "why" into blame. */
const COST_KINDS = new Set<StoryFact["kind"]>([
  "en_prise",
  "still_en_prise",
  "leaves_trapped",
]);

/**
 * A move's first two facts as the reason it works or fails (COACH_CLAIM_
 * VERIFIER), minus any "it can be taken" fact that the engine's reply does
 * not bear out. 12.Ng5's knight on b5 could be taken for nothing by static
 * count, but the engine's reply (12...g6) never takes it and it had been
 * loose since move 11: it is not why 12.Ng5 was a slip. A piece the reply
 * really takes (19.Nxa8 Kxg5) stays the reason. No reply line, no blame.
 */
function whyCaption(
  first: LineCaption,
  startFen: string,
  san: string,
  reply: readonly string[] | undefined
): string {
  const kept = first.facts.filter((f) => {
    if (!COST_KINDS.has(f.kind) || !("square" in f) || !("piece" in f)) {
      return true;
    }
    const [v] = verifyClaims({
      startFen,
      line: [san],
      claims: [{ kind: "refutation_takes", square: f.square, piece: f.piece }],
      refutation: reply,
    }).verdicts;
    return v.status === "verified";
  });
  return kept
    .map(factSayable)
    .filter((s): s is string => s !== null)
    .slice(0, 2)
    .join("; ");
}

function labelFor(moveNumber: number, color: "w" | "b", san: string): string {
  return `${moveNumber}${color === "w" ? "." : "..."} ${san}`;
}

/**
 * The browser classifier's expected-points tiers (moveClassification.ts),
 * for a re-checked move read from its deeper pair: win chance lost by the
 * mover, 2 / 5 / 10 / 20 points.
 */
function classifyByLoss(
  before: LineEval,
  after: LineEval,
  mover: "w" | "b"
): MoveClassification {
  const wb = getLineWinPercentage(before);
  const wa = getLineWinPercentage(after);
  const loss = Math.max(0, mover === "w" ? wb - wa : wa - wb) / 100;
  if (loss <= 0) return MoveClassification.Best;
  if (loss <= 0.02) return MoveClassification.Excellent;
  if (loss <= 0.05) return MoveClassification.Good;
  if (loss <= 0.1) return MoveClassification.Inaccuracy;
  if (loss <= 0.2) return MoveClassification.Mistake;
  return MoveClassification.Blunder;
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
  playerColor: "w" | "b" | null,
  /** COACH_CLAIM_VERIFIER pass 2: a re-checked move reads its deeper pair. */
  recheck?: GameEvalRecheck | null
): MoveAnalysis | null {
  if (!positions || ply < 1 || ply > gameSans.length) return null;
  const index = ply - 1;
  const san = gameSans[index];
  const color: "w" | "b" = index % 2 === 0 ? "w" : "b";
  const moveNumber = Math.floor(index / 2) + 1;
  const verified = isClaimVerifierEnabled();
  const deep = verified ? recheckedPair(recheck, index) : null;
  const before: PositionEval | undefined = deep
    ? { ...positions[index], lines: deep.before.lines }
    : positions[index];
  const after: PositionEval | undefined = deep
    ? { ...positions[ply], lines: deep.after.lines }
    : positions[ply];
  // The engine's line from before the move comes from the deeper pair too.
  const linePositions = deep
    ? positions.map((p, k) => (k === index ? before! : p))
    : positions;
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
    linePositions,
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
  const engineFirst = engineLine
    ? captionLine(engineLine.startFen, engineLine.sans, playerColor).plies[0]
    : undefined;
  const bestCaption =
    engineLine && engineFirst
      ? verified
        ? whyCaption(
            engineFirst,
            engineLine.startFen,
            engineLine.sans[0],
            engineLine.sans.slice(1)
          )
        : engineFirst.caption
      : "";
  // The engine's reply to the move actually played: its line from the
  // position after it.
  const reply =
    after?.lines?.[0]?.depth && after.lines[0].pv.length > 0
      ? after.lines[0].pv
      : undefined;
  const caption =
    first && played
      ? verified
        ? whyCaption(first, played.startFen, san, reply)
        : first.caption
      : "";

  // A re-checked move's browser label came from the shallower pair; its
  // verdict is read again from the deeper one.
  const classification = deep
    ? bestSan === null
      ? MoveClassification.Best
      : classifyByLoss(deep.before.lines[0], deep.after.lines[0], color)
    : ((after?.moveClassification ?? null) as MoveClassification | null);
  const missed = verified
    ? missedMate(before?.lines?.[0], after?.lines?.[0], color)
    : null;
  const shownDepth = before?.lines?.[0]?.depth;
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
    caption,
    captionFull: first?.full ?? "",
    bestSan,
    engineLine,
    bestCaption,
    playedLine: played,
    sentence: "",
    depthLabel: verified && shownDepth ? `d${shownDepth}` : null,
    missedMateIn: missed?.mateIn ?? null,
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

  if (a.missedMateIn !== null) {
    return `${does} You had mate in ${a.missedMateIn}${bestLabel ? ` with ${bestLabel}` : ""}.`;
  }
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
    // COACH_CLAIM_VERIFIER: "the move the engine rates highest" only when it
    // was; neither label requires the engine's first choice.
    if (isClaimVerifierEnabled() && a.bestSan !== null) {
      return `${does} A strong move. ${instead}`.trim();
    }
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
