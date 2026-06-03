/**
 * Zod schemas for the Puzzle Coach chat endpoint (/api/puzzle-chat).
 *
 * Mirrors the chatSchema pattern in `./schemas.ts` for the AUDIT-PHASE-1.4
 * hardening (no client-supplied `system` role). The puzzle-coach surface
 * uses Sonnet for turn-1 (initial explanation) and Haiku for follow-ups —
 * the tier choice is server-driven via `turnIndex`, not client-supplied,
 * so a client can't force flagship-tier on every follow-up.
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
  /** 0 = initial explanation (Sonnet); ≥1 = follow-up (Haiku).
   *  Server uses this to pick `tier` — never trust a client-supplied tier. */
  turnIndex: z.number().int().min(0).max(64),
  /** Prior turns in this puzzle-coach session. Empty on turn 0. */
  history: z.array(turnSchema).max(32).default([]),
  /** Current user message. Required on turn ≥ 1; ignored on turn 0
   *  (turn 0 is the auto-fired explanation prompt). */
  userMessage: z.string().min(1).max(2000).optional(),
  /** Optional user rating to tune the explanation depth. */
  userRating: z.number().int().min(400).max(3000).optional(),
});

export type PuzzleChatBody = z.infer<typeof puzzleChatSchema>;
export type PuzzleContext = z.infer<typeof puzzleContextSchema>;
export type PuzzleOutcome = z.infer<typeof puzzleOutcomeSchema>;
