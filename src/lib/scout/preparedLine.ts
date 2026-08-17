// ─────────────────────────────────────────────────────────────────────────────
// The line you actually play, from the hole onward.
//
// The hole finder answers "where do I steer them", and the answer is shallow by
// construction — a results deficit is only testable near the root, because their
// games fan out exponentially. Measured on a real archive, the effective sample
// down one branch went 25 → 22 → 17 → 13 → 8 → 4 → 3. Nothing at ply twelve will
// ever be statistically confirmable from one person's games.
//
// "1.e4 c5 2.c3, they score 31%" is therefore true, well-evidenced, and not
// what anybody asked for. It is a fact about a structure. Preparation is a
// SEQUENCE, and it is built from a different signal:
//
//   RESULTS tell you where they are weak.        Needs ~70 games. Shallow.
//   BEHAVIOUR tells you what they will play.     Needs a handful. Goes deep.
//
// A reply played in 25 of 25 games is a firm prediction on a sample that could
// never confirm a score deficit. So the line is extended by prediction, not by
// significance, and each ply carries its own confidence rather than inheriting a
// claim it cannot support.
//
// THE NOVELTY POINT
//
// The most valuable single fact in the report is where they leave known ground.
// At every one of your turns the engine's move is compared against what their
// opponents actually play, because at club level those differ constantly — in
// one archive the opponent's most common reply in a 260-game position was 25cp
// worse than the engine's, and the scouted player had faced the better move in
// only 71 of those games. A position they reach often, where the strongest move
// is one they have never had to answer, is a hole in their PREPARATION as
// opposed to a hole in their results. That is the thing worth walking into.
// ─────────────────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';
import {
  positionKey,
  type PositionIndex,
  type PositionStat,
} from '@/lib/scout/positionStats';
import type { HoleFinderProviders } from '@/lib/scout/holeFinder';

export interface PreparedMove {
  san: string;
  side: 'you' | 'them';
  /** Their games that reached the position this move was played from. */
  from: number;

  // ── their moves ──
  /** How often they choose this from here, by recency-weighted frequency. */
  probability?: number;
  /** Their other replies worth knowing about, most likely first. */
  alternatives?: Array<{ san: string; probability: number }>;

  // ── your moves ──
  /** How many of their games faced this move in this position. */
  timesFaced?: number;
  /** What their opponents usually play here instead. */
  commonReply?: string;
  /** Centipawns this is better than that common reply. */
  gainOverCommon?: number;
}

export type PreparedEnd = 'novelty' | 'unpredictable' | 'thin' | 'depth' | 'gameover' | 'noengine';

export interface PreparedLine {
  moves: PreparedMove[];
  /**
   * Index in `moves` of the first move of yours they have never faced. This is
   * the payoff: from here they are on their own, at a board you have prepared.
   */
  noveltyIndex?: number;
  /** Why the line stopped. */
  end: PreparedEnd;
}

export interface PreparedLineConfig {
  /** Total plies to extend, beyond the hole. */
  maxPly: number;
  /**
   * Their games that must have reached a position before their reply from it is
   * treated as a prediction rather than an anecdote.
   */
  minGames: number;
  /**
   * How dominant their top reply must be to carry a single line onward. Below
   * this they are genuinely choosing, and the line forks rather than guessing.
   */
  minProbability: number;
  /** Most lines to return. Branching is only useful up to what anyone will read. */
  maxLines: number;
  /** Most branches to take at any one fork. */
  maxBranch: number;
  /** Alternatives at or above this share are worth showing. */
  altProbability: number;
  /**
   * Centipawns your move must beat their opponents' usual choice by before it
   * is called out as something they have not had to meet.
   */
  minGain: number;
  /**
   * Share of their games in a position that may have faced your move before it
   * still counts as unfamiliar ground.
   *
   * Not zero. Two games in twenty-four is not "they know this" — it is a move
   * they will not have seen in nine games out of ten, and insisting on a
   * literal zero walks straight past the most useful moment in the line. It
   * also matches what can be predicted afterwards: a reply drawn from two games
   * is noise regardless.
   */
  noveltyRate: number;
}

export const PREPARED_DEFAULTS: PreparedLineConfig = {
  maxPly: 16,
  minGames: 5,
  minProbability: 0.55,
  maxLines: 3,
  maxBranch: 3,
  altProbability: 0.15,
  minGain: 20,
  noveltyRate: 0.15,
};

/** Their replies from a position, recency-weighted, most likely first. */
export function replyDistribution(
  stat: PositionStat | undefined
): Array<{ san: string; probability: number; games: number }> {
  if (!stat || stat.replies.size === 0) return [];
  let total = 0;
  for (const r of Array.from(stat.replies.values())) total += r.weight;
  if (total <= 0) return [];

  return Array.from(stat.replies.entries())
    .map(([san, r]) => ({ san, probability: r.weight / total, games: r.games }))
    .sort((a, b) => b.probability - a.probability || b.games - a.games);
}

/**
 * Extend a line from `fen` into the prepared continuation.
 *
 * Your moves come from the engine, theirs from their own history. The line ends
 * the moment either source runs out: when the engine has no answer, when they
 * have not been here often enough to predict, when they are genuinely split, or
 * when you play something they have never faced — after which their history
 * cannot say anything, and there is nothing honest left to add.
 */
export async function buildPreparedLine(
  fen: string,
  yourColor: 'white' | 'black',
  index: PositionIndex,
  providers: HoleFinderProviders,
  config: PreparedLineConfig = PREPARED_DEFAULTS,
  /** Force their first reply, so a caller can walk each side of a fork. */
  forcedFirstReply?: string
): Promise<PreparedLine> {
  const moves: PreparedMove[] = [];
  let noveltyIndex: number | undefined;
  let end: PreparedEnd = 'depth';

  const board = new Chess(fen);
  const seen = new Set<string>([positionKey(fen)]);

  for (let ply = 0; ply < config.maxPly; ply++) {
    if (board.isGameOver()) {
      end = 'gameover';
      break;
    }

    const key = positionKey(board.fen());
    const stat = index.positions.get(key);
    const here = stat?.games ?? 0;
    const yourTurn =
      (board.turn() === 'w' && yourColor === 'white') ||
      (board.turn() === 'b' && yourColor === 'black');

    if (yourTurn) {
      const evaluation = await providers.evaluate(board.fen());
      if (!evaluation?.bestMove) {
        end = 'noengine';
        break;
      }

      // What have they actually been shown here, and how much worse is it?
      const replies = replyDistribution(stat);
      const common = replies[0];
      const faced = replies.find(r => r.san === evaluation.bestMove)?.games ?? 0;

      let gainOverCommon: number | undefined;
      if (common && common.san !== evaluation.bestMove) {
        const gap = await centipawnGap(board.fen(), evaluation.bestMove, common.san, providers);
        if (gap !== null && gap >= config.minGain) gainOverCommon = gap;
      }

      const move: PreparedMove = {
        san: evaluation.bestMove,
        side: 'you',
        from: here,
        timesFaced: faced,
        commonReply: common && common.san !== evaluation.bestMove ? common.san : undefined,
        gainOverCommon,
      };

      try {
        if (!board.move(move.san)) {
          end = 'noengine';
          break;
        }
      } catch {
        end = 'noengine';
        break;
      }
      moves.push(move);

      // They have all but certainly never answered this. Anything past it
      // would be predicted from the handful of games that did.
      //
      // `replies.length` is the load-bearing condition. A position with games
      // but no recorded reply is one where their games simply stopped — the
      // index truncates at maxPly, and games end — which is an absence of data,
      // not evidence that a move is new to them. Without this the line claims a
      // novelty at its own horizon every time.
      if (replies.length > 0 && here >= config.minGames && faced / here <= config.noveltyRate) {
        noveltyIndex = moves.length - 1;
        end = 'novelty';
        break;
      }
      if (replies.length === 0) {
        end = 'thin';
        break;
      }
    } else {
      if (here < config.minGames) {
        end = 'thin';
        break;
      }
      const replies = replyDistribution(stat);
      const forced = ply === 0 && forcedFirstReply
        ? replies.find(r => r.san === forcedFirstReply)
        : undefined;
      const top = forced ?? replies[0];
      if (!top) {
        end = 'thin';
        break;
      }
      // A fork is not a dead end — the caller walks each side separately — but
      // one line must not silently pick a branch they take under half the time.
      if (!forced && top.probability < config.minProbability) {
        end = 'unpredictable';
        break;
      }

      const move: PreparedMove = {
        san: top.san,
        side: 'them',
        from: here,
        probability: top.probability,
        // Excludes the move THIS line took, which is not always the top one:
        // when the caller forked, listing the branch among its own alternatives
        // reads as though they might also play what they just played.
        alternatives: replies
          .filter(r => r.san !== top.san && r.probability >= config.altProbability)
          .map(r => ({ san: r.san, probability: r.probability })),
      };

      try {
        if (!board.move(move.san)) {
          end = 'thin';
          break;
        }
      } catch {
        end = 'thin';
        break;
      }
      moves.push(move);
    }

    // Shuffling back into a position already on the line is not preparation.
    const next = positionKey(board.fen());
    if (seen.has(next)) {
      end = 'unpredictable';
      break;
    }
    seen.add(next);
  }

  return { moves, noveltyIndex, end };
}

/**
 * The prepared continuation, forking where they genuinely choose.
 *
 * A single line is the right answer when one reply dominates, and a lie when it
 * does not: after the strongest entry found on a real archive their replies ran
 * 42% / 24% / 24%, and following the 42% alone would be preparation that fails
 * three games in five. Where no reply carries the position, each major one gets
 * its own line, most likely first.
 */
export async function buildPreparedLines(
  fen: string,
  yourColor: 'white' | 'black',
  index: PositionIndex,
  providers: HoleFinderProviders,
  config: PreparedLineConfig = PREPARED_DEFAULTS
): Promise<PreparedLine[]> {
  const stat = index.positions.get(positionKey(fen));
  const board = new Chess(fen);
  const theirTurn =
    !((board.turn() === 'w' && yourColor === 'white') ||
      (board.turn() === 'b' && yourColor === 'black'));

  const replies = theirTurn ? replyDistribution(stat) : [];
  const dominated = replies.length > 0 && replies[0].probability >= config.minProbability;

  // One line when they are predictable here, or when it is your move and there
  // is nothing to fork on yet.
  if (!theirTurn || replies.length === 0 || dominated) {
    return [await buildPreparedLine(fen, yourColor, index, providers, config)];
  }

  const branches = replies
    .filter(r => r.probability >= config.altProbability)
    .slice(0, Math.min(config.maxBranch, config.maxLines));

  const lines: PreparedLine[] = [];
  for (const branch of branches) {
    lines.push(
      await buildPreparedLine(fen, yourColor, index, providers, config, branch.san)
    );
  }
  return lines.filter(l => l.moves.length > 0);
}

/**
 * How much better `best` is than `common` from the mover's point of view.
 *
 * Sibling comparison for the same reason the hole finder uses one: parent and
 * child searched to the same nominal depth disagree by tens of centipawns in
 * the opening, and that bias cancels only between positions one ply apart on
 * the same side.
 */
async function centipawnGap(
  fen: string,
  best: string,
  common: string,
  providers: HoleFinderProviders
): Promise<number | null> {
  const after = async (san: string): Promise<number | null> => {
    try {
      const board = new Chess(fen);
      if (!board.move(san)) return null;
      const evaluation = await providers.evaluate(board.fen());
      return evaluation ? evaluation.cp : null;
    } catch {
      return null;
    }
  };

  const [bestCp, commonCp] = await Promise.all([after(best), after(common)]);
  if (bestCp === null || commonCp === null) return null;
  // Both are from the replier's view, so lower is better for the mover.
  return Math.max(0, commonCp - bestCp);
}
