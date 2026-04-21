/// <reference lib="webworker" />
// Web Worker that offloads opening-tree + prep-line construction AND the full
// analytics bundle (profile / stalker / prep / checklist / rivals / psychology
// / recent) so the main thread stays responsive even for 2000+ scouted games.

import { buildOpeningTree, generatePrepLines } from '@/lib/scoutService';
import { computeAnalytics } from '@/lib/scoutAnalytics';
import type {
  ScoutGame,
  OpeningTreeNode,
  PrepLine,
  ScoutAnalytics,
} from '@/types/scout';

export type ScoutWorkerRequest = {
  id: number;
  games: ScoutGame[];
  targetUsername: string;
  colorFilter: 'both' | 'white' | 'black';
  minGames: number;
  /** Whether to recompute the full analytics bundle (expensive) or only the color-filtered drill-down tree. */
  computeAnalytics: boolean;
};

export type ScoutWorkerResponse = {
  id: number;
  tree: OpeningTreeNode;
  prepLines: PrepLine[];
  analytics: ScoutAnalytics | null;
  buildMs: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: any = self;

ctx.onmessage = (event: MessageEvent<ScoutWorkerRequest>) => {
  const { id, games, targetUsername, colorFilter, minGames } = event.data;
  const t0 = performance.now();
  const tree = buildOpeningTree(games, targetUsername, colorFilter, 25, minGames);
  const prepLines = generatePrepLines(tree, 10, Math.max(2, minGames));
  const analytics = event.data.computeAnalytics
    ? computeAnalytics(games, targetUsername)
    : null;
  const buildMs = performance.now() - t0;
  const response: ScoutWorkerResponse = { id, tree, prepLines, analytics, buildMs };
  ctx.postMessage(response);
};

export {};
