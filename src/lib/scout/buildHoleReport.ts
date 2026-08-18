// Orchestrating a hole-finder run, separately from React.
//
// This lives outside the hook because the interesting parts are not state. The
// colour inversion in particular — you asked to play White, so the side being
// scouted is Black — produces a completely plausible report when it is wrong,
// exactly like the centipawn sign in holeProviders. It needs a test, and a test
// needs it out of a component.
//
// The warming pass is the other reason. `findHoles` awaits every evaluation, so
// against a ~200ms cloud a naive run is twenty seconds of waiting. Everything
// before the engine pass is pure, so the position list is computed first and
// filled concurrently; the search then mostly reads its provider's cache.

import { buildOpeningTree } from '@/lib/scoutService';
import { buildPositionIndex } from '@/lib/scout/positionStats';
import { createCloudProvider } from '@/lib/scout/holeProviders';
import {
  findHoles,
  planEngineWork,
  HOLE_DEFAULTS,
  type HoleFinderConfig,
  type HoleFinderProviders,
  type HoleReport,
} from '@/lib/scout/holeFinder';
import type { ScoutGame } from '@/types/scout';

export type HolePhase = 'idle' | 'reading' | 'evaluating' | 'ranking' | 'done' | 'error';

export interface HoleProgress {
  phase: HolePhase;
  /** 0–1, across the whole run. */
  fraction: number;
  /** What is happening, in words a player understands. */
  label: string;
}

export interface BuildHoleReportOptions {
  config?: HoleFinderConfig;
  /**
   * Your own games, so the report can compare the two of you in the same
   * position instead of only describing them.
   *
   * Optional on purpose: scouting a stranger without a linked account is still
   * worth doing, and the ranking degrades to the one-sided version rather than
   * refusing to run.
   */
  yourGames?: ScoutGame[];
  /** Your handle, needed to pick your side of your own games. */
  yourUsername?: string;
  /** Injectable for tests; defaults to the Lichess cloud provider. */
  makeProvider?: () => HoleFinderProviders;
  onProgress?: (p: HoleProgress) => void;
  /** Returns true when this run has been superseded and should stop quietly. */
  isStale?: () => boolean;
  /**
   * How many evaluations may be in flight while warming.
   *
   * Small on purpose. Probing the real endpoint, 11 of 120 requests errored at
   * 60ms spacing, so this is a queue rather than a fan-out.
   */
  concurrency?: number;
}

export class NoGamesError extends Error {
  constructor(username: string, color: 'white' | 'black') {
    super(`No games found where ${username} plays ${color}.`);
    this.name = 'NoGamesError';
  }
}

/** Run `work` over `items` with a bounded number in flight. */
export async function pool<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await work(items[i]);
    }
  });
  await Promise.all(runners);
}

/**
 * Build the prep report.
 *
 * `yourColor` is the colour YOU intend to play, so the side scouted is the
 * other one.
 */
export async function buildHoleReport(
  games: ScoutGame[],
  username: string,
  yourColor: 'white' | 'black',
  options: BuildHoleReportOptions = {}
): Promise<HoleReport | null> {
  const {
    config = HOLE_DEFAULTS,
    yourGames,
    yourUsername,
    makeProvider = () => createCloudProvider({ minDepth: 20 }),
    onProgress = () => {},
    isStale = () => false,
    concurrency = 4,
  } = options;

  const theirColor: 'white' | 'black' = yourColor === 'white' ? 'black' : 'white';

  onProgress({ phase: 'reading', fraction: 0.02, label: 'Reading their games' });

  const index = buildPositionIndex(games, username, theirColor);
  if (index.games === 0) throw new NoGamesError(username, theirColor);

  const tree = buildOpeningTree(games, username, theirColor, config.maxPly, config.minRepeats);
  if (isStale()) return null;

  // Your side of the board, indexed identically so positions pair by FEN.
  const yourIndex =
    yourGames && yourUsername && yourGames.length > 0
      ? buildPositionIndex(yourGames, yourUsername, yourColor)
      : undefined;

  const provider = makeProvider();
  const plan = planEngineWork(tree, theirColor, index, config).slice(0, config.engineBudget);

  let done = 0;
  onProgress({
    phase: 'evaluating',
    fraction: 0.05,
    label: `Checking ${plan.length} positions with the engine`,
  });

  await pool(plan, concurrency, async fen => {
    if (isStale()) return;
    await provider.evaluate(fen);
    done += 1;
    onProgress({
      phase: 'evaluating',
      fraction: plan.length ? 0.05 + 0.85 * (done / plan.length) : 0.9,
      label: `Checking positions with the engine — ${done} of ${plan.length}`,
    });
  });
  if (isStale()) return null;

  onProgress({ phase: 'ranking', fraction: 0.93, label: 'Ranking what actually helps' });
  // The provider is warm, so this is mostly cache reads. Its own budget still
  // covers anything the plan could not know about in advance — chiefly the
  // sibling the engine would rather have played.
  const report = await findHoles(tree, theirColor, index, provider, config, yourIndex);
  if (isStale()) return null;

  onProgress({ phase: 'done', fraction: 1, label: '' });
  return report;
}
