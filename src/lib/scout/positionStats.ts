// ─────────────────────────────────────────────────────────────────────────────
// What they actually score, measured per POSITION and weighted by recency.
//
// Two corrections to the obvious approach, both forced by real data rather than
// taste. Measured on a 22,000-game archive:
//
//   Move order.  A move tree asks a separate question of every spelling of the
//   same idea. The c4 break against their Caro-Kann appeared as eighteen games
//   down one order and thirty-one down another; pooled by position it is one
//   question with an effective sample of fifty. Splitting evidence across
//   orders is what let an 18-game mirage outrank its own 167-game parent.
//
//   Recency.  The same player answered 1.e4 with c6 in 58.6% of all their
//   games and in 96.3% of their most recent fifteen hundred. An unweighted
//   archive describes someone who no longer exists. Games decay with a
//   half-life so the index tracks who they are now, and the effective sample
//   size falls honestly as it does.
//
// Nothing here judges anything — it counts. The gate lives in holeFinder.
// ─────────────────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';
import type { ScoutGame } from '@/types/scout';

export interface PositionStat {
  /** FEN with the move counters dropped, so transpositions share an entry. */
  key: string;
  /** Σw — total recency weight of games reaching here. */
  weight: number;
  /** Σw² — carried so the effective sample size can be computed. */
  weightSq: number;
  /** Σw·result, result being 1 / 0.5 / 0 from the scouted player's side. */
  points: number;
  /** Plies from the start along the first path that reached it. */
  ply: number;
  /** Raw game count, for display. A reader understands "31 games". */
  games: number;
  /** Positions reachable from here in one ply, among those we indexed. */
  next: Set<string>;
}

export interface PositionIndex {
  positions: Map<string, PositionStat>;
  /** Their recency-weighted score across all games with this colour. */
  baseline: number;
  /** Effective sample size behind the baseline. */
  baselineNeff: number;
  /** Games that contributed. */
  games: number;
  /** Half-life actually used, in days. */
  halfLifeDays: number;
}

export interface PositionIndexConfig {
  /**
   * Days after which a game counts half as much.
   *
   * A year is roughly the timescale on which club players change repertoire —
   * short enough to follow a switch, long enough that a month of tilt cannot
   * rewrite the picture.
   */
  halfLifeDays: number;
  /** How deep to index. Beyond this, samples are too thin to test anyway. */
  maxPly: number;
}

export const POSITION_INDEX_DEFAULTS: PositionIndexConfig = {
  halfLifeDays: 365,
  maxPly: 16,
};

/** Drop halfmove and fullmove counters — they never change an evaluation. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/**
 * Effective sample size of a weighted sample (Kish): (Σw)² / Σw².
 *
 * Equal weights give back the plain count; a sample dominated by a few recent
 * games reports the handful it really rests on. Every confidence interval
 * downstream uses this rather than the raw game count, so recency weighting
 * cannot manufacture significance it has not earned.
 */
export function effectiveN(stat: { weight: number; weightSq: number }): number {
  if (stat.weightSq <= 0) return 0;
  return (stat.weight * stat.weight) / stat.weightSq;
}

/** Their recency-weighted score at a position, 0–1. */
export function positionScore(stat: PositionStat): number {
  return stat.weight > 0 ? stat.points / stat.weight : 0.5;
}

export function buildPositionIndex(
  games: ScoutGame[],
  username: string,
  color: 'white' | 'black',
  config: PositionIndexConfig = POSITION_INDEX_DEFAULTS
): PositionIndex {
  const target = username.toLowerCase();
  const mine = games.filter(g => {
    const isWhite = g.whiteUsername.toLowerCase() === target;
    const isBlack = g.blackUsername.toLowerCase() === target;
    return color === 'white' ? isWhite : isBlack;
  });

  const positions = new Map<string, PositionStat>();
  let baseWeight = 0;
  let baseWeightSq = 0;
  let basePoints = 0;
  let counted = 0;

  // Anchor decay at their latest game, not at today. A player who stopped
  // playing six months ago should still be scouted on their real repertoire
  // rather than have every game decayed into irrelevance together.
  const newest = mine.reduce((max, g) => Math.max(max, g.date || 0), 0);
  const chess = new Chess();

  for (const game of mine) {
    const result = outcomeFor(game, color);
    if (result === null) continue;
    if (!game.moves || game.moves.length === 0) continue;

    const ageDays = newest > 0 && game.date ? (newest - game.date) / 86_400_000 : 0;
    const w = Math.pow(0.5, ageDays / config.halfLifeDays);

    baseWeight += w;
    baseWeightSq += w * w;
    basePoints += w * result;
    counted += 1;

    chess.reset();
    let prev: string | null = null;
    // A game that repeats a position must not count it twice — that would let
    // one shuffling game masquerade as several observations.
    const seen = new Set<string>();

    for (let i = 0; i < Math.min(game.moves.length, config.maxPly); i++) {
      try {
        if (!chess.move(game.moves[i])) break;
      } catch {
        break;
      }
      const key = positionKey(chess.fen());
      if (prev) positions.get(prev)?.next.add(key);
      if (seen.has(key)) {
        prev = key;
        continue;
      }
      seen.add(key);

      let stat = positions.get(key);
      if (!stat) {
        stat = { key, weight: 0, weightSq: 0, points: 0, ply: i + 1, games: 0, next: new Set() };
        positions.set(key, stat);
      }
      stat.weight += w;
      stat.weightSq += w * w;
      stat.points += w * result;
      stat.games += 1;
      prev = key;
    }
  }

  return {
    positions,
    baseline: baseWeight > 0 ? basePoints / baseWeight : 0.5,
    baselineNeff: baseWeightSq > 0 ? (baseWeight * baseWeight) / baseWeightSq : 0,
    games: counted,
    halfLifeDays: config.halfLifeDays,
  };
}

function outcomeFor(game: ScoutGame, color: 'white' | 'black'): number | null {
  if (game.result === '1/2-1/2') return 0.5;
  if (game.result === '1-0') return color === 'white' ? 1 : 0;
  if (game.result === '0-1') return color === 'black' ? 1 : 0;
  return null;
}
