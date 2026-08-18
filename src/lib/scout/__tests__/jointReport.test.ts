import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { buildHoleReport } from '@/lib/scout/buildHoleReport';
import type { HoleFinderProviders } from '@/lib/scout/holeFinder';
import type { ScoutGame } from '@/types/scout';

let nextId = 0;
/** Games for `who`, playing `color`, scoring `score` down `moves`. */
function games(
  who: string,
  color: 'white' | 'black',
  moves: string[],
  n: number,
  score: number
): ScoutGame[] {
  const wins = Math.round(n * score);
  const theirWin = color === 'white' ? '1-0' : '0-1';
  const theirLoss = color === 'white' ? '0-1' : '1-0';
  return Array.from({ length: n }, (_, i) => ({
    id: `g${nextId++}`,
    platform: 'chess.com' as const,
    moves,
    whiteUsername: color === 'white' ? who : 'someone',
    blackUsername: color === 'black' ? who : 'someone',
    whiteRating: 1500,
    blackRating: 1500,
    result: (i < wins ? theirWin : theirLoss) as ScoutGame['result'],
    timeClass: 'blitz' as ScoutGame['timeClass'],
    date: Date.UTC(2026, 0, 1),
  }));
}

const neutral = (): HoleFinderProviders => ({
  async evaluate(fen: string) {
    return { bestMove: new Chess(fen).moves()[0] ?? '', cp: 0 };
  },
});

const SOUND = ['e4', 'e5', 'Nf3', 'Nc6'];
const HOLE = ['e4', 'c5', 'c3', 'Nf6'];

/** They are fine everywhere except HOLE, where they collapse. */
const opponent = () => [
  ...games('them', 'black', SOUND, 400, 0.5),
  ...games('them', 'black', HOLE, 120, 0.1),
];

/**
 * Your archive: a body of ordinary games at your baseline, plus however you do
 * in the hole.
 *
 * The rest of the archive is the load-bearing part. Handed only the hole games,
 * your baseline IS your score there, the surplus is exactly zero, and every
 * assertion about promotion or demotion quietly tests nothing.
 */
const mine = (holeGames: number, holeScore: number) => [
  ...games('me', 'white', ['d4', 'd5', 'c4', 'e6'], 300, 0.5),
  ...games('me', 'white', HOLE, holeGames, holeScore),
];

const run = (yourGames?: ScoutGame[]) =>
  buildHoleReport(opponent(), 'them', 'white', {
    makeProvider: neutral,
    yourGames,
    yourUsername: yourGames ? 'me' : undefined,
  });

describe('pairing your archive with theirs', () => {
  it('says nothing about you when your games were not supplied', async () => {
    const report = await run();
    expect(report!.holes[0].you).toBeUndefined();
    // And the ranking is the one-sided one: joint edge is just their edge.
    expect(report!.holes[0].jointEdge).toBeCloseTo(report!.holes[0].edge, 9);
  });

  it('says nothing about you in a position you have never reached', async () => {
    // Your games share no opening with the hole at all.
    const elsewhere = games('me', 'white', ['d4', 'd5', 'c4', 'e6'], 200, 0.5);
    const report = await run(elsewhere);
    expect(report!.holes[0].you).toBeUndefined();
  });

  it('reports your own record in the same position', async () => {
    const report = await run(mine(60, 0.8));
    const you = report!.holes[0].you!;

    expect(you.games).toBe(60);
    expect(you.score).toBeCloseTo(0.8, 2);
    expect(you.surplus).toBeGreaterThan(0);
  });

  it('ranks a line higher when you are strong there too', async () => {
    const cold = await run();
    const warm = await run(mine(60, 0.8));
    expect(warm!.holes[0].benefit).toBeGreaterThan(cold!.holes[0].benefit);
  });

  it('ranks a line lower when you are ALSO bad there', async () => {
    // The whole point. Them at 10% and you at 15% is not an edge, it is a
    // position you are both bad at, and the one-sided report cannot see it.
    const cold = await run();
    const weak = await run(mine(60, 0.15));

    expect(weak!.holes[0].you!.surplus).toBeLessThan(0);
    expect(weak!.holes[0].benefit).toBeLessThan(cold!.holes[0].benefit);
  });

  it('measures each of you against your OWN baseline', async () => {
    // You score 60% here but 60% everywhere — no surplus. A player who wins a
    // lot is not unusually good in this position, and a rating gap must not
    // read as an edge.
    const yours = [
      ...games('me', 'white', HOLE, 60, 0.6),
      ...games('me', 'white', ['d4', 'd5'], 300, 0.6),
    ];
    const report = await run(yours);
    expect(report!.holes[0].you!.surplus).toBeCloseTo(0, 1);
  });

  it('does not let a handful of your games veto a confirmed weakness', async () => {
    // Three bad games of yours shrink almost entirely toward your baseline, so
    // a 120-game collapse of theirs still survives.
    const report = await run(mine(3, 0));
    expect(report!.confirmedWeakness).toBe(true);
    expect(report!.holes[0].benefit).toBeGreaterThan(0);
  });

  it('shrinks your side by sample size like theirs', async () => {
    const many = await run(mine(200, 0.9));
    const few = await run(mine(4, 0.9));
    expect(many!.holes[0].you!.surplus).toBeGreaterThan(few!.holes[0].you!.surplus);
  });
});
