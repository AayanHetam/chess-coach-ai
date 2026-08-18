/**
 * Public handles — the name a user picks for themselves, and can sign in with.
 *
 * Pure: format rules, normalisation and the reserved list. The atomic claim
 * lives in server/handles.ts, because uniqueness needs a transaction and this
 * file must stay importable from the browser for live validation as they type.
 *
 * ── Why a separate canonical form ──────────────────────────────────────────
 * Uniqueness is CASE-INSENSITIVE and confusable-insensitive. "LazerWizard" and
 * "lazerwizard" must not be two accounts, or a handle stops identifying a
 * person and starts being a costume anyone can wear — which matters more here
 * than usual, because the handle is a public identifier AND a sign-in
 * credential. We store the display form the user typed and index on the
 * canonical form.
 */

/** What the user sees; preserves their capitalisation. */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

/**
 * Letters, digits, underscore and hyphen. No dots: they invite
 * `name.` / `.name` lookalikes and complicate any future /u/<handle>.<ext>
 * route. Must start with a letter or digit so a handle can never be mistaken
 * for a flag, and must not end with a separator.
 */
const SHAPE = /^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/;

/**
 * Names that must never belong to a user.
 *
 * Two categories, both about impersonation rather than taste: our own route
 * namespace (so a handle can never shadow a real page if /u/<handle> or
 * chessmasti.com/<handle> ever ships) and terms that would let someone pass
 * themselves off as us. This list is deliberately small and specific — a
 * sprawling profanity filter is a different problem with different tradeoffs,
 * and belongs in moderation, not in a uniqueness check.
 */
export const RESERVED_HANDLES = new Set([
  // Route namespace
  "admin",
  "api",
  "auth",
  "analysis",
  "plan",
  "play",
  "puzzles",
  "profile",
  "onboarding",
  "settings",
  "signin",
  "signup",
  "login",
  "logout",
  "share",
  "scout",
  "intern",
  "internship",
  "privacy",
  "terms",
  "about",
  "help",
  "support",
  "billing",
  "checkout",
  "pricing",
  "u",
  "user",
  "users",
  "me",
  "static",
  "assets",
  "public",
  "new",
  "edit",
  "delete",
  "null",
  "undefined",
  // Impersonation
  "chessmasti",
  "chess-masti",
  "chessmastiai",
  "official",
  "staff",
  "team",
  "moderator",
  "mod",
  "root",
  "system",
  "bot",
  "coach",
  "mastermind",
]);

export type HandleProblem =
  | "too_short"
  | "too_long"
  | "bad_shape"
  | "reserved"
  | "confusable";

export interface HandleCheck {
  ok: boolean;
  problem?: HandleProblem;
  /** Lowercased, confusable-folded key that uniqueness is enforced on. */
  canonical?: string;
  /** Trimmed original, preserving the user's capitalisation. */
  display?: string;
  /** Sentence for the UI. Present whenever ok is false. */
  message?: string;
}

/**
 * Fold the characters people cannot reliably tell apart in a UI font.
 *
 * Underscore and hyphen collapse because `lazer_wizard` and `lazer-wizard`
 * reading as two different people is a phishing affordance, not a feature.
 * Applied ONLY to the uniqueness key — the user still sees exactly what they
 * typed.
 */
export function canonicalHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_-]/g, "");
}

const MESSAGES: Record<HandleProblem, string> = {
  too_short: `Handles need at least ${HANDLE_MIN} characters.`,
  too_long: `Handles can be at most ${HANDLE_MAX} characters.`,
  bad_shape:
    "Use letters, numbers, _ or -, starting and ending with a letter or number.",
  reserved: "That one's reserved. Try another.",
  confusable: "That's too close to an existing handle.",
};

export function checkHandle(raw: string | undefined | null): HandleCheck {
  const display = (raw ?? "").trim();

  if (display.length < HANDLE_MIN) {
    return { ok: false, problem: "too_short", message: MESSAGES.too_short };
  }
  if (display.length > HANDLE_MAX) {
    return { ok: false, problem: "too_long", message: MESSAGES.too_long };
  }
  if (!SHAPE.test(display)) {
    return { ok: false, problem: "bad_shape", message: MESSAGES.bad_shape };
  }

  const canonical = canonicalHandle(display);
  // Checked on the CANONICAL form: "Adm-in" must be as reserved as "admin",
  // or the reserved list is decoration.
  if (RESERVED_HANDLES.has(canonical)) {
    return { ok: false, problem: "reserved", message: MESSAGES.reserved };
  }
  // Folding can empty a string that passed SHAPE only via separators.
  if (canonical.length < HANDLE_MIN) {
    return { ok: false, problem: "too_short", message: MESSAGES.too_short };
  }

  return { ok: true, canonical, display };
}
