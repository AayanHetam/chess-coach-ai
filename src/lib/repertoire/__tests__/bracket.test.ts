// The coverage number, and the shape of the bracket.
//
// "Your repertoire answers 84%" is the one claim on /learn a player will
// repeat to themselves, and it is the easiest one to inflate. These tests exist
// to keep it honest: an unfilled slot is fully open, a move is not a
// repertoire, and picking something we cannot prove coverage for must not
// silently credit the branches under it.

import { describe, expect, it } from 'vitest';
import {
  buildBracket,
  coverage,
  flatten,
  numberedLine,
  roots,
  share,
  slotTitle,
  transposesInto,
} from '@/lib/repertoire/bracket';
import type { RepertoireMap, RepertoireSlot } from '@/types/repertoire';

function slot(over: Partial<RepertoireSlot> & { id: string }): RepertoireSlot {
  return {
    side: 'black', line: [], fen: 'x', share: 1, name: null, eco: null,
    origin: null, moves: [], brief: null, choices: [], ...over,
  };
}

// 1.d4 is 30% of Black's games. The Grünfeld answers 70% of what follows and
// leaves the London (20% of the branch) and the Trompowsky (10%).
const MAP: RepertoireMap = {
  meta: { source: 'test', games: 1, openings: 1, gapMaxPly: 3, gapMinShare: 0.02, steerPly: 8, otherFirstMoves: 0 },
  slots: [
    slot({
      id: 'black:d4', line: ['d4'], share: 0.3,
      choices: [
        {
          id: 'grunfeld', name: 'Grünfeld', play: 'Nf6', coverage: 'family', family: 'Grünfeld',
          load: 'heavy', character: 'counterattack', blurb: '', absorbs: 0.7, namedLines: 55,
          gaps: [{ slot: 'black:d4 Nf6 Bf4', share: 0.2 }, { slot: 'black:d4 Nf6 Bg5', share: 0.1 }],
        },
        {
          id: 'london-proof', name: 'System', play: 'd5', coverage: 'system', family: null,
          load: 'light', character: 'solid', blurb: '', absorbs: 1, namedLines: null, gaps: [],
        },
      ],
    }),
    slot({ id: 'black:d4 Nf6 Bf4', line: ['d4', 'Nf6', 'Bf4'], origin: 'grunfeld', name: 'London System' }),
    slot({ id: 'black:d4 Nf6 Bg5', line: ['d4', 'Nf6', 'Bg5'], origin: 'grunfeld', name: 'Trompowsky Attack' }),
    slot({ id: 'black:e4', line: ['e4'], share: 0.7 }),
  ],
  transpositions: [{ slot: 'black:e4', choice: 'grunfeld', atLeast: 0.28 }],
};

describe('the bracket', () => {
  it('starts with one slot per root, biggest first', () => {
    expect(roots(MAP, 'black').map(s => s.id)).toEqual(['black:e4', 'black:d4']);
  });

  it('hides a branch until the choice that creates it is made', () => {
    // Nobody should be asked about the London before they have said they meet
    // 1.d4 with 1...Nf6.
    const before = buildBracket(MAP, 'black', []);
    expect(flatten(before)).toHaveLength(2);

    const after = buildBracket(MAP, 'black', [{ slotId: 'black:d4', choiceId: 'grunfeld', label: 'Grünfeld' }]);
    expect(flatten(after).map(n => n.slot.id)).toContain('black:d4 Nf6 Bf4');
  });

  it('compounds reach down the tree', () => {
    const [, d4] = buildBracket(MAP, 'black', [{ slotId: 'black:d4', choiceId: 'grunfeld', label: 'G' }]);
    // 20% of a branch worth 30% of your games is 6%, not 20%. Showing the raw
    // branch share would make every deep slot look more urgent than its parent.
    const london = d4.children.find(c => c.slot.id === 'black:d4 Nf6 Bf4');
    expect(london?.reach).toBeCloseTo(0.06, 5);
  });
});

describe('coverage', () => {
  it('counts an empty bracket as zero', () => {
    expect(coverage(MAP, 'black', []).answered).toBe(0);
  });

  it('credits only what a choice actually absorbs', () => {
    const c = coverage(MAP, 'black', [{ slotId: 'black:d4', choiceId: 'grunfeld', label: 'G' }]);
    // 30% of games x 70% absorbed. The open branches under it are NOT credited.
    expect(c.answered).toBeCloseTo(0.21, 5);
  });

  it('reaches the whole slot once its branches are filled too', () => {
    const c = coverage(MAP, 'black', [
      { slotId: 'black:d4', choiceId: 'grunfeld', label: 'G' },
      { slotId: 'black:d4 Nf6 Bf4', san: 'e6', label: 'anti-London' },
      { slotId: 'black:d4 Nf6 Bg5', san: 'Ne4', label: 'anti-Tromp' },
    ]);
    expect(c.answered).toBeCloseTo(0.3, 5);
  });

  it('gives a system the whole branch immediately', () => {
    const c = coverage(MAP, 'black', [{ slotId: 'black:d4', choiceId: 'london-proof', label: 'S' }]);
    // A system genuinely does answer everything: it plays its own moves.
    expect(c.answered).toBeCloseTo(0.3, 5);
  });

  it('does not credit branches under a pick we cannot prove coverage for', () => {
    // Picked out of the searchable library. We know they answered the slot; we
    // know nothing about what follows, and inventing it would be the easiest
    // possible way to make this number a lie.
    const c = coverage(MAP, 'black', [{ slotId: 'black:d4', san: 'g6', label: 'Modern', fromLibrary: true }]);
    expect(c.answered).toBeCloseTo(0.3, 5);
    expect(c.open.map(o => o.slot.id)).not.toContain('black:d4 Nf6 Bf4');
  });

  it('names the biggest thing still unanswered', () => {
    const c = coverage(MAP, 'black', [{ slotId: 'black:d4', choiceId: 'grunfeld', label: 'G' }]);
    // 1.e4 at 70% beats the London branch at 6%.
    expect(c.open[0].slot.id).toBe('black:e4');
  });

  it('holds back the share taken by first moves too rare to plan for', () => {
    const withRare = { ...MAP, meta: { ...MAP.meta, otherFirstMoves: 0.1 } };
    const filled = [
      { slotId: 'black:e4', san: 'c5', label: 'Sicilian' },
      { slotId: 'black:d4', choiceId: 'london-proof', label: 'S' },
    ];
    // A repertoire that answers 1.e4 and 1.d4 and stops is not finished.
    expect(coverage(withRare, 'black', filled).answered).toBeCloseTo(0.9, 5);
  });

  it('never exceeds one', () => {
    const odd = {
      ...MAP,
      slots: MAP.slots.map(s =>
        s.id === 'black:d4' ? { ...s, share: 5 } : s
      ),
    };
    expect(coverage(odd, 'black', [{ slotId: 'black:d4', choiceId: 'london-proof', label: 'S' }]).answered).toBe(1);
  });
});

describe('transposition', () => {
  it('offers only systems already in the bracket', () => {
    expect(transposesInto(MAP, 'black:e4', [])).toEqual([]);
    const picked = [{ slotId: 'black:d4', choiceId: 'grunfeld', label: 'G' }];
    expect(transposesInto(MAP, 'black:e4', picked)).toEqual([
      { choiceId: 'grunfeld', name: 'Grünfeld', atLeast: 0.28 },
    ]);
  });
});

describe('wording', () => {
  it('names a slot after the opening when the position has a name', () => {
    expect(slotTitle(MAP.slots[1])).toBe('Against the London System');
  });

  it('falls back to the move, never to a bare position', () => {
    expect(slotTitle(slot({ id: 'x', line: ['d4', 'Nf6', 'Nc3'] }))).toBe('Against 1.d4 Nf6 2.Nc3');
  });

  it('calls the empty line what it is', () => {
    expect(slotTitle(slot({ id: 'white:', line: [] }))).toBe('Your first move');
  });

  it('numbers a line that starts on Black move', () => {
    expect(numberedLine(['e4', 'c5', 'c3'])).toBe('1.e4 c5 2.c3');
  });

  it('never rounds a real branch away to zero percent', () => {
    // "0%" reads as "this does not happen", and a slot that does not happen
    // should not have been on the page at all.
    expect(share(0.004)).toBe('<1%');
    expect(share(0)).toBe('0%');
    expect(share(0.31)).toBe('31%');
  });
});
