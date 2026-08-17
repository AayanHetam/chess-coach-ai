import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  bhThreshold,
  cpToScoreEdge,
  dedupeNested,
  deficitPValue,
  findHoles,
  moveLoss,
  normalCdf,
  screenPositions,
  shrinkScore,
  HOLE_DEFAULTS,
  type Hole,
  type HoleFinderProviders,
} from '@/lib/scout/holeFinder';
import {
  buildPositionIndex,
  effectiveN,
  positionKey,
  positionScore,
} from '@/lib/scout/positionStats';
import { buildOpeningTree } from '@/lib/scoutService';
import type { ScoutGame } from '@/types/scout';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 0, 1);

let nextId = 0;
function game(moves: string[], result: string, ageDays = 0): ScoutGame {
  return {
    id: `g${nextId++}`,
    platform: 'chess.com',
    moves,
    whiteUsername: 'opponent_white',
    blackUsername: 'them',
    whiteRating: 1500,
    blackRating: 1500,
    result: result as ScoutGame['result'],
    timeClass: 'blitz',
    date: NOW - ageDays * DAY,
  };
}

/** `n` games down `moves`, of which `wins` are won by Black (the scouted side). */
function batch(moves: string[], n: number, blackScore: number, ageDays = 0): ScoutGame[] {
  const out: ScoutGame[] = [];
  const wins = Math.round(n * blackScore);
  for (let i = 0; i < n; i++) out.push(game(moves, i < wins ? '0-1' : '1-0', ageDays));
  return out;
}

/** Deterministic PRNG. Tests must not depend on Math.random. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * An opponent with NO weakness anywhere, but with realistic noise: fifty-odd
 * distinct lines whose scores scatter around 0.5 exactly as chance dictates.
 *
 * This is the fixture that actually tests the correction. A control where every
 * line sits at a flat 50% cannot produce a false discovery even with the
 * correction removed, so it proves nothing about it — which is precisely what
 * the first version of this file got wrong. Seed is fixed so the scatter is
 * reproducible.
 */
function noisyControl(seed = 7): ScoutGame[] {
  const rand = lcg(seed);
  const out: ScoutGame[] = [];
  const opening = new Chess();
  opening.move('e4');
  opening.move('c6');

  for (const w of opening.moves().slice(0, 8)) {
    const afterWhite = new Chess(opening.fen());
    afterWhite.move(w);
    for (const b of afterWhite.moves().slice(0, 6)) {
      const n = 45 + Math.floor(rand() * 60);
      let wins = 0;
      for (let i = 0; i < n; i++) if (rand() < 0.5) wins++;
      for (let i = 0; i < n; i++) {
        out.push(game(['e4', 'c6', w, b], i < wins ? '0-1' : '1-0'));
      }
    }
  }
  return out;
}

const SOUND = ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nf6'];
const HOLE = ['e4', 'c6', 'd4', 'd5', 'c4', 'Nf6', 'Nc3', 'e6'];

/** An opponent who is fine everywhere except one line, where they collapse. */
function plantedHole() {
  return [...batch(SOUND, 400, 0.5), ...batch(HOLE, 120, 0.1)];
}

/** The same opponent with no weakness — the control. */
function noHole() {
  return [...batch(SOUND, 400, 0.5), ...batch(HOLE, 120, 0.5)];
}

/**
 * A stub engine that is neutral everywhere, so nothing in these tests can pass
 * on the strength of an engine edge. Results are the only signal under test.
 */
function neutralEngine(): HoleFinderProviders {
  return {
    async evaluate(fen: string) {
      const board = new Chess(fen);
      const moves = board.moves();
      return { bestMove: moves[0] ?? '', cp: 0 };
    },
  };
}

// ── Statistics ───────────────────────────────────────────────────────────────

describe('normalCdf', () => {
  it('matches the textbook values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 4);
    expect(normalCdf(-3)).toBeCloseTo(0.00135, 4);
  });

  it('is symmetric about zero', () => {
    for (const z of [0.3, 1.1, 2.4, 4]) {
      expect(normalCdf(z) + normalCdf(-z)).toBeCloseTo(1, 6);
    }
  });
});

describe('deficitPValue', () => {
  it('is a coin flip when they score exactly at baseline', () => {
    expect(deficitPValue(0.5, 100, 0.5)).toBeCloseTo(0.5, 6);
  });

  it('shrinks as the deficit grows and as the sample grows', () => {
    const shallow = deficitPValue(0.4, 50, 0.5);
    const deeper = deficitPValue(0.3, 50, 0.5);
    const bigger = deficitPValue(0.4, 200, 0.5);
    expect(deeper).toBeLessThan(shallow);
    expect(bigger).toBeLessThan(shallow);
  });

  it('is one-sided — scoring ABOVE baseline is never evidence of a hole', () => {
    expect(deficitPValue(0.8, 100, 0.5)).toBeGreaterThan(0.9);
  });

  it('reports no evidence when there is no sample', () => {
    expect(deficitPValue(0, 0, 0.5)).toBe(1);
  });
});

describe('bhThreshold', () => {
  it('returns the step-up cutoff', () => {
    // m=5, q=0.1 → thresholds .02 .04 .06 .08 .10; p=.03 clears rank 2.
    expect(bhThreshold([0.001, 0.03, 0.5, 0.6, 0.9], 0.1)).toBeCloseTo(0.03, 9);
  });

  it('rejects everything when nothing clears its rank', () => {
    expect(bhThreshold([0.3, 0.4, 0.5], 0.1)).toBe(0);
  });

  it('is a step-UP procedure — a deep hit rescues weaker p-values below it', () => {
    // Rank 3 clears (0.06 <= 3/5*0.1), so the 0.05 at rank 2 is rejected too
    // even though it fails its own 0.04 threshold.
    const t = bhThreshold([0.001, 0.05, 0.06, 0.9, 0.95], 0.1);
    expect(t).toBeCloseTo(0.06, 9);
    expect(0.05).toBeLessThanOrEqual(t);
  });

  it('handles an empty screen', () => {
    expect(bhThreshold([], 0.1)).toBe(0);
  });

  it('gets stricter as more tests are screened', () => {
    const few = bhThreshold([0.02, 0.9], 0.1);
    const many = bhThreshold([0.02, ...Array.from({ length: 98 }, () => 0.9)], 0.1);
    expect(few).toBeGreaterThan(0);
    expect(many).toBe(0);
  });
});

describe('shrinkScore', () => {
  it('falls back to the baseline with no evidence', () => {
    expect(shrinkScore(0, 0, 0.48, 12)).toBe(0.48);
  });

  it('barely moves a large sample and heavily moves a small one', () => {
    expect(shrinkScore(0.2, 1000, 0.5, 12)).toBeCloseTo(0.2036, 3);
    expect(shrinkScore(0.2, 4, 0.5, 12)).toBeCloseTo(0.425, 3);
  });
});

describe('cpToScoreEdge', () => {
  it('is zero at an even evaluation', () => {
    expect(cpToScoreEdge(0)).toBeCloseTo(0, 9);
  });

  it('puts an engine loss and a results slump on the same scale', () => {
    // ~150cp should be worth about fifteen points of expected score, which is
    // what makes max(resultsEdge, engineEdge) a meaningful comparison.
    expect(cpToScoreEdge(150)).toBeCloseTo(0.1457, 3);
    expect(cpToScoreEdge(30)).toBeCloseTo(0.03, 2);
  });

  it('is monotone', () => {
    expect(cpToScoreEdge(50)).toBeGreaterThan(cpToScoreEdge(20));
  });
});

describe('moveLoss', () => {
  it('is zero when the move played IS the engine choice', () => {
    expect(moveLoss(-25, -25)).toBe(0);
  });

  it('measures how much worse the position is left for the mover', () => {
    // Both from the replier's view: leaving them -10 instead of -60 costs 50.
    expect(moveLoss(-10, -60)).toBe(50);
  });

  it('never rewards a move for beating the engine', () => {
    expect(moveLoss(-80, -60)).toBe(0);
  });
});

// ── The position index ───────────────────────────────────────────────────────

describe('buildPositionIndex', () => {
  it('pools transpositions into one position', () => {
    // The knight moves must come at different points in the two orders, so the
    // halfmove clocks differ (0 versus 2) and the raw FENs genuinely disagree.
    // With identical clocks the fixture would pass even if the key never
    // dropped the counters, and would be testing nothing.
    const orderA = ['Nf3', 'Nf6', 'd4', 'd5'];
    const orderB = ['d4', 'd5', 'Nf3', 'Nf6'];

    const fenOf = (moves: string[]) => {
      const b = new Chess();
      for (const m of moves) b.move(m);
      return b.fen();
    };
    expect(fenOf(orderA)).not.toBe(fenOf(orderB));
    expect(positionKey(fenOf(orderA))).toBe(positionKey(fenOf(orderB)));

    const index = buildPositionIndex(
      [...batch(orderA, 30, 0.5), ...batch(orderB, 30, 0.5)],
      'them',
      'black'
    );

    const stat = index.positions.get(positionKey(fenOf(orderA)))!;
    expect(stat).toBeDefined();
    expect(stat.games).toBe(60);
  });

  it('weights recent games more heavily', () => {
    // Won everything a year ago, lost everything since. One half-life back
    // counts half, so the weighted score must land near a third, not a half.
    const games = [
      ...batch(SOUND, 100, 1, 365),
      ...batch(SOUND, 100, 0, 0),
    ];
    const index = buildPositionIndex(games, 'them', 'black');
    expect(index.baseline).toBeCloseTo(1 / 3, 2);
  });

  it('reports the Kish effective sample, not the raw count or the weight sum', () => {
    // 100 games at weight 1 and 100 at weight 0.125 (three half-lives back).
    //   Σw  = 112.5      Σw² = 101.5625      (Σw)²/Σw² = 124.6
    // Asserting the exact value matters: a naive implementation returning Σw
    // gives 112.5, which sits inside any loose range one might write here.
    const mixed = buildPositionIndex(
      [...batch(SOUND, 100, 0.5, 0), ...batch(SOUND, 100, 0.5, 1095)],
      'them',
      'black'
    );
    const board = new Chess();
    for (const m of SOUND) board.move(m);
    const stat = mixed.positions.get(positionKey(board.fen()))!;

    expect(stat.games).toBe(200);
    expect(stat.weight).toBeCloseTo(112.5, 3);
    expect(effectiveN(stat)).toBeCloseTo(124.62, 1);
  });

  it('counts a repeated position once per game', () => {
    // Knights out and back: the start position recurs, but one game is one
    // observation of it, not two.
    const shuffle = batch(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6'], 20, 0.5);
    const index = buildPositionIndex(shuffle, 'them', 'black');

    const board = new Chess();
    board.move('Nf3');
    board.move('Nf6');
    const stat = index.positions.get(positionKey(board.fen()))!;
    expect(stat.games).toBe(20);
  });

  it('ignores the colour that was not scouted', () => {
    const index = buildPositionIndex(batch(SOUND, 40, 0.5), 'them', 'white');
    expect(index.games).toBe(0);
  });
});

// ── The screen ───────────────────────────────────────────────────────────────

describe('screenPositions', () => {
  it('confirms a planted hole', () => {
    const index = buildPositionIndex(plantedHole(), 'them', 'black');
    const screen = screenPositions(index, HOLE_DEFAULTS);
    const confirmed = Array.from(screen.tested.values()).filter(t => t.confirmed);

    expect(confirmed.length).toBeGreaterThan(0);
    for (const t of confirmed) expect(t.score).toBeLessThan(index.baseline);
  });

  it('confirms nothing when the same opponent has no weakness', () => {
    // The control. Without it, "confirms a planted hole" would also pass on
    // code that confirms everything it is handed.
    const index = buildPositionIndex(noHole(), 'them', 'black');
    const screen = screenPositions(index, HOLE_DEFAULTS);
    expect(Array.from(screen.tested.values()).filter(t => t.confirmed)).toHaveLength(0);
  });

  it('confirms nothing on an opponent who is merely noisy', () => {
    const index = buildPositionIndex(noisyControl(), 'them', 'black');
    const screen = screenPositions(index, HOLE_DEFAULTS);

    // The fixture has to be able to fool an uncorrected screen, or this proves
    // nothing: several lines must look significant on their own.
    const nominallySignificant = Array.from(screen.tested.values()).filter(
      t => t.p <= 0.05 && t.score < index.baseline
    );
    expect(screen.tests).toBeGreaterThan(20);
    expect(nominallySignificant.length).toBeGreaterThan(0);

    // And yet none of them is a real discovery.
    expect(Array.from(screen.tested.values()).filter(t => t.confirmed)).toHaveLength(0);
  });

  it('collapses a forced continuation into one test', () => {
    // Every game down HOLE continues identically, so its later positions carry
    // the same games and are not independent questions.
    const index = buildPositionIndex(plantedHole(), 'them', 'black');
    const screen = screenPositions(index, HOLE_DEFAULTS);

    const eligible = Array.from(index.positions.values()).filter(
      p => effectiveN(p) >= HOLE_DEFAULTS.minNeff
    );
    expect(screen.tests).toBeLessThan(eligible.length);
  });

  it('never tests a position below the effective-sample floor', () => {
    const index = buildPositionIndex(plantedHole(), 'them', 'black');
    const screen = screenPositions(index, HOLE_DEFAULTS);
    for (const t of Array.from(screen.tested.values())) {
      expect(t.n).toBeGreaterThanOrEqual(HOLE_DEFAULTS.minNeff);
    }
  });
});

// ── End to end ───────────────────────────────────────────────────────────────

describe('findHoles', () => {
  const run = (games: ScoutGame[]) => {
    const index = buildPositionIndex(games, 'them', 'black');
    const tree = buildOpeningTree(games, 'them', 'black', HOLE_DEFAULTS.maxPly, HOLE_DEFAULTS.minRepeats);
    return findHoles(tree, 'black', index, neutralEngine(), HOLE_DEFAULTS);
  };

  it('finds the planted hole and marks it confirmed', async () => {
    const report = await run(plantedHole());

    expect(report.confirmedWeakness).toBe(true);
    const top = report.holes[0];
    expect(top.tier).toBe('confirmed');
    expect(top.kind).toBe('results');
    // The line must actually be the planted one.
    expect(top.line.map(m => m.san).slice(0, 5)).toEqual(HOLE.slice(0, 5));
    expect(top.score).toBeLessThan(0.2);
  });

  it('reports no confirmed weakness on the control', async () => {
    const report = await run(noHole());
    expect(report.confirmedWeakness).toBe(false);
    expect(report.holes.every(h => h.tier !== 'confirmed')).toBe(true);
  });

  it('charges nothing for your own move choices in reach', async () => {
    // They answer 1.e4 with c6 every time and 2.d4/2.c4 are ours, so the
    // planted line stays highly reachable despite being five plies deep.
    const report = await run(plantedHole());
    expect(report.holes[0].reach).toBeGreaterThan(0.15);
  });

  it('names the move you actually have to play', async () => {
    const report = await run(plantedHole());
    // c4 at ply 5 is the last move of ours before their collapse.
    expect(report.holes[0].keyMove).toBe('c4');
  });

  it('leaves the p-value undefined for lines the screen never tested', async () => {
    const report = await run(plantedHole());
    for (const h of report.holes) {
      if (h.tier === 'prep') expect(h.p).toBeUndefined();
      else expect(typeof h.p).toBe('number');
    }
  });

  it('does not report one idea twice under different move orders', async () => {
    // The hole is reachable as 2.d4 d5 3.c4 and as 2.c4 d5 3.d4, which pool to
    // the same position. Only one of them may be recommended.
    const orders = [
      ['e4', 'c6', 'd4', 'd5', 'c4', 'Nf6'],
      ['e4', 'c6', 'c4', 'd5', 'd4', 'Nf6'],
    ];
    const report = await run([
      ...batch(SOUND, 400, 0.5),
      ...batch(orders[0], 60, 0.1),
      ...batch(orders[1], 60, 0.1),
    ]);

    const keys = report.holes.map(h => positionKey(h.fen));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('refuses to recommend a line the screen never tested', async () => {
    // Eight games at 0% is the most extreme sample imaginable, and it is still
    // not evidence — nothing corrected for the size of the search ever looked
    // at it. Shrinkage alone would turn it into a twenty-point "edge".
    const tiny = ['e4', 'c6', 'd4', 'd5', 'f3', 'e5'];
    const games = [...batch(SOUND, 400, 0.5), ...batch(tiny, 8, 0)];

    // Control: the line is present and above the repeat floor, so it genuinely
    // had the chance to be recommended.
    const tree = buildOpeningTree(games, 'them', 'black', HOLE_DEFAULTS.maxPly, HOLE_DEFAULTS.minRepeats);
    let node = tree;
    for (const san of tiny) {
      const next = node.children.find(c => c.move === san);
      expect(next, `tree is missing ${san}`).toBeDefined();
      node = next!;
    }
    expect(node.totalGames).toBe(8);

    const report = await run(games);
    for (const h of report.holes) {
      expect(h.neff).toBeGreaterThanOrEqual(HOLE_DEFAULTS.minNeff);
    }
  });

  it('stops evaluating once the engine budget is spent', async () => {
    const index = buildPositionIndex(plantedHole(), 'them', 'black');
    const tree = buildOpeningTree(plantedHole(), 'them', 'black', HOLE_DEFAULTS.maxPly, HOLE_DEFAULTS.minRepeats);
    let calls = 0;
    const counting: HoleFinderProviders = {
      async evaluate(fen) {
        calls++;
        return neutralEngine().evaluate(fen);
      },
    };
    const report = await findHoles(tree, 'black', index, counting, {
      ...HOLE_DEFAULTS,
      engineBudget: 6,
    });
    expect(calls).toBeLessThanOrEqual(6);
    expect(report.budgetExhausted).toBe(true);
  });

  it('carries the evidence a caller needs to be honest about the claim', async () => {
    const report = await run(plantedHole());
    expect(report.tests).toBeGreaterThan(0);
    expect(report.baselineGames).toBe(520);
    expect(report.baseline).toBeGreaterThan(0.4);

    const top = report.holes[0];
    expect(top.games).toBe(120);
    expect(top.neff).toBeGreaterThan(100);
    expect(top.p).toBeLessThan(0.01);
    expect(top.confirmedEdge).toBeGreaterThan(0);
  });
});

describe('dedupeNested', () => {
  const hole = (line: string[], fen: string, benefit: number): Hole =>
    ({
      line: line.map(san => ({ san, side: 'them' as const, games: 10 })),
      fen,
      kind: 'results',
      tier: 'signal',
      games: 10,
      neff: 10,
      score: 0.3,
      shrunkScore: 0.35,
      baseline: 0.5,
      scoreUpper: 0.45,
      concessionCp: 0,
      reach: 0.5,
      confirmedEdge: 0,
      edge: 0.15,
      benefit,
    }) as Hole;

  const FEN_A = 'rnbqkbnr/pp2pppp/2p5/3p4/2PPP3/8/PP3PPP/RNBQKBNR b KQkq -';
  const FEN_B = 'rnbqkbnr/pp2pppp/2p5/3p4/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq -';

  it('keeps the better of two move orders reaching the same position', () => {
    const kept = dedupeNested([
      hole(['e4', 'c6', 'd4', 'd5', 'c4'], FEN_A, 0.05),
      hole(['e4', 'c6', 'c4', 'd5', 'd4'], FEN_A, 0.09),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].benefit).toBeCloseTo(0.09, 9);
  });

  it('keeps the better of a line and its own continuation', () => {
    const kept = dedupeNested([
      hole(['e4', 'c6', 'd4'], FEN_A, 0.04),
      hole(['e4', 'c6', 'd4', 'd5'], FEN_B, 0.08),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].line).toHaveLength(4);
  });

  it('keeps genuinely different ideas', () => {
    const kept = dedupeNested([
      hole(['e4', 'c6', 'd4', 'd5', 'c4'], FEN_A, 0.09),
      hole(['e4', 'c6', 'd4', 'd5', 'Nf3'], FEN_B, 0.05),
    ]);
    expect(kept).toHaveLength(2);
  });
});

describe('positionScore', () => {
  it('is a draw-counts-half score', () => {
    expect(positionScore({ weight: 10, points: 4, weightSq: 10, key: '', ply: 1, games: 10, next: new Set(), replies: new Map() })).toBe(0.4);
  });
});
