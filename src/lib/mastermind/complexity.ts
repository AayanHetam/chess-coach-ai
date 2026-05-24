import { Chess } from "chess.js";
import { LineEval } from "@/types/eval";

export interface ComplexityScore {
  score: number;
  fanOut: number;
  evalSpreadCp: number;
  forcingPresent: boolean;
  components: { fanOut: number; spread: number; forcing: number };
}

const FAN_OUT_NORMALIZATION = 35;
const SPREAD_NORMALIZATION_CP = 200;
const FAN_OUT_WEIGHT = 0.4;
const SPREAD_WEIGHT = 0.4;
const FORCING_WEIGHT = 0.2;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * 0-1 complexity score for a position. High = many candidate moves, similar
 * top-line evaluations, or forcing tactics present. Used to decide whether
 * to spend flagship (Sonnet) or fast (Haiku) tier on a coaching turn.
 *
 * Components:
 * - fanOut: # of legal moves / 35 (capped at 1)
 * - spread: cp gap between top line and 3rd line / 200 (low spread = many similar candidates = harder choice)
 * - forcing: 1 if any of: in check, capture available in PV, mate in line, else 0
 */
export function evaluate_position_complexity(fen: string, lines: LineEval[]): ComplexityScore {
  const game = new Chess(fen);
  const legalMoves = game.moves();
  const fanOut = legalMoves.length;
  const fanOutComponent = clamp01(fanOut / FAN_OUT_NORMALIZATION);

  const sortedLines = [...lines].sort((a, b) => (a.multiPv ?? 1) - (b.multiPv ?? 1));
  const top = sortedLines[0];
  const third = sortedLines[2];

  let spreadCp = 0;
  if (top && third) {
    const topCp = top.mate !== undefined ? (top.mate > 0 ? 10000 : -10000) : (top.cp ?? 0);
    const thirdCp = third.mate !== undefined ? (third.mate > 0 ? 10000 : -10000) : (third.cp ?? 0);
    spreadCp = Math.abs(topCp - thirdCp);
  } else if (top && sortedLines[1]) {
    const topCp = top.mate !== undefined ? (top.mate > 0 ? 10000 : -10000) : (top.cp ?? 0);
    const secondCp = sortedLines[1].mate !== undefined ? (sortedLines[1].mate! > 0 ? 10000 : -10000) : (sortedLines[1].cp ?? 0);
    spreadCp = Math.abs(topCp - secondCp);
  }
  const spreadComponent = 1 - clamp01(spreadCp / SPREAD_NORMALIZATION_CP);

  const inCheck = game.inCheck();
  const matePresent = sortedLines.some((l) => l.mate !== undefined);
  const captureInPv = top?.pv?.[0] ? hasCaptureFlag(fen, top.pv[0]) : false;
  const forcingPresent = inCheck || matePresent || captureInPv;
  const forcingComponent = forcingPresent ? 1 : 0;

  const score = clamp01(
    fanOutComponent * FAN_OUT_WEIGHT +
    spreadComponent * SPREAD_WEIGHT +
    forcingComponent * FORCING_WEIGHT
  );

  return {
    score,
    fanOut,
    evalSpreadCp: spreadCp,
    forcingPresent,
    components: {
      fanOut: fanOutComponent,
      spread: spreadComponent,
      forcing: forcingComponent,
    },
  };
}

function hasCaptureFlag(fen: string, uci: string): boolean {
  try {
    const game = new Chess(fen);
    const move = game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
    return Boolean(move?.captured);
  } catch {
    return false;
  }
}
