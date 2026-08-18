// React wrapper around `buildHoleReport`. State only — the orchestration and
// every decision worth testing live in that module.

import { useCallback, useRef, useState } from 'react';
import {
  buildHoleReport,
  NoGamesError,
  type BuildHoleReportOptions,
  type HoleProgress,
} from '@/lib/scout/buildHoleReport';
import { HOLE_DEFAULTS, type HoleFinderConfig, type HoleReport } from '@/lib/scout/holeFinder';
import type { ScoutGame } from '@/types/scout';

export type { HolePhase, HoleProgress } from '@/lib/scout/buildHoleReport';

const IDLE: HoleProgress = { phase: 'idle', fraction: 0, label: '' };

export interface UseHoleReportResult {
  report: HoleReport | null;
  progress: HoleProgress;
  error: string | null;
  /** `yourColor` is the colour YOU intend to play. */
  run: (games: ScoutGame[], username: string, yourColor: 'white' | 'black') => Promise<void>;
  reset: () => void;
}

export function useHoleReport(
  config: HoleFinderConfig = HOLE_DEFAULTS,
  options: Pick<BuildHoleReportOptions, 'makeProvider' | 'concurrency'> = {}
): UseHoleReportResult {
  const [report, setReport] = useState<HoleReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<HoleProgress>(IDLE);

  // Guards a second click landing on top of the first, and a colour switch
  // whose slower predecessor would otherwise overwrite it on arrival.
  const runId = useRef(0);

  const reset = useCallback(() => {
    runId.current += 1;
    setReport(null);
    setError(null);
    setProgress(IDLE);
  }, []);

  const run = useCallback(
    async (games: ScoutGame[], username: string, yourColor: 'white' | 'black') => {
      const id = ++runId.current;
      const isStale = () => runId.current !== id;

      setError(null);
      setReport(null);

      try {
        const result = await buildHoleReport(games, username, yourColor, {
          ...options,
          config,
          isStale,
          onProgress: p => {
            if (!isStale()) setProgress(p);
          },
        });
        if (isStale() || !result) return;
        setReport(result);
      } catch (e) {
        if (isStale()) return;
        setError(
          e instanceof NoGamesError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Could not build your prep.'
        );
        setProgress({ phase: 'error', fraction: 0, label: '' });
      }
    },
    [config, options]
  );

  return { report, progress, error, run, reset };
}
