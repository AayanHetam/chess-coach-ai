import { atomWithStorage } from "jotai/utils";

/**
 * Multi-game strength/weakness profiling.
 * Aggregates data across games to identify patterns in the player's performance.
 */

export interface GameRecord {
  id: string;
  date: number;
  result: "win" | "draw" | "loss";
  playerColor: "white" | "black";
  opening: string;
  totalMoves: number;
  accuracy: number;
  openingAccuracy: number;
  middlegameAccuracy: number;
  endgameAccuracy: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  missedThemes: string[];
}

export interface PlayerProfile {
  totalGames: number;
  wins: number;
  draws: number;
  losses: number;
  avgAccuracy: number;
  avgOpeningAccuracy: number;
  avgMiddlegameAccuracy: number;
  avgEndgameAccuracy: number;
  weakestPhase: "opening" | "middlegame" | "endgame";
  strongestPhase: "opening" | "middlegame" | "endgame";
  totalBlunders: number;
  totalMistakes: number;
  blundersPerGame: number;
  mistakesPerGame: number;
  frequentMissedThemes: { theme: string; count: number }[];
  recentGames: GameRecord[];
  openingStats: Record<string, { games: number; wins: number; accuracy: number }>;
}

const DEFAULT_PROFILE_DATA: GameRecord[] = [];

/**
 * Persistent storage for game records used in profiling.
 */
export const gameRecordsAtom = atomWithStorage<GameRecord[]>(
  "chessMastiGameRecords",
  DEFAULT_PROFILE_DATA
);

/**
 * Build a player profile from game records.
 */
export function buildProfile(games: GameRecord[]): PlayerProfile {
  if (games.length === 0) {
    return {
      totalGames: 0,
      wins: 0, draws: 0, losses: 0,
      avgAccuracy: 0,
      avgOpeningAccuracy: 0,
      avgMiddlegameAccuracy: 0,
      avgEndgameAccuracy: 0,
      weakestPhase: "opening",
      strongestPhase: "opening",
      totalBlunders: 0,
      totalMistakes: 0,
      blundersPerGame: 0,
      mistakesPerGame: 0,
      frequentMissedThemes: [],
      recentGames: [],
      openingStats: {},
    };
  }

  const n = games.length;
  const wins = games.filter((g) => g.result === "win").length;
  const draws = games.filter((g) => g.result === "draw").length;
  const losses = games.filter((g) => g.result === "loss").length;

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const avgAccuracy = Math.round(avg(games.map((g) => g.accuracy)) * 10) / 10;
  const avgOpening = Math.round(avg(games.map((g) => g.openingAccuracy)) * 10) / 10;
  const avgMiddle = Math.round(avg(games.map((g) => g.middlegameAccuracy)) * 10) / 10;
  const avgEndgame = Math.round(avg(games.map((g) => g.endgameAccuracy)) * 10) / 10;

  const phaseScores = { opening: avgOpening, middlegame: avgMiddle, endgame: avgEndgame };
  const phases = Object.entries(phaseScores) as [keyof typeof phaseScores, number][];
  phases.sort((a, b) => a[1] - b[1]);
  const weakestPhase = phases[0][0];
  const strongestPhase = phases[phases.length - 1][0];

  const totalBlunders = games.reduce((acc, g) => acc + g.blunders, 0);
  const totalMistakes = games.reduce((acc, g) => acc + g.mistakes, 0);

  // Count missed themes
  const themeCount: Record<string, number> = {};
  for (const g of games) {
    for (const theme of g.missedThemes) {
      themeCount[theme] = (themeCount[theme] || 0) + 1;
    }
  }
  const frequentMissedThemes = Object.entries(themeCount)
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Opening stats
  const openingStats: Record<string, { games: number; wins: number; totalAccuracy: number }> = {};
  for (const g of games) {
    const key = g.opening || "Unknown";
    if (!openingStats[key]) openingStats[key] = { games: 0, wins: 0, totalAccuracy: 0 };
    openingStats[key].games++;
    if (g.result === "win") openingStats[key].wins++;
    openingStats[key].totalAccuracy += g.accuracy;
  }

  const openingStatsResult: Record<string, { games: number; wins: number; accuracy: number }> = {};
  for (const [key, val] of Object.entries(openingStats)) {
    openingStatsResult[key] = {
      games: val.games,
      wins: val.wins,
      accuracy: Math.round((val.totalAccuracy / val.games) * 10) / 10,
    };
  }

  return {
    totalGames: n,
    wins, draws, losses,
    avgAccuracy,
    avgOpeningAccuracy: avgOpening,
    avgMiddlegameAccuracy: avgMiddle,
    avgEndgameAccuracy: avgEndgame,
    weakestPhase,
    strongestPhase,
    totalBlunders,
    totalMistakes,
    blundersPerGame: Math.round((totalBlunders / n) * 10) / 10,
    mistakesPerGame: Math.round((totalMistakes / n) * 10) / 10,
    frequentMissedThemes,
    recentGames: games.slice(-20).reverse(),
    openingStats: openingStatsResult,
  };
}

/**
 * Generate training recommendations from a player profile.
 */
export function generateRecommendations(profile: PlayerProfile): string[] {
  const recs: string[] = [];

  if (profile.totalGames === 0) {
    return ["Play some games and analyze them to get personalized recommendations!"];
  }

  // Phase-based
  if (profile.avgOpeningAccuracy < profile.avgMiddlegameAccuracy && profile.avgOpeningAccuracy < profile.avgEndgameAccuracy) {
    recs.push("Your opening play is the weakest phase. Practice opening drills to build a reliable repertoire.");
  }
  if (profile.avgEndgameAccuracy < profile.avgOpeningAccuracy && profile.avgEndgameAccuracy < profile.avgMiddlegameAccuracy) {
    recs.push("Your endgame is the weakest phase. Focus on endgame puzzles and study basic endgame patterns.");
  }
  if (profile.avgMiddlegameAccuracy < 60) {
    recs.push("Your middlegame accuracy needs work. Focus on tactical puzzles to sharpen your calculation.");
  }

  // Blunder-based
  if (profile.blundersPerGame >= 2) {
    recs.push(`You average ${profile.blundersPerGame} blunders per game. Slow down and check for opponent threats before each move.`);
  }

  // Theme-based
  if (profile.frequentMissedThemes.length > 0) {
    const topThemes = profile.frequentMissedThemes.slice(0, 3).map((t) => t.theme);
    recs.push(`You frequently miss ${topThemes.join(", ")} tactics. Practice these specific themes in the puzzle trainer.`);
  }

  // Win rate
  const winRate = profile.totalGames > 0 ? (profile.wins / profile.totalGames) * 100 : 0;
  if (winRate < 40 && profile.totalGames >= 5) {
    recs.push("Your win rate is below 40%. Consider playing opponents closer to your level and focus on not making big mistakes.");
  }

  if (recs.length === 0) {
    recs.push("Great job! Keep playing and analyzing your games to continue improving.");
  }

  return recs;
}
