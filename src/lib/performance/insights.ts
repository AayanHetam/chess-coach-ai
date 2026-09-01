import type { Game } from "@/types/game";
import { MoveClassification } from "@/types/enums";
import { getPositionWinPercentage } from "@/lib/engine/helpers/winPercentage";
import { getMovesAccuracy } from "@/lib/engine/helpers/accuracy";

/**
 * Aggregates the phase accuracy / blunder-pattern insights that
 * enhanced-analysis already computes per game and then throws away —
 * src/pages/profile.tsx's own docstring flags this exact gap ("Phase
 * accuracy has no source at all and is gone until one exists"). The source
 * now exists: every saved game already carries `eval.positions` (classified,
 * from getMovesClassification) and `eval.accuracy` (from computeAccuracy),
 * this just reads them across the user's saved games instead of one at a
 * time.
 *
 * Every number here comes from a game the user actually saved and that
 * finished Stockfish analysis — no fabricated defaults, matching profile.tsx's
 * "every number on this page comes from a store something actually writes
 * to" rule.
 */

export interface AccuracyPoint {
  gameId: number;
  date?: string;
  accuracy: number;
}

export interface PhaseAccuracy {
  opening: number | null;
  middlegame: number | null;
  endgame: number | null;
}

export interface GameInsights {
  /** Saved games with a completed analysis AND a resolvable player color. */
  gamesAnalyzed: number;
  avgAccuracy: number | null;
  /** Oldest → newest, for a trend line. */
  accuracyTrend: AccuracyPoint[];
  /** Counts across the user's own moves only, not the opponent's. */
  classificationCounts: Partial<Record<MoveClassification, number>>;
  phaseAccuracy: PhaseAccuracy;
}

const EMPTY_INSIGHTS: GameInsights = {
  gamesAnalyzed: 0,
  avgAccuracy: null,
  accuracyTrend: [],
  classificationCounts: {},
  phaseAccuracy: { opening: null, middlegame: null, endgame: null },
};

function resolveUserColor(
  game: Game,
  usernames: string[],
): "white" | "black" | null {
  const targets = usernames
    .filter((u): u is string => Boolean(u))
    .map((u) => u.toLowerCase());
  if (!targets.length) return null;
  if (game.white?.name && targets.includes(game.white.name.toLowerCase())) {
    return "white";
  }
  if (game.black?.name && targets.includes(game.black.name.toLowerCase())) {
    return "black";
  }
  return null;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function computeGameInsights(
  games: Game[],
  usernames: (string | undefined)[],
): GameInsights {
  const cleanUsernames = usernames.filter((u): u is string => Boolean(u));
  if (!cleanUsernames.length) return EMPTY_INSIGHTS;

  const classificationCounts: Partial<Record<MoveClassification, number>> = {};
  const accuracyTrend: AccuracyPoint[] = [];
  const phaseSums = {
    opening: [] as number[],
    middlegame: [] as number[],
    endgame: [] as number[],
  };

  for (const game of games) {
    const positions = game.eval?.positions;
    if (!positions || positions.length < 3) continue;
    const color = resolveUserColor(game, cleanUsernames);
    if (!color) continue;
    const isWhite = color === "white";

    const gameAccuracy = isWhite
      ? game.eval?.accuracy?.white
      : game.eval?.accuracy?.black;
    if (typeof gameAccuracy === "number") {
      accuracyTrend.push({ gameId: game.id, date: game.date, accuracy: gameAccuracy });
    }

    let movesAccuracy: number[] | null = null;
    try {
      movesAccuracy = getMovesAccuracy(positions.map(getPositionWinPercentage));
    } catch {
      movesAccuracy = null;
    }

    // The opening/middlegame/endgame split is a heuristic, not a rule: the
    // opening boundary is real (the last ply the classifier tagged
    // MoveClassification.Opening); everything after it is bisected evenly
    // into "middlegame" and "endgame" for lack of a cheaper real signal.
    let openingEndsAtPly = 0;
    for (let ply = 1; ply < positions.length; ply++) {
      if (positions[ply].moveClassification === MoveClassification.Opening) {
        openingEndsAtPly = ply;
      }
    }
    const remainingPlies = positions.length - 1 - openingEndsAtPly;
    const middlegameEndsAtPly =
      openingEndsAtPly + Math.ceil(remainingPlies / 2);

    for (let ply = 1; ply < positions.length; ply++) {
      const isWhiteMove = ply % 2 === 1;
      if (isWhiteMove !== isWhite) continue;

      const cls = positions[ply].moveClassification;
      if (cls) {
        classificationCounts[cls] = (classificationCounts[cls] ?? 0) + 1;
      }

      const moveAccuracy = movesAccuracy?.[ply - 1];
      if (moveAccuracy !== undefined) {
        if (ply <= openingEndsAtPly) phaseSums.opening.push(moveAccuracy);
        else if (ply <= middlegameEndsAtPly) phaseSums.middlegame.push(moveAccuracy);
        else phaseSums.endgame.push(moveAccuracy);
      }
    }
  }

  return {
    gamesAnalyzed: accuracyTrend.length,
    avgAccuracy: mean(accuracyTrend.map((p) => p.accuracy)),
    accuracyTrend,
    classificationCounts,
    phaseAccuracy: {
      opening: mean(phaseSums.opening),
      middlegame: mean(phaseSums.middlegame),
      endgame: mean(phaseSums.endgame),
    },
  };
}
