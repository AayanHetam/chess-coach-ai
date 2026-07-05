import { z } from "zod";

// ── Shared field validators ──────────────────────────────────────────────────

/** Validates a FEN string format (basic structure check, not full legality) */
export const fenSchema = z
  .string()
  .min(10, "FEN string is too short")
  .regex(
    /^[rnbqkpRNBQKP1-8/]+ [wb] [KQkq-]{1,4} [a-h1-8-]{1,2} \d+ \d+$/,
    "Invalid FEN format"
  );

/** Loose FEN — accepts any non-empty string that looks vaguely like a FEN (for endpoints that handle edge cases internally) */
export const looseFenSchema = z.string().min(1, "FEN string is required");

export const usernameSchema = z
  .string()
  .min(1, "Username is required")
  .max(50, "Username too long")
  .regex(/^[a-zA-Z0-9_-]+$/, "Username contains invalid characters");

export const platformSchema = z.enum(["lichess", "chesscom"], {
  error: "Platform must be 'lichess' or 'chesscom'",
});

export const scoutPlatformSchema = z.enum(["chess.com", "lichess"], {
  error: "Platform must be 'chess.com' or 'lichess'",
});

export const difficultyBandSchema = z.enum(
  ["beginner", "intermediate", "advanced", "expert"],
  {
    error:
      "Invalid difficulty. Expected 'beginner' | 'intermediate' | 'advanced' | 'expert'",
  }
);

export const skillLevelSchema = z.enum(
  ["beginner", "intermediate", "advanced"],
  {
    error:
      "Invalid skill level. Expected 'beginner' | 'intermediate' | 'advanced'",
  }
);

// Phase-3 cross-game weakness memory (per-user teaching relevance filter).
// The weakness store lives in the BROWSER's localStorage (weaknessProfile.ts);
// the server routes can't read it, so the client sends a bounded projection
// (relevanceFilter.toMasterySummary) that the routes thread into the teaching
// relevance filter (buildTeachingSpine per critical move + the PERSONALIZED
// FOCUS prompt block). AUDIT-PHASE-1.4 discipline: this is NOT free-form prompt
// text — category + severity are closed enums (mirroring weaknessProfile.ts's
// MISTAKE_CATEGORIES and severity buckets), frequency is clamped to 0..1, and
// the list is capped at 3, so nothing here reaches the system prompt as raw
// client prose. Shared verbatim between /api/enhanced-analysis (deep, turn 1)
// and /api/chat (Haiku follow-up) so both paths validate the identical shape.
export const masterySummarySchema = z
  .object({
    gamesAnalyzed: z.number().int().min(0).max(100000),
    weaknesses: z
      .array(
        z
          .object({
            category: z.enum([
              "Hanging Pieces",
              "Missed Tactics",
              "King Safety",
              "Pawn Structure",
              "Piece Activity",
              "Endgame Technique",
              "Time Management",
              "Positional Errors",
            ]),
            severity: z.enum(["critical", "frequent", "occasional"]),
            frequency: z.number().min(0).max(1),
          })
          .strict()
      )
      .max(3),
  })
  .strict();

// ── Route schemas ────────────────────────────────────────────────────────────

/** POST /api/chess-puzzles */
export const chessPuzzlesSchema = z.object({
  fen: looseFenSchema,
  principalVariation: z.array(z.string()).optional(),
  bestMove: z.string().optional(),
});

/** POST /api/chess-puzzles-dataset */
export const puzzleDatasetSchema = z.object({
  command: z
    .enum(["find_similar", "by_theme", "random", "daily", "by_rating"])
    .default("find_similar"),
  fen: z.string().optional(),
  themes: z.array(z.string().min(1)).optional(),
  limit: z.number().int().min(1).max(100).default(5),
  difficulty: z
    .union([difficultyBandSchema, z.array(difficultyBandSchema)])
    .optional(),
  // Rating window for the `by_rating` command (adaptive placement / daily plan).
  minRating: z.number().int().min(0).max(4000).optional(),
  maxRating: z.number().int().min(0).max(4000).optional(),
  excludeIds: z.array(z.string()).optional(),
});

/** POST /api/feedback */
export const feedbackSchema = z.object({
  username: usernameSchema,
  platform: platformSchema,
  maxGames: z.number().int().min(1).max(100).default(25),
});

/** POST /api/scout */
export const scoutSchema = z.object({
  username: z.string().min(1, "Username is required").max(50, "Username too long"),
  platform: scoutPlatformSchema,
  months: z.number().int().min(1).max(60).default(12),
});

/** POST /api/chat */
// AUDIT-PHASE-1.4 (TEMP HARDENING): role enums restricted to user|assistant.
// Previously accepted "system", which let any client inject an arbitrary system
// prompt and override the chess-coach persona. Proper fix (auth + rate limit +
// prompt allowlist) is tracked as a Phase 3 P0 finding.
export const chatSchema = z.object({
  // Fast-path fields
  contextId: z.string().optional(),
  userMessage: z.string().optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  // Fallback fields
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(16000).optional(),
  // Phase-3 cross-game weakness memory on the follow-up path. The fast path
  // reuses the turn-1 system-prompt suffix (which already embeds a PERSONALIZED
  // FOCUS block when the deep call carried a summary), but a follow-up can carry
  // a FRESHER summary — the player analyzed more games since turn 1 — so the
  // route refreshes the block from this field (relevanceFilter.refreshPersonalizedFocus).
  masterySummary: masterySummarySchema.optional(),
});

/** POST /api/enhanced-analysis */
// AUDIT-PHASE-1.4 (TEMP HARDENING): removed `systemPrompt` (was a prompt-injection
// vector — client could fully override the chess-coach persona) and restricted
// `conversationHistory[].role` to user|assistant. Proper Phase 3 P0 fix is
// auth + rate limit + a server-side prompt allowlist.
//
// Phase 2 (coach-prompt restoration): added structured fields the server uses
// to compose the system prompt itself (personalityId, playerColorName,
// chesscomUsername, lichessUsername). The hardening intent is preserved —
// personalityId is resolved via a server-side allowlist in
// getPersonalityById(); the regex below caps it at safe characters before
// the lookup happens. systemPrompt stays stripped (Zod silently drops unknown
// keys, which is the test contract in schemas.audit-phase-1-4.test.ts).
export const enhancedAnalysisSchema = z.object({
  userMessage: z.string().optional(),
  message: z.string().optional(),
  moveHistory: z.array(z.string()).optional(),
  fen: z.string().optional(),
  position: z.string().optional(),
  gameEval: z.any().optional(),
  playerColor: z.string().optional(),
  username: z.string().optional(),
  userRating: z.number().int().min(0).max(4000).optional(),
  boardOrientation: z.any().optional(),
  personalityId: z
    .string()
    .regex(/^[a-z0-9_-]{1,40}$/)
    .optional(),
  playerColorName: z.enum(["white", "black"]).optional(),
  chesscomUsername: z
    .string()
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  lichessUsername: z
    .string()
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  // Stage B (PR 1.C, §3.7.10 Question C): opt-in opponent identifier for the
  // Mastermind scout-citation validator. When MASTERMIND_VALIDATORS_ENABLED
  // is on, this drives the opponent_prep category's scout fetch via
  // wireValidators.ts (per T11 Option (c) — explicit field, no PGN parsing
  // since enhanced-analysis doesn't carry a PGN body). Anonymous-opponent
  // flows continue to skip scout (graceful degradation per §3.2).
  opponentUsername: z
    .string()
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  opponentPlatform: z.enum(["lichess", "chess.com"]).optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  // Optional PGN headers extracted from the loaded game so the coach has
  // structured player + event metadata to ground its analysis ("your opponent
  // is a 2050 in this Lichess blitz" reads very differently from "you played
  // a Najdorf"). Each field is permissively capped — chess.com PGN events
  // include long tournament names, so 200 chars per field is the sweet spot.
  gameHeaders: z
    .object({
      white: z.string().max(200).optional(),
      black: z.string().max(200).optional(),
      whiteElo: z.string().max(20).optional(),
      blackElo: z.string().max(20).optional(),
      event: z.string().max(200).optional(),
      date: z.string().max(40).optional(),
      result: z.string().max(20).optional(),
      eco: z.string().max(10).optional(),
      opening: z.string().max(200).optional(),
      timeControl: z.string().max(40).optional(),
    })
    .strict()
    .optional(),
  // Phase-3 cross-game weakness memory (see masterySummarySchema above).
  masterySummary: masterySummarySchema.optional(),
  stream: z.boolean().optional(),
});

/** POST /api/maia-predict */
export const maiaPredictSchema = z.object({
  fen: looseFenSchema,
  rating: z.number().int().min(100).max(4000).optional(),
  opponent_rating: z.number().int().min(100).max(4000).optional(),
});

// ── Helper: parse & return structured 400 on failure ─────────────────────────

import { NextResponse } from "next/server";

/**
 * Validate a request body against a Zod schema.
 * Returns `{ success: true, data }` on valid input,
 * or `{ success: false, response }` with a 400 NextResponse on invalid input.
 */
export function validateRequest<T>(
  schema: z.ZodType<T>,
  body: unknown
):
  | { success: true; data: T }
  | { success: false; response: NextResponse } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".") || "_root";
    if (!fieldErrors[path]) fieldErrors[path] = [];
    fieldErrors[path].push(issue.message);
  }

  return {
    success: false,
    response: NextResponse.json(
      {
        error: "Invalid input",
        details: { fieldErrors },
      },
      { status: 400 }
    ),
  };
}
