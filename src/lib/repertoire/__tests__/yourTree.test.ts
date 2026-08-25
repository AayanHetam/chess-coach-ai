// Counting somebody's own games is the one place on this page where a wrong
// number is indistinguishable from a right one.
//
// The corpus share can be sanity-checked against chess knowledge: if the page
// said 1.e4 was 4% of games, anybody would notice. A PERSONAL share has no such
// check — "you meet the Caro-Kann in 8% of your games" is unfalsifiable to the
// reader, so every failure mode here ships silently and looks authoritative.
//
// The three that would:
//   1. A username that matches nothing produces all zeros, which renders as
//      "you have never played 1.e4" rather than "we could not find you".
//   2. Dividing by TOTAL games instead of games as that colour, which halves
//      every share and still looks plausible.
//   3. Counting the opponent's move as yours at a slot, which would tell a
//      Caro-Kann player that they play the Sicilian.

import { describe, expect, it } from 'vitest';
import {
  MIN_GAMES_PER_COLOUR,
  MIN_REACHES_FOR_SHARE,
  buildYourTree,
  factsFor,
  mainMoveAt,
  measuredFor,
  sideOf,
} from '@/lib/repertoire/yourTree';
import type { RepertoireSlot } from '@/types/repertoire';
import type { ScoutGame } from '@/types/scout';

const ME = 'aayan';

const slot = (id: string, side: 'white' | 'black', line: string[]): RepertoireSlot =>
  ({
    id,
    side,
    line,
    fen: '',
    share: 0,
    name: null,
    eco: null,
    origin: null,
    moves: [],
    replyCoverage: 1,
    brief: null,
    choices: [],
  }) as RepertoireSlot;

const SLOTS: RepertoireSlot[] = [
  slot('white:', 'white', []),
  slot('black:e4', 'black', ['e4']),
  slot('black:d4', 'black', ['d4']),
  slot('white:e4 c5', 'white', ['e4', 'c5']),
  slot('black:d4 Nf6 Bg5', 'black', ['d4', 'Nf6', 'Bg5']),
];

let seq = 0;
const game = (
  moves: string[],
  as: 'white' | 'black',
  opts: Partial<ScoutGame> = {}
): ScoutGame =>
  ({
    id: `g${seq++}`,
    platform: 'lichess',
    moves,
    whiteUsername: as === 'white' ? ME : 'opponent',
    blackUsername: as === 'black' ? ME : 'opponent',
    result: '1-0',
    date: 1_700_000_000_000,
    ...opts,
  }) as ScoutGame;

/** n games, so a colour clears MIN_GAMES_PER_COLOUR without hand-writing 30. */
const many = (n: number, moves: string[], as: 'white' | 'black') =>
  Array.from({ length: n }, () => game(moves, as));

describe('sideOf', () => {
  it('finds them on either side, case-insensitively', () => {
    expect(sideOf(game(['e4'], 'white'), 'AaYaN')).toBe('white');
    expect(sideOf(game(['e4'], 'black'), 'aayan')).toBe('black');
  });

  it('returns null rather than guessing when they are in neither seat', () => {
    expect(sideOf(game(['e4'], 'white'), 'someone-else')).toBeNull();
  });

  it('returns null for a blank username instead of matching a blank seat', () => {
    // A ScoutGame with a missing username and a blank query would otherwise
    // "match", attributing a stranger's game to the user.
    const anonymous = { ...game(['e4'], 'white'), whiteUsername: '', blackUsername: '' };
    expect(sideOf(anonymous as ScoutGame, '')).toBeNull();
    expect(sideOf(anonymous as ScoutGame, '   ')).toBeNull();
  });
});

describe('buildYourTree', () => {
  // ── Failure mode 1: a username that matches nothing ──────────────────────
  it('reports games it could not attribute rather than counting them as zeros', () => {
    const tree = buildYourTree(many(40, ['e4', 'c5'], 'white'), 'wrong-handle', SLOTS);
    expect(tree.unattributed).toBe(40);
    expect(tree.games).toEqual({ white: 0, black: 0 });
    // And the derived guard refuses to state shares off it, so the page cannot
    // render "you have never played 1.e4" from a typo.
    expect(measuredFor(tree, 'white')).toBe(false);
    expect(measuredFor(tree, 'black')).toBe(false);
  });

  // ── Failure mode 2: the wrong denominator ────────────────────────────────
  it('divides by games as that COLOUR, not by total games', () => {
    // 40 as White (all 1.e4), 40 as Black (all facing 1.d4). If either share
    // divided by 80 it would read 50% instead of 100%.
    const games = [...many(40, ['e4', 'c5'], 'white'), ...many(40, ['d4', 'Nf6'], 'black')];
    const tree = buildYourTree(games, ME, SLOTS);
    expect(tree.games).toEqual({ white: 40, black: 40 });
    expect(factsFor(tree, 'white:').share).toBe(1);
    expect(factsFor(tree, 'black:d4').share).toBe(1);
    // And the colour they never faced 1.e4 in is a true zero, not an absence.
    expect(factsFor(tree, 'black:e4').share).toBe(0);
    expect(factsFor(tree, 'black:e4').reached).toBe(0);
  });

  // ── Failure mode 3: the opponent's move recorded as yours ────────────────
  it('records YOUR move at a slot, never the opponent reply that created it', () => {
    // As Black against 1.e4 they answer 1...c6 every time. The slot's own line
    // is ['e4'] — White's move — and the move that must be recorded is c6.
    const tree = buildYourTree(many(40, ['e4', 'c6', 'd4', 'd5'], 'black'), ME, SLOTS);
    expect(factsFor(tree, 'black:e4').played).toEqual([{ san: 'c6', games: 40 }]);
    // The White slot at the same depth is not theirs and must be untouched.
    expect(factsFor(tree, 'white:').reached).toBe(0);
  });

  it('records nothing at a slot the game never reached', () => {
    const tree = buildYourTree(many(40, ['d4', 'd5'], 'black'), ME, SLOTS);
    expect(factsFor(tree, 'black:e4')).toEqual({ reached: 0, share: 0, played: [] });
  });

  it('counts a deep slot only when the whole line matches', () => {
    const hit = many(20, ['d4', 'Nf6', 'Bg5', 'e6'], 'black');
    const miss = many(20, ['d4', 'Nf6', 'c4', 'g6'], 'black');
    const tree = buildYourTree([...hit, ...miss], ME, SLOTS);
    expect(factsFor(tree, 'black:d4 Nf6 Bg5').reached).toBe(20);
    expect(factsFor(tree, 'black:d4').reached).toBe(40);
    expect(factsFor(tree, 'black:d4 Nf6 Bg5').share).toBeCloseTo(0.5, 6);
  });

  it('ignores aborted games instead of letting them dilute every share', () => {
    // Thirty real 1.e4 games and ten aborts. Counting the aborts would make
    // "you play 1.e4" read as 75%.
    const games = [...many(30, ['e4'], 'white'), ...many(10, [], 'white')];
    const tree = buildYourTree(games, ME, SLOTS);
    expect(tree.games.white).toBe(30);
    expect(factsFor(tree, 'white:').share).toBe(1);
  });

  it('orders what they play by frequency, most-played first', () => {
    const games = [
      ...many(25, ['e4', 'e5'], 'white'),
      ...many(10, ['d4', 'd5'], 'white'),
      ...many(5, ['Nf3', 'd5'], 'white'),
    ];
    const tree = buildYourTree(games, ME, SLOTS);
    expect(factsFor(tree, 'white:').played).toEqual([
      { san: 'e4', games: 25 },
      { san: 'd4', games: 10 },
      { san: 'Nf3', games: 5 },
    ]);
  });

  it('reports the window the games came from', () => {
    const early = game(['e4'], 'white', { date: 1_600_000_000_000 });
    const late = game(['e4'], 'white', { date: 1_700_000_000_000 });
    const tree = buildYourTree([late, early], ME, SLOTS);
    expect(tree.from).toBe(1_600_000_000_000);
    expect(tree.to).toBe(1_700_000_000_000);
  });

  it('survives an empty archive without inventing a window', () => {
    const tree = buildYourTree([], ME, SLOTS);
    expect(tree).toMatchObject({ games: { white: 0, black: 0 }, unattributed: 0, from: 0, to: 0 });
    expect(Number.isFinite(tree.from)).toBe(true);
  });
});

describe('measuredFor', () => {
  // ── The boundary, stated both ways ───────────────────────────────────────
  it('refuses one game below the floor and allows it at the floor', () => {
    const under = buildYourTree(many(MIN_GAMES_PER_COLOUR - 1, ['e4'], 'white'), ME, SLOTS);
    expect(measuredFor(under, 'white')).toBe(false);
    // ...and the shares are withheld too, not just the flag.
    expect(factsFor(under, 'white:').share).toBeNull();
    expect(factsFor(under, 'white:').reached).toBe(MIN_GAMES_PER_COLOUR - 1);

    const at = buildYourTree(many(MIN_GAMES_PER_COLOUR, ['e4'], 'white'), ME, SLOTS);
    expect(measuredFor(at, 'white')).toBe(true);
    expect(factsFor(at, 'white:').share).toBe(1);
  });

  it('is false for a colour they have plenty of the OTHER of', () => {
    const tree = buildYourTree(many(200, ['e4'], 'white'), ME, SLOTS);
    expect(measuredFor(tree, 'white')).toBe(true);
    expect(measuredFor(tree, 'black')).toBe(false);
  });

  it('is false with no tree at all', () => {
    expect(measuredFor(null, 'white')).toBe(false);
  });
});

describe('mainMoveAt', () => {
  it('names the move they actually play', () => {
    const tree = buildYourTree(many(40, ['e4', 'c6'], 'black'), ME, SLOTS);
    expect(mainMoveAt(tree, 'black:e4')).toEqual({ san: 'c6', games: 40, share: 1 });
  });

  // ── Zero by definition: two games is not a repertoire ────────────────────
  it('says nothing off a sample too small to be a habit', () => {
    const games = [
      ...many(MIN_REACHES_FOR_SHARE - 1, ['e4', 'c6'], 'black'),
      ...many(40, ['d4', 'Nf6'], 'black'),
    ];
    const tree = buildYourTree(games, ME, SLOTS);
    expect(factsFor(tree, 'black:e4').reached).toBe(MIN_REACHES_FOR_SHARE - 1);
    expect(mainMoveAt(tree, 'black:e4')).toBeNull();
  });

  it('says nothing on a genuine tie rather than inventing a decision', () => {
    // Twenty Caro-Kanns and twenty Sicilians is a player who has not chosen.
    // Returning either would put "you already play this" on one of them.
    const games = [...many(20, ['e4', 'c6'], 'black'), ...many(20, ['e4', 'c5'], 'black')];
    const tree = buildYourTree(games, ME, SLOTS);
    expect(factsFor(tree, 'black:e4').reached).toBe(40);
    expect(mainMoveAt(tree, 'black:e4')).toBeNull();
  });

  it('names the leader as soon as the tie breaks', () => {
    const games = [...many(21, ['e4', 'c6'], 'black'), ...many(20, ['e4', 'c5'], 'black')];
    const tree = buildYourTree(games, ME, SLOTS);
    expect(mainMoveAt(tree, 'black:e4')?.san).toBe('c6');
  });

  it('is null with no tree', () => {
    expect(mainMoveAt(null, 'black:e4')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The parity invariant.
//
// `game.moves[ply]` is taken as the PLAYER'S move on the strength of one thing:
// the slot exists at their turn, so its line length has the same parity as its
// side. If that ever stops being true, this module records the opponent's reply
// as the user's repertoire — a Caro-Kann player told they play the Sicilian,
// with no symptom anywhere else.
// ─────────────────────────────────────────────────────────────────────────────
import map from '@/data/repertoire-map.json';
import type { RepertoireMap } from '@/types/repertoire';

describe('the parity the walk depends on', () => {
  const shipped = (map as unknown as RepertoireMap).slots;

  it('holds for every slot in the shipped map', () => {
    expect(shipped.length).toBeGreaterThan(50);
    const broken = shipped.filter(s =>
      s.side === 'white' ? s.line.length % 2 !== 0 : s.line.length % 2 !== 1
    );
    expect(broken.map(s => `${s.id} (${s.side}, ${s.line.length} plies)`)).toEqual([]);
  });

  it('ignores a malformed slot rather than crediting the opponent to them', () => {
    // A White slot whose line is one ply long: the move after it is BLACK's.
    const malformed = slot('white:BROKEN', 'white', ['e4']);
    const tree = buildYourTree(many(40, ['e4', 'c5', 'Nf3'], 'white'), ME, [
      ...SLOTS,
      malformed,
    ]);
    // Never reached, so nothing is claimed about it...
    expect(factsFor(tree, 'white:BROKEN')).toEqual({ reached: 0, share: 0, played: [] });
    // ...and in particular the opponent's 1...c5 is nowhere in their moves.
    const everything = Object.values(tree.slots).flatMap(f => f.played.map(p => p.san));
    expect(everything).not.toContain('c5');
    // The control: their real moves ARE there, so this cannot pass vacuously.
    expect(everything).toContain('e4');
    expect(everything).toContain('Nf3');
  });
});

describe('the floor that makes the zero-attribution branch unnecessary', () => {
  it('is positive, which is what makes an unmatched username unmeasurable', () => {
    // measuredFor has no separate "nothing attributed" branch: a count of zero
    // is below the floor. That only holds while the floor is positive.
    expect(MIN_GAMES_PER_COLOUR).toBeGreaterThan(0);
    expect(MIN_REACHES_FOR_SHARE).toBeGreaterThan(0);
  });
});
