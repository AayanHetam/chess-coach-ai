/**
 * Zod schemas for the staged puzzle-hint pipeline (/api/puzzle-hint).
 *
 * Four stages of progressive disclosure on a wrong-move (or on demand
 * after solving). Each stage has its own prompt + leak constraints. Drives
 * the puzzle-equivalent of /analysis's "analyze my game" surface.
 *
 *   why_wrong    : Haiku, ≤80 words.  Explains the user's mistake.
 *                  HARD constraint: must NOT reveal the solution.
 *   hint         : Sonnet, ≤120 words. One positional observation + one
 *                  strategic implication. May highlight squares.
 *   answer       : Sonnet, ≤60 words.  Solution move + what it achieves.
 *                  Emits [SHOW_MOVE:...] so the client can offer a demo.
 *   deeper_dive  : Sonnet (+ extended thinking), ≤300 words. Full pattern
 *                  breakdown — name, why this position invites it, what to
 *                  look for next time.
 *
 * v1 is non-streaming JSON; streaming may be added in a follow-up if the
 * deeper_dive 10s wait feels too long.
 */

import { z } from "zod";
import { puzzleContextSchema } from "./puzzleChatSchemas";

export const hintStageSchema = z.enum([
  "why_wrong",
  "hint",
  "answer",
  "deeper_dive",
]);
export type HintStage = z.infer<typeof hintStageSchema>;

export const puzzleHintRequestSchema = z.object({
  puzzle: puzzleContextSchema,
  /** SAN of the wrong move that triggered this hint. Required for
   *  `why_wrong`; ignored for `answer` / `deeper_dive` on a solved puzzle. */
  userAttemptSan: z.string().min(1).max(16).optional(),
  stage: hintStageSchema,
  userRating: z.number().int().min(400).max(3000).optional(),
});
export type PuzzleHintRequest = z.infer<typeof puzzleHintRequestSchema>;

/** Overlay colors the client knows how to paint on the board. */
export const mentionColorSchema = z.enum([
  "red",
  "blue",
  "yellow",
  "green",
  "orange",
]);
export type MentionColor = z.infer<typeof mentionColorSchema>;

/** Structured payload the coach attaches to glossary terms it uses. When
 *  the user taps the term's chip in the chat, the client paints `squares`
 *  on the main board in `color`. Empty mentions[] = no overlays. */
export const termMentionSchema = z.object({
  /** Lowercase term key matching CHESS_TERM_GLOSSARY in
   *  ChessTermGlossary.tsx (e.g. "pin", "fork", "skewer"). */
  term: z.string().min(2).max(32),
  squares: z
    .array(z.string().regex(/^[a-h][1-8]$/))
    .min(1)
    .max(8),
  color: mentionColorSchema,
});
export type TermMention = z.infer<typeof termMentionSchema>;

export const puzzleHintResponseSchema = z.object({
  stage: hintStageSchema,
  prose: z.string().min(1).max(4000),
  mentions: z.array(termMentionSchema).max(8).default([]),
  /** SAN sequence for the "Show on board" handshake. Only populated on
   *  `answer`. Parsed out of the prose's [SHOW_MOVE:...] tag by the
   *  server. */
  showMoves: z.array(z.string().min(2).max(8)).max(8).optional(),
  meta: z.object({
    model: z.string(),
    provider: z.string(),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    elapsedMs: z.number().int().min(0),
    /** True when served from the in-memory cache. */
    cacheHit: z.boolean().default(false),
    /** True when the leak validator fired a retry on this response. */
    leakRetry: z.boolean().default(false),
    /** True when both attempts leaked and we returned a generic fallback. */
    leakFallback: z.boolean().default(false),
  }),
});
export type PuzzleHintResponse = z.infer<typeof puzzleHintResponseSchema>;

/**
 * Resolved highlight ready for the board to paint. Carries the squares
 * + the color (mapped to CSS by PuzzleBoard's overlay table). Derived
 * from a `TermMention` plus the chip-click event in PR-C.3.
 */
export interface CoachHighlight {
  /** Squares to overlay (a1-h8). */
  squares: string[];
  color: MentionColor;
  /** Term that produced this highlight — purely for telemetry / debug. */
  term?: string;
}
