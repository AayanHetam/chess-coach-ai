/**
 * Request body for the coach follow-up fast path (`POST /api/chat`).
 *
 * Extracted verbatim from AnalysisImpl's `streamCoachReply` so the shape can
 * be asserted in a test. The server grounds its answer on the FEN it is given
 * and, when none arrives, silently falls back to `context.fen` — which is the
 * position after the ENTIRE game is replayed (enhanced-analysis/route.ts:904-912),
 * i.e. the final position. It then labels that board "the position the user is
 * looking at RIGHT NOW" (positionFacts.ts). So an omitted `fen` does not
 * produce an error; it produces a confident answer about the wrong board.
 */

import type { ClientEvals } from "./clientEvals";
import type { PageTurnKind } from "./pageActions";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequestBodyInput {
  contextId: string;
  userMessage: string;
  conversationHistory: ChatTurn[];
  /** The board the user is actually viewing (AnalysisImpl's `displayFen`). */
  fen?: string;
  /** Ply cursor for the viewed position. */
  currentPly?: number;
  /** A what-if's own numbers for this question (clientEvals.ts), when its search had them in time. */
  clientEvals?: ClientEvals | null;
  /**
   * The orders this page can carry out itself (pageActions.ts), sent only
   * while page actions are on: the route may then answer one with no model
   * call, and never otherwise.
   */
  pageActions?: readonly PageTurnKind[] | null;
  /**
   * The page's standing side (standingSide.ts), sent only while
   * perspective is on and a side is set: the side the coach's answers are
   * about, never the player's colour.
   */
  perspective?: "w" | "b" | null;
}

export interface ChatRequestBody {
  contextId: string;
  userMessage: string;
  conversationHistory: ChatTurn[];
  fen?: string;
  moveIndex?: number;
  clientEvals?: ClientEvals;
  pageActions?: PageTurnKind[];
  perspective?: "w" | "b";
}

export function buildChatRequestBody(
  input: ChatRequestBodyInput
): ChatRequestBody {
  return {
    contextId: input.contextId,
    userMessage: input.userMessage,
    conversationHistory: input.conversationHistory,
    // B1: forward the board the user is actually looking at. The server
    // already accepts both (`chat/route.ts` re-derives `activeFen` from `fen`
    // and slices `effectiveMoveHistory` by `moveIndex`); it was only ever the
    // client that dropped them. Omitted when the caller has no position —
    // absence is recoverable (the server falls back to the stored context),
    // a wrong FEN is not.
    fen: input.fen,
    moveIndex: input.currentPly,
    // Only when there are numbers: an absent field is the turn as before.
    ...(input.clientEvals ? { clientEvals: input.clientEvals } : {}),
    ...(input.pageActions && input.pageActions.length > 0
      ? { pageActions: [...input.pageActions] }
      : {}),
    ...(input.perspective ? { perspective: input.perspective } : {}),
  };
}
