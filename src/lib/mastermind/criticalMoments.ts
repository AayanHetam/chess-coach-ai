import { Chess } from "chess.js";
import { PositionEval, LineEval } from "@/types/eval";
import { evaluate_position_complexity } from "./complexity";

export type CriticalClassification = "BLUNDER" | "MISTAKE" | "INACCURACY" | "TURNING_POINT";

export interface CriticalMoment {
  halfMoveIdx: number;
  moveNum: number;
  color: "white" | "black";
  moveUci: string;
  moveSan: string;
  classification: CriticalClassification;
  cpDrop: number;
  complexityScore: number;
  criticalityScore: number;
  fenBefore: string;
  fenAfter: string;
  bestLine: LineEval | null;
}

const BLUNDER_CP_DROP = 300;
const MISTAKE_CP_DROP = 150;
const INACCURACY_CP_DROP = 50;
const TURNING_POINT_CP_DROP = 100;

const COMPLEXITY_WEIGHT = 0.3;
const DROP_WEIGHT = 0.6;
const PHASE_WEIGHT = 0.1;

function lineCp(line: LineEval | undefined): number {
  if (!line) return 0;
  if (line.mate !== undefined) return line.mate > 0 ? 10000 : -10000;
  return line.cp ?? 0;
}

function classifyDrop(drop: number): CriticalClassification | null {
  if (drop >= BLUNDER_CP_DROP) return "BLUNDER";
  if (drop >= MISTAKE_CP_DROP) return "MISTAKE";
  if (drop >= TURNING_POINT_CP_DROP) return "TURNING_POINT";
  if (drop >= INACCURACY_CP_DROP) return "INACCURACY";
  return null;
}

function phaseWeight(fenBefore: string): number {
  const game = new Chess(fenBefore);
  let pieces = 0;
  for (const row of game.board()) for (const sq of row) if (sq) pieces++;
  if (pieces <= 10) return 1;
  if (pieces >= 26) return 0.4;
  return 0.7;
}

/**
 * Replay moves to materialize before/after FEN pairs without trusting
 * the input array's positions to already line up — the engine output and
 * UCI history can be misaligned if intermediate positions failed to evaluate.
 */
function replayFens(uciMoves: string[]): { fens: string[]; sans: string[] } {
  const game = new Chess();
  const fens = [game.fen()];
  const sans: string[] = [];
  for (const uci of uciMoves) {
    try {
      const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!move) break;
      sans.push(move.san);
      fens.push(game.fen());
    } catch {
      break;
    }
  }
  return { fens, sans };
}

/**
 * Top-N moments in the game ranked by criticality = a blend of cp-drop,
 * position complexity (where the player faced a hard decision), and game
 * phase weight (endgame errors tend to be more decisive than opening ones).
 * Replaces the route's existing top-by-raw-drop selection at route.ts:551-574.
 */
export function find_critical_moments(
  positions: PositionEval[],
  uciMoves: string[],
  topN: number = 3
): CriticalMoment[] {
  const { fens, sans } = replayFens(uciMoves);
  const candidates: CriticalMoment[] = [];

  for (let i = 0; i < uciMoves.length; i++) {
    const evalBefore = positions[i];
    const evalAfter = positions[i + 1];
    if (!evalBefore?.lines?.[0] || !evalAfter?.lines?.[0]) continue;

    const cpBefore = lineCp(evalBefore.lines[0]);
    const cpAfter = lineCp(evalAfter.lines[0]);
    const movedByWhite = i % 2 === 0;
    const drop = movedByWhite ? cpBefore - cpAfter : cpAfter - cpBefore;

    const classification = classifyDrop(drop);
    if (!classification) continue;

    const fenBefore = fens[i];
    const fenAfter = fens[i + 1];
    if (!fenBefore || !fenAfter) continue;

    const complexity = evaluate_position_complexity(fenBefore, evalBefore.lines);
    const dropComponent = Math.min(1, drop / BLUNDER_CP_DROP);
    const criticalityScore =
      dropComponent * DROP_WEIGHT +
      complexity.score * COMPLEXITY_WEIGHT +
      phaseWeight(fenBefore) * PHASE_WEIGHT;

    candidates.push({
      halfMoveIdx: i,
      moveNum: Math.floor(i / 2) + 1,
      color: movedByWhite ? "white" : "black",
      moveUci: uciMoves[i],
      moveSan: sans[i] ?? uciMoves[i],
      classification,
      cpDrop: drop,
      complexityScore: complexity.score,
      criticalityScore,
      fenBefore,
      fenAfter,
      bestLine: evalBefore.lines[0] ?? null,
    });
  }

  candidates.sort((a, b) => b.criticalityScore - a.criticalityScore);
  return candidates.slice(0, topN);
}
