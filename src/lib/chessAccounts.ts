// The reader's own Chess.com and Lichess usernames.
//
// A signed-in reader's live on the profile (`chesscomUsername` /
// `lichessUsername`), which /profile shows and edits. A signed-out reader's are
// remembered on the device under the keys the old load-game inputs wrote with
// `useLocalStorage`, so the stored value is JSON (`"hikaru"`, quotes included).
// The side inference on /analysis reads both.
//
// Saved by use: the first username a reader loads a game from on a platform
// becomes theirs. From then on the load dialog opens on it, and a different
// name typed there is a lookup, not a change. The change is made in /profile.

import type { UserProfile } from "@/lib/firestoreUsers";

export type ChessPlatform = "chesscom" | "lichess";

export const PLATFORM_NAME: Record<ChessPlatform, string> = {
  chesscom: "Chess.com",
  lichess: "Lichess",
};

export const PROFILE_FIELD = {
  chesscom: "chesscomUsername",
  lichess: "lichessUsername",
} as const satisfies Record<ChessPlatform, keyof UserProfile>;

export const DEVICE_KEY: Record<ChessPlatform, string> = {
  chesscom: "chesscom-username",
  lichess: "lichess-username",
};

export type ProfileUsernames = Pick<
  UserProfile,
  "chesscomUsername" | "lichessUsername"
>;

/** The profile's username for a platform, trimmed; "" when it has none. */
export function profileUsername(
  profile: ProfileUsernames | null | undefined,
  platform: ChessPlatform
): string {
  return profile?.[PROFILE_FIELD[platform]]?.trim() ?? "";
}

/** The username this device remembers for a platform; "" when none. */
export function readDeviceUsername(platform: ChessPlatform): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(DEVICE_KEY[platform]);
    if (!raw) return "";
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === "string" || typeof parsed === "number"
        ? String(parsed).trim()
        : "";
    } catch {
      // Written bare by something other than useLocalStorage.
      return raw.trim();
    }
  } catch {
    return "";
  }
}

export function writeDeviceUsername(
  platform: ChessPlatform,
  username: string
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DEVICE_KEY[platform],
      JSON.stringify(username.trim())
    );
  } catch {
    /* storage full or blocked: the dialog just opens empty next time */
  }
}

/** The username the load dialog opens with: the profile's, else the device's. */
export function savedUsername(
  platform: ChessPlatform,
  profile: ProfileUsernames | null | undefined,
  deviceValue: string
): string {
  return profileUsername(profile, platform) || deviceValue.trim();
}

/**
 * What we know about who is reading. "loading" covers the moment between the
 * cached account painting and /api/auth/me answering, when the profile (and
 * so whether a username is already saved) is not known yet.
 */
export type AccountState = "loading" | "signed-out" | "signed-in";

/**
 * Where loading a game from `username` should save that name as the reader's
 * own: the profile for a signed-in reader with none saved for the platform,
 * the device for a signed-out reader with none remembered, and nowhere when
 * one is already saved (a different name is a lookup) or while the account is
 * still loading (saving then could overwrite a name the profile already has).
 */
export function rememberTarget(input: {
  account: AccountState;
  profileValue: string;
  deviceValue: string;
  username: string;
}): "profile" | "device" | null {
  if (!input.username.trim()) return null;
  if (input.account === "loading") return null;
  if (input.account === "signed-in") {
    return input.profileValue.trim() ? null : "profile";
  }
  return input.deviceValue.trim() ? null : "device";
}

/** The two usernames compared the way both platforms compare them. */
export function sameUsername(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** A username on a platform: whose games a reader loaded one from. */
export interface PlatformUsername {
  platform: ChessPlatform;
  username: string;
}

/** The note shown once a username has been saved to the profile. */
export function usernameSavedMessage({
  platform,
  username,
}: PlatformUsername): string {
  return `Saved ${username} as your ${PLATFORM_NAME[platform]} username. Change it any time in Profile.`;
}
