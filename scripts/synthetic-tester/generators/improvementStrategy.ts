/**
 * improvement_strategy generator. Picks one of the four chess.com test
 * users (the ones with user_history_cache fixtures populated by
 * load-real-user-history.ts), computes a quick aggregate summary of
 * their recent play (time controls, openings, win rate), and asks
 * the improvement_seeker persona to generate a concrete improvement
 * question anchored on the patterns visible in that user's data.
 *
 * Sets bodyExtensions.username so the route's flag-on Firestore-fetch
 * can route to the cached games (route-side stub-mode wiring is the
 * deviation flagged for live sweep — see Step 2.3.2 commit body).
 */

import { type Generator, type UserHistoryCacheFile, pickOne } from "./index";

const PERSONA_NAME = "improvement_seeker";

interface UserSummary {
  username: string;
  totalGames: number;
  byTimeControl: Record<string, { count: number; wins: number; losses: number; draws: number }>;
  recentResultsString: string;
}

function summarizeHistory(cache: UserHistoryCacheFile): UserSummary {
  const byTimeControl: UserSummary["byTimeControl"] = {};
  let recentResults: string[] = [];

  for (const g of cache.games) {
    const tc = g.timeControl || "unknown";
    if (!byTimeControl[tc]) byTimeControl[tc] = { count: 0, wins: 0, losses: 0, draws: 0 };
    byTimeControl[tc].count++;

    // Detect user color by username substring match (Stage A.7 detectUserColor pattern).
    const userLower = cache.username.toLowerCase();
    const isWhite = (g.white.name || "").toLowerCase().includes(userLower);
    const isBlack = (g.black.name || "").toLowerCase().includes(userLower);

    if (g.result === "1-0") {
      if (isWhite) byTimeControl[tc].wins++;
      else if (isBlack) byTimeControl[tc].losses++;
    } else if (g.result === "0-1") {
      if (isWhite) byTimeControl[tc].losses++;
      else if (isBlack) byTimeControl[tc].wins++;
    } else if (g.result === "1/2-1/2") {
      byTimeControl[tc].draws++;
    }
  }

  // Build a 1-line recent-results string (W/L/D from the user's perspective for the
  // 10 most-recent games).
  const userLower = cache.username.toLowerCase();
  for (const g of cache.games.slice(0, 10)) {
    const isWhite = (g.white.name || "").toLowerCase().includes(userLower);
    const isBlack = (g.black.name || "").toLowerCase().includes(userLower);
    if (g.result === "1-0") recentResults.push(isWhite ? "W" : isBlack ? "L" : "?");
    else if (g.result === "0-1") recentResults.push(isWhite ? "L" : isBlack ? "W" : "?");
    else if (g.result === "1/2-1/2") recentResults.push("D");
    else recentResults.push("?");
  }

  return {
    username: cache.username,
    totalGames: cache.games.length,
    byTimeControl,
    recentResultsString: recentResults.join(""),
  };
}

function formatSummary(s: UserSummary): string {
  const lines: string[] = [
    `Your username: ${s.username}`,
    `Total recent games in cache: ${s.totalGames}`,
    `Recent results (last 10): ${s.recentResultsString} (W=win, L=loss, D=draw)`,
    "",
    "Win rates by time control:",
  ];
  const tcs = Object.entries(s.byTimeControl)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6); // top 6 most-played time controls
  for (const [tc, stats] of tcs) {
    const total = stats.count;
    const winPct = total > 0 ? ((stats.wins / total) * 100).toFixed(0) : "0";
    const drawPct = total > 0 ? ((stats.draws / total) * 100).toFixed(0) : "0";
    lines.push(`  ${tc}: ${stats.count} games — W ${stats.wins} / L ${stats.losses} / D ${stats.draws} (${winPct}% win, ${drawPct}% draw)`);
  }
  return lines.join("\n");
}

export const improvementStrategyGenerator: Generator = async (ctx) => {
  const personaPrompt = ctx.personas[PERSONA_NAME];
  if (!personaPrompt) {
    throw new Error(
      `improvementStrategyGenerator: ${PERSONA_NAME} persona not loaded`,
    );
  }
  const availableUsers = Object.keys(ctx.fixtures.userHistories).filter(
    (u) => !ctx.fixtures.userHistories[u].loadFailed && ctx.fixtures.userHistories[u].games.length > 0,
  );
  if (availableUsers.length === 0) {
    throw new Error(
      "improvementStrategyGenerator: no user_history fixtures available — run scripts/synthetic-tester/load-real-user-history.ts first",
    );
  }

  const chosenUsername = pickOne(ctx.rng, availableUsers);
  const cache = ctx.fixtures.userHistories[chosenUsername];
  const summary = summarizeHistory(cache);
  const summaryBlock = formatSummary(summary);

  const userPrompt = [
    summaryBlock,
    "",
    "Ask ONE concrete improvement question about your trajectory, in the improvement_seeker persona's voice.",
    "Anchor on a pattern visible in the data above (time-control gap, win-rate dip, draw-heavy time control, etc.).",
    "Reply with ONLY the message text.",
  ].join("\n");

  const res = await ctx.llmCall({
    systemPrompt: personaPrompt,
    userPrompt,
    generatorTag: "improvementStrategy",
  });
  if (!res.ok) {
    throw new Error(
      `improvementStrategyGenerator LLM call failed: ${res.errorMessage || "unknown error"}`,
    );
  }

  return {
    question: res.text,
    personaUsed: PERSONA_NAME,
    bodyExtensions: {
      // The route's flag-on user-history fetch uses session.uid for the
      // Firestore lookup; the harness sets `username` on the request body
      // as the user's chess.com handle (used by detectUserColor downstream).
      username: chosenUsername,
    },
    metadata: {
      username: chosenUsername,
      total_games_in_cache: summary.totalGames,
      time_controls_in_cache: Object.keys(summary.byTimeControl).length,
    },
  };
};
