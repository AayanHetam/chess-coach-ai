import { z } from "zod";

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
  favoriteOpenings: z.array(z.string().trim().min(1).max(80)).max(20).optional(),

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
