// ─────────────────────────────────────────────────────────────────────────────
// What masters do in this position, and what the idea is.
//
// The scout report can tell you where to steer someone and what they will play.
// It cannot tell you what to DO once you arrive, and that is the part a weaker
// player actually needs — knowing the move is not knowing the plan.
//
// Every fact here is counted, not written. The corpus is a FEN-keyed tree of
// 3.4M Lichess Elite games, so "masters castle short and break with d5" is a
// statement about moves that were played, in the position on screen, and can be
// checked. Nothing is generated: prose about chess positions is the single most
// reliable way to produce confident nonsense, and this file exists precisely
// where that temptation is strongest.
//
// The most useful output is not the move list — it is DISAGREEMENT. When the
// engine's move and the master move differ, that gap is the idea. Measured on a
// real prepared line: after 1.e4 c5 2.c3 Nf6 3.e5 Nd5 4.d4 cxd4, Stockfish
// plays 5.cxd4 and masters play 5.Nf3 in 46% of 9,459 games, taking cxd4 in 38%.
// Both are sound; only one of them is what a human would understand.
// ─────────────────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';

/** One master move in a position, as the corpus stores it. */
export interface MasterMoveStat {
  san: string;
  count: number;
  white: number;
  draws: number;
  black: number;
}

/** Injected so callers can supply the server corpus, or a fixture. */
export type MasterLookup = (fen: string) => { moves: MasterMoveStat[] } | null;

export interface MasterChoice {
  san: string;
  games: number;
  /** Share of master games in this position that continued with this move. */
  share: number;
  /** How the move scores FOR THE SIDE PLAYING IT, draws counting half. */
  score: number;
}

export type MasterMotif =
  | { kind: 'castle'; side: 'kingside' | 'queenside'; by: 'you' | 'them'; san: string }
  | { kind: 'break'; san: string; by: 'you' | 'them' }
  | { kind: 'route'; piece: string; from: string; to: string; by: 'you' | 'them' }
  | { kind: 'trade'; square: string; by: 'you' | 'them' };

export interface MasterView {
  /** Master games reaching this position. */
  games: number;
  /** Score for the side to move here. */
  score: number;
  /** What masters play, most popular first. */
  choices: MasterChoice[];
  /**
   * Where the move you intend sits in master practice.
   *
   * `rank: null` means no master in the corpus has played it — which is a fact
   * worth stating either way round: a novelty against a weak opponent is an
   * opportunity, and a novelty nobody strong has ever chosen is a warning.
   */
  yourMove?: { san: string; share: number; games: number; rank: number | null };
  /** The most-played continuation from here. */
  principal: string[];
  /** Share of games that follow the whole principal line. */
  principalShare: number;
  /** Master games that reached the end of it. */
  principalGames: number;
  /** Plans visible in that line, counted rather than described. */
  motifs: MasterMotif[];
}

export interface MasterIdeasConfig {
  /** Plies of principal line to walk. */
  depth: number;
  /** Positions below this many master games are not worth reporting. */
  minGames: number;
  /** Choices below this share are noise in a list. */
  minShare: number;
  /** Most choices to return. */
  maxChoices: number;
}

export const MASTER_IDEAS_DEFAULTS: MasterIdeasConfig = {
  depth: 8,
  minGames: 20,
  minShare: 0.04,
  maxChoices: 4,
};

const PIECE_NAME: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

function totals(moves: MasterMoveStat[]) {
  let games = 0;
  let white = 0;
  let draws = 0;
  for (const m of moves) {
    games += m.count;
    white += m.white;
    draws += m.draws;
  }
  return { games, white, draws };
}

/** Score for whoever is to move in `fen`, 0–1, draws counting half. */
export function scoreForSideToMove(
  fen: string,
  stat: { count: number; white: number; draws: number }
): number {
  if (stat.count <= 0) return 0.5;
  const whiteScore = (stat.white + 0.5 * stat.draws) / stat.count;
  return fen.split(' ')[1] === 'w' ? whiteScore : 1 - whiteScore;
}

/**
 * Is this move a pawn break?
 *
 * A pawn ADVANCE that comes to rest in contact with an enemy pawn. That contact
 * is what makes a break a break rather than a quiet advance, and it is decidable
 * from the board rather than from opening names.
 *
 * Captures are deliberately excluded. Counting them made every recapture read
 * as "White breaks with cxd4", which is not what a break is and buried the real
 * ones in noise — the exchanges are reported as trades instead.
 */
export function isPawnBreak(before: Chess, san: string): boolean {
  const legal = before.moves({ verbose: true }).find(m => m.san === san);
  if (!legal || legal.piece !== 'p') return false;
  if (legal.captured) return false;

  const file = legal.to.charCodeAt(0);
  const rank = Number(legal.to[1]);
  const forward = legal.color === 'w' ? 1 : -1;
  // Squares the pawn would now attack, and those attacking it.
  for (const df of [-1, 1]) {
    for (const dr of [forward, -forward]) {
      const f = String.fromCharCode(file + df);
      const r = rank + dr;
      if (f < 'a' || f > 'h' || r < 1 || r > 8) continue;
      const piece = before.get(`${f}${r}` as Parameters<Chess['get']>[0]);
      if (piece && piece.type === 'p' && piece.color !== legal.color) return true;
    }
  }
  return false;
}

/**
 * The line masters actually play from here, following the most popular move at
 * each step while the corpus still has enough games to mean anything.
 */
export function principalLine(
  fen: string,
  lookup: MasterLookup,
  config: MasterIdeasConfig = MASTER_IDEAS_DEFAULTS
): { moves: string[]; share: number; games: number } {
  const board = new Chess(fen);
  const moves: string[] = [];
  let share = 1;
  let games = 0;

  for (let i = 0; i < config.depth; i++) {
    const entry = lookup(board.fen());
    if (!entry || entry.moves.length === 0) break;
    const here = totals(entry.moves);
    if (here.games < config.minGames) break;

    const best = entry.moves.reduce((a, b) => (b.count > a.count ? b : a));
    try {
      if (!board.move(best.san)) break;
    } catch {
      break;
    }
    moves.push(best.san);
    share *= best.count / here.games;
    // Games that reached the position this move leads to — the honest measure
    // of how well-trodden the line is. The cumulative share is arithmetically
    // correct and reads as a failing grade: eight plies of ordinary theory
    // multiply out to 2.6%, which says nothing about 1,000 master games.
    games = best.count;
  }

  return { moves, share, games };
}

/**
 * Plans visible in a line, derived from the moves themselves.
 *
 * Deliberately narrow. Castling, pawn breaks, repeated piece journeys and
 * recaptures are all decidable from the board; "White has a space advantage" is
 * not, and inventing it is how this feature would start lying.
 */
export function motifsOf(
  fen: string,
  line: string[],
  yourColor: 'white' | 'black'
): MasterMotif[] {
  const board = new Chess(fen);
  const motifs: MasterMotif[] = [];
  const journeys = new Map<string, { piece: string; from: string; to: string; by: 'you' | 'them' }>();
  let pendingCapture: { square: string; by: 'you' | 'them' } | null = null;

  for (const san of line) {
    const mover = board.turn() === 'w' ? 'white' : 'black';
    const by: 'you' | 'them' = mover === yourColor ? 'you' : 'them';
    const isBreak = isPawnBreak(board, san);

    let played;
    try {
      played = board.move(san);
    } catch {
      break;
    }
    if (!played) break;

    if (san === 'O-O' || san === 'O-O-O') {
      motifs.push({ kind: 'castle', side: san === 'O-O' ? 'kingside' : 'queenside', by, san });
      continue;
    }
    if (isBreak) motifs.push({ kind: 'break', san, by });

    // A capture answered by a capture on the same square is a trade, not a won
    // piece. The reply is often not immediate — in the Alapin the recapture on
    // d4 comes two moves later — so a fixed one-ply lookback finds none of them.
    if (played.captured) {
      if (pendingCapture && pendingCapture.square === played.to && pendingCapture.by !== by) {
        motifs.push({ kind: 'trade', square: played.to, by });
        pendingCapture = null;
      } else {
        pendingCapture = { square: played.to, by };
      }
    }

    if (played.piece !== 'p') {
      // Track where each piece started and ended, so a two-step manoeuvre reads
      // as one idea (Nb1-c3-e2) rather than two disconnected moves.
      const existing = Array.from(journeys.values()).find(j => j.to === played.from && j.by === by);
      if (existing) {
        existing.to = played.to;
      } else {
        journeys.set(`${by}:${played.from}`, {
          piece: PIECE_NAME[played.piece] ?? played.piece,
          from: played.from,
          to: played.to,
          by,
        });
      }
    }
  }

  for (const journey of Array.from(journeys.values())) {
    if (journey.from === journey.to) continue;
    motifs.push({ kind: 'route', ...journey });
  }
  return motifs;
}

/**
 * Everything the corpus can say about one position.
 *
 * `yourMove` is optional but is the reason this exists: the report already
 * knows what it wants you to play, and whether masters agree is more use than
 * any amount of description.
 */
export function masterIdeas(
  fen: string,
  lookup: MasterLookup,
  yourColor: 'white' | 'black',
  yourMove?: string,
  config: MasterIdeasConfig = MASTER_IDEAS_DEFAULTS
): MasterView | null {
  const entry = lookup(fen);
  if (!entry || entry.moves.length === 0) return null;

  const { games, white, draws } = totals(entry.moves);
  if (games < config.minGames) return null;

  const ordered = [...entry.moves].sort((a, b) => b.count - a.count);
  const choices: MasterChoice[] = ordered
    .map(m => ({
      san: m.san,
      games: m.count,
      share: m.count / games,
      // The move is played BY the side to move, so its score belongs to them.
      score: scoreForSideToMove(fen, m),
    }))
    .filter(c => c.share >= config.minShare)
    .slice(0, config.maxChoices);

  let yourMoveView: MasterView['yourMove'];
  if (yourMove) {
    const index = ordered.findIndex(m => m.san === yourMove);
    yourMoveView =
      index === -1
        ? { san: yourMove, share: 0, games: 0, rank: null }
        : {
            san: yourMove,
            share: ordered[index].count / games,
            games: ordered[index].count,
            rank: index + 1,
          };
  }

  const principal = principalLine(fen, lookup, config);

  return {
    games,
    score: scoreForSideToMove(fen, { count: games, white, draws }),
    choices,
    yourMove: yourMoveView,
    principal: principal.moves,
    principalShare: principal.share,
    principalGames: principal.games,
    motifs: motifsOf(fen, principal.moves, yourColor),
  };
}
