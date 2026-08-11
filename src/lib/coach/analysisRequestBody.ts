/**
 * Request body for the coach deep path (`POST /api/enhanced-analysis`).
 *
 * Extracted from `AnalysisImpl`'s `streamCoachReply` so the personalization
 * fields can be asserted in a test instead of being reviewed by eye. This is
 * the *live* builder — the component calls it — so a green test here is a
 * statement about production, not about a copy.
 *
 * A1 (SILENT_SUBSTITUTION_HANDOFF §3 Group A): this body used to carry a
 * hardcoded `userRating: userRating ?? 1500`. Because the body value wins the
 * server's fallback chain (`body ?? firestoreProfile ?? pgnHeaderElo`), the two
 * real sources below it were unreachable and every user in the product was
 * coached as a 1500 — with the prompt asserting `- User rating: 1500` as fact.
 *
 * The invariant this module exists to hold: **a field the caller does not have
 * is omitted, never defaulted.** Omission is recoverable server-side; a
 * plausible default is not, because nothing downstream can tell it apart from
 * a measured value.
 */

export interface AnalysisChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Structured PGN tags the server's zod schema accepts (all optional). */
export interface AnalysisGameHeaders {
  white?: string;
  black?: string;
  whiteElo?: string;
  blackElo?: string;
  event?: string;
  date?: string;
  result?: string;
  eco?: string;
  opening?: string;
  timeControl?: string;
}

export interface AnalysisRequestBodyInput {
  userMessage: string;
  /** SAN list for the FULL game (not sliced to the cursor). */
  moveHistory: string[];
  /** The cursor position, so the server can ground "what's happening here". */
  fen: string;
  gameEval: unknown;
  conversationHistory: AnalysisChatTurn[];
  /**
   * The user's real rating, or `undefined` when they have none.
   *
   * Required *key*, optional *value*: a caller must decide about the rating
   * rather than silently omit it. Dropping this from `coachExtras` is what
   * caused A1, and it type-checked because the key used to be `?`-optional.
   */
  userRating: number | undefined;
  /**
   * Half-moves on the board the user is viewing, or `undefined` when they are
   * at the end of the game. Required key / optional value, same reasoning as
   * `userRating`: forgetting it is how B3 happened.
   */
  viewedPly: number | undefined;
  playerColor?: "w" | "b";
  playerColorName?: "white" | "black";
  boardOrientation?: "white" | "black";
  username?: string;
  chesscomUsername?: string;
  lichessUsername?: string;
  personalityId?: string;
  gameHeaders?: AnalysisGameHeaders;
}

export function buildAnalysisRequestBody(
  input: AnalysisRequestBodyInput
): Record<string, unknown> {
  const hasAnyHeader =
    input.gameHeaders !== undefined &&
    Object.values(input.gameHeaders).some((v) => v !== undefined);

  return {
    userMessage: input.userMessage,
    moveHistory: input.moveHistory,
    fen: input.fen,
    gameEval: input.gameEval,
    conversationHistory: input.conversationHistory,
    // A1: the real rating or nothing at all. `JSON.stringify` drops the key
    // when the value is undefined, which is what keeps the server's profile →
    // PGN-header fallbacks reachable. Never reintroduce a `?? 1500` here.
    userRating: input.userRating,
    viewedPly: input.viewedPly,
    // Personalization. All optional server-side; the system prompt only gets
    // richer with each one present.
    playerColor: input.playerColor,
    playerColorName: input.playerColorName,
    boardOrientation: input.boardOrientation,
    username: input.username,
    chesscomUsername: input.chesscomUsername,
    lichessUsername: input.lichessUsername,
    personalityId: input.personalityId,
    ...(hasAnyHeader ? { gameHeaders: input.gameHeaders } : {}),
    stream: true,
  };
}
