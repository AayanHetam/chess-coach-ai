/**
 * Client-side wrappers for the user-profile API. Every call now hits
 * chessmasti.com — Firebase domains are never contacted from the browser.
 *
 * `uid` parameters are now redundant since the server resolves the user
 * from the session cookie. Kept in the signature for backward compat
 * and ignored.
 */

export type CoachTone = "friendly" | "strict" | "masti";
export type PlayingStyle = "tactical" | "positional" | "balanced";
export type StudyGoal =
  | "tactics"
  | "endgames"
  | "openings"
  | "middlegame"
  | "time-management";
export type BoardTheme = "classic" | "wood" | "neon";
export type PieceSet = "default" | "merida" | "alpha";

export interface UserProfile {
  uid: string;
  email: string;

  displayName?: string;
  photoURL?: string;
  bio?: string;

  chesscomUsername?: string;
  lichessUsername?: string;
  selfReportedRating?: number;
  primaryPlatform?: "chesscom" | "lichess";
  rating?: number;

  coachTone?: CoachTone;
  playingStyle?: PlayingStyle;
  studyGoals?: StudyGoal[];
  favoriteOpenings?: string[];

  // Onboarding-quiz output (see StoredUser in lib/server/users.ts). Both flow
  // through UserProfileUpdates automatically since they aren't in the Omit.
  focusThemes?: string[];
  /** Normalized platform rating used for coach calibration (see rating/platformRatings.ts). */
  platformRating?: number;
  /** The platform's own number — what we show the user. */
  platformRatingRaw?: number;
  platformRatingSource?: "lichess" | "chesscom";
  platformRatingPerf?: string;
  platformRatingFetchedAt?: number;
  /** Target rating, on the same calibration scale as platformRating. */
  goalRating?: number;
  /** Days per week the user plans to practise (1-7). */
  practiceDaysPerWeek?: number;
  /** Epoch ms the goal rating is projected for. */
  goalTargetDate?: number;
  dailyTimeCommitment?: "under-10" | "10-30" | "30-plus";
  onboardingCompletedAt?: number;

  // Single-rating model (placement test + live mirror). See StoredUser.
  measuredRating?: number;
  measuredRatingConfidence?: "low" | "medium" | "high";
  measuredAt?: number;
  liveRatingSnapshot?: number;
  liveRatingSnapshotAt?: number;

  // User-set learning goals (see StoredUser).
  goals?: {
    targetRating?: number;
    puzzlesPerDay?: number;
    masteryThemes?: string[];
  };

  // Reminder + activity state (Phase 3; see StoredUser).
  lastActiveAt?: number;
  currentStreak?: number;
  streakUpdatedAt?: number;
  reminderPrefs?: {
    enabled: boolean;
    hour?: number;
  };
  pushSubscriptions?: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }[];

  boardTheme?: BoardTheme;
  pieceSet?: PieceSet;

  createdAt?: unknown;
  updatedAt?: unknown;
}

export type UserProfileUpdates = Partial<
  Omit<
    UserProfile,
    "uid" | "email" | "rating" | "createdAt" | "updatedAt" | "photoURL"
  >
>;

async function asJson(res: Response): Promise<unknown> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Request failed (${res.status}): ${text || res.statusText}`
    );
  }
  return res.json();
}

export async function getUserProfile(
  _uid: string
): Promise<UserProfile | null> {
  void _uid;
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as { user: UserProfile | null };
  return data.user ?? null;
}

export async function createUserProfile(_user: {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}): Promise<void> {
  // No-op: profiles are created server-side during signup / OAuth callback.
  void _user;
}

export async function updateUserProfile(
  _uid: string,
  updates: UserProfileUpdates
): Promise<void> {
  void _uid;
  const res = await fetch("/api/users/me", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  await asJson(res);
}
