/**
 * Analysis Context Cache — Server-side cache for pre-computed game analysis.
 *
 * When a game is first analyzed via /api/enhanced-analysis, the full game context
 * (move-by-move Stockfish data, position annotations, few-shot examples, etc.)
 * is cached here with a unique context ID.
 *
 * Follow-up chat messages via /api/chat use this cached context instead of
 * rebuilding everything from scratch, enabling near-instant responses.
 */

import { createHash } from "crypto";

export interface AnalysisContext {
  contextId: string;
  gameContext: string;        // Full pre-built game context string (used for the initial deep analysis only)
  compactGameContext: string; // Trimmed move list + per-move evals + mistakes — re-sent on every chat follow-up
  playedMoves: string[];      // SAN move history; lets follow-up code answer "did I play X?" without re-deriving
  systemPrompt: string;       // System prompt with player info + weakness profile
  fewShotExamples: string;    // Pre-selected few-shot examples
  fen: string;                // Current/final FEN
  skillLevel: "beginner" | "intermediate" | "advanced";
  playerColor: string;
  moveCount: number;
  createdAt: number;
  initialAnalysis: string;    // The first LLM response (deep analysis)
}

const MAX_CACHE_SIZE = 50;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// In-memory cache keyed by contextId
const contextCache = new Map<string, AnalysisContext>();

/**
 * Generate a unique context ID from the game state.
 * Same game + same player = same context ID (allows reconnection).
 */
export function generateContextId(
  moveHistory: string[] | undefined,
  fen: string | undefined,
  playerColor: string
): string {
  const key = JSON.stringify({
    moves: moveHistory?.join(",") || "",
    fen: fen || "startpos",
    color: playerColor,
  });
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/**
 * Store a pre-computed analysis context.
 */
export function storeAnalysisContext(context: AnalysisContext): void {
  // Evict expired entries
  const now = Date.now();
  const expiredIds: string[] = [];
  contextCache.forEach((entry, id) => {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      expiredIds.push(id);
    }
  });
  expiredIds.forEach(id => contextCache.delete(id));

  // Evict oldest if at capacity
  if (contextCache.size >= MAX_CACHE_SIZE) {
    let oldestId: string | null = null;
    let oldestTime = Infinity;
    contextCache.forEach((entry, id) => {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestId = id;
      }
    });
    if (oldestId) contextCache.delete(oldestId);
  }

  contextCache.set(context.contextId, context);
}

/**
 * Retrieve a cached analysis context by ID.
 * Returns null if not found or expired.
 */
export function getAnalysisContext(contextId: string): AnalysisContext | null {
  const entry = contextCache.get(contextId);
  if (!entry) return null;

  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    contextCache.delete(contextId);
    return null;
  }

  return entry;
}

/**
 * Build a condensed context summary for follow-up chat messages.
 *
 * Sends the moves + Stockfish evals + mistakes (compactGameContext) — far cheaper
 * than the full move-by-move gameContext used in the deep analysis, but enough
 * to keep follow-ups grounded so the LLM doesn't invent moves or evals.
 *
 * Layout:
 *   1. Position metadata (FEN, player, skill, length)
 *   2. Grounding rules — what the LLM is allowed to assert
 *   3. Pointer to the prior deep analysis (lives in conversation history)
 *   4. The compactGameContext block (PGN + per-move narrative + top mistakes)
 */
export function buildCondensedContext(context: AnalysisContext): string {
  const lines: string[] = [];

  lines.push("## ANALYSIS CONTEXT");
  lines.push(`Final FEN: ${context.fen}`);
  lines.push(`Player: ${context.playerColor === "w" ? "White" : "Black"}, Skill: ${context.skillLevel}`);
  lines.push(`Game length: ${context.moveCount} full moves`);
  lines.push("");

  lines.push("## GROUNDING RULES (read carefully)");
  lines.push("Every chess fact you state must be derivable from the moves, evals, and position supplied below, OR from your initial deep analysis (your first message in this conversation).");
  lines.push("- Never invent moves, evals, openings, or 'best was X' recommendations. If a move number or eval the user asks about is not in the data below, say 'I don't have that in the analysis.' rather than guessing.");
  lines.push("- When asked about a specific move, prefer to quote the corresponding sentence from the MOVE-BY-MOVE NARRATIVE below verbatim, then explain.");
  lines.push("- Before recommending a move from the current position (e.g., \"play X\"), confirm it is legal in the supplied FEN — do not suggest castling if the relevant rook or king has moved, do not suggest captures of empty squares, etc.");
  lines.push("");

  lines.push("## PRIOR DEEP ANALYSIS");
  lines.push("Your initial deep analysis of this game is in the conversation history as your first assistant message. Treat it as the canonical narrative — when the user asks about themes, weaknesses, or moments you've already analyzed, reference and build on what you said before rather than re-deriving from scratch. If the user contradicts or corrects something in that prior analysis, update accordingly.");
  lines.push("");

  if (context.compactGameContext) {
    lines.push(context.compactGameContext);
  }

  return lines.join("\n");
}
