#!/usr/bin/env tsx
/**
 * load-real-user-history.ts — one-shot loader for the four chess.com
 * test users defined by Stage C O2 ratification. Fetches each user's
 * recent games via scoutFetch, transforms them into the UserHistoryGame
 * shape that userHistoryAggregates expects, and writes per-user JSON
 * cache files to scripts/synthetic-tester/fixtures/user_history_cache/.
 *
 * Cache is committed to git so collaborators get the same data.
 * Re-run with `--refresh-fixtures` to re-fetch from chess.com APIs;
 * otherwise the script is a no-op when caches already exist (use
 * `--force` to overwrite without the refresh-fixtures contract).
 *
 * Failure handling per O2 ratification:
 *   - chess.com rate-limits during load → retry with exponential
 *     backoff (1s, 2s, 4s).
 *   - Partial fetch for a user (fewer than expected games returned)
 *     → log the gap, write what we got, move on.
 *   - Whole-user fetch fails (all retries exhausted) → log the
 *     failure with the error, write an empty cache file marked
 *     loadFailed: true, continue with the other users.
 *
 * Runs against the live chess.com API only — no Anthropic cost.
 * See CATEGORY_GENERATOR_DESIGN.md §5 (O2) for the full workflow.
 *
 * Usage:
 *   npx tsx scripts/synthetic-tester/load-real-user-history.ts
 *   npx tsx scripts/synthetic-tester/load-real-user-history.ts --refresh-fixtures
 *   npx tsx scripts/synthetic-tester/load-real-user-history.ts --force
 *   npx tsx scripts/synthetic-tester/load-real-user-history.ts --users=gothamchess,Lazer_Wizard
 *   npx tsx scripts/synthetic-tester/load-real-user-history.ts --months=6 --max-games=100
 */

import { writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fetchOpponentGames } from "@/lib/server/scoutFetch";
import type { UserHistoryGame } from "@/lib/mastermind/userHistoryAggregates";
import type { ScoutGame } from "@/types/scout";

// ─────────────────────────────────────────────────────────────────────
// Config — defaults from CATEGORY_GENERATOR_DESIGN.md §5 (O2)
// ─────────────────────────────────────────────────────────────────────

interface TestUser {
  username: string;
  platform: "chess.com" | "lichess";
}

const TEST_USERS: TestUser[] = [
  { username: "Lazer_Wizard", platform: "chess.com" },
  { username: "JSNoverPuka", platform: "chess.com" },
  { username: "Chilllychess", platform: "chess.com" },
  { username: "gothamchess", platform: "chess.com" },
];

const DEFAULT_MONTHS = 12;
const DEFAULT_MAX_GAMES_PER_USER = 200;
const RETRY_BACKOFFS_MS = [1000, 2000, 4000];

const CACHE_DIR = join(
  __dirname,
  "fixtures",
  "user_history_cache",
);

// ─────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────

interface CliOpts {
  refresh: boolean;
  force: boolean;
  months: number;
  maxGames: number;
  users: TestUser[];
}

function parseArgs(argv: string[]): CliOpts {
  const out: CliOpts = {
    refresh: false,
    force: false,
    months: DEFAULT_MONTHS,
    maxGames: DEFAULT_MAX_GAMES_PER_USER,
    users: TEST_USERS,
  };
  for (const a of argv) {
    if (a === "--refresh-fixtures") out.refresh = true;
    else if (a === "--force") out.force = true;
    else if (a.startsWith("--months=")) out.months = parseInt(a.split("=")[1], 10);
    else if (a.startsWith("--max-games=")) out.maxGames = parseInt(a.split("=")[1], 10);
    else if (a.startsWith("--users=")) {
      const names = a.split("=")[1].split(",").map((s) => s.trim());
      out.users = TEST_USERS.filter((u) =>
        names.some((n) => n.toLowerCase() === u.username.toLowerCase()),
      );
      if (out.users.length === 0) {
        throw new Error(`--users=${a.split("=")[1]} matched none of: ${TEST_USERS.map((u) => u.username).join(", ")}`);
      }
    } else if (a === "--help" || a === "-h") {
      console.log(usage());
      process.exit(0);
    }
  }
  return out;
}

function usage(): string {
  return [
    "load-real-user-history.ts — Stage C user-history cache loader",
    "",
    "Usage:",
    "  npx tsx scripts/synthetic-tester/load-real-user-history.ts [flags]",
    "",
    "Flags:",
    "  --refresh-fixtures      Re-fetch even when cache exists (overwrite).",
    "  --force                 Same as --refresh-fixtures (sweep-team alias).",
    "  --months=N              chess.com archive window (default 12).",
    "  --max-games=N           Per-user cap on cached games (default 200).",
    "  --users=A,B,C           Subset of test users (default: all 4).",
    "  --help, -h              Show this.",
    "",
    `Cache directory: ${CACHE_DIR}`,
    `Test users: ${TEST_USERS.map((u) => u.username).join(", ")}`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────
// Fetch with retry
// ─────────────────────────────────────────────────────────────────────

async function fetchWithRetry(
  user: TestUser,
  months: number,
): Promise<{ games: ScoutGame[]; totalGames: number }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_BACKOFFS_MS.length; attempt++) {
    try {
      const payload = await fetchOpponentGames(
        user.username,
        user.platform,
        months,
      );
      return { games: payload.games, totalGames: payload.totalGames };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < RETRY_BACKOFFS_MS.length) {
        const backoff = RETRY_BACKOFFS_MS[attempt];
        console.warn(
          `  attempt ${attempt + 1} for ${user.username} failed: ${msg}; backing off ${backoff}ms`,
        );
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────────────────────────────
// ScoutGame → UserHistoryGame
// ─────────────────────────────────────────────────────────────────────

function formatPgnDate(epochMs: number): string {
  // PGN convention: "YYYY.MM.DD"
  const d = new Date(epochMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function buildMinimalPgn(g: ScoutGame): string {
  // Synthesize a PGN with the headers userHistoryCitation's
  // detectUserColor needs (White, Black) plus Result / TimeControl /
  // Date for downstream claim-type cross-checks. Full annotated PGN
  // is not required — validators read structured fields, not move
  // semantics from the synthesized string.
  const moves: string[] = [];
  for (let i = 0; i < g.moves.length; i++) {
    if (i % 2 === 0) moves.push(`${Math.floor(i / 2) + 1}.`);
    moves.push(g.moves[i]);
  }
  const movetext = moves.join(" ");
  return [
    `[Event "chess.com game ${g.id}"]`,
    `[Site "${g.platform}"]`,
    `[Date "${formatPgnDate(g.date)}"]`,
    `[White "${g.whiteUsername || "?"}"]`,
    `[Black "${g.blackUsername || "?"}"]`,
    `[Result "${g.result || "*"}"]`,
    `[TimeControl "${g.timeControl || "?"}"]`,
    g.whiteRating ? `[WhiteElo "${g.whiteRating}"]` : "",
    g.blackRating ? `[BlackElo "${g.blackRating}"]` : "",
    "",
    `${movetext} ${g.result || "*"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function scoutGameToUserHistoryGame(g: ScoutGame): UserHistoryGame {
  return {
    pgn: buildMinimalPgn(g),
    white: { name: g.whiteUsername },
    black: { name: g.blackUsername },
    result: g.result,
    timeControl: g.timeControl,
    date: formatPgnDate(g.date),
    createdAt: g.date, // ms-since-epoch — UserHistoryGame accepts number
  };
}

// ─────────────────────────────────────────────────────────────────────
// Cache file shape
// ─────────────────────────────────────────────────────────────────────

interface CacheFileSuccess {
  username: string;
  platform: "chess.com" | "lichess";
  loadedAt: string; // ISO
  totalFetchedFromApi: number;
  gamesCached: number;
  monthsRequested: number;
  games: UserHistoryGame[];
  loadFailed?: false;
}

interface CacheFileFailure {
  username: string;
  platform: "chess.com" | "lichess";
  loadedAt: string;
  loadFailed: true;
  error: string;
  games: [];
}

type CacheFile = CacheFileSuccess | CacheFileFailure;

function cachePath(username: string): string {
  return join(CACHE_DIR, `${username}.json`);
}

function isExistingCache(username: string): boolean {
  const p = cachePath(username);
  if (!existsSync(p)) return false;
  const s = statSync(p);
  return s.isFile() && s.size > 0;
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

async function loadUser(
  user: TestUser,
  opts: CliOpts,
): Promise<{ summary: string; cache: CacheFile }> {
  const wantOverwrite = opts.refresh || opts.force;
  if (!wantOverwrite && isExistingCache(user.username)) {
    return {
      summary: `  ⏭️  ${user.username}: cache exists at ${cachePath(user.username)} (skip — use --refresh-fixtures to overwrite)`,
      cache: null as unknown as CacheFile, // not written; signal skip
    };
  }

  console.log(`  ↓ Fetching ${user.username}@${user.platform} (${opts.months} months)...`);
  try {
    const { games, totalGames } = await fetchWithRetry(user, opts.months);
    // Sort newest first, then cap. Per O2 ratification 200 default.
    const sorted = [...games].sort((a, b) => b.date - a.date);
    const capped = sorted.slice(0, opts.maxGames);
    const transformed = capped.map(scoutGameToUserHistoryGame);

    const cache: CacheFileSuccess = {
      username: user.username,
      platform: user.platform,
      loadedAt: new Date().toISOString(),
      totalFetchedFromApi: totalGames,
      gamesCached: transformed.length,
      monthsRequested: opts.months,
      games: transformed,
    };

    mkdirSync(CACHE_DIR, { recursive: true });
    const p = cachePath(user.username);
    writeFileSync(p, JSON.stringify(cache, null, 2));
    const partial = totalGames > capped.length ? ` (capped from ${totalGames})` : "";
    return {
      summary: `  ✓ ${user.username}: ${transformed.length} games${partial} → ${p}`,
      cache,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const failureCache: CacheFileFailure = {
      username: user.username,
      platform: user.platform,
      loadedAt: new Date().toISOString(),
      loadFailed: true,
      error: msg,
      games: [],
    };
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath(user.username), JSON.stringify(failureCache, null, 2));
    return {
      summary: `  ✗ ${user.username}: load FAILED — ${msg}`,
      cache: failureCache,
    };
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  console.log("load-real-user-history.ts (Stage C user-history cache loader)");
  console.log(`  Cache dir: ${CACHE_DIR}`);
  console.log(`  Users: ${opts.users.map((u) => `${u.username}@${u.platform}`).join(", ")}`);
  console.log(`  Months: ${opts.months}, Max games: ${opts.maxGames}`);
  console.log(`  Refresh existing: ${opts.refresh || opts.force ? "yes" : "no"}`);
  console.log("");

  const summaries: string[] = [];
  for (const user of opts.users) {
    const res = await loadUser(user, opts);
    summaries.push(res.summary);
    console.log(res.summary);
  }

  console.log("");
  console.log("=== Summary ===");
  for (const s of summaries) console.log(s);
  console.log("");
  console.log("Next: commit fixtures/user_history_cache/ to git so collaborators share the same data.");
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
