/**
 * Zod schemas for the Puzzle Coach chat endpoint (/api/puzzle-chat).
 *
 * Mirrors the chatSchema pattern in `./schemas.ts` for the AUDIT-PHASE-1.4
 * hardening (no client-supplied `system` role). The puzzle-coach surface
 * uses Sonnet for the initial explanation and Haiku for follow-ups.
 *
 * TIER (corrected 2026-09-01): this header used to claim "the tier choice is
 * server-driven via `turnIndex`, not client-supplied, so a client can't force
 * flagship-tier on every follow-up." That was never true. `turnIndex` IS a
 * client-supplied field of this schema, and the route selected Sonnet whenever
 * it was 0 — so any caller could send `turnIndex: 0` forever and pin the
 * expensive model. The route no longer reads it for that decision: flagship is
 * now reachable only on a genuinely initial turn (no history, no user
 * message), which is also the CHEAPEST possible request. See
 * puzzle-chat/route.ts. `turnIndex` survives only as a depth hint for the
 * prompt, and the route clamps it against the history it can actually see.
 *
 * SIZE: the route is anonymous, so the request body is the whole cost surface.
 * `history` is bounded both per-turn and IN TOTAL — 32 × 8 000 chars would
 * have been ~64k uncached input tokens per call, and `llmProvider` caches only
 * the first SYSTEM block, never `messages`.
 */

import { z } from "zod";

/** A puzzle attempt outcome reported by the client. */
const puzzleOutcomeSchema = z.enum(["solved", "wrong", "unattempted"]);

/** The minimum puzzle context the coach needs to coach. */
export const puzzleContextSchema = z.object({
  /** Stable puzzle identifier (Lichess id or local fixture id). */
  id: z.string().min(1).max(64),
  /** Starting FEN (the puzzle's anchor position, before the opponent's
   *  setup move per Lichess convention). */
  fen: z.string().min(10).max(120),
  /** UCI move list — solution[0] is the opponent's setup, solution[1] is
   *  the user's first move, alternating thereafter. */
  solution: z.array(z.string().min(2).max(6)).min(1).max(32),
  /** Puzzle rating (Lichess Glicko-2). */
  rating: z.number().int().min(400).max(3000).optional(),
  /** Themes from the puzzle DB. Normalised + allowlisted server-side. */
  themes: z.array(z.string().min(1).max(48)).max(20).default([]),
});

/**
 * Total characters allowed across the whole replayed history. Sized ~25%
 * above the largest realistic session so it never truncates a real
 * conversation, while cutting the abusive worst case by 8x.
 */
export const MAX_HISTORY_CHARS = 32_000;

/** A single conversation turn. Same role discipline as chatSchema. */
const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

/** POST /api/puzzle-chat body. */
export const puzzleChatSchema = z.object({
  puzzle: puzzleContextSchema,
  /** User's most recent attempted move in SAN (for "wrong" outcomes — the
   *  coach addresses the specific move the user tried). */
  userAttemptSan: z.string().min(1).max(16).optional(),
  /** Outcome of the user's current attempt at this puzzle. */
  outcome: puzzleOutcomeSchema,
  /** Conversation depth hint for the prompt only. NOT the tier selector —
   *  see the header; the route derives that from `history` + `userMessage`. */
  turnIndex: z.number().int().min(0).max(64),
  /** Prior turns in this puzzle-coach session. Empty on the initial turn. */
  history: z
    .array(turnSchema)
    .max(32)
    .default([])
    // A real 32-turn session is ~26k chars (assistant turns are capped by the
    // route's own 350-600 output-token budget, user turns by userMessage's
    // 2 000). The per-turn 8 000 cap alone would allow 256k, so bound the sum
    // too: this is the only thing standing between an anonymous caller and an
    // arbitrarily large uncached prompt.
    .refine(
      (turns) => turns.reduce((n, t) => n + t.content.length, 0) <= MAX_HISTORY_CHARS,
      { message: `history exceeds ${MAX_HISTORY_CHARS} characters in total` },
    ),
  /** Current user message. Required on turn ≥ 1; ignored on turn 0
   *  (turn 0 is the auto-fired explanation prompt). */
  userMessage: z.string().min(1).max(2000).optional(),
  /** Optional user rating to tune the explanation depth. */
  userRating: z.number().int().min(400).max(3000).optional(),
});

export type PuzzleChatBody = z.infer<typeof puzzleChatSchema>;
export type PuzzleContext = z.infer<typeof puzzleContextSchema>;
export type PuzzleOutcome = z.infer<typeof puzzleOutcomeSchema>;
