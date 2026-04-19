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
  gameContext: string;        // Full pre-built game context string
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
 * This is much shorter than the full gameContext — just enough for the LLM
 * to maintain continuity without re-reading 10K tokens of move-by-move data.
 */
export function buildCondensedContext(context: AnalysisContext): string {
  const lines: string[] = [];

  lines.push("## ANALYSIS CONTEXT (pre-computed — do NOT repeat this analysis)");
  lines.push(`Position FEN: ${context.fen}`);
  lines.push(`Player: ${context.playerColor === "w" ? "White" : "Black"}, Skill: ${context.skillLevel}`);
  lines.push(`Game length: ${context.moveCount} moves`);
  lines.push("");
  lines.push("The full game has already been analyzed. Your initial analysis is in the conversation history.");
  lines.push("For follow-up questions, refer to your previous analysis. Only add NEW insights the user asks about.");
  lines.push("Be concise — the user has already read your deep analysis.");

  return lines.join("\n");
}
