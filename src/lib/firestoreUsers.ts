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
export type StudyGoal = "tactics" | "endgames" | "openings" | "time-management";
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

  boardTheme?: BoardTheme;
  pieceSet?: PieceSet;

  createdAt?: unknown;
  updatedAt?: unknown;
}

export type UserProfileUpdates = Partial<
  Omit<UserProfile, "uid" | "email" | "rating" | "createdAt" | "updatedAt" | "photoURL">
>;

async function asJson(res: Response): Promise<unknown> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json();
}

export async function getUserProfile(_uid: string): Promise<UserProfile | null> {
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
