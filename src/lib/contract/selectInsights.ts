/**
 * Deterministic insight selection (PR-CI-1 scope item 2).
 *
 * Formalizes the EXISTING buildGameContext selection EXACTLY — including its
 * two deliberate asymmetries, which the snapshot suite pins:
 *
 *  1. TOP MISTAKES (top 10): scans every half-move, computes the eval drop
 *     from the mover's perspective (mates flattened to ±9999), keeps
 *     drop > 50cp, SKIPS plies touching a client-timeout sentinel
 *     ({cp:0, depth:0}), filters to the USER's color, stable-sorts by drop
 *     descending, slices 10.
 *
 *  2. CHESS INTELLIGENCE top-3: an INDEPENDENT scan that does NOT skip
 *     sentinels and does NOT filter by color (legacy route.ts:810-835).
 *     Opponent blunders and sentinel-adjacent fake drops therefore appear
 *     here but not in TOP MISTAKES. This is faithfully reproduced, not
 *     endorsed — fixing it is a WHAT-TO-COVER policy change (CI-4).
 *
 * The `policy` knob exists per plan §12-Q6 (severity-first with a
 * teachability preference among near-equal severities). Only "legacy" is
 * legal in PR-CI-1; the teachability policy lands with CI-4.
 */
import { getFenAtHalfMove, uciToSan } from "./chessFormat";
import type { GameEvalInput } from "./gameEvalSchema";

export type InsightSelectionPolicy = "legacy";

export interface SelectInsightsOptions {
  /** Currently only "legacy" is implemented (see module doc). */
  policy?: InsightSelectionPolicy;
}

export interface MistakeCandidate {
  /** 0-based half-move index. */
  ply: number;
  moveNumber: number;
  colorName: "White" | "Black";
  san: string;
  /** Mate-flattened (±9999) numbers, exactly as the legacy loop computed. */
  cpBeforeFlat: number;
  cpAfterFlat: number;
  dropCp: number;
  /** uciToSan(evalBefore.bestMove) — null when the client sent none. */
  bestSan: string | null;
  fenBefore: string;
  fenAfter: string;
}

export interface IntelCandidate {
  ply: number;
  moveNumber: number;
  colorName: "White" | "Black";
  san: string;
  dropCp: number;
  fenBefore: string;
}

export interface InsightSelection {
  topMistakes: MistakeCandidate[];
  intelligenceTop3: IntelCandidate[];
}

function flattenEval(line: { cp?: number; mate?: number }): number {
  return line.mate !== undefined ? (line.mate > 0 ? 9999 : -9999) : (line.cp ?? 0);
}

export function selectInsights(
  moveHistory: string[],
  gameEval: GameEvalInput | undefined,
  playerColor: string,
  opts: SelectInsightsOptions = {},
): InsightSelection {
  const policy = opts.policy ?? "legacy";
  // Exhaustive guard: new policies must be implemented, not silently ignored.
  if (policy !== "legacy") {
    throw new Error(`selectInsights: unknown policy "${policy}"`);
  }

  const positions = gameEval?.positions;
  if (!positions || positions.length === 0) {
    // Legacy computes both lists only inside the gameEval branch; the
    // intelligence scan's weaker `if (gameEval?.positions)` gate yields
    // nothing for an empty array anyway.
    if (!positions) return { topMistakes: [], intelligenceTop3: [] };
  }

  // ── Scan 1: TOP MISTAKES (sentinel-skipping, user-color, top 10) ─────────
  const mistakes: MistakeCandidate[] = [];
  if (positions && positions.length > 0) {
    for (let i = 0; i < moveHistory.length; i++) {
      const evalBefore = positions[i];
      const evalAfter = positions[i + 1];
      const beforeIsSentinel = evalBefore?.lines?.[0]?.depth === 0;
      const afterIsSentinel = evalAfter?.lines?.[0]?.depth === 0;
      if (!evalBefore?.lines?.[0] || !evalAfter?.lines?.[0] || beforeIsSentinel || afterIsSentinel) {
        continue;
      }
      const cpBefore = flattenEval(evalBefore.lines[0]);
      const cpAfter = flattenEval(evalAfter.lines[0]);
      const drop = i % 2 === 0 ? cpBefore - cpAfter : cpAfter - cpBefore;
      if (drop > 50) {
        const fenBefore = getFenAtHalfMove(moveHistory, i);
        mistakes.push({
          ply: i,
          moveNumber: Math.floor(i / 2) + 1,
          colorName: i % 2 === 0 ? "White" : "Black",
          san: moveHistory[i],
          cpBeforeFlat: cpBefore,
          cpAfterFlat: cpAfter,
          dropCp: drop,
          bestSan: evalBefore.bestMove ? uciToSan(fenBefore, evalBefore.bestMove) : null,
          fenBefore,
          fenAfter: getFenAtHalfMove(moveHistory, i + 1),
        });
      }
    }
  }
  const userColorName = playerColor === "w" ? "White" : "Black";
  const topMistakes = mistakes
    .filter((m) => m.colorName === userColorName)
    .sort((a, b) => b.dropCp - a.dropCp)
    .slice(0, 10);

  // ── Scan 2: CHESS INTELLIGENCE top-3 (no sentinel skip, no color filter) ─
  const intelCandidates: IntelCandidate[] = [];
  if (positions) {
    for (let i = 0; i < moveHistory.length; i++) {
      const evalBefore = positions[i];
      const evalAfter = positions[i + 1];
      if (!evalBefore?.lines?.[0] || !evalAfter?.lines?.[0]) continue;
      const cpBefore = flattenEval(evalBefore.lines[0]);
      const cpAfter = flattenEval(evalAfter.lines[0]);
      const drop = i % 2 === 0 ? cpBefore - cpAfter : cpAfter - cpBefore;
      if (drop > 50) {
        intelCandidates.push({
          ply: i,
          moveNumber: Math.floor(i / 2) + 1,
          colorName: i % 2 === 0 ? "White" : "Black",
          san: moveHistory[i],
          dropCp: drop,
          fenBefore: getFenAtHalfMove(moveHistory, i),
        });
      }
    }
  }
  const intelligenceTop3 = intelCandidates.sort((a, b) => b.dropCp - a.dropCp).slice(0, 3);

  return { topMistakes, intelligenceTop3 };
}
