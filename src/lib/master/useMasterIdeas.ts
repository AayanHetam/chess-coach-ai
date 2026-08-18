// Fetching master context for a built prep report.
//
// Deliberately a second, separate request rather than part of the report. The
// report is the expensive part — a hundred engine evaluations — and it is
// useful on its own; the corpus is a fast disk read that either has the
// position or does not. Bolting the two together would mean a corpus miss, or a
// slow route, degrading prep that was already finished and correct.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Hole } from '@/lib/scout/holeFinder';
import type { MasterView } from '@/lib/master/ideas';

export interface MasterCorpus {
  games: number;
  positions: number;
  source: string;
}

export interface MasterContext {
  /** Keyed by the FEN asked about, so a line can look up its own position. */
  byFen: Map<string, MasterView>;
  corpus: MasterCorpus | null;
}

const EMPTY: MasterContext = { byFen: new Map(), corpus: null };

/**
 * Which positions are worth asking about.
 *
 * The first move YOU make in each prepared line, and the position before it.
 * That is the only place the question "do masters agree?" has an answer that
 * changes anything — their replies are theirs, and our later moves are past the
 * point where the corpus still has games.
 */
export function positionsToAsk(holes: Hole[]): Array<{ fen: string; yourMove?: string }> {
  const seen = new Set<string>();
  const out: Array<{ fen: string; yourMove?: string }> = [];

  for (const hole of holes) {
    for (const line of hole.prepared ?? []) {
      const yours = line.moves.find(m => m.side === 'you');
      if (!yours) continue;
      if (seen.has(yours.fen)) continue;
      seen.add(yours.fen);
      out.push({ fen: yours.fen, yourMove: yours.san });
    }
    // The entry itself, so a hole with no continuation still says something.
    if (!seen.has(hole.fen)) {
      seen.add(hole.fen);
      out.push({ fen: hole.fen });
    }
  }
  return out;
}

export function useMasterIdeas(
  holes: Hole[] | undefined,
  yourColor: 'white' | 'black'
): MasterContext {
  const [context, setContext] = useState<MasterContext>(EMPTY);
  const requestId = useRef(0);

  const load = useCallback(
    async (targets: Array<{ fen: string; yourMove?: string }>) => {
      const id = ++requestId.current;
      try {
        const res = await fetch('/api/master-ideas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positions: targets, yourColor }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { views: Array<MasterView | null>; corpus: MasterCorpus };
        if (requestId.current !== id) return;

        const byFen = new Map<string, MasterView>();
        targets.forEach((t, i) => {
          const view = data.views?.[i];
          if (view) byFen.set(t.fen, view);
        });
        setContext({ byFen, corpus: data.corpus ?? null });
      } catch {
        // Master context is an enrichment. Losing it must not disturb a report
        // that is already complete and correct.
      }
    },
    [yourColor]
  );

  useEffect(() => {
    if (!holes || holes.length === 0) {
      setContext(EMPTY);
      return;
    }
    const targets = positionsToAsk(holes);
    if (targets.length === 0) {
      setContext(EMPTY);
      return;
    }
    void load(targets);
  }, [holes, load]);

  return context;
}
