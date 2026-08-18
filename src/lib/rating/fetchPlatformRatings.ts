/**
 * Network layer for platform rating lookup. Kept apart from the parsing in
 * `platformRatings.ts` so the resolution rules stay pure and unit-testable
 * without a network stub.
 *
 * SERVER-SIDE ONLY, on purpose. Per CLAUDE.md the browser does not talk to
 * third parties directly — school networks filter them, and routing through
 * chessmasti.com is the established pattern for exactly this reason.
 */

import {
  parseLichessRatings,
  parseChessComRatings,
  type PlatformRatings,
  type LichessUserResponse,
  type ChessComStatsResponse,
} from "./platformRatings";

/** Per-request ceiling. Both APIs are normally <300ms; this is a stall guard. */
const FETCH_TIMEOUT_MS = 6_000;

/** Chess.com blocks requests without a descriptive User-Agent. */
const USER_AGENT = "chessmasti.com rating lookup (contact: chessmastiprivacy@gmail.com)";

export type LookupOutcome =
  | { status: "ok"; ratings: PlatformRatings }
  /** The username does not exist on that platform — surface it, do not guess. */
  | { status: "not_found" }
  /** Platform unreachable, rate-limited, or malformed. Distinct from not_found. */
  | { status: "unavailable"; reason: string };

/**
 * Usernames are user-supplied and go straight into a URL path. Both platforms
 * allow only these characters, so anything else is rejected before we build the
 * request rather than being escaped into it.
 */
const USERNAME_RE = /^[A-Za-z0-9_-]{1,30}$/;

export function isValidUsername(name: string): boolean {
  return USERNAME_RE.test(name);
}

async function getJson(
  url: string
): Promise<{ ok: true; body: unknown } | { ok: false; outcome: LookupOutcome }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (res.status === 404) return { ok: false, outcome: { status: "not_found" } };
    if (!res.ok) {
      return {
        ok: false,
        outcome: { status: "unavailable", reason: `HTTP ${res.status}` },
      };
    }
    return { ok: true, body: await res.json() };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? `timeout after ${FETCH_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : "unknown error";
    return { ok: false, outcome: { status: "unavailable", reason } };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLichessRatings(username: string): Promise<LookupOutcome> {
  if (!isValidUsername(username)) return { status: "not_found" };
  const r = await getJson(`https://lichess.org/api/user/${encodeURIComponent(username)}`);
  if (!r.ok) return r.outcome;
  const body = r.body as LichessUserResponse;
  // A closed or TOS-banned account still returns 200 with stale perfs.
  if (body?.disabled || body?.tosViolation) return { status: "not_found" };
  return { status: "ok", ratings: parseLichessRatings(username, body) };
}

export async function fetchChessComRatings(username: string): Promise<LookupOutcome> {
  if (!isValidUsername(username)) return { status: "not_found" };
  const r = await getJson(
    `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/stats`
  );
  if (!r.ok) return r.outcome;
  return {
    status: "ok",
    ratings: parseChessComRatings(username, r.body as ChessComStatsResponse),
  };
}

export function fetchRatingsFor(
  platform: "lichess" | "chesscom",
  username: string
): Promise<LookupOutcome> {
  return platform === "lichess"
    ? fetchLichessRatings(username)
    : fetchChessComRatings(username);
}
