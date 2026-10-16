// ─── "Which side did you play?" — inference + per-game persistence ───────
// The coach's playerColor used to be silently derived from board
// orientation (default: white). Founder feedback 2026-08-10: the coach
// must actually know which side the user played. Resolution order:
//   1. username match against the PGN White/Black headers (any known
//      handle — lichess, chess.com, display name);
//   2. a previously stored per-game answer (localStorage);
//   3. otherwise → null, and CoachPanel shows the inline two-button ask
//      before the first analysis request.
//
// Both the ask and the line that follows it name the players (founder
// feedback 2026-10-16): "White (hikaru)" rather than "White", because the
// reader knows which name is theirs before they know which colour it had.

import type { ProfileUsernames } from "@/lib/chessAccounts";

export type PlayerSideColor = "white" | "black";

export type PlayerSideSource = "username_match" | "stored_choice" | "user_choice";

export interface PlayerSide {
  color: PlayerSideColor;
  source: PlayerSideSource;
}

const STORAGE_KEY = "cm-analysis-player-sides";
const MAX_STORED_GAMES = 100;

/** Stable per-game key for persisting the user's side choice. Uses the
 *  players + date headers plus the ply count so two different games
 *  between the same players on the same day rarely collide, without
 *  hashing the whole PGN. Returns null when the game has no identity to
 *  key on (e.g. a bare FEN load with no moves). */
export function gameSideKey(
  headers: Record<string, string | null | undefined>,
  plyCount: number
): string | null {
  const white = headers.White?.trim();
  const black = headers.Black?.trim();
  if ((!white && !black) || plyCount === 0) return null;
  return [white ?? "?", black ?? "?", headers.Date?.trim() ?? "?", plyCount].join(
    "|"
  );
}

/** Case-insensitive exact match of any known username against the PGN
 *  White/Black headers. Broader than the old G13 check (which required a
 *  chess.com/lichess Site header): a pasted PGN whose header names the
 *  user still infers correctly. */
export function inferPlayerSideFromHeaders(
  headers: Record<string, string | null | undefined>,
  candidateUsernames: Array<string | undefined | null>
): PlayerSideColor | null {
  const white = headers.White?.trim().toLowerCase();
  const black = headers.Black?.trim().toLowerCase();
  for (const raw of candidateUsernames) {
    const candidate = raw?.trim().toLowerCase();
    if (!candidate) continue;
    if (white && candidate === white) return "white";
    if (black && candidate === black) return "black";
  }
  return null;
}

/**
 * The usernames that may be the reader's, strongest first: their saved
 * profile usernames, the ones this device remembers, the username the game
 * was fetched for, then the account's display name and email prefix.
 *
 * Their own names come before the fetched one because a game found through
 * someone else's list can still be the reader's own: looking through a
 * friend's games, they pick the one they played against that friend.
 */
export function playerSideCandidates(input: {
  profile?: ProfileUsernames | null;
  device?: Array<string | null | undefined>;
  fetchedFor?: string | null;
  displayName?: string | null;
  email?: string | null;
}): string[] {
  const all = [
    input.profile?.chesscomUsername,
    input.profile?.lichessUsername,
    ...(input.device ?? []),
    input.fetchedFor,
    input.displayName,
    input.email?.split("@")[0],
  ];
  return all
    .map((c) => c?.trim() ?? "")
    .filter((c): c is string => c.length > 0);
}

export interface SideNames {
  white: string | null;
  black: string | null;
}

/**
 * The name a PGN header gives a side, or null when it gives none worth
 * showing: empty, the "?" placeholder, or the colour itself
 * (`[White "White"]` would read "White (White)").
 */
export function sideDisplayName(
  raw: string | null | undefined,
  color: PlayerSideColor
): string | null {
  const name = raw?.trim();
  if (!name || name === "?") return null;
  if (name.toLowerCase() === color) return null;
  return name;
}

export function sideNamesFromHeaders(
  headers: Record<string, string | null | undefined>
): SideNames {
  return {
    white: sideDisplayName(headers.White, "white"),
    black: sideDisplayName(headers.Black, "black"),
  };
}

/** "White (hikaru)", or "White" when the game names nobody. */
export function sideLabel(color: PlayerSideColor, names: SideNames): string {
  const colour = color === "white" ? "White" : "Black";
  const name = names[color];
  return name ? `${colour} (${name})` : colour;
}

function readStore(): Record<string, PlayerSideColor> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, PlayerSideColor>;
    }
  } catch {
    /* corrupt or unavailable storage — treat as empty */
  }
  return {};
}

export function loadStoredSide(key: string | null): PlayerSideColor | null {
  if (!key) return null;
  const side = readStore()[key];
  return side === "white" || side === "black" ? side : null;
}

export function storeSide(key: string | null, color: PlayerSideColor): void {
  if (!key || typeof window === "undefined") return;
  try {
    const store = readStore();
    store[key] = color;
    // Cap the map so years of analyzed games don't grow the entry
    // unbounded — drop oldest-inserted keys first (object key order).
    const keys = Object.keys(store);
    if (keys.length > MAX_STORED_GAMES) {
      for (const k of keys.slice(0, keys.length - MAX_STORED_GAMES)) {
        delete store[k];
      }
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage full or unavailable — session state still holds the answer */
  }
}
