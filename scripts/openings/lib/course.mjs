// The course model. Pure, no I/O, so the same code runs in the build script and
// in its tests.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT A COURSE IS, AND WHO DECIDES EACH MOVE
//
// A course is not paragraphs. It is a tree: our move at each of our turns,
// branching over what the opponent actually plays, deep enough to matter, with
// the evaluation attached.
//
// The two sides of that tree are decided by different authorities, and mixing
// them up is the whole failure mode:
//
//   THEIR moves come from the CORPUS. You prepare against what people play, not
//   against what an engine would play. A line built on engine replies teaches
//   you to beat Stockfish and leaves you unprepared for the 1400 in front of
//   you.
//
//   OUR move comes from the ENGINE. The most-played move is "most played, not
//   best" — brief() says so in its own comment — and a course built on
//   popularity inherits every popular inaccuracy at full confidence. That is
//   the worst possible outcome for a trainer, because it drills the mistake.
//
// The corpus still gets a vote on our side, but only as a tie-break: where a
// popular move is within PREFER_POPULAR_CP of the engine's choice, we play the
// popular one. It is equally sound, it is better trodden, and it reaches
// positions our own corpus can keep describing.
// ─────────────────────────────────────────────────────────────────────────────
//
// PAST THE CORPUS HORIZON the line does not stop. We can still say what to play,
// because the engine needs no corpus to have an opinion; we simply cannot branch
// over their replies any more, so the line continues single-file and says so.

import { Chess } from 'chess.js';

export const positionKey = fen => fen.split(' ').slice(0, 4).join(' ');

/** Mate encoding shared with build-eval-index.mjs. */
export const MATE_BASE = 100000;
export const isMate = cp => Math.abs(cp) >= MATE_BASE - 1000;

/**
 * A stored score is WHITE-RELATIVE. Measured, not assumed: across 6,113
 * parent/child pairs in the real dump the sign agreed with White 98.6% of the
 * time. Reading it as side-to-move would invert every recommendation we ever
 * make for Black, and every number on the page would still look plausible.
 */
export const forSide = (cp, side) => (side === 'white' ? cp : -cp);

/**
 * A UCI move applied to a board, including the Chess960 castling encoding.
 *
 * Lichess PV lines are UCI_Chess960, where castling is written KING TAKES ROOK
 * — `e1h1`, not `e1g1`. Passed through unconverted it is not a legal move, so
 * the engine's own recommendation silently drops and the corpus principal wins
 * by default. That is the failure this whole file exists to avoid, arriving by
 * the back door.
 */
export function playUci(board, uci) {
  if (!uci || uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.slice(4) || undefined;
  const piece = board.get(from);
  let dest = to;
  if (piece && piece.type === 'k') {
    if (from === 'e1' && to === 'h1') dest = 'g1';
    else if (from === 'e1' && to === 'a1') dest = 'c1';
    else if (from === 'e8' && to === 'h8') dest = 'g8';
    else if (from === 'e8' && to === 'a8') dest = 'c8';
  }
  try {
    return board.move({ from, to: dest, promotion });
  } catch {
    return null;
  }
}

/** Rows and true arrivals at a position, for either tree shape. See coverage.mjs. */
function nodeAt(tree, key) {
  const node = tree.positions?.[key];
  if (!node) return null;
  const rows = Array.isArray(node) ? node : node.m;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const sum = rows.reduce((s, m) => s + m[1], 0);
  const declared = Array.isArray(node) ? 0 : Number(node.t) || 0;
  return { rows, sum, total: Math.max(sum, declared) };
}

/** What people actually play here, as shares of the games that arrived. */
export function repliesAt(tree, fen) {
  const node = nodeAt(tree, positionKey(fen));
  if (!node || node.total <= 0) return [];
  return node.rows
    .map(m => ({
      san: m[0],
      games: m[1],
      share: m[1] / node.total,
      score: m[1] > 0 ? (m[2] + m[3] / 2) / m[1] : 0,
    }))
    .sort((a, b) => b.games - a.games);
}

/** Games that arrived at a position, 0 when we hold nothing. */
export function gamesAt(tree, fen) {
  return nodeAt(tree, positionKey(fen))?.total ?? 0;
}

/** Engine view of a position, already turned into SAN and our own perspective. */
export function engineAt(evals, fen, side) {
  const e = evals.positions?.[positionKey(fen)];
  if (!e || !Array.isArray(e.p) || e.p.length === 0) return null;
  const moves = [];
  for (const [uci, cp] of e.p) {
    const board = new Chess(fen);
    const played = playUci(board, uci);
    if (!played) continue;
    moves.push({ san: played.san, cp, ours: forSide(cp, side) });
  }
  if (moves.length === 0) return null;
  // Best FOR US, which is not the first PV when we are Black.
  moves.sort((a, b) => b.ours - a.ours);
  return { depth: e.d ?? 0, knodes: e.k ?? 0, moves };
}

/**
 * A popular move this close to the engine's choice is taken instead of it.
 *
 * Not zero, because the engine's preference between two moves it scores within
 * a tenth of a pawn is noise at any depth, and the popular one is better
 * trodden, more likely to have theory written about it, and reaches positions
 * our corpus can keep describing. Not large, because the point of building
 * lines with an engine is that popularity is allowed to be wrong.
 */
export const PREFER_POPULAR_CP = 15;

/** Our move is never worse than the engine's best by more than this. */
export const MAX_ENGINE_LOSS_CP = 150;

/**
 * Depth at which the engine is allowed to overrule a move people actually play.
 *
 * Measured on the real index: every override in a seven-opening sweep was backed
 * by depth >= 32, median 53, and the depth distribution for agreements was
 * identical — so this floor costs nothing today. It exists for the gap-filled
 * evaluations, which come from our own Stockfish at depth ~20 and must not be
 * able to overturn a main line on a small margin at a depth the dump would have
 * beaten four times over.
 */
export const MIN_OVERRIDE_DEPTH = 30;

/** Margin that overrules popularity even at a depth we would not otherwise trust. */
export const BLUNDER_CP = 100;

/** Below this the position is a rounding error in the player's year. */
export const DEFAULT_MIN_SHARE = 0.02;

/**
 * Which move WE play here, and on whose authority.
 *
 * `src` is recorded on every node because a trainer that cannot say where a move
 * came from cannot be audited, and "the engine says so" and "everyone plays it"
 * are very different claims to put in front of a learner.
 */
export function chooseOurMove(tree, evals, fen, side, setup = null) {
  const engine = engineAt(evals, fen, side);
  const played = repliesAt(tree, fen);

  // A SYSTEM is a system. The London is chosen precisely because you play the
  // same setup whatever they do, so an engine that prefers a different move
  // order here would quietly turn a London course into something else and the
  // learner would never reach the position they signed up for.
  //
  // The engine still has a veto: a setup move that is a real blunder is not
  // played, and the build says so rather than drilling it.
  if (setup && setup.length) {
    const board = new Chess(fen);
    const legal = new Set(board.moves());
    const wanted = setup.find(san => legal.has(san));
    if (wanted) {
      const rated = engine?.moves.find(m => m.san === wanted) ?? null;
      const loss = rated && engine ? Math.round(engine.moves[0].ours - rated.ours) : null;
      if (loss === null || loss <= MAX_ENGINE_LOSS_CP) {
        return {
          san: wanted,
          src: 'setup',
          cp: rated?.cp ?? null,
          loss,
          depth: engine?.depth ?? 0,
          share: played.find(r => r.san === wanted)?.share ?? 0,
        };
      }
    }
  }

  if (!engine) {
    // No evaluation. The corpus principal is all we have, and it is labelled as
    // exactly that rather than being passed off as a recommendation.
    if (played.length === 0) return null;
    return {
      san: played[0].san,
      src: 'corpus',
      cp: null,
      loss: null,
      depth: 0,
      share: played[0].share,
    };
  }

  const best = engine.moves[0];
  const byShare = new Map(played.map(r => [r.san, r.share]));

  // How far a popular move may fall short and still be taken. At a depth we do
  // not trust, only a real blunder is overruled — a shallow evaluation should
  // not be able to rewrite a main line over a tenth of a pawn.
  const tolerance =
    engine.depth >= MIN_OVERRIDE_DEPTH ? PREFER_POPULAR_CP : BLUNDER_CP;

  // A popular move that is close enough to the best one wins on the tie-break.
  let pick = best;
  let src = 'engine';
  for (const move of engine.moves) {
    const share = byShare.get(move.san) ?? 0;
    if (share <= 0) continue;
    if (best.ours - move.ours > tolerance) continue;
    if (share > (byShare.get(pick.san) ?? 0)) {
      pick = move;
      src = move.san === best.san ? 'engine' : 'corpus-confirmed';
    }
  }
  if (pick.san === best.san && (byShare.get(best.san) ?? 0) > 0) src = 'corpus-confirmed';

  return {
    san: pick.san,
    src,
    cp: pick.cp,
    loss: Math.round(best.ours - pick.ours),
    depth: engine.depth,
    share: byShare.get(pick.san) ?? 0,
    alternatives: engine.moves.slice(0, 3).map(m => ({ san: m.san, cp: m.cp })),
  };
}

/**
 * Replies frequent enough at this position to be worth an answer.
 *
 * Below the threshold the branch exists and we choose not to teach it, which is
 * `pruned` and is a different statement from "there is nothing there".
 */
export function theirReplies(tree, fen, minShare, minGames) {
  return repliesAt(tree, fen).filter(r => r.share >= minShare && r.games >= minGames);
}

/**
 * Why a line stopped. Three values, and every one of them is measured.
 *
 *   depth   the band's ply budget ran out — we chose to stop
 *   wall    the corpus has nothing here — we cannot see further
 *   pruned  the branch is real and below the share threshold
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THERE WAS A FOURTH, AND IT WAS WRONG
 *
 * `settled` was meant to mean "deep, evaluated, quiet — nothing left to teach",
 * and it fired when the engine had looked 30 plies deep and the position was
 * within 60 centipawns of equal.
 *
 * That describes essentially ALL sound opening theory. A correctly played
 * Najdorf is equal; that is why people play it. Measured on the first build:
 * 2,185 of about 3,900 terminations were `settled`, and the entire Najdorf
 * course stopped at ply 13 — three plies past its own root — with nine lines,
 * because by move 6 it was deeply evaluated and equal.
 *
 * Equality is not a signal that there is nothing to teach. It is a signal that
 * both sides have been playing well, which is the part worth teaching. There is
 * no reliable measure of "this position is done", so the concept is gone rather
 * than kept with a tuned threshold that would be just as arbitrary and would
 * fail silently in the same direction.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function terminationOf({ ply, maxPly, games }) {
  if (ply >= maxPly) return 'depth';
  if (games <= 0) return 'wall';
  return null;
}

/**
 * Build the course as a NODE GRAPH keyed by position, not a list of lines.
 *
 * Transpositions then pool for free — two move orders reaching the same position
 * are one thing to learn, and `reaches()` in the trainer already grades by
 * position. It also exposes the honest count: a course with 555 expanded paths
 * may hold ~512 distinct decisions, and reporting only the larger number is the
 * "coverage probe counted a shared prefix" bug wearing new clothes.
 */
export function buildCourse(tree, evals, opts) {
  const {
    root = [],
    side,
    maxPly = 24,
    minShare = DEFAULT_MIN_SHARE,
    minGames = 25,
    id,
    name,
    setup = null,
  } = opts;

  const board = new Chess();
  for (const san of root) {
    if (!board.move(san)) throw new Error(`illegal root move ${san} in ${root.join(' ')}`);
  }
  const rootPly = board.history().length;
  const rootFen = board.fen();

  const nodes = Object.create(null);
  const problems = [];
  let expanded = 0;

  // Chapters begin at the OPPONENT'S FIRST REAL BRANCH, wherever it falls.
  //
  // Not at the root: a White course rooted at 1.d4 d5 2.Bf4 starts on our own
  // move, and the first thing a learner actually has to distinguish is two
  // moves later. Keying chapters to the root produced exactly one chapter for
  // every course where we move first, which is most of them.
  const chapters = [];
  let branched = false;

  function chapterFor(replies) {
    if (branched) return null;
    branched = true;
    return replies.map((reply, i) => {
      const chapter = { i, share: Number(reply.share.toFixed(4)), title: null };
      chapters.push(chapter);
      return chapter;
    });
  }

  /**
   * `weight` is the product of the OPPONENT's shares only.
   *
   * We choose our own moves, so multiplying by our own share would be the
   * inverted-reach bug from repertoireHole.ts arriving in a new place: it would
   * measure how likely we are to play into our own repertoire, treating the
   * opponent's choices as free. The trunk is excluded for the same reason
   * familyPositions() excludes it — every London line starts 1.d4, and counting
   * it makes every chapter look like it covers everything.
   */
  function walk(fen, ply, weight, chapter) {
    const key = positionKey(fen);
    const existing = nodes[key];
    if (existing) {
      // Reached again by another move order. Its weight is the sum of the ways
      // in, and it keeps the shallowest ply because that is where it is taught.
      existing.w = Number((existing.w + weight).toFixed(6));
      if (ply < existing.p) existing.p = ply;
      return;
    }
    expanded++;

    const games = gamesAt(tree, fen);
    const b = new Chess(fen);
    const ours = (b.turn() === 'w') === (side === 'white');
    const engine = engineAt(evals, fen, side);

    const node = {
      p: ply,
      w: Number(weight.toFixed(6)),
      g: games,
      ch: chapter,
      end: null,
    };
    if (engine) {
      node.ev = { cp: engine.moves[0].cp, d: engine.depth };
    }
    nodes[key] = node;

    const end = terminationOf({ ply, maxPly, games });
    if (end) {
      node.end = end;
      return;
    }

    if (ours) {
      const pick = chooseOurMove(tree, evals, fen, side, setup);
      if (!pick) {
        node.end = 'wall';
        return;
      }
      if (pick.loss !== null && pick.loss > MAX_ENGINE_LOSS_CP) {
        problems.push(
          `${id}: at ${key} our move ${pick.san} is ${pick.loss}cp worse than ${pick.alternatives?.[0]?.san}`
        );
      }
      node.us = pick.san;
      node.src = pick.src;
      if (pick.loss !== null) node.loss = pick.loss;
      const next = new Chess(fen);
      next.move(pick.san);
      // The position our move leads to. Without it the graph is not traversable
      // through our own turns, and every consumer would have to replay the move
      // to find out where it went.
      node.next = positionKey(next.fen());
      // Our own move does not divide the weight: we always play it.
      walk(next.fen(), ply + 1, weight, chapter);
      return;
    }

    const replies = theirReplies(tree, fen, minShare, minGames);
    if (replies.length === 0) {
      node.end = games > 0 ? 'pruned' : 'wall';
      return;
    }
    const covered = replies.reduce((s, r) => s + r.share, 0);
    node.rc = Number(covered.toFixed(4));
    node.them = [];
    // The first position where they have a real choice is where the table of
    // contents comes from. Everything above it is the trunk every chapter shares.
    const opened = replies.length > 1 ? chapterFor(replies) : null;
    replies.forEach((reply, i) => {
      const next = new Chess(fen);
      if (!next.move(reply.san)) return;
      const childKey = positionKey(next.fen());
      node.them.push({
        san: reply.san,
        share: Number(reply.share.toFixed(4)),
        to: childKey,
      });
      const opening = opened?.[i];
      if (opening) {
        opening.at = childKey;
        opening.line = [...root, ...new Chess(next.fen()).history().slice(root.length)];
      }
      walk(next.fen(), ply + 1, weight * reply.share, opening ? opening.i : chapter);
    });
  }

  walk(rootFen, rootPly, 1, -1);
  if (chapters.length === 0) {
    chapters.push({ i: -1, at: positionKey(rootFen), line: [...root], title: null, share: 1 });
  }

  // Cumulative share, so the page can say "six chapters get you to 93%".
  chapters.sort((a, b) => b.share - a.share);
  let cum = 0;
  for (const chapter of chapters) {
    cum += chapter.share;
    chapter.cum = Number(cum.toFixed(4));
    chapter.nodes = Object.values(nodes).filter(n => n.ch === chapter.i).length;
  }


  const list = Object.values(nodes);
  return {
    meta: {
      id,
      name,
      root,
      side,
      maxPly,
      minShare,
      minGames,
      nodes: list.length,
      expanded,
      chapters: chapters.length,
      ourNodes: list.filter(n => n.us).length,
      byTermination: list.reduce((acc, n) => {
        if (n.end) acc[n.end] = (acc[n.end] ?? 0) + 1;
        return acc;
      }, {}),
      bySource: list.reduce((acc, n) => {
        if (n.src) acc[n.src] = (acc[n.src] ?? 0) + 1;
        return acc;
      }, {}),
      evaluated: list.filter(n => n.ev).length,
    },
    nodes,
    chapters,
    problems,
  };
}

/**
 * Distinct root-to-end paths through the graph.
 *
 * `meta.expanded` counts how many times the walker entered a node; two move
 * orders reaching the same position are ONE thing to learn, and reporting only
 * the larger number is the "coverage probe counted a shared prefix" bug wearing
 * new clothes. Every user-facing sentence uses this.
 *
 * Memoised, and cycle-safe: a transposition can make the graph cyclic, and an
 * unguarded walk would not terminate.
 */
export function countLines(course) {
  const memo = new Map();
  const onStack = new Set();

  const from = key => {
    if (memo.has(key)) return memo.get(key);
    if (onStack.has(key)) return 0; // a cycle contributes no new line
    const node = course.nodes[key];
    if (!node) return 1;
    onStack.add(key);
    let total;
    if (node.end) total = 1;
    else if (node.us) total = node.next ? from(node.next) : 1;
    else if (node.them?.length) total = node.them.reduce((sum, r) => sum + from(r.to), 0);
    else total = 1;
    onStack.delete(key);
    memo.set(key, total);
    return total;
  };

  const roots = course.chapters.map(c => c.at).filter(Boolean);
  if (roots.length === 0) return 0;
  return roots.reduce((sum, key) => sum + from(key), 0);
}
