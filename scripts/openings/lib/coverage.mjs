// The repertoire coverage model. Pure, no I/O, so the same code runs in the
// build script and in its tests.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS DOES AND WHY IT IS BUILT THIS WAY
//
// A repertoire is not a list of openings. It is a set of DECISIONS, one per
// position where the opponent can send you somewhere you have not prepared.
// Picking "the Grünfeld" answers 1.d4 and nothing else: after 1...Nf6 White can
// play 2.Bf4, 2.Bg5 or 2.Nc3, and no amount of Grünfeld theory helps. Those are
// separate decisions, and a repertoire builder that hides them is lying.
//
// So every coverage claim here is COMPUTED, never declared:
//
//   * "your system handles this" is set membership over the positions its real
//     move sequences reach, compared by FEN so transpositions resolve for free
//   * "you will face this X% of the time" is a frequency read off 3.4M games
//   * "this transposes into what you already play" is a bounded search where we
//     steer and the opponent branches by measured frequency
//
// Nothing is asserted by hand that could quietly rot, and no model writes any
// of it.
// ─────────────────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';

export const positionKey = fen => fen.split(' ').slice(0, 4).join(' ');

/** SAN moves out of PGN movetext. */
export function sansOfPgn(pgn) {
  if (!pgn) return [];
  return pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/).filter(Boolean);
}

/** Board after a SAN sequence, or null if any move is illegal. */
export function fenAfter(sans) {
  const board = new Chess();
  for (const san of sans) {
    try {
      if (!board.move(san)) return null;
    } catch {
      return null;
    }
  }
  return board.fen();
}

/** Every position along a SAN sequence, with the ply it sits at. */
export function walk(sans) {
  const board = new Chess();
  const out = [{ ply: 0, key: positionKey(board.fen()), fen: board.fen() }];
  for (let i = 0; i < sans.length; i++) {
    try {
      if (!board.move(sans[i])) return out;
    } catch {
      return out;
    }
    out.push({ ply: i + 1, key: positionKey(board.fen()), fen: board.fen() });
  }
  return out;
}

/**
 * The positions a named family actually occupies.
 *
 * `trunk` is the move order the family is being used in, and only lines
 * consistent with it count. That filter is load-bearing rather than tidying.
 * ECO names classify the STRUCTURE a game ends in, not the repertoire that
 * produced it, so "Grünfeld Defense: Flohr Defense" is reached by
 * 1.d4 d5 2.c4 c6 — a Slav move order. Counting it would tell a Grünfeld player
 * they are prepared for 1...d5, which they are not.
 *
 * `own` excludes the shared prefix: every Grünfeld line starts 1.d4, so "after
 * 1.d4" is not a Grünfeld position, and counting it makes every family look
 * like it covers everything. `any` keeps the prefix, and is what absorption
 * tests use, because there the question is only "does a line of mine still run
 * through this position".
 */
export function familyPositions(openings, prefix, trunk) {
  const lines = openings
    .filter(o => o.pgn && o.name.startsWith(prefix))
    .map(o => sansOfPgn(o.pgn))
    .filter(sans => trunk.every((m, i) => sans[i] === m));
  if (lines.length === 0) return null;
  const minPly = Math.min(...lines.map(l => l.length));
  const own = new Set();
  const any = new Set();
  for (const sans of lines) {
    for (const step of walk(sans)) {
      any.add(step.key);
      if (step.ply >= minPly) own.add(step.key);
    }
  }
  return { own, any, lines: lines.length, minPly };
}

/**
 * A human label for a position.
 *
 * Not simply "the opening whose line ends here". The dataset files bare family
 * names at whatever position their ECO code happens to land on, so "Sicilian
 * Defense" sits at 1.e4 c5 2.Nf3 d6 3.d4 cxd4 and NOTHING sits at 1.e4 c5.
 * Labelling by endpoint alone leaves the most common reply in chess unnamed.
 *
 * So an exact endpoint wins when there is one, and otherwise we name it after
 * the named lines running through it. NOT by the prefix they all share:
 * positions transpose, and 1.e4 c5 is also reached from the Bird Opening and
 * the Pterodactyl, so the universally-shared prefix of the 383 names passing
 * through the Sicilian is the empty string. Taking the prefix a clear majority
 * share instead survives that contamination and still refuses to name a
 * position that genuinely has no consensus.
 */
export function buildLabeller(openings) {
  const endsAt = new Map();
  const through = new Map();
  for (const o of openings) {
    if (!o.pgn) continue;
    const sans = sansOfPgn(o.pgn);
    const steps = walk(sans);
    if (steps.length !== sans.length + 1) continue; // unplayable pgn
    const last = steps[steps.length - 1].key;
    const prev = endsAt.get(last);
    if (!prev || sans.length < prev.ply) {
      endsAt.set(last, { name: o.name, ply: sans.length, eco: o.eco ?? null });
    }
    for (const step of steps) {
      if (step.ply === 0) continue;
      let bucket = through.get(step.key);
      if (!bucket) through.set(step.key, (bucket = []));
      // Capped: a shared prefix is decided by the first handful of names as
      // reliably as by four hundred, and the map is held for every position.
      if (bucket.length < 64) bucket.push(o.name);
    }
  }
  return function label(key) {
    const exact = endsAt.get(key);
    if (exact) return { name: exact.name, eco: exact.eco, exact: true };
    const names = through.get(key);
    if (!names || names.length === 0) return null;
    let pool = names.map(n => n.split(': '));
    const chosen = [];
    for (let i = 0; i < 3; i++) {
      const counts = new Map();
      for (const parts of pool) {
        const segment = parts[i];
        if (segment === undefined) continue;
        counts.set(segment, (counts.get(segment) ?? 0) + 1);
      }
      if (counts.size === 0) break;
      let best = null;
      for (const [segment, n] of counts) if (!best || n > best[1]) best = [segment, n];
      // A clear majority, or the position has no consensus name and we would
      // rather say nothing than pick one of several openings at random.
      if (best[1] / pool.length < 0.6) break;
      chosen.push(best[0]);
      pool = pool.filter(parts => parts[i] === best[0]);
    }
    return chosen.length ? { name: chosen.join(': '), eco: null, exact: false } : null;
  };
}

/** Moves played at a position in the master corpus, as shares. */
export function repliesAt(tree, fen) {
  const node = tree.positions[positionKey(fen)];
  if (!node || node.length === 0) return [];
  const total = node.reduce((sum, m) => sum + m[1], 0);
  if (total <= 0) return [];
  return node.map(m => ({ san: m[0], games: m[1], share: m[1] / total }));
}

/**
 * The probability the opponent lets you transpose into `own`, if you always
 * steer for it.
 *
 * MAX over our own moves because we choose them; frequency-weighted SUM over
 * theirs because they do. No move-order judgement is encoded anywhere: our
 * "choice" is whatever actually maximises arrival, read off the same corpus as
 * everything else.
 *
 * The horizon makes this a LOWER bound — a transposition first available at
 * ply 12 is not seen from depth 8 — which is the safe direction to be wrong in.
 * Callers must present it as "at least", never as "exactly".
 */
export function steerability(startFen, own, ourSide, maxPly, tree, cache = new Map()) {
  const memo = new Map();
  const child = (fen, san) => {
    const ck = `${fen}|${san}`;
    if (cache.has(ck)) return cache.get(ck);
    let out = null;
    try {
      const board = new Chess(fen);
      if (board.move(san)) out = board.fen();
    } catch {
      out = null;
    }
    cache.set(ck, out);
    return out;
  };
  function probability(fen, left) {
    const key = positionKey(fen);
    if (own.has(key)) return 1;
    if (left <= 0) return 0;
    const memoKey = `${key}|${left}`;
    const hit = memo.get(memoKey);
    if (hit !== undefined) return hit;
    // Guard against re-entering a position mid-search. Resolving it to 0
    // under-claims coverage, which is the direction that cannot mislead.
    memo.set(memoKey, 0);
    const replies = repliesAt(tree, fen);
    if (replies.length === 0) return 0;
    let out = 0;
    if (fen.split(' ')[1] === ourSide) {
      for (const reply of replies.slice(0, 10)) {
        const next = child(fen, reply.san);
        if (next) out = Math.max(out, probability(next, left - 1));
      }
    } else {
      for (const reply of replies) {
        const next = child(fen, reply.san);
        if (next) out += reply.share * probability(next, left - 1);
      }
    }
    memo.set(memoKey, out);
    return out;
  }
  return probability(startFen, maxPly);
}

/**
 * The branches a choice leaves for the player to answer separately.
 *
 * Walks forward from the slot: at the opponent's turns we take their measured
 * replies, at ours we take the move our own lines play. A reply our lines still
 * run through is absorbed and the walk continues past it. A reply they do not
 * run through is a gap, and a gap is a slot.
 *
 * `maxPly` is a deliberate cut between two different kinds of decision. Shallow
 * branches are REPERTOIRE decisions: 2.Bf4 against your Grünfeld is a different
 * opening and needs its own answer. Deep ones are THEORY decisions inside a
 * system already chosen, and putting those in a bracket would turn a page about
 * what to play into a page about how to play it.
 *
 * A choice with no family absorbs nothing, which is the correct model of "I
 * play 1...e5": that is one move, not a repertoire, and every White second move
 * really is still to be decided.
 */
export function findGaps(tree, family, trunk, { maxPly, minShare, limit = 10 }) {
  const gaps = [];
  const seen = new Set();
  (function step(sans, share) {
    if (sans.length >= maxPly || share < minShare) return;
    const fen = fenAfter(sans);
    if (!fen) return;
    for (const reply of repliesAt(tree, fen)) {
      const next = [...sans, reply.san];
      const weight = share * reply.share;
      if (weight < minShare) continue;
      const nextFen = fenAfter(next);
      if (!nextFen) continue;
      const key = positionKey(nextFen);
      if (family && family.any.has(key)) {
        // Ours to answer, and our own lines say how. Step past our reply so the
        // walk resumes at the opponent's next real decision.
        for (const ours of repliesAt(tree, nextFen)) {
          const after = [...next, ours.san];
          const afterFen = fenAfter(after);
          if (afterFen && family.any.has(positionKey(afterFen))) {
            step(after, weight);
            break;
          }
        }
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      gaps.push({ line: next, share: weight, key, fen: nextFen });
    }
  })(trunk, 1);
  return gaps.sort((a, b) => b.share - a.share).slice(0, limit);
}
