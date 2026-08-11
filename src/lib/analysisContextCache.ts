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
import { Chess } from "chess.js";
import { detectOpening } from "@/lib/unifiedOpeningDetector";
import { logger } from "@/lib/logging";
import type { MastermindGameEval } from "./mastermind/routeHelpers";

const log = logger.child({ module: "analysis-context-cache" });

export interface AnalysisContext {
  contextId: string;
  gameContext: string;        // Full pre-built game context string (used for the initial deep analysis only)
  compactGameContext: string; // Trimmed move list + per-move evals + mistakes — re-sent on every chat follow-up
  playedMoves: string[];      // SAN move history; lets follow-up code answer "did I play X?" without re-deriving
  systemPrompt: string;       // Joined system prompt (stable + perUser). Kept
                              //   for backward compat with legacy cache entries
                              //   and as the fallback when the split below is
                              //   absent.
  /**
   * Persona-stable prefix of the system prompt. Identical across users who
   * share the same personalityId; safe to ship as the Anthropic ephemeral
   * prompt-cache prefix on /api/chat follow-ups so two users in the same
   * persona share the cache instead of each warming their own. Optional —
   * legacy cache entries created before the split landed have this undefined
   * and the chat route falls back to using `systemPrompt` as the whole block.
   */
  systemPromptStable?: string;
  /**
   * Per-user / per-conversation tail. Username, rating, coaching prefs and
   * anything else that varies across callers of the same persona. Sent
   * uncached on /api/chat so a username difference between two callers
   * doesn't bust the cached prefix above.
   */
  systemPromptSuffix?: string;
  fewShotExamples: string;    // Pre-selected few-shot examples
  fen: string;                // Current/final FEN
  skillLevel: "beginner" | "intermediate" | "advanced";
  playerColor: string;
  moveCount: number;
  createdAt: number;
  initialAnalysis: string;    // The first LLM response (deep analysis)
  // (γ-route, 2026-05-23): persisted from /api/enhanced-analysis so chat-route
  // follow-ups can validate eval claims against real stockfish ground truth
  // instead of skipping. Optional to preserve backward-compat with legacy
  // cache entries created before this field landed (in-memory cache; cold
  // starts and TTL expiry already invalidate, so the legacy window is small).
  // Legacy entries get gameEval: undefined → (β) skip path in validateEvalClaim
  // emits a no_stockfish_eval telemetry event rather than firing false-positive
  // eval_mismatch_* events.
  gameEval?: MastermindGameEval;
}

const MAX_CACHE_SIZE = 50;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// In-memory cache keyed by contextId
const contextCache = new Map<string, AnalysisContext>();

/**
 * T9 (SILENT_SUBSTITUTION_HANDOFF §4) — INSTRUMENTATION ONLY. Do not "fix"
 * anything based on the hypothesis below; measure first.
 *
 * `contextCache` is a module-level Map with no Redis/KV behind it, so it lives
 * per warm serverless instance. Per-route `.nft.json` traces plus vercel.json's
 * per-source-file `functions` glob suggest /api/chat and /api/enhanced-analysis
 * are SEPARATE functions — in which case /api/chat could never see an entry
 * written by /api/enhanced-analysis, the fast path would never hit, and every
 * follow-up would silently be a full flagship re-analysis. It works perfectly
 * in local dev (one process), which is exactly why nobody would notice.
 *
 * That is a hypothesis, not a finding. These counters exist to settle it with
 * production traffic rather than with reasoning about build output.
 *
 * How to read one day of logs:
 *   - `outcome: "hit"` appearing at all  → the cache DOES work cross-request.
 *   - only "miss_absent", with `cacheSize: 0` and small `instanceAgeMs`
 *     → cold starts; the instance simply had not served the write yet.
 *   - only "miss_absent" with a NON-ZERO cacheSize → the instance holds other
 *     entries but not this one: that is the cross-function isolation case, and
 *     the one that would justify shared storage.
 *   - "miss_expired" → genuine TTL expiry (2h); unrelated to the hypothesis.
 */
const instanceStartedAtMs = Date.now();
let lookupHits = 0;
let lookupMissesAbsent = 0;
let lookupMissesExpired = 0;
let writes = 0;

/** Test/ops read-only view of the counters. */
export function __getContextCacheStats() {
  return {
    hits: lookupHits,
    missesAbsent: lookupMissesAbsent,
    missesExpired: lookupMissesExpired,
    writes,
    cacheSize: contextCache.size,
  };
}

/** Test-only: reset counters and cache so suites don't leak into each other. */
export function __resetContextCacheStats(): void {
  lookupHits = 0;
  lookupMissesAbsent = 0;
  lookupMissesExpired = 0;
  writes = 0;
  contextCache.clear();
}

/**
 * Generate a unique context ID from the game state.
 * Same game + same player + same user = same context ID (allows reconnection).
 *
 * `uid` is part of the key: without it, two users analyzing the same game
 * (e.g. a master game) shared one cache entry — last write won, so the other
 * user's follow-ups ran with someone else's persona suffix, rating, and
 * initial analysis. Omitting uid (legacy/unauthenticated callers) keeps the
 * old per-game key.
 */
export function generateContextId(
  moveHistory: string[] | undefined,
  fen: string | undefined,
  playerColor: string,
  uid?: string
): string {
  const key = JSON.stringify({
    moves: moveHistory?.join(",") || "",
    fen: fen || "startpos",
    color: playerColor,
    ...(uid ? { uid } : {}),
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
  writes++;
  // T9: pairs with analysis_context_lookup. If writes are happening on one
  // instance and lookups only ever miss on another, the two routes are not
  // sharing memory — which is the whole question.
  log.info("analysis_context_stored", {
    cacheSize: contextCache.size,
    instanceAgeMs: Date.now() - instanceStartedAtMs,
    writesThisInstance: writes,
  });
}

/**
 * Retrieve a cached analysis context by ID.
 * Returns null if not found or expired.
 */
export function getAnalysisContext(contextId: string): AnalysisContext | null {
  const entry = contextCache.get(contextId);

  // T9: one line per lookup. `cacheSize` and `instanceAgeMs` are the two
  // fields that separate "cold start" from "this instance cannot see the
  // writer's memory at all" — the number alone cannot.
  const emit = (outcome: "hit" | "miss_absent" | "miss_expired") => {
    log.info("analysis_context_lookup", {
      outcome,
      cacheSize: contextCache.size,
      instanceAgeMs: Date.now() - instanceStartedAtMs,
      writesThisInstance: writes,
      hits: lookupHits,
      missesAbsent: lookupMissesAbsent,
      missesExpired: lookupMissesExpired,
    });
  };

  if (!entry) {
    lookupMissesAbsent++;
    emit("miss_absent");
    return null;
  }

  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    contextCache.delete(contextId);
    lookupMissesExpired++;
    emit("miss_expired");
    return null;
  }

  lookupHits++;
  emit("hit");
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
/**
 * Facts about the game as a whole, for the follow-up context (E1).
 *
 * Everything here is DERIVED from what the context already stores, so this
 * needs no new fields and works for entries written before it existed. Each
 * line is emitted only when the underlying value is genuinely present — an
 * absent opening is left out rather than guessed at, which is the entire point
 * of the document this comes from.
 */
function buildGameOverview(context: AnalysisContext): string[] {
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

export function buildCondensedContext(context: AnalysisContext): string {
  const lines: string[] = [];

  lines.push("## ANALYSIS CONTEXT");
  lines.push(`Final FEN: ${context.fen}`);
  lines.push(`Player: ${context.playerColor === "w" ? "White" : "Black"}, Skill: ${context.skillLevel}`);
  lines.push(`Game length: ${context.moveCount} full moves`);

  // E1 (SILENT_SUBSTITUTION_HANDOFF §3 Group E): the follow-up context used to
  // carry no opening name, no ECO, and no accuracy — while the cached system
  // prompt still instructs the model to acknowledge the opening BY NAME. So
  // "what opening did I play?" was answered from memory over raw SAN, and
  // transposition-heavy lines got misnamed confidently.
  //
  // Derived here rather than stored, so none of the six storeAnalysisContext
  // call sites has to be touched — and so a context written before this
  // existed still gets an overview on read.
  const overview = buildGameOverview(context);
  if (overview.length > 0) {
    lines.push("");
    lines.push("## GAME OVERVIEW");
    lines.push(...overview);
  }
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
