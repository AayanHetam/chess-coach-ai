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
 *  2. CHESS INTELLIGENCE top-3: an INDEPENDENT scan over the same candidates,
 *     kept because it renders a richer block (concepts, branch points, the
 *     teaching spine) for the few most severe positions.
 *
 * Both scans filter to the USER's colour. The intelligence scan did not, and
 * that was the one asymmetry this module reproduced without endorsing — the
 * original note here read "fixing it is a WHAT-TO-COVER policy change (CI-4)".
 *
 * Aayan made that call after watching real reviews: "the model goes to the
 * opponent's mistakes when it cannot find significant mistakes in your own
 * gameplay." It did, and the mechanism was here. `buildCoachContract` cards the
 * UNION of the two lists, so an unfiltered scan ranked purely by eval drop
 * promoted the opponent's blunders into the prompt — and the better the student
 * played, the more completely the opponent took the list over. Measured on
 * Aayan's twelve games, ordered by his worst move in each:
 *
 *     61cp -> opponent took 3 of 3 slots      197cp -> 0 of 3
 *    114cp -> opponent took 3 of 3 slots      364cp -> 0 of 3
 *    115cp -> opponent took 3 of 3 slots
 *
 * 21 of 111 carded plies were the opponent's, across 10 of the 12 games. The
 * three games he played BEST are exactly the three the opponent took over.
 *
 * It reached the student intact: renderIntelligenceBlock prints the concepts
 * under "teach by name — this is the principle the student missed", so an
 * opponent's blunder arrived as the student's own lesson, directly under a
 * MISTAKES section reading "No significant mistakes detected".
 *
 * The `policy` knob exists per plan §12-Q6 (severity-first with a teachability
 * preference among near-equal severities). Only "legacy" is legal today.
 */
import { getFenAtHalfMove, uciToSan } from "./chessFormat";
import type { GameEvalInput } from "./gameEvalSchema";
import { isComparableDepthPair, requestedDepth } from "./evalDepth";

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

/**
 * Mate-flatten a line's score, or return null when the line carries none.
 *
 * C6 (SILENT_SUBSTITUTION_HANDOFF §3): `mate !== undefined` is TRUE for
 * `null`, and `null > 0` is false — so a null mate flattened to -9999, a
 * forced loss for White, out of a position that has no mate at all.
 *
 * The null-cp half of the same bug lived here longer: the no-mate branch read
 * `line.cp ?? 0`, so a line with neither score — no measurement at all, which
 * gameEvalSchema deliberately admits — flattened to a confident "dead equal".
 * That 0 fed `drop = cpBefore - cpAfter` and the `drop > 50` gate, so one
 * unscored ply next to a real +350 manufactured a 350cp collapse into it and
 * a 350cp recovery out of it, both sorted by size toward rank 1. A missing
 * number is now null, and callers must decline the ply, exactly as the
 * depth-0 sentinel already does.
 */
export function flattenEval(line: { cp?: number | null; mate?: number | null }): number | null {
  if (typeof line.mate === "number") return line.mate > 0 ? 9999 : -9999;
  return typeof line.cp === "number" ? line.cp : null;
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
  const declaredDepth = requestedDepth(gameEval);
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
      // T8: a retried position comes back 4 plies shallower and merges in
      // looking exactly like its neighbours. Subtracting a d12 eval from a
      // d16 one manufactures a 50-150cp "drop" out of the search rather than
      // the move — squarely inside the band this scan calls a mistake.
      if (!isComparableDepthPair(evalBefore, evalAfter, declaredDepth)) continue;
      const cpBefore = flattenEval(evalBefore.lines[0]);
      const cpAfter = flattenEval(evalAfter.lines[0]);
      // Unscored line: skipped like the sentinel above, never read as 0.00.
      if (cpBefore === null || cpAfter === null) continue;
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

  // ── Scan 2: CHESS INTELLIGENCE top-3 (sentinel-skipping, user-color) ─────
  //
  // C4 (SILENT_SUBSTITUTION_HANDOFF): this scan used to omit the sentinel skip
  // that Scan 1 above performs. A `cp: 0` timeout next to a winning position
  // fabricates a multi-hundred-centipawn swing TWICE — once as the collapse
  // into it, once as the recovery out of it — and since this list is sorted by
  // drop size, the phantom sorts straight to rank 1 and is rendered under a
  // header describing it as pre-computed verified analysis.
  const intelCandidates: IntelCandidate[] = [];
  if (positions) {
    for (let i = 0; i < moveHistory.length; i++) {
      const evalBefore = positions[i];
      const evalAfter = positions[i + 1];
      if (!evalBefore?.lines?.[0] || !evalAfter?.lines?.[0]) continue;
      if (evalBefore.lines[0].depth === 0 || evalAfter.lines[0].depth === 0) continue;
      // T8: a retried position comes back 4 plies shallower and merges in
      // looking exactly like its neighbours. Subtracting a d12 eval from a
      // d16 one manufactures a 50-150cp "drop" out of the search rather than
      // the move — squarely inside the band this scan calls a mistake.
      if (!isComparableDepthPair(evalBefore, evalAfter, declaredDepth)) continue;
      const cpBefore = flattenEval(evalBefore.lines[0]);
      const cpAfter = flattenEval(evalAfter.lines[0]);
      // Unscored line: skipped like the sentinel above, never read as 0.00.
      if (cpBefore === null || cpAfter === null) continue;
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
  // The colour filter is the fix for "it goes to the opponent's mistakes when it
  // cannot find significant ones in yours" (see module doc). It is applied here
  // rather than in the scan loop so that `intelCandidates` still holds the
  // whole-game picture for any future policy that wants it.
  const intelligenceTop3 = intelCandidates
    .filter((c) => c.colorName === userColorName)
    .sort((a, b) => b.dropCp - a.dropCp)
    .slice(0, 3);

  return { topMistakes, intelligenceTop3 };
}
