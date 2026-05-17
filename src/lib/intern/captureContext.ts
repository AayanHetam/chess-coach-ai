import { createHash } from "crypto";
import { getAnalysisContext } from "@/lib/analysisContextCache";
import { PROMPT_VERSION } from "@/lib/prompts/coachChatPrompt";

/**
 * Server-only helper. Given the browser-supplied flag payload + the server-side
 * cached analysis context (if any), produces the normalized capture row ready
 * to write into `intern_flags`.
 *
 * Design refinement from plan §5.2: the plan assumed chat history lived in
 * the server cache. It doesn't — only the initial analysis context does.
 * Follow-up chat messages travel with each /api/chat request and live in
 * browser state. So the FlagButton sends the full chat history; this helper
 * merges it with the server-cached game context (PGN / FEN / etc.).
 */

export type ClientMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type CaptureInput = {
  contextId: string | null;
  chatHistory: ClientMessage[];
  flaggedMessageIndex: number;
};

export type CaptureSuccess = {
  ok: true;
  chatSessionId: string | null;
  chatHistory: ClientMessage[];
  gamePgn: string | null;
  fenAtFlag: string | null;
  flaggedMessageId: string;
  flaggedMessageContent: string;
  flaggedMessageIndex: number;
  promptVersion: string;
};

export type CaptureFailure = {
  ok: false;
  error: string;
};

export type CaptureResult = CaptureSuccess | CaptureFailure;

const MAX_HISTORY_MESSAGES = 200;
const MAX_MESSAGE_CHARS = 50_000;

export function captureFlagContext(input: CaptureInput): CaptureResult {
  const { contextId, chatHistory, flaggedMessageIndex } = input;

  if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
    return { ok: false, error: "chatHistory is empty" };
  }
  if (chatHistory.length > MAX_HISTORY_MESSAGES) {
    return { ok: false, error: `chatHistory exceeds ${MAX_HISTORY_MESSAGES} messages` };
  }
  if (flaggedMessageIndex < 0 || flaggedMessageIndex >= chatHistory.length) {
    return { ok: false, error: "flaggedMessageIndex out of bounds" };
  }

  const flaggedMessage = chatHistory[flaggedMessageIndex];
  if (flaggedMessage.role !== "assistant") {
    return { ok: false, error: "flagged message must be an assistant message" };
  }
  if (flaggedMessage.content.length > MAX_MESSAGE_CHARS) {
    return { ok: false, error: `flagged message exceeds ${MAX_MESSAGE_CHARS} chars` };
  }

  const flaggedMessageId = createHash("sha256")
    .update(`${flaggedMessage.role}\n${flaggedMessageIndex}\n${flaggedMessage.content}`)
    .digest("hex")
    .slice(0, 16);

  let gamePgn: string | null = null;
  let fenAtFlag: string | null = null;

  if (contextId) {
    const analysis = getAnalysisContext(contextId);
    if (analysis) {
      gamePgn = formatMovesAsPGN(analysis.playedMoves);
      fenAtFlag = analysis.fen;
    }
  }

  return {
    ok: true,
    chatSessionId: contextId,
    chatHistory,
    gamePgn,
    fenAtFlag,
    flaggedMessageId,
    flaggedMessageContent: flaggedMessage.content,
    flaggedMessageIndex,
    promptVersion: PROMPT_VERSION,
  };
}

/**
 * Build a minimal PGN move-list from a SAN move array. No headers — just
 * `1. e4 e5 2. Nf3 Nc6 ...`. Good enough for downstream eval consumers to
 * replay the game with chess.js or similar.
 */
function formatMovesAsPGN(moves: string[]): string {
  const tokens: string[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const moveNum = i / 2 + 1;
    const white = moves[i];
    const black = moves[i + 1];
    tokens.push(black ? `${moveNum}. ${white} ${black}` : `${moveNum}. ${white}`);
  }
  return tokens.join(" ");
}
