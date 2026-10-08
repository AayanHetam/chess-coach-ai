import { Chess, type Move } from "chess.js";

/**
 * A position the user has walked to OFF the mainline, as AnalysisImpl keeps
 * it: the resulting FEN, the last move played to get there, the SANs played
 * since leaving the mainline, and the ply they left it from.
 */
export interface ExplorationStep {
  fen: string;
  from: string;
  to: string;
  san: string;
  path: string[];
  anchorPly: number;
}

function replayMainline(
  allMoves: ReadonlyArray<Pick<Move, "san">>,
  ply: number,
  rootFen?: string
): Chess | null {
  let game: Chess;
  try {
    game = rootFen ? new Chess(rootFen) : new Chess();
  } catch {
    return null;
  }
  try {
    for (let i = 0; i < ply && i < allMoves.length; i++) {
      game.move(allMoves[i].san);
    }
  } catch {
    return null;
  }
  return game;
}

/** The mainline position after `ply` half-moves, or null if it can't be replayed. */
export function fenAtPly(
  allMoves: ReadonlyArray<Pick<Move, "san">>,
  ply: number,
  rootFen?: string
): string | null {
  return replayMainline(allMoves, ply, rootFen)?.fen() ?? null;
}

/**
 * The exploration one half-move shorter: the same branch with its last move
 * taken back. Null when there is nothing left to take back, which puts the
 * board on the anchor position. Rebuilt from the mainline and the path rather
 * than kept as a stack, so it can never disagree with what is on the board.
 */
export function stepBackPreview(
  preview: ExplorationStep,
  allMoves: ReadonlyArray<Pick<Move, "san">>,
  rootFen?: string
): ExplorationStep | null {
  if (preview.path.length <= 1) return null;
  const game = replayMainline(allMoves, preview.anchorPly, rootFen);
  if (!game) return null;
  const path = preview.path.slice(0, -1);
  let last: Move | null = null;
  try {
    for (const san of path) last = game.move(san);
  } catch {
    return null;
  }
  if (!last) return null;
  return {
    fen: game.fen(),
    from: last.from,
    to: last.to,
    san: last.san,
    path,
    anchorPly: preview.anchorPly,
  };
}
