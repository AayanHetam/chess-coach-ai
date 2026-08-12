import { z } from "zod";
import {
  QUIZ_FOCUS_THEME_IDS,
  MAX_FOCUS_THEMES,
} from "@/components/onboarding/quizThemes";

/**
 * Auth payload schemas. Centralized so signup / signin / change-password
 * stay aligned on what's valid. bcrypt hashes only the first 72 bytes,
 * so we cap there explicitly rather than letting longer passwords silently
 * truncate.
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(254, "Email is too long.");

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(72, "Password must be 72 characters or fewer.")
  .refine(
    (p) => /[0-9]/.test(p) || /[^A-Za-z0-9]/.test(p),
    "Include a number or a symbol."
  );

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Name cannot be empty.")
  .max(50, "Name must be 50 characters or fewer.");

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
  // COPPA: set by the client only after the neutral DOB age gate resolves
  // 13+. Must be literally true — account creation is refused without it,
  // and the server stamps ageAffirmedAt from it. The DOB itself is never
  // transmitted.
  ageAffirmed: z
    .boolean("Please confirm your date of birth to sign up.")
    .refine((v) => v === true, "Please confirm your date of birth to sign up."),
});

export const signinSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required."),
  newPassword: passwordSchema,
});

/**
 * Profile patch — full personalization schema. Empty strings are allowed
 * and treated by the server as "clear this field." Server discards
 * undefined keys so PATCH stays idempotent.
 */
export const profilePatchSchema = z.object({
  // Chess identity
  chesscomUsername: z.string().trim().max(50).optional(),
  lichessUsername: z.string().trim().max(50).optional(),
  selfReportedRating: z
    .number()
    .int()
    .min(0, "Rating cannot be negative.")
    .max(3500, "Rating must be at most 3500.")
    .optional(),
  primaryPlatform: z.enum(["chesscom", "lichess"]).optional(),

  // Account
  displayName: z.string().trim().max(50).optional(),
  bio: z.string().trim().max(280).optional(),

  // Coaching preferences
  coachTone: z.enum(["friendly", "strict", "masti"]).optional(),
  playingStyle: z.enum(["tactical", "positional", "balanced"]).optional(),
  studyGoals: z
    .array(z.enum(["tactics", "endgames", "openings", "time-management"]))
    .max(4)
    .optional(),
  favoriteOpenings: z
    .array(z.string().trim().min(1).max(80))
    .max(20)
    .optional(),

  // Onboarding quiz output. `focusThemes` is enum-locked to the quiz's
  // canonical kebab theme ids (QUIZ_FOCUS_THEME_IDS) so a tampered PATCH can't
  // inject free-text or an uncovered taxonomy id; the recommender consumes
  // these verbatim. `dailyTimeCommitment` stands alone (NOT the same concept as
  // the studyGoals "time-management" clock-discipline value).
  focusThemes: z
    .array(z.enum(QUIZ_FOCUS_THEME_IDS))
    .max(MAX_FOCUS_THEMES)
    .optional(),
  dailyTimeCommitment: z.enum(["under-10", "10-30", "30-plus"]).optional(),
  onboardingCompletedAt: z.number().int().min(0).optional(),

  // Single-rating model snapshots written by the placement test + live mirror.
  measuredRating: z.number().int().min(0).max(3500).optional(),
  measuredRatingConfidence: z.enum(["low", "medium", "high"]).optional(),
  measuredAt: z.number().int().min(0).optional(),
  liveRatingSnapshot: z.number().int().min(0).max(3500).optional(),
  liveRatingSnapshotAt: z.number().int().min(0).optional(),

  // Rating pulled from the user's linked Lichess / Chess.com account. Written
  // only by /api/ratings/lookup, which derives them server-side from the
  // platform APIs — a client PATCH carrying these is accepted but pointless,
  // since the next lookup overwrites them from the source of truth.
  platformRating: z.number().int().min(0).max(3500).optional(),
  platformRatingRaw: z.number().int().min(0).max(3500).optional(),
  platformRatingSource: z.enum(["lichess", "chesscom"]).optional(),
  platformRatingPerf: z.enum(["bullet", "blitz", "rapid", "classical"]).optional(),
  platformRatingFetchedAt: z.number().int().min(0).optional(),

  // User-set learning goals (target rating is a self-chosen aspiration only).
  goals: z
    .object({
      targetRating: z.number().int().min(0).max(3500).optional(),
      puzzlesPerDay: z.number().int().min(1).max(200).optional(),
      masteryThemes: z
        .array(z.string().trim().min(1).max(40))
        .max(20)
        .optional(),
    })
    .optional(),

  // Reminder + activity state (Phase 3).
  lastActiveAt: z.number().int().min(0).optional(),
  currentStreak: z.number().int().min(0).optional(),
  streakUpdatedAt: z.number().int().min(0).optional(),
  reminderPrefs: z
    .object({
      enabled: z.boolean(),
      hour: z.number().int().min(0).max(23).optional(),
    })
    .optional(),
  pushSubscriptions: z
    .array(
      z.object({
        endpoint: z.string().url().max(2000),
        keys: z.object({
          p256dh: z.string().max(255),
          auth: z.string().max(255),
        }),
      })
    )
    .max(10)
    .optional(),

  // Appearance
  boardTheme: z.enum(["classic", "wood", "neon"]).optional(),
  pieceSet: z.enum(["default", "merida", "alpha"]).optional(),
});

/**
 * Game create payload — accepts the wide set of fields the client today
 * pushes through addCloudGame. We don't shape-check the inner contents
 * (PGN, eval, etc.) since those are domain types maintained elsewhere.
 */
export const gameCreateSchema = z.record(z.string(), z.unknown());

export const gameEvalUpdateSchema = z.object({
  eval: z.unknown(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type SigninInput = z.infer<typeof signinSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export function firstZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input.";
}
