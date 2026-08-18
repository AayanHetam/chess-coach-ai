import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  REPERTOIRE_DEFAULTS,
  findRepertoireHoles,
  formatLine,
  pickTodaysLine,
  teachingValue,
  type RepertoireHole,
  type RepertoireReport,
} from '@/lib/learn/repertoireHole';
import { positionKey } from '@/lib/scout/positionStats';
import type { HoleFinderProviders } from '@/lib/scout/holeFinder';
import type { ScoutGame } from '@/types/scout';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ME = 'me';

let nextId = 0;

/**
 * `n` games of `moves` in which I score `share`, playing `color`.
 *
 * Every game carries the SAME date so the recency weights are all exactly 1 and
 * the effective sample equals the game count. A moving clock here would make
 * every arithmetic assertion below approximate, and an approximate assertion is
 * how four joint-model tests once passed for the wrong reason.
 */
function games(moves: string[], n: number, share: number, color: 'white' | 'black' = 'white'): ScoutGame[] {
  const out: ScoutGame[] = [];
  const wins = Math.round(n * share);
  for (let i = 0; i < n; i++) {
    const iWon = i < wins;
    out.push({
      id: `g${nextId++}`,
      platform: 'chess.com',
      moves,
      whiteUsername: color === 'white' ? ME : 'other',
      blackUsername: color === 'black' ? ME : 'other',
      whiteRating: 1500,
      blackRating: 1500,
      result: (color === 'white'
        ? iWon
          ? '1-0'
          : '0-1'
        : iWon
          ? '0-1'
          : '1-0') as ScoutGame['result'],
      timeClass: 'blitz',
      date: Date.UTC(2026, 0, 1),
    });
  }
  return out;
}

/** Flat evaluation: nothing here can pass on the strength of an engine edge. */
const neutral = (): HoleFinderProviders => ({
  async evaluate(fen: string) {
    return { bestMove: new Chess(fen).moves()[0] ?? '', cp: 0 };
  },
});

/**
 * An engine that wants `better` played and prices the position I actually
 * reached at `penaltyCp` worse.
 *
 * `costOfMove` compares SIBLINGS — the position after my move against the
 * position after the engine's — so the penalty has to be attached to the fen I
 * arrived at, not to its parent.
 */
function disapproves(badFen: string, better: string, penaltyCp: number): HoleFinderProviders {
  const badKey = positionKey(badFen);
  return {
    async evaluate(fen: string) {
      const board = new Chess(fen);
      const legal = board.moves();
      return {
        bestMove: legal.includes(better) ? better : (legal[0] ?? ''),
        cp: positionKey(fen) === badKey ? penaltyCp : 0,
      };
    },
  };
}

function fenAfter(moves: string[]): string {
  const b = new Chess();
  for (const m of moves) b.move(m);
  return b.fen();
}

/**
 * A White archive with two teachable holes and enough branching that neither is
 * collapsed as a forced continuation.
 *
 *   1.e4 c5 2.c3   150 games, 30%  — frequent, moderate deficit
 *   1.e4 e6 2.d4 d5 3.Nc3   45 games, 10%  — rare, severe deficit
 *
 * The sibling on each branch exists purely so the hole is a real choice: a
 * position reached in ≥95% of its parent's games is one question told twice and
 * the screen collapses it.
 */
function whiteArchive(): ScoutGame[] {
  return [
    ...games(['e4', 'e5', 'Nf3', 'Nc6'], 300, 0.5),
    ...games(['e4', 'c5', 'c3', 'Nf6', 'e5'], 150, 0.3),
    ...games(['e4', 'c5', 'Nf3', 'd6', 'd4'], 100, 0.5),
    ...games(['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4'], 45, 0.1),
    ...games(['e4', 'e6', 'd4', 'd5', 'exd5', 'exd5'], 60, 0.5),
  ];
}

const findHole = (r: RepertoireReport, san: string): RepertoireHole | undefined =>
  r.holes.find(h => h.line[h.line.length - 1].san === san);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('findRepertoireHoles', () => {
  it('reports the moves under the right player', async () => {
    const report = await findRepertoireHoles(whiteArchive(), ME, 'white', neutral());
    const hole = findHole(report, 'c3');
    expect(hole).toBeDefined();

    // Asymmetric on purpose. `1.e4 c5 2.c3` alternates sides, so a fixture where
    // the labels were simply passed through unflipped would put c5 under my name
    // — which is exactly the bug this guards, and a symmetric line could not
    // distinguish the two.
    expect(hole!.line.map(m => `${m.san}:${m.side}`)).toEqual([
      'e4:you',
      'c5:opponent',
      'c3:you',
    ]);
  });

  it('un-flips the labels for Black too, where the opponent moves first', async () => {
    const archive = [
      ...games(['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], 300, 0.5, 'black'),
      ...games(['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7'], 150, 0.2, 'black'),
      ...games(['d4', 'Nf6', 'c4', 'c5', 'd5', 'e6'], 120, 0.5, 'black'),
    ];
    const report = await findRepertoireHoles(archive, ME, 'black', neutral());
    const hole = findHole(report, 'g6');
    expect(hole).toBeDefined();
    expect(hole!.line.map(m => `${m.san}:${m.side}`)).toEqual([
      'd4:opponent',
      'Nf6:you',
      'c4:opponent',
      'g6:you',
    ]);
  });

  it('only ever teaches a line that ends on a move I chose', async () => {
    const report = await findRepertoireHoles(whiteArchive(), ME, 'white', neutral());
    expect(report.holes.length).toBeGreaterThan(0);
    for (const h of report.holes) {
      expect(h.line[h.line.length - 1].side).toBe('you');
    }
  });

  it('ranks a frequent moderate leak above a rare severe one', async () => {
    const report = await findRepertoireHoles(whiteArchive(), ME, 'white', neutral());
    const frequent = findHole(report, 'c3');
    const severe = findHole(report, 'Nc3');
    expect(frequent).toBeDefined();
    expect(severe).toBeDefined();

    // The rare line is genuinely worse per game...
    expect(severe!.deficit).toBeGreaterThan(frequent!.deficit);
    // ...and still costs less overall, because it comes up a third as often.
    expect(frequent!.teachingValue).toBeGreaterThan(severe!.teachingValue);
    expect(report.holes[0].line[report.holes[0].line.length - 1].san).toBe('c3');
  });

  it('measures frequency from games that happened, not from a reach model', async () => {
    const report = await findRepertoireHoles(whiteArchive(), ME, 'white', neutral());
    const hole = findHole(report, 'c3')!;

    // 655 White games, 150 of them through 2.c3, all weight 1.
    expect(report.baselineNeff).toBeCloseTo(655, 6);
    expect(hole.neff).toBeCloseTo(150, 6);
    expect(hole.frequency).toBeCloseTo(150 / 655, 6);

    // A reach model would multiply my own move probabilities and land somewhere
    // else entirely: 1.e4 is played in every game, so reach would be the share
    // of c5 alone (250/655) and would not notice that only 150 of those went on
    // to 2.c3.
    expect(hole.frequency).not.toBeCloseTo(250 / 655, 3);
  });

  it('keeps teachingValue equal to frequency times deficit', async () => {
    const report = await findRepertoireHoles(whiteArchive(), ME, 'white', neutral());
    for (const h of report.holes) {
      expect(h.teachingValue).toBeCloseTo(teachingValue(h.frequency, h.deficit), 12);
      expect(h.deficit).toBeCloseTo(h.baseline - h.shrunkScore, 12);
    }
  });

  it('records the decision point, not just the position after it', async () => {
    const report = await findRepertoireHoles(whiteArchive(), ME, 'white', neutral());
    const hole = findHole(report, 'c3')!;

    expect(positionKey(hole.parentFen)).toBe(positionKey(fenAfter(['e4', 'c5'])));
    expect(positionKey(hole.fen)).toBe(positionKey(fenAfter(['e4', 'c5', 'c3'])));

    // And the move has to actually connect the two. The master corpus is asked
    // "where does c3 rank among the moves played HERE" — from a parent that is
    // not one ply before the position, that question has a confident answer to
    // something nobody asked.
    const board = new Chess(hole.parentFen);
    expect(board.move('c3')).toBeTruthy();
    expect(positionKey(board.fen())).toBe(positionKey(hole.fen));
  });

  it('pulls a thin sample back toward my own average', async () => {
    const report = await findRepertoireHoles(whiteArchive(), ME, 'white', neutral());
    const frequent = findHole(report, 'c3')!;
    const severe = findHole(report, 'Nc3')!;

    // Never left raw. A run of bad luck in a line I have played forty times is
    // mostly luck; the same run over a hundred and fifty is mostly me.
    for (const h of [frequent, severe]) {
      expect(h.shrunkScore).toBeGreaterThan(h.score);
      expect(h.shrunkScore).toBeLessThan(h.baseline);
    }

    const pull = (h: RepertoireHole) =>
      (h.shrunkScore - h.score) / (h.baseline - h.score);
    // 45 games get dragged a long way toward the mean; 150 barely budge.
    expect(pull(severe)).toBeGreaterThan(pull(frequent) * 2);
  });

  it('never teaches a position the screen did not test', async () => {
    const report = await findRepertoireHoles(whiteArchive(), ME, 'white', neutral());
    // 45 and 150 clear minNeff; nothing thinner may appear.
    for (const h of report.holes) {
      expect(h.neff).toBeGreaterThanOrEqual(REPERTOIRE_DEFAULTS.minNeff);
      expect(h.p).toBeLessThanOrEqual(1);
    }
  });

  it('blames the position, not the move, when the engine likes what I played', async () => {
    const report = await findRepertoireHoles(whiteArchive(), ME, 'white', neutral());
    const hole = findHole(report, 'c3')!;

    // A flat engine means my move threw away nothing. Naming a "better move"
    // here would point the user at noise and hide the real cause — they score
    // badly in a structure they cannot play, which is the whole finding the
    // scout research rests on.
    expect(hole.diagnosis).toBe('position');
    expect(hole.betterMove).toBeUndefined();
  });

  it('names the replacement when the engine really does disagree', async () => {
    const bad = fenAfter(['e4', 'c5', 'c3']);
    const report = await findRepertoireHoles(
      whiteArchive(),
      ME,
      'white',
      disapproves(bad, 'Nf3', 120)
    );
    const hole = findHole(report, 'c3')!;
    expect(hole.diagnosis).toBe('move');
    expect(hole.cpLoss).toBeCloseTo(120, 6);
    expect(hole.betterMove).toBe('Nf3');
  });

  it('holds its tongue below the centipawn bar rather than dressing up noise', async () => {
    const bad = fenAfter(['e4', 'c5', 'c3']);
    // Under `moveLossCp` (30) — a real number, and not one worth acting on.
    const report = await findRepertoireHoles(
      whiteArchive(),
      ME,
      'white',
      disapproves(bad, 'Nf3', 12)
    );
    const hole = findHole(report, 'c3')!;
    expect(hole.cpLoss).toBeCloseTo(12, 6);
    expect(hole.diagnosis).toBe('position');
    expect(hole.betterMove).toBeUndefined();
  });

  it('separates "not enough games" from "nothing is wrong"', async () => {
    const thin = await findRepertoireHoles(games(['e4', 'e5'], 6, 0.2), ME, 'white', neutral());
    expect(thin.insufficientData).toBe(true);
    expect(thin.holes).toHaveLength(0);

    // Plenty of games, every branch at the same score: we looked properly and
    // there is nothing to report. Telling this player to "play more games"
    // would be the opposite of the truth.
    const even = await findRepertoireHoles(
      [
        ...games(['e4', 'e5', 'Nf3', 'Nc6'], 300, 0.5),
        ...games(['e4', 'c5', 'c3', 'Nf6'], 150, 0.5),
        ...games(['e4', 'c5', 'Nf3', 'd6'], 100, 0.5),
      ],
      ME,
      'white',
      neutral()
    );
    expect(even.insufficientData).toBe(false);
    expect(even.tests).toBeGreaterThan(0);
    expect(even.holes).toHaveLength(0);
  });

  it('spends no engine time on lines it will not show', async () => {
    let calls = 0;
    const counting: HoleFinderProviders = {
      async evaluate(fen: string) {
        calls += 1;
        return { bestMove: new Chess(fen).moves()[0] ?? '', cp: 0 };
      },
    };
    const report = await findRepertoireHoles(whiteArchive(), ME, 'white', counting);
    // Ranking is a results measurement and costs nothing, so at most three
    // evaluations per returned line: the parent, the move played, the move
    // preferred. Anything much above that means the shortlist leaked.
    expect(calls).toBeLessThanOrEqual(3 * report.holes.length + 1);
    expect(report.evaluated).toBeLessThanOrEqual(calls);
  });

  it('never issues two evaluations at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const watched: HoleFinderProviders = {
      async evaluate(fen: string) {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(r => setTimeout(r, 0));
        inFlight -= 1;
        return { bestMove: new Chess(fen).moves()[0] ?? '', cp: 0 };
      },
    };
    await findRepertoireHoles(whiteArchive(), ME, 'white', watched);
    // A provider backed by one engine process is a single conversation. Two
    // `position`/`go` pairs in flight come back crossed, which surfaces as a
    // move illegal in the position it was returned for.
    expect(maxInFlight).toBe(1);
  });
});

describe('pickTodaysLine', () => {
  const hole = (over: Partial<RepertoireHole>): RepertoireHole => ({
    line: [{ san: 'e4', side: 'you', games: 10 }],
    fen: new Chess().fen(),
    parentFen: new Chess().fen(),
    color: 'white',
    tier: 'signal',
    diagnosis: 'position',
    games: 50,
    neff: 50,
    score: 0.3,
    shrunkScore: 0.35,
    baseline: 0.5,
    p: 0.02,
    frequency: 0.1,
    deficit: 0.15,
    teachingValue: 0.015,
    ...over,
  });

  it('returns nothing when there is nothing to teach', () => {
    expect(pickTodaysLine([])).toBeNull();
  });

  it('prefers a measured line over a larger guess', () => {
    const measured = hole({ tier: 'confirmed', teachingValue: 0.01 });
    const guess = hole({ tier: 'signal', teachingValue: 0.09 });
    expect(pickTodaysLine([{ holes: [guess, measured] } as RepertoireReport])).toBe(measured);
  });

  it('falls back to the largest unconfirmed line when none is confirmed', () => {
    const small = hole({ teachingValue: 0.01 });
    const big = hole({ teachingValue: 0.09 });
    expect(pickTodaysLine([{ holes: [small, big] } as RepertoireReport])).toBe(big);
  });

  it('compares across both colours', () => {
    const asWhite = hole({ color: 'white', teachingValue: 0.02 });
    const asBlack = hole({ color: 'black', teachingValue: 0.08 });
    const picked = pickTodaysLine([
      { holes: [asWhite] } as RepertoireReport,
      { holes: [asBlack] } as RepertoireReport,
    ]);
    expect(picked).toBe(asBlack);
  });
});

describe('formatLine', () => {
  it('numbers a White line', () => {
    expect(
      formatLine(
        [
          { san: 'e4', side: 'you', games: 1 },
          { san: 'c5', side: 'opponent', games: 1 },
          { san: 'c3', side: 'you', games: 1 },
        ],
        'white'
      )
    ).toBe('1.e4 c5 2.c3');
  });

  it('numbers a Black line, where the opponent has the odd moves', () => {
    expect(
      formatLine(
        [
          { san: 'd4', side: 'opponent', games: 1 },
          { san: 'Nf6', side: 'you', games: 1 },
          { san: 'c4', side: 'opponent', games: 1 },
          { san: 'g6', side: 'you', games: 1 },
        ],
        'black'
      )
    ).toBe('1.d4 Nf6 2.c4 g6');
  });
});
