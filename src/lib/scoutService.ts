import { Chess } from 'chess.js';
import { ScoutGame, OpeningTreeNode, PrepLine } from '@/types/scout';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function parseGameMoves(pgn: string): { moves: string[]; fens: string[] } | null {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history();

    const replay = new Chess();
    const fens: string[] = [replay.fen()];

    for (const move of history) {
      replay.move(move);
      fens.push(replay.fen());
    }

    return { moves: history, fens };
  } catch {
    return null;
  }
}

function getOutcome(
  result: string,
  playerColor: 'w' | 'b'
): 'win' | 'draw' | 'loss' | null {
  if (result === '1-0') return playerColor === 'w' ? 'win' : 'loss';
  if (result === '0-1') return playerColor === 'b' ? 'win' : 'loss';
  if (result === '1/2-1/2') return 'draw';
  return null;
}

export function buildOpeningTree(
  games: ScoutGame[],
  targetUsername: string,
  colorFilter: 'both' | 'white' | 'black' = 'both',
  maxDepth: number = 25,
  minGames: number = 5
): OpeningTreeNode {
  const root: OpeningTreeNode = {
    move: '',
    fen: STARTING_FEN,
    totalGames: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    children: [],
  };

  const normalizedTarget = targetUsername.toLowerCase();

  for (const game of games) {
    const isWhite = game.whiteUsername.toLowerCase() === normalizedTarget;
    const isBlack = game.blackUsername.toLowerCase() === normalizedTarget;
    if (!isWhite && !isBlack) continue;

    const playerColor: 'w' | 'b' = isWhite ? 'w' : 'b';

    if (colorFilter === 'white' && playerColor !== 'w') continue;
    if (colorFilter === 'black' && playerColor !== 'b') continue;

    const outcome = getOutcome(game.result, playerColor);
    if (!outcome) continue;

    const parsed = parseGameMoves(game.pgn);
    if (!parsed) continue;

    const { moves, fens } = parsed;

    let currentNode = root;
    currentNode.totalGames++;
    if (outcome === 'win') currentNode.wins++;
    else if (outcome === 'draw') currentNode.draws++;
    else currentNode.losses++;

    const depth = Math.min(moves.length, maxDepth);
    for (let i = 0; i < depth; i++) {
      const move = moves[i];
      const fen = fens[i + 1];

      let child = currentNode.children.find(c => c.move === move);
      if (!child) {
        child = {
          move,
          fen,
          totalGames: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          children: [],
        };
        currentNode.children.push(child);
      }

      child.totalGames++;
      if (outcome === 'win') child.wins++;
      else if (outcome === 'draw') child.draws++;
      else child.losses++;

      currentNode = child;
    }
  }

  pruneTree(root, minGames);
  return root;
}

function pruneTree(node: OpeningTreeNode, minGames: number): void {
  node.children = node.children.filter(child => child.totalGames >= minGames);
  node.children.sort((a, b) => b.totalGames - a.totalGames);
  for (const child of node.children) {
    pruneTree(child, minGames);
  }
}

export function getNodeScore(node: OpeningTreeNode): number {
  if (node.totalGames === 0) return 50;
  return ((node.wins + 0.5 * node.draws) / node.totalGames) * 100;
}

export function generatePrepLines(
  tree: OpeningTreeNode,
  maxLines: number = 10
): PrepLine[] {
  const lines: PrepLine[] = [];

  function traverse(node: OpeningTreeNode, movePath: string[]): void {
    if (node.totalGames < 5) return;

    const score = getNodeScore(node);

    if (movePath.length >= 2 && score < 45 && node.totalGames >= 5) {
      lines.push({
        moves: [...movePath],
        fen: node.fen,
        opponentScore: score,
        totalGames: node.totalGames,
        wins: node.wins,
        draws: node.draws,
        losses: node.losses,
        recommendation: generateRecommendation(movePath, node, score),
      });
    }

    for (const child of node.children) {
      if (child.totalGames >= 5) {
        traverse(child, [...movePath, child.move]);
      }
    }
  }

  for (const child of tree.children) {
    traverse(child, [child.move]);
  }

  lines.sort((a, b) => {
    const scoreA = (50 - a.opponentScore) * Math.log(a.totalGames + 1);
    const scoreB = (50 - b.opponentScore) * Math.log(b.totalGames + 1);
    return scoreB - scoreA;
  });

  return lines.slice(0, maxLines);
}

function generateRecommendation(
  moves: string[],
  node: OpeningTreeNode,
  score: number
): string {
  const moveStr = formatMoveSequence(moves);
  const yourWinPct = ((node.losses / node.totalGames) * 100).toFixed(0);
  return `After ${moveStr}, opponent scores only ${score.toFixed(0)}% over ${node.totalGames} games. You win ${yourWinPct}% of the time in this line.`;
}

export function formatMoveSequence(moves: string[]): string {
  let result = '';
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) {
      result += `${Math.floor(i / 2) + 1}. `;
    }
    result += moves[i];
    if (i < moves.length - 1) result += ' ';
  }
  return result;
}

export function getTreeNodeAtPath(
  tree: OpeningTreeNode,
  path: string[]
): OpeningTreeNode | null {
  let node = tree;
  for (const move of path) {
    const child = node.children.find(c => c.move === move);
    if (!child) return null;
    node = child;
  }
  return node;
}
