/**
 * Is a coach-offered board demo actually playable?
 *
 * The puzzle coach can attach `[SHOW_MOVE: san1 san2 …]` to its prose. The
 * server parses that into `showMoves[]`, the client renders it as a
 * `DemoMoveCard` with piece glyphs and a "Show" button, and clicking it
 * replays the line on the real board.
 *
 * Every one of those SAN strings is written by the model, and until now
 * nothing checked that a single one of them was legal. The request schema
 * asks only for `z.string().min(2).max(8)` — which "Qz9" satisfies.
 *
 * What made it invisible is the playback loop in `pages/puzzles.tsx`:
 *
 *     try { const r = g.move(activeDemo.moves[i]); if (!r) break; }
 *     catch { break; }
 *
 * An illegal ply does not throw a visible error, does not warn, and does not
 * mark the card. It BREAKS — so the board plays the legal prefix, stops
 * wherever the hallucination begins, and sits there. The card above it still
 * lists the whole line in confident glyphs. The user is looking at a board
 * that stopped mid-explanation for no stated reason, next to a line that
 * claims to be chess.
 *
 * A demo that cannot be played is not a demo. This module decides that
 * question, in one place, from the position the demo will actually run from.
 */
import { Chess } from "chess.js";
import { parseSolutionMoves } from "@/lib/puzzleSolution";

export interface DemoLinePlan {
  /** Every ply is legal from the anchor, in order. */
  playable: boolean;
  /** The prefix that IS legal — diagnostic only; see `playable`. */
  legalPrefix: string[];
  /** First ply that could not be played, or null when the line is clean. */
  firstIllegal: { index: number; san: string } | null;
}

/**
 * Replay `moves` from `anchorFen` and report whether the whole line survives.
 *
 * Deliberately all-or-nothing. Offering the legal prefix instead would be a
 * quieter version of the same bug: the coach's sentence describes the whole
 * line, so playing four plies of a six-ply claim silently substitutes a
 * different line for the one the user was told about — and the truncation is
 * exactly what nobody can see.
 */
export function planDemoLine(
  anchorFen: string,
  moves: readonly string[],
): DemoLinePlan {
  const legalPrefix: string[] = [];

  // An unusable anchor is not the model's fault, but it is equally not a
  // playable demo.
  let game: Chess;
  try {
    game = new Chess(anchorFen);
  } catch {
    return {
      playable: false,
      legalPrefix,
      firstIllegal: moves.length > 0 ? { index: 0, san: moves[0] } : null,
    };
  }

  // An empty line is not playable — there is nothing to show. Callers treat
  // this the same as a rejected line, which is why it is not `true`.
  if (moves.length === 0) {
    return { playable: false, legalPrefix, firstIllegal: null };
  }

  for (let i = 0; i < moves.length; i++) {
    const san = moves[i];
    let ok = false;
    try {
      // chess.js v1 throws on an unparseable SAN and returns null on a
      // parseable-but-illegal one. Both mean the same thing here.
      ok = game.move(san) !== null;
    } catch {
      ok = false;
    }
    if (!ok) {
      return { playable: false, legalPrefix, firstIllegal: { index: i, san } };
    }
    legalPrefix.push(san);
  }

  return { playable: true, legalPrefix, firstIllegal: null };
}

/**
 * Every position the solver can legitimately be sitting on: the puzzle's
 * start, and each position along its own solution.
 *
 * The client anchors a coach demo at `game.fen()` — wherever the user has got
 * to — which the server does not know. It does know that a solver's board is
 * always somewhere on this line, so a demo playable from NONE of these
 * positions cannot be playable from theirs either. That is what makes it safe
 * to reject server-side, before the line is memoised and replayed to everyone
 * who reaches the same puzzle.
 *
 * @param solution the puzzle's solution, UCI or SAN — `parseSolutionMoves`
 *   handles both, and it is the parser the solving board itself uses, so the
 *   anchors here are the positions the user actually sees.
 */
export function solverAnchors(
  puzzleFen: string,
  solution: readonly string[],
): string[] {
  const anchors: string[] = [];
  let game: Chess;
  try {
    game = new Chess(puzzleFen);
  } catch {
    return anchors;
  }
  anchors.push(game.fen());

  const { parsed } = parseSolutionMoves(puzzleFen, [...solution]);
  for (const mv of parsed) {
    try {
      if (game.move(mv) === null) break;
    } catch {
      break;
    }
    anchors.push(game.fen());
  }
  return anchors;
}

/**
 * True when the line is playable from at least one position the solver could
 * actually be on.
 *
 * Deliberately the weaker of the two checks. The server does not know the
 * exact anchor, and a false rejection would delete a demo that would have
 * worked — so it only rejects lines that fit nowhere at all. The client, which
 * DOES know the anchor, makes the exact call.
 */
export function isPlayableFromAnySolverAnchor(
  puzzleFen: string,
  solution: readonly string[],
  moves: readonly string[],
): boolean {
  if (moves.length === 0) return false;
  return solverAnchors(puzzleFen, solution).some(
    (fen) => planDemoLine(fen, moves).playable,
  );
}
