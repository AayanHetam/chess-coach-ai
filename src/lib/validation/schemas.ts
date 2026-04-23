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
    .enum(["find_similar", "by_theme", "random", "daily"])
    .default("find_similar"),
  fen: z.string().optional(),
  themes: z.array(z.string().min(1)).optional(),
  limit: z.number().int().min(1).max(100).default(5),
  difficulty: z
    .union([difficultyBandSchema, z.array(difficultyBandSchema)])
    .optional(),
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
});

/** POST /api/enhanced-analysis */
// AUDIT-PHASE-1.4 (TEMP HARDENING): removed `systemPrompt` (was a prompt-injection
// vector — client could fully override the chess-coach persona) and restricted
// `conversationHistory[].role` to user|assistant. Proper Phase 3 P0 fix is
// auth + rate limit + a server-side prompt allowlist.
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
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
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
