// Running the hole finder from the browser, with a progress figure that means
// something.
//
// The search awaits every evaluation, so run naively against a ~200ms cloud it
// would sit there for twenty seconds. Everything before the engine pass is pure,
// so the plan is computed first, warmed concurrently, and only then handed to
// the search — which by that point is mostly reading its own cache.
//
// Concurrency is deliberately small. Probing the real endpoint, 11 of 120
// requests errored at 60ms spacing, so this is a queue, not a fan-out.

import { useCallback, useRef, useState } from 'react';
import { buildOpeningTree } from '@/lib/scoutService';
import { buildPositionIndex } from '@/lib/scout/positionStats';
import { createCloudProvider } from '@/lib/scout/holeProviders';
import {
  findHoles,
  planEngineWork,
  HOLE_DEFAULTS,
  type HoleFinderConfig,
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

const CONCURRENCY = 4;

/** Run `tasks` with a bounded number in flight. Order of completion is free. */
async function pool<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await work(items[i]);
    }
  });
  await Promise.all(runners);
}

export interface UseHoleReportResult {
  report: HoleReport | null;
  progress: HoleProgress;
  error: string | null;
  /** `yourColor` is the colour YOU intend to play. */
  run: (games: ScoutGame[], username: string, yourColor: 'white' | 'black') => Promise<void>;
  reset: () => void;
}

export function useHoleReport(config: HoleFinderConfig = HOLE_DEFAULTS): UseHoleReportResult {
  const [report, setReport] = useState<HoleReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<HoleProgress>({
    phase: 'idle',
    fraction: 0,
    label: '',
  });
  // Guards against a second click while the first run is still in flight, and
  // against a colour switch landing its results after a later one.
  const runId = useRef(0);

  const reset = useCallback(() => {
    runId.current += 1;
    setReport(null);
    setError(null);
    setProgress({ phase: 'idle', fraction: 0, label: '' });
  }, []);

  const run = useCallback(
    async (games: ScoutGame[], username: string, yourColor: 'white' | 'black') => {
      const id = ++runId.current;
      const stale = () => runId.current !== id;

      setError(null);
      setReport(null);
      setProgress({ phase: 'reading', fraction: 0.02, label: 'Reading their games' });

      try {
        // They have the colour you are not playing.
        const theirColor = yourColor === 'white' ? 'black' : 'white';
        const index = buildPositionIndex(games, username, theirColor);
        if (index.games === 0) {
          setProgress({ phase: 'done', fraction: 1, label: '' });
          setReport(null);
          setError(`No games found where ${username} plays ${theirColor}.`);
          return;
        }

        const tree = buildOpeningTree(games, username, theirColor, config.maxPly, config.minRepeats);
        if (stale()) return;

        const plan = planEngineWork(tree, theirColor, index, config);
        const provider = createCloudProvider({ minDepth: 20 });

        let done = 0;
        setProgress({
          phase: 'evaluating',
          fraction: 0.05,
          label: `Checking ${plan.length} positions with the engine`,
        });

        await pool(plan.slice(0, config.engineBudget), CONCURRENCY, async fen => {
          await provider.evaluate(fen);
          done += 1;
          if (stale()) return;
          setProgress({
            phase: 'evaluating',
            fraction: 0.05 + 0.85 * (done / Math.min(plan.length, config.engineBudget)),
            label: `Checking positions with the engine — ${done} of ${Math.min(plan.length, config.engineBudget)}`,
          });
        });
        if (stale()) return;

        setProgress({ phase: 'ranking', fraction: 0.93, label: 'Ranking what actually helps' });
        // The provider is warm, so this is mostly cache reads. Its own budget
        // still applies to anything the plan could not know about in advance.
        const result = await findHoles(tree, theirColor, index, provider, config);
        if (stale()) return;

        setReport(result);
        setProgress({ phase: 'done', fraction: 1, label: '' });
      } catch (e) {
        if (stale()) return;
        setError(e instanceof Error ? e.message : 'Could not build your prep.');
        setProgress({ phase: 'error', fraction: 0, label: '' });
      }
    },
    [config]
  );

  return { report, progress, error, run, reset };
}
