import type { RecentGame } from "./recentGames";

/**
 * "Last N games" summaries, the games-side twin of `puzzleWindow`.
 *
 * Same reasoning as the puzzle windows: a recency view is the marginal angle
 * ("how am I playing now") and the widest window is the total. The windows are
 * smaller here because both platform fetchers cap at 50 games, so offering
 * "last 100" would be a promise the data cannot keep.
 */

export const GAME_WINDOWS = [10, 25, 50] as const;
export type GameWindow = (typeof GAME_WINDOWS)[number];

export interface SplitRecord {
  wins: number;
  draws: number;
  losses: number;
  /** 0-100 over DECIDED games, or null when nothing decided. */
  winRate: number | null;
}

export interface GameSummary {
  window: GameWindow;
  /** Games that informed this summary. */
  sampleSize: number;
  /** True when the window asked for more games than we hold. */
  truncated: boolean;
  wins: number;
  draws: number;
  losses: number;
  /**
   * Games whose result we could not derive — unfinished ("*"), or played by a
   * username that matches neither seat. Counted separately and never folded
   * into losses.
   */
  undecided: number;
  /** 0-100 over decided games only, or null when none are decided. */
  winRate: number | null;
  asWhite: SplitRecord;
  asBlack: SplitRecord;
  /** Per time-control record, most-played first. */
  bySpeed: Array<{ speed: string } & SplitRecord & { games: number }>;
}

/**
 * Win rate over DECIDED games.
 *
 * Draws stay in the denominator — a draw is a real result you played to. Games
 * with no derivable result do not, because dividing by them would quietly
 * depress the number every time a game is still in progress.
 */
function rate(r: {
  wins: number;
  draws: number;
  losses: number;
}): number | null {
  const decided = r.wins + r.draws + r.losses;
  if (decided <= 0) return null;
  return Math.round((r.wins / decided) * 100);
}

function tally(
  into: { wins: number; draws: number; losses: number },
  result: RecentGame["result"]
): void {
  if (result === "win") into.wins++;
  else if (result === "draw") into.draws++;
  else if (result === "loss") into.losses++;
}

/**
 * Summarise the most recent `window` games.
 *
 * `games` is expected newest-first (which is what `mergeRecentGames` returns).
 * Asking for more games than exist returns every game and flags `truncated`,
 * so every oversized window agrees — the same collapse rule the puzzle windows
 * follow.
 */
export function summarizeGameWindow(
  games: RecentGame[],
  window: GameWindow
): GameSummary {
  const slice = games.slice(0, window);

  const overall = { wins: 0, draws: 0, losses: 0 };
  const white = { wins: 0, draws: 0, losses: 0 };
  const black = { wins: 0, draws: 0, losses: 0 };
  const speeds = new Map<
    string,
    { wins: number; draws: number; losses: number; games: number }
  >();
  let undecided = 0;

  for (const g of slice) {
    if (!g.result) undecided++;
    tally(overall, g.result);
    if (g.playerColor === "white") tally(white, g.result);
    else if (g.playerColor === "black") tally(black, g.result);

    const speed = g.speed || "other";
    const s = speeds.get(speed) ?? { wins: 0, draws: 0, losses: 0, games: 0 };
    s.games++;
    tally(s, g.result);
    speeds.set(speed, s);
  }

  return {
    window,
    sampleSize: slice.length,
    truncated: slice.length < window,
    ...overall,
    undecided,
    winRate: rate(overall),
    asWhite: { ...white, winRate: rate(white) },
    asBlack: { ...black, winRate: rate(black) },
    bySpeed: Array.from(speeds.entries())
      .map(([speed, s]) => ({ speed, ...s, winRate: rate(s) }))
      .sort((a, b) => b.games - a.games),
  };
}

/**
 * Human label for a result, used on the game rows.
 * Undefined result reads "—", never "Loss".
 */
export function resultLabel(result: RecentGame["result"]): string {
  if (result === "win") return "Win";
  if (result === "loss") return "Loss";
  if (result === "draw") return "Draw";
  return "—";
}
