// ─────────────────────────────────────────────────────────────────────────────
// Wiring the hole finder to a real engine.
//
// The hole finder asks for one thing — an evaluation in centipawns from the
// side to move's point of view — and everything else in this codebase speaks a
// different dialect, so this file is where the translation lives.
//
// THE SIGN. `LineEval.cp` is White-relative: the local engine's UCI output is
// negated for Black to move in parseResults, and Lichess is White-relative to
// begin with. The hole finder wants side-to-move-relative, because that is what
// makes "how much did this move cost the player who made it" a subtraction. Get
// this backwards and nothing throws — concessions simply invert, the engine
// starts rewarding the moves it should be charging for, and the output stays
// plausible. Hence `cpForSideToMove` and its tests.
//
// THE SOURCE. Every position the hole finder looks at is an opening position
// inside sixteen plies, which is exactly the set Lichess's cloud holds at depth
// 50+. Cloud first is not an optimisation here so much as the only way this runs
// in a browser at all: the alternative is ~100 WASM searches.
// ─────────────────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';
import { getLichessEval } from '@/lib/lichess';
import { positionKey } from '@/lib/scout/positionStats';
import type { HoleFinderProviders, PositionEval } from '@/lib/scout/holeFinder';

/**
 * Convert a White-relative score to the side-to-move's point of view.
 *
 * Mates are folded into a large centipawn number so a forced win never loses to
 * a merely huge advantage, and so arithmetic downstream does not have to carry
 * a separate mate case. The step per ply keeps a shorter mate ahead of a longer
 * one.
 */
export function cpForSideToMove(
  fen: string,
  line: { cp?: number; mate?: number } | undefined
): number | null {
  if (!line) return null;
  const whiteToMove = fen.split(' ')[1] === 'w';

  let white: number;
  if (typeof line.mate === 'number' && line.mate !== 0) {
    white = line.mate > 0 ? 100_000 - line.mate * 100 : -100_000 - line.mate * 100;
  } else if (typeof line.cp === 'number') {
    white = line.cp;
  } else {
    return null;
  }

  return whiteToMove ? white : -white;
}

/** First move of a UCI principal variation, as SAN. */
export function uciToSan(fen: string, uci: string | undefined): string {
  if (!uci || uci.length < 4) return '';
  try {
    const board = new Chess(fen);
    const move = board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return move?.san ?? '';
  } catch {
    return '';
  }
}

export interface CloudProviderOptions {
  /**
   * Ignore cloud answers shallower than this. Lichess holds depth 50+ for
   * common openings; anything much shallower is a rarely-visited position whose
   * cloud entry is not obviously better than the local engine's.
   */
  minDepth?: number;
  /**
   * Called when the cloud has no usable answer. Returning null drops the
   * candidate, which is the correct fail-closed behaviour — see the note on
   * `HoleFinderProviders.evaluate`.
   */
  fallback?: (fen: string) => Promise<PositionEval | null>;
  /** Injectable for tests. */
  fetchEval?: typeof getLichessEval;
}

export interface CloudProviderStats {
  hits: number;
  misses: number;
  fallbacks: number;
}

/**
 * Cloud-eval-first provider, with an optional local fallback.
 *
 * Memoised on the position key so transposed lines — which the whole design
 * goes out of its way to pool — do not pay twice for the same position.
 */
export function createCloudProvider(options: CloudProviderOptions = {}): HoleFinderProviders & {
  stats: () => CloudProviderStats;
} {
  const { minDepth = 20, fallback, fetchEval = getLichessEval } = options;
  const cache = new Map<string, PositionEval | null>();
  const stats: CloudProviderStats = { hits: 0, misses: 0, fallbacks: 0 };

  return {
    stats: () => ({ ...stats }),
    async evaluate(fen: string): Promise<PositionEval | null> {
      const key = positionKey(fen);
      if (cache.has(key)) return cache.get(key)!;

      let result: PositionEval | null = null;
      try {
        const cloud = await fetchEval(fen, 1);
        const best = cloud.lines[0];
        const cp = cpForSideToMove(fen, best);
        if (best && cp !== null && best.depth >= minDepth) {
          stats.hits += 1;
          result = { cp, bestMove: uciToSan(fen, best.pv[0]) };
        }
      } catch {
        // A cloud failure is a miss, not an error — the fallback decides.
      }

      if (!result) {
        stats.misses += 1;
        if (fallback) {
          result = await fallback(fen);
          if (result) stats.fallbacks += 1;
        }
      }

      cache.set(key, result);
      return result;
    },
  };
}
