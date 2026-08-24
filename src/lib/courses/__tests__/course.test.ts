// The course generator. Their moves come from the corpus, ours from the engine.
//
// Every test here is about one of the two ways this can be plausibly wrong:
// recommending a move because it is popular rather than good, or reading the
// engine's answer backwards for Black.

import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  BLUNDER_CP,
  MATE_BASE,
  PREFER_POPULAR_CP,
  buildCourse,
  chooseOurMove,
  countLines,
  engineAt,
  forSide,
  playUci,
  positionKey,
  terminationOf,
} from '../../../../scripts/openings/lib/course.mjs';

const START = new Chess().fen();
const key = (sans: string[]) => {
  const b = new Chess();
  for (const s of sans) b.move(s);
  return positionKey(b.fen());
};
const fenOf = (sans: string[]) => {
  const b = new Chess();
  for (const s of sans) b.move(s);
  return b.fen();
};

/** A corpus: position key -> rows of [san, games, whiteWins, draws]. */
const tree = (positions: Record<string, [string, number, number, number][]>) => ({ positions });
/** An eval index: position key -> depth + [firstMoveUci, whiteRelativeCp]. */
const evals = (positions: Record<string, { d: number; p: [string, number][] }>) => ({ positions });

describe('playUci', () => {
  it('reads Chess960 castling, where the king takes its own rook', () => {
    // Lichess PV lines write O-O as e1h1. Passed through literally it is not a
    // legal move, the engine's recommendation silently drops, and popularity
    // wins by default — the exact failure this file exists to prevent.
    const b = new Chess('rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1');
    const move = playUci(b, 'e1h1');
    expect(move?.san).toBe('O-O');
  });

  it('reads long castling the same way', () => {
    const b = new Chess('r3kbnr/pppqpppp/2np4/8/8/2NPB3/PPPQPPPP/R3KBNR w KQkq - 0 1');
    expect(playUci(b, 'e1a1')?.san).toBe('O-O-O');
  });

  it('still reads an ordinary move, and a promotion', () => {
    expect(playUci(new Chess(), 'e2e4')?.san).toBe('e4');
    const b = new Chess('8/P7/8/8/8/8/8/K5k1 w - - 0 1');
    expect(playUci(b, 'a7a8q')?.san).toBe('a8=Q');
  });

  it('returns null for a move that is not legal, rather than throwing', () => {
    expect(playUci(new Chess(), 'e2e5')).toBeNull();
    expect(playUci(new Chess(), '')).toBeNull();
  });
});

describe('forSide', () => {
  it('leaves a White-relative score alone for White and flips it for Black', () => {
    // Measured on the real dump: signs agree with White 98.6% of the time
    // across 6,113 parent/child pairs. Reading it as side-to-move would invert
    // every recommendation we make for Black, and every number would still look
    // plausible on screen.
    expect(forSide(40, 'white')).toBe(40);
    expect(forSide(40, 'black')).toBe(-40);
  });
});

describe('engineAt', () => {
  const fen = fenOf(['e4']);
  const index = evals({
    [key(['e4'])]: { d: 40, p: [['e7e5', 20], ['c7c5', 35], ['e7e6', 60]] },
  });

  it('ranks moves best-for-us, which is not the PV order when we are Black', () => {
    // Stored White-relative: +20, +35, +60. For Black the best is the SMALLEST.
    expect(engineAt(index, fen, 'black')!.moves.map((m: { san: string }) => m.san)).toEqual([
      'e5',
      'c5',
      'e6',
    ]);
    expect(engineAt(index, fen, 'white')!.moves.map((m: { san: string }) => m.san)).toEqual([
      'e6',
      'c5',
      'e5',
    ]);
  });

  it('says nothing about a position it has no evaluation for', () => {
    expect(engineAt(evals({}), fen, 'white')).toBeNull();
  });

  it('drops a PV whose move is not legal here rather than inventing one', () => {
    const bad = evals({ [key(['e4'])]: { d: 40, p: [['a1a8', 0], ['e7e5', 20]] } });
    expect(bad && engineAt(bad, fen, 'black')!.moves.map((m: { san: string }) => m.san)).toEqual([
      'e5',
    ]);
  });
});

describe('chooseOurMove', () => {
  const fen = fenOf(['e4', 'e5']);
  const corpus = tree({
    [key(['e4', 'e5'])]: [
      ['Nf3', 900, 450, 200],
      ['Bc4', 100, 50, 20],
    ],
  });

  it('takes the popular move when the engine rates it within a hair of best', () => {
    const index = evals({
      [key(['e4', 'e5'])]: { d: 45, p: [['f1c4', 30], ['g1f3', 30 - PREFER_POPULAR_CP + 1]] },
    });
    const pick = chooseOurMove(corpus, index, fen, 'white')!;
    expect(pick.san).toBe('Nf3');
    expect(pick.src).toBe('corpus-confirmed');
  });

  it('overrules the popular move when the engine rates it clearly worse', () => {
    // The whole point of building lines with an engine: popularity is allowed
    // to be wrong, and a course built on it drills the mistake at full
    // confidence.
    const index = evals({
      [key(['e4', 'e5'])]: { d: 45, p: [['f1c4', 80], ['g1f3', 10]] },
    });
    const pick = chooseOurMove(corpus, index, fen, 'white')!;
    expect(pick.san).toBe('Bc4');
    expect(pick.src).toBe('corpus-confirmed');
    expect(pick.loss).toBe(0);
  });

  it('will not overrule popularity on a shallow evaluation over a small margin', () => {
    // Gap-filled evals come from our own Stockfish at ~depth 20. They must not
    // rewrite a main line at a depth the dump would have beaten four times over.
    const shallow = evals({
      [key(['e4', 'e5'])]: { d: 18, p: [['f1c4', 80], ['g1f3', 10]] },
    });
    expect(chooseOurMove(corpus, shallow, fen, 'white')!.san).toBe('Nf3');
  });

  it('does overrule a shallow evaluation when the popular move is a blunder', () => {
    const shallow = evals({
      [key(['e4', 'e5'])]: { d: 18, p: [['f1c4', 80], ['g1f3', 80 - BLUNDER_CP - 1]] },
    });
    expect(chooseOurMove(corpus, shallow, fen, 'white')!.san).toBe('Bc4');
  });

  it('picks for Black by the same rule, not by the stored sign', () => {
    const blackFen = fenOf(['e4', 'e5', 'Nf3']);
    const blackCorpus = tree({
      [key(['e4', 'e5', 'Nf3'])]: [
        ['Nc6', 900, 400, 200],
        ['Nf6', 100, 40, 20],
      ],
    });
    // White-relative: Nf6 leaves White at +5, Nc6 leaves White at +80. Black
    // should prefer Nf6. Reading the sign naively would choose Nc6.
    const index = evals({
      [key(['e4', 'e5', 'Nf3'])]: { d: 45, p: [['g8f6', 5], ['b8c6', 80]] },
    });
    expect(chooseOurMove(blackCorpus, index, blackFen, 'black')!.san).toBe('Nf6');
  });

  it('falls back to the corpus principal when there is no evaluation, and says so', () => {
    const pick = chooseOurMove(corpus, evals({}), fen, 'white')!;
    expect(pick.san).toBe('Nf3');
    expect(pick.src).toBe('corpus');
    expect(pick.cp).toBeNull();
  });

  it('has nothing to say about a position with neither corpus nor engine', () => {
    expect(chooseOurMove(tree({}), evals({}), fen, 'white')).toBeNull();
  });

  it('prefers a mate over any centipawn score', () => {
    const index = evals({
      [key(['e4', 'e5'])]: { d: 40, p: [['f1c4', MATE_BASE - 5], ['g1f3', 900]] },
    });
    expect(chooseOurMove(corpus, index, fen, 'white')!.san).toBe('Bc4');
  });
});

describe('terminationOf', () => {
  it('stops at the ply budget', () => {
    expect(terminationOf({ ply: 12, maxPly: 12, games: 500 })).toBe('depth');
  });

  it('calls a position with no corpus data a wall', () => {
    expect(terminationOf({ ply: 4, maxPly: 12, games: 0 })).toBe('wall');
  });

  it('keeps going through a deeply evaluated, dead-equal position', () => {
    // This is the regression. A `settled` state used to fire here — deep
    // evaluation, within 60cp of equal — and that describes essentially all
    // sound opening theory. It truncated the entire Najdorf course at ply 13,
    // three plies past its own root, with nine lines. Equality means both sides
    // played well, which is the part worth teaching.
    expect(terminationOf({ ply: 14, maxPly: 24, games: 500 })).toBeNull();
    expect(terminationOf({ ply: 20, maxPly: 24, games: 12000 })).toBeNull();
  });

  it('prefers the ply budget over the wall when both apply', () => {
    expect(terminationOf({ ply: 24, maxPly: 24, games: 0 })).toBe('depth');
  });
});

describe('buildCourse', () => {
  // 1.e4 e5, White to choose. Black answers 2...Nc6 (70%) or 2...Nf6 (30%).
  const corpus = tree({
    [key(['e4'])]: [['e5', 1000, 500, 200]],
    [key(['e4', 'e5'])]: [['Nf3', 1000, 500, 200]],
    [key(['e4', 'e5', 'Nf3'])]: [
      ['Nc6', 700, 350, 140],
      ['Nf6', 300, 150, 60],
    ],
    [key(['e4', 'e5', 'Nf3', 'Nc6'])]: [['Bb5', 700, 350, 140]],
    [key(['e4', 'e5', 'Nf3', 'Nf6'])]: [['Nxe5', 300, 150, 60]],
  });
  const index = evals({
    [key(['e4', 'e5'])]: { d: 45, p: [['g1f3', 25]] },
    [key(['e4', 'e5', 'Nf3', 'Nc6'])]: { d: 45, p: [['f1b5', 25]] },
    [key(['e4', 'e5', 'Nf3', 'Nf6'])]: { d: 45, p: [['f3e5', 30]] },
  });
  const course = buildCourse(corpus, index, {
    id: 'w-open',
    name: 'Open Game',
    root: ['e4', 'e5'],
    side: 'white',
    maxPly: 6,
    minShare: 0.05,
    minGames: 10,
  });

  it('is a graph keyed by position, so transpositions cost nothing', () => {
    expect(course.nodes[key(['e4', 'e5'])]).toBeDefined();
    expect(course.nodes[key(['e4', 'e5', 'Nf3'])]).toBeDefined();
  });

  it('makes our own move traversable', () => {
    // Without the child key the graph is a dead end at every one of our turns
    // and no consumer can follow the line without replaying it.
    const node = course.nodes[key(['e4', 'e5'])];
    expect(node.us).toBe('Nf3');
    expect(node.next).toBe(key(['e4', 'e5', 'Nf3']));
  });

  it('weights nodes by the OPPONENT shares only', () => {
    // We choose our own moves, so folding our own share in would measure how
    // likely we are to play into our own repertoire, treating their choices as
    // free — the inverted-reach bug from repertoireHole.ts in a new place.
    expect(course.nodes[key(['e4', 'e5'])].w).toBe(1);
    expect(course.nodes[key(['e4', 'e5', 'Nf3'])].w).toBe(1);
    expect(course.nodes[key(['e4', 'e5', 'Nf3', 'Nc6'])].w).toBeCloseTo(0.7, 4);
    expect(course.nodes[key(['e4', 'e5', 'Nf3', 'Nf6'])].w).toBeCloseTo(0.3, 4);
  });

  it('records how much of the position its taught replies account for', () => {
    expect(course.nodes[key(['e4', 'e5', 'Nf3'])].rc).toBeCloseTo(1, 4);
  });

  it('names the authority behind every move we recommend', () => {
    for (const node of Object.values(course.nodes) as { us?: string; src?: string }[]) {
      if (node.us) expect(node.src).toBeTruthy();
    }
  });

  it('counts distinct lines, not the times the walker entered a node', () => {
    expect(countLines(course)).toBe(2);
  });

  it('reports a chapter per real branch, with cumulative share', () => {
    expect(course.chapters).toHaveLength(2);
    expect(course.chapters[0].share).toBeCloseTo(0.7, 4);
    expect(course.chapters[course.chapters.length - 1].cum).toBeCloseTo(1, 4);
  });

  it('flags our move when it is far worse than the engine has on offer', () => {
    const bad = evals({
      [key(['e4', 'e5'])]: { d: 45, p: [['d2d4', 400], ['g1f3', 25]] },
    });
    const built = buildCourse(corpus, bad, {
      id: 'x',
      name: 'x',
      root: ['e4', 'e5'],
      side: 'white',
      maxPly: 4,
      minShare: 0.05,
      minGames: 10,
    });
    // d4 is not in the corpus at all, so the engine's choice stands and there is
    // no problem to report; the guard fires only when we take a popular move
    // that the engine rates far below its own.
    expect(built.nodes[key(['e4', 'e5'])].us).toBe('d4');
    expect(built.problems).toHaveLength(0);
  });

  it('refuses an illegal root rather than building a course from nowhere', () => {
    expect(() =>
      buildCourse(corpus, index, {
        id: 'x',
        name: 'x',
        root: ['e4', 'e4'],
        side: 'white',
        maxPly: 4,
      })
    ).toThrow();
  });
});

describe('system openings', () => {
  // The London is chosen because you play the same setup whatever they do. An
  // engine allowed to pick the move order here would quietly turn a London
  // course into something else, and the learner would never reach the position
  // they signed up for.
  const fen = fenOf(['d4', 'd5']);
  const corpus = tree({
    [key(['d4', 'd5'])]: [
      ['c4', 900, 450, 200],
      ['Bf4', 100, 50, 20],
    ],
  });
  const setup = ['Bf4', 'e3', 'Nf3'];

  it('plays the setup move even when the engine prefers another', () => {
    const index = evals({ [key(['d4', 'd5'])]: { d: 45, p: [['c2c4', 40], ['c1f4', 15]] } });
    const pick = chooseOurMove(corpus, index, fen, 'white', setup)!;
    expect(pick.san).toBe('Bf4');
    expect(pick.src).toBe('setup');
    expect(pick.loss).toBe(25);
  });

  it('plays the setup move when there is no evaluation at all', () => {
    const pick = chooseOurMove(corpus, evals({}), fen, 'white', setup)!;
    expect(pick.san).toBe('Bf4');
    expect(pick.src).toBe('setup');
  });

  it('refuses a setup move that is an outright blunder', () => {
    // The engine keeps a veto. Drilling a losing move because it fits the shape
    // of a system is the one thing worse than not teaching the system.
    const index = evals({
      [key(['d4', 'd5'])]: { d: 45, p: [['c2c4', 40], ['c1f4', 40 - 200]] },
    });
    const pick = chooseOurMove(corpus, index, fen, 'white', setup)!;
    expect(pick.san).not.toBe('Bf4');
    expect(pick.src).not.toBe('setup');
  });

  it('skips a setup move that is not legal yet and takes the next one', () => {
    // Bf4 already played, so the next setup move standing is e3.
    const later = fenOf(['d4', 'd5', 'Bf4', 'Nf6']);
    const laterCorpus = tree({ [key(['d4', 'd5', 'Bf4', 'Nf6'])]: [['e3', 500, 250, 100]] });
    const pick = chooseOurMove(laterCorpus, evals({}), later, 'white', ['Bf4', 'e3', 'Nf3'])!;
    expect(pick.san).toBe('e3');
  });
});
