/**
 * userHistoryAggregates — PR 1.C Stage A.7
 *
 * Three pure functions that aggregate the user's played-game history into
 * data shapes Stage A.8's `userHistoryCitation` validator will cross-check
 * coach claims against:
 *
 *   - aggregateWinRateByTimeControl  → TimeControlPerformance[]
 *   - aggregateScoreByOpening        → OpeningRepertoirePerformance[]
 *   - countGamesInDateRange          → GameCountInRange
 *
 * Plan: MASTERMIND_CONTEXT/PR_1C_USER_HISTORY_AGGREGATES_PLAN.md
 *
 * Reads the existing Firestore `users/{uid}/games` shape (Game type from
 * `src/types/game.ts`) without requiring new collections or migrations.
 * The three claim types deferred to PR 1.E (rating_trajectory,
 * puzzle_stats_claim, puzzle_rating_trajectory) depend on localStorage-
 * only state and are NOT in scope here.
 *
 * No I/O, no async, no LLM. The route handler that calls these aggregators
 * is responsible for fetching games via Firebase Admin and passing them in.
 */

import type { Game } from "@/types/game";
import { extractPgnHeaders } from "@/lib/utils/pgnHeaders";

// ─────────────────────────────────────────────────────────────────────────
// Input type
// ─────────────────────────────────────────────────────────────────────────

/**
 * The minimum game shape the aggregators consume. Accepts both `Game`
 * (in-memory shape) and Firestore `CloudGame` (server-stored shape with
 * `createdAt`). Pure-function helpers stay loosely coupled to the wider
 * Game schema; only the fields used here are required.
 */
export interface UserHistoryGame {
  pgn: string;
  white: { name?: string };
  black: { name?: string };
  result?: string;
  timeControl?: string;
  /** PGN "Date" header, format "YYYY.MM.DD" by convention. Fallback only. */
  date?: string;
  /**
   * Firestore server timestamp — preferred over PGN `date` for range
   * queries because it's absolute server-truth. Two shapes accepted:
   * - JSON-serialized Firestore Admin response: `{ _seconds, _nanoseconds }`
   * - In-process Firestore Timestamp object: `{ seconds, nanoseconds }`
   * - Already-converted ms-since-epoch: `number`
   */
  createdAt?:
    | { _seconds: number; _nanoseconds?: number }
    | { seconds: number; nanoseconds?: number }
    | number;
}

// ─────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Resolve which color the user played in a given game.
 *
 * Matching is case-insensitive *substring*: `"Aayan"` matches `"Aayan_K"`
 * (Lichess username with suffix), `"aayanhetam"`, `"AAYAN"`, etc. Per
 * Aayan 2026-05-18 (Stage A.7 plan T3): substring is intentional — single-
 * platform single-identifier MVP for personal datasets. The known failure
 * mode is collision (e.g., `"aayan"` would match `"raayan_99"`); accepted
 * as low-probability for personal use. If Stage C sweep surfaces a real
 * collision, the fix is to require exact-token match or username-anchor
 * at start; decision made then with data, not now.
 */
function detectUserColor(
  game: UserHistoryGame,
  userName: string
): "white" | "black" | null {
  const needle = userName.toLowerCase().trim();
  if (!needle) return null;
  const w = game.white?.name?.toLowerCase() ?? "";
  const b = game.black?.name?.toLowerCase() ?? "";
  if (w.includes(needle)) return "white";
  if (b.includes(needle)) return "black";
  return null;
}

function outcomeFor(
  result: string | undefined,
  userColor: "white" | "black"
): "win" | "draw" | "loss" | null {
  if (!result) return null;
  if (result === "1/2-1/2") return "draw";
  if (result === "1-0") return userColor === "white" ? "win" : "loss";
  if (result === "0-1") return userColor === "black" ? "win" : "loss";
  // "*" (unfinished) or any other shape — not counted.
  return null;
}

function scorePct(wins: number, draws: number, losses: number): number {
  const total = wins + draws + losses;
  if (total === 0) return 0;
  return ((wins + 0.5 * draws) / total) * 100;
}

// ─────────────────────────────────────────────────────────────────────────
// §2.1 aggregateWinRateByTimeControl
// ─────────────────────────────────────────────────────────────────────────

export interface TimeControlPerformance {
  /** Verbatim timeControl string. Bucketed by exact match (no normalization). */
  timeControl: string;
  totalGames: number;
  wins: number;
  draws: number;
  losses: number;
  /** 0–100. (wins + 0.5 × draws) / totalGames × 100. */
  scorePct: number;
}

export function aggregateWinRateByTimeControl(
  games: UserHistoryGame[],
  userName: string
): TimeControlPerformance[] {
  if (!userName.trim()) return [];

  const buckets = new Map<string, { wins: number; draws: number; losses: number }>();
  for (const g of games) {
    if (!g.timeControl) continue;
    const userColor = detectUserColor(g, userName);
    if (!userColor) continue;
    const outcome = outcomeFor(g.result, userColor);
    if (!outcome) continue;
    let b = buckets.get(g.timeControl);
    if (!b) {
      b = { wins: 0, draws: 0, losses: 0 };
      buckets.set(g.timeControl, b);
    }
    if (outcome === "win") b.wins++;
    else if (outcome === "draw") b.draws++;
    else b.losses++;
  }

  const result: TimeControlPerformance[] = [];
  buckets.forEach((counts, timeControl) => {
    const total = counts.wins + counts.draws + counts.losses;
    if (total === 0) return;
    result.push({
      timeControl,
      totalGames: total,
      wins: counts.wins,
      draws: counts.draws,
      losses: counts.losses,
      scorePct: scorePct(counts.wins, counts.draws, counts.losses),
    });
  });
  result.sort((a, b) => b.totalGames - a.totalGames);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// §2.2 aggregateScoreByOpening
// ─────────────────────────────────────────────────────────────────────────

export interface OpeningRepertoirePerformance {
  /** PGN "ECO" header, uppercased. Empty string when ECO absent. */
  eco: string;
  /** PGN "Opening" header. Empty string when absent. */
  opening: string;
  /** PGN "Variation" header, optional. */
  variation?: string;
  /** The color the user played in these games. */
  color: "white" | "black";
  totalGames: number;
  wins: number;
  draws: number;
  losses: number;
  scorePct: number;
}

interface OpeningBucket {
  eco: string;
  opening: string;
  variation?: string;
  color: "white" | "black";
  wins: number;
  draws: number;
  losses: number;
}

export function aggregateScoreByOpening(
  games: UserHistoryGame[],
  userName: string,
  color?: "white" | "black"
): OpeningRepertoirePerformance[] {
  if (!userName.trim()) return [];

  const buckets = new Map<string, OpeningBucket>();
  for (const g of games) {
    const userColor = detectUserColor(g, userName);
    if (!userColor) continue;
    if (color && userColor !== color) continue;
    const headers = extractPgnHeaders(g.pgn);
    const eco = (headers.ECO ?? "").toUpperCase();
    const opening = headers.Opening ?? "";
    const variation = headers.Variation;
    if (!eco && !opening) continue;
    const outcome = outcomeFor(g.result, userColor);
    if (!outcome) continue;
    // Color in the key so same opening played as both colors → 2 buckets
    // (per plan §2.2 + T5 — coaching-relevant distinction).
    const key = `${eco}:${opening}:${variation ?? ""}:${userColor}`;
    let b = buckets.get(key);
    if (!b) {
      b = { eco, opening, variation, color: userColor, wins: 0, draws: 0, losses: 0 };
      buckets.set(key, b);
    }
    if (outcome === "win") b.wins++;
    else if (outcome === "draw") b.draws++;
    else b.losses++;
  }

  const result: OpeningRepertoirePerformance[] = [];
  buckets.forEach((b) => {
    const total = b.wins + b.draws + b.losses;
    if (total === 0) return;
    result.push({
      eco: b.eco,
      opening: b.opening,
      variation: b.variation,
      color: b.color,
      totalGames: total,
      wins: b.wins,
      draws: b.draws,
      losses: b.losses,
      scorePct: scorePct(b.wins, b.draws, b.losses),
    });
  });
  result.sort((a, b) => b.totalGames - a.totalGames);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// §2.3 countGamesInDateRange
// ─────────────────────────────────────────────────────────────────────────

export interface GameCountInRange {
  count: number;
  fromMs: number;
  toMs: number;
  /** Games excluded from count because they lacked a usable date. */
  skippedNoDate: number;
}

export function countGamesInDateRange(
  games: UserHistoryGame[],
  fromMs: number,
  toMs: number
): GameCountInRange {
  if (fromMs > toMs) {
    // Inverted range — don't throw; let the validator surface if needed.
    return { count: 0, fromMs, toMs, skippedNoDate: 0 };
  }

  let count = 0;
  let skippedNoDate = 0;
  for (const g of games) {
    const dateMs = deriveGameDateMs(g);
    if (dateMs === null) {
      skippedNoDate++;
      continue;
    }
    if (dateMs >= fromMs && dateMs <= toMs) count++;
  }
  return { count, fromMs, toMs, skippedNoDate };
}

/**
 * Resolve a game's date to ms-since-epoch. Preference order:
 *   1. `createdAt` (Firestore-server timestamp — most reliable)
 *   2. PGN `date` header (string format YYYY.MM.DD — fallback only;
 *      skipped for the "????.??.??" sentinel)
 */
function deriveGameDateMs(game: UserHistoryGame): number | null {
  const ca = game.createdAt;
  if (ca !== undefined && ca !== null) {
    if (typeof ca === "number") return ca;
    if (typeof ca === "object") {
      const obj = ca as { _seconds?: number; seconds?: number };
      if (typeof obj._seconds === "number") return obj._seconds * 1000;
      if (typeof obj.seconds === "number") return obj.seconds * 1000;
    }
  }
  if (game.date && game.date !== "????.??.??") {
    const parts = game.date.split(/[.\-/]/);
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (
        !isNaN(year) && !isNaN(month) && !isNaN(day) &&
        year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31
      ) {
        return Date.UTC(year, month - 1, day);
      }
    }
  }
  return null;
}
