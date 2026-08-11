/**
 * B3 (SILENT_SUBSTITUTION_HANDOFF §3 Group B) — the deep path's block for
 * "the board the user is actually asking about".
 *
 * The deep path renders the game as PGN + TOP MISTAKES + FINAL POSITION. It
 * had no concept of a viewed ply at all, so when the user clicked a mistake row
 * — which is the common way the coach is opened, and which deliberately
 * computes the FEN at that ply — the position was silently dropped and the
 * model answered about the end of the game instead.
 *
 * This block is rendered ALONGSIDE the final-position block, not instead of
 * it: the surrounding narrative (mistake list, accuracy, result) is still
 * about the whole game. It states plainly which board the question is about,
 * because two position blocks with no precedence rule is how B2 happened.
 */
import { buildRelationalFacts } from "@/lib/relational/relationalFactsBuilder";
import { getFenAtHalfMove } from "@/lib/contract/legacyGameContext";
import { buildFenPositionFacts } from "@/lib/mastermind/positionFacts";

export const POSITION_UNDER_DISCUSSION_HEADER = "## POSITION UNDER DISCUSSION";

/**
 * Render the viewed-position block, or `""` when there is nothing to add.
 *
 * Returns `""` when:
 *  - no `viewedPly` was sent (older clients, or the user is at the live end),
 *  - the ply is the end of the game — the FINAL POSITION block already covers
 *    that board, and a duplicate would recreate the B2 ambiguity,
 *  - the ply is out of range, or the position cannot be reconstructed.
 */
export function buildPositionUnderDiscussion(
  moveHistory: string[] | undefined,
  viewedPly: number | undefined,
): string {
  if (!moveHistory || moveHistory.length === 0) return "";
  if (viewedPly === undefined) return "";
  if (viewedPly < 0 || viewedPly >= moveHistory.length) return "";

  let fen: string;
  try {
    fen = getFenAtHalfMove(moveHistory, viewedPly);
  } catch {
    return "";
  }
  if (!fen) return "";

  const boardFacts = buildFenPositionFacts(fen);
  if (!boardFacts) return "";

  let relationalSummary = "";
  try {
    relationalSummary = buildRelationalFacts(fen).summary ?? "";
  } catch {
    // Pure chess.js computation; a failure here just means fewer facts.
  }

  const movesPlayed = viewedPly;
  const lastMove = viewedPly > 0 ? moveHistory[viewedPly - 1] : null;
  const moveNumber = Math.floor((viewedPly + 1) / 2);

  const header = [
    POSITION_UNDER_DISCUSSION_HEADER,
    lastMove
      ? `The user is asking about the position after ${moveNumber}${viewedPly % 2 === 1 ? "." : "..."}${lastMove} (${movesPlayed} half-moves played), NOT the end of the game.`
      : "The user is asking about the starting position, NOT the end of the game.",
    "Answer about THIS board. The FINAL POSITION block below describes the end of the game and is background only.",
    "",
  ].join("\n");

  // buildFenPositionFacts emits its own "CURRENTLY VIEWED POSITION" heading;
  // strip it so this block has exactly one header and no competing claim
  // about which board is current.
  const facts = boardFacts.replace(/^##[^\n]*\n/, "");

  return [header, facts, relationalSummary].filter(Boolean).join("\n");
}
