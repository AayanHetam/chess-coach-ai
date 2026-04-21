// ─────────────────────────────────────────────────────────────────────────────
// Collision analysis — "you vs them"
//
// Given YOUR games (as a named player) and THEIR games, find the high-value
// "collision" lines: positions where the intersection of the two repertoires
// maximally favours you.
//
// A collision is scored by combining:
//   - Your score in this line  (the higher, the better)
//   - Their score in this line (the lower, the better)
//   - Sample confidence        (more games on both sides = more trust)
//
// We walk BOTH players' opening trees simultaneously (your tree filtered to
// colour X vs their tree filtered to the opposite colour) and score nodes
// whose SAN path matches up to ply-depth D.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CollisionLine,
  Collisions,
  OpeningTreeNode,
  ScoutGame,
} from '@/types/scout';
import { buildOpeningTree } from '@/lib/scoutService';
import { getOpeningName } from '@/lib/scoutEco';

const MIN_YOUR_GAMES = 3;
const MIN_THEIR_GAMES = 3;
const MIN_DEPTH = 3;
const MAX_DEPTH = 10;

function nodeScore(n: OpeningTreeNode): number {
  if (!n.totalGames) return 50;
  return ((n.wins + 0.5 * n.draws) / n.totalGames) * 100;
}

/**
 * Walk both trees in lockstep along matching SAN paths and collect nodes that
 * satisfy sample-size thresholds. Each collision captures your advantage in a
 * specific line that BOTH of you reach often enough to matter.
 *
 * When `yourColor === 'white'`, `yourTree` is your white-tree and `theirTree`
 * is their black-tree (i.e., their reply tree against your first move).
 */
function collectCollisions(
  yourTree: OpeningTreeNode,
  theirTree: OpeningTreeNode,
  yourColor: 'white' | 'black'
): CollisionLine[] {
  const out = new Map<string, CollisionLine>();

  const walk = (
    y: OpeningTreeNode,
    t: OpeningTreeNode,
    path: string[]
  ): void => {
    if (path.length >= MIN_DEPTH && path.length <= MAX_DEPTH) {
      if (y.totalGames >= MIN_YOUR_GAMES && t.totalGames >= MIN_THEIR_GAMES) {
        const ys = nodeScore(y);
        const ts = nodeScore(t);
        // Edge = (your score - their score), scaled by sample confidence.
        const edge =
          (ys - ts) * Math.log(Math.min(y.totalGames, t.totalGames) + 1);
        // Only keep lines where your edge is meaningfully positive.
        if (edge > 4) {
          const info = getOpeningName(path);
          const key = `${info.eco}|${info.name}|${path.join('|')}`;
          const prev = out.get(key);
          const entry: CollisionLine = {
            moves: [...path],
            eco: info.eco,
            name: info.name,
            variation: info.variation,
            yourColor,
            yourScorePct: ys,
            yourGames: y.totalGames,
            theirScorePct: ts,
            theirGames: t.totalGames,
            edge,
          };
          if (!prev || prev.edge < edge) out.set(key, entry);
        }
      }
    }

    // Descend along moves present in BOTH trees (same SAN).
    for (const yc of y.children) {
      const tc = t.children.find(c => c.move === yc.move);
      if (!tc) continue;
      walk(yc, tc, [...path, yc.move]);
    }
  };

  walk(yourTree, theirTree, []);

  const list = Array.from(out.values()).sort((a, b) => b.edge - a.edge);
  return list.slice(0, 6);
}

/**
 * Run the full pairwise collision analysis against the target opponent.
 *
 * @param yourGames   Your game history (same ScoutGame shape).
 * @param yourUsername Your platform username (case-insensitive).
 * @param targetGames  The opponent's game history.
 * @param targetUsername The opponent's username.
 */
export function computeCollisions(
  yourGames: ScoutGame[],
  yourUsername: string,
  targetGames: ScoutGame[],
  targetUsername: string
): Collisions {
  // Your trees per colour (depth 14, min 2 games per node).
  const yourWhite = buildOpeningTree(yourGames, yourUsername, 'white', 14, 2);
  const yourBlack = buildOpeningTree(yourGames, yourUsername, 'black', 14, 2);

  // Their trees per colour.
  const theirWhite = buildOpeningTree(targetGames, targetUsername, 'white', 14, 2);
  const theirBlack = buildOpeningTree(targetGames, targetUsername, 'black', 14, 2);

  // When you play White, THEY play Black → their reply-tree is theirBlack.
  const whenYouPlayWhite = collectCollisions(yourWhite, theirBlack, 'white');
  // When you play Black, THEY play White → their tree is theirWhite.
  const whenYouPlayBlack = collectCollisions(yourBlack, theirWhite, 'black');

  // Your overall win rate for context.
  let w = 0, t = 0;
  for (const g of yourGames) {
    const t1 = yourUsername.toLowerCase();
    const isWhite = g.whiteUsername.toLowerCase() === t1;
    const isBlack = g.blackUsername.toLowerCase() === t1;
    if (!isWhite && !isBlack) continue;
    t += 1;
    if (
      (g.result === '1-0' && isWhite) ||
      (g.result === '0-1' && isBlack)
    ) {
      w += 1;
    }
  }

  return {
    whenYouPlayWhite,
    whenYouPlayBlack,
    yourWinRate: t > 0 ? w / t : 0,
    yourGames: t,
    yourUsername,
  };
}
