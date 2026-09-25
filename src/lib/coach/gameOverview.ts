/**
 * Facts about the game as a whole, for the follow-up context (E1).
 *
 * Everything here is DERIVED from what the analysis context already stores,
 * so it needs no new fields and works for entries written before it existed.
 * Each line is emitted only when the underlying value is genuinely present —
 * an absent opening is left out rather than guessed at, which is the entire
 * point of the document this comes from (SILENT_SUBSTITUTION_HANDOFF §3 E1).
 *
 * Its own module so both condensed-context builders (the legacy one in
 * analysisContextCache.ts and the follow-up one in followUpContext.ts) share
 * it without one importing the other's cache.
 */
import { Chess } from "chess.js";
import { detectOpening } from "@/lib/unifiedOpeningDetector";
import type { AnalysisContext } from "@/lib/analysisContextCache";

export function buildGameOverview(context: AnalysisContext): string[] {
  const out: string[] = [];

  const moves = context.playedMoves ?? [];
  if (moves.length > 0) {
    try {
      const game = new Chess();
      for (const san of moves) {
        try {
          game.move(san);
        } catch {
          break;
        }
      }
      const opening = detectOpening(game);
      if (opening && opening.name && opening.name !== "Opening") {
        out.push(
          `Opening: ${opening.name}${opening.eco ? ` (ECO ${opening.eco})` : ""}`,
        );
      }
    } catch {
      // Opening detection is best-effort; never block the context on it.
    }
  }

  // gameEval is `z.any()` at the request boundary, so read defensively.
  const ge = context.gameEval as
    | {
        accuracy?: { white?: number; black?: number };
        estimatedElo?: { white?: number; black?: number };
      }
    | undefined;
  const side = context.playerColor === "w" ? "white" : "black";
  const acc = ge?.accuracy?.[side];
  if (typeof acc === "number" && Number.isFinite(acc)) {
    out.push(`Your accuracy this game: ${acc.toFixed(1)}%`);
  }
  const elo = ge?.estimatedElo?.[side];
  if (typeof elo === "number" && Number.isFinite(elo)) {
    out.push(`Estimated Elo for this game: ${Math.round(elo)}`);
  }

  return out;
}
