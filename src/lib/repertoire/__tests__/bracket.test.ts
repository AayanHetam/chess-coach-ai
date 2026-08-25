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
  focusedRoots,
  numberedLine,
  roots,
  share,
  slotTitle,
  transposesInto,
} from '@/lib/repertoire/bracket';
import type { RepertoireMap, RepertoireSlot } from '@/types/repertoire';
import shipped from '@/data/repertoire-map.json';

/** The map as it actually ships, so the override is tested against real slots. */
const shippedMap = () => shipped as unknown as RepertoireMap;

function slot(over: Partial<RepertoireSlot> & { id: string }): RepertoireSlot {
  return {
    side: 'black', line: [], fen: 'x', share: 1, name: null, eco: null,
    origin: null, moves: [], replyCoverage: 1, brief: null, choices: [], ...over,
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
          load: 'heavy', level: 'club', why: 'x', character: 'counterattack', blurb: '', absorbs: 0.7, namedLines: 55,
          gaps: [{ slot: 'black:d4 Nf6 Bf4', share: 0.2 }, { slot: 'black:d4 Nf6 Bg5', share: 0.1 }], diagram: [],
        },
        {
          id: 'london-proof', name: 'System', play: 'd5', coverage: 'system', family: null,
          load: 'light', level: 'new', why: 'x', character: 'solid', blurb: '', absorbs: 1, namedLines: null, gaps: [], diagram: [],
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

describe('focusedRoots', () => {
  // The tightest consensus in the coaching literature is about breadth: one
  // White opening, one answer to 1.e4, one answer to 1.d4. White has one root,
  // so a beginner meets exactly three decisions across both colours.
  const fourRoots = {
    meta: { otherFirstMoves: 0 },
    slots: [
      slot({ id: 'black:e4', side: 'black', share: 0.47 }),
      slot({ id: 'black:d4', side: 'black', share: 0.32 }),
      slot({ id: 'black:Nf3', side: 'black', share: 0.1 }),
      slot({ id: 'black:c4', side: 'black', share: 0.06 }),
    ],
    transpositions: [],
  } as unknown as RepertoireMap;

  it('asks a beginner for two answers as Black, not four', () => {
    const { focus, deferred } = focusedRoots(fourRoots, 'black', 'beginner');
    expect(focus.map(s => s.id)).toEqual(['black:e4', 'black:d4']);
    expect(deferred.map(s => s.id)).toEqual(['black:Nf3', 'black:c4']);
  });

  it('defers the RAREST slots, never whatever came last in the file', () => {
    const { deferred } = focusedRoots(fourRoots, 'black', 'new');
    expect(deferred.every(d => d.share <= 0.1)).toBe(true);
  });

  it('gives a club player the whole map', () => {
    const { focus, deferred } = focusedRoots(fourRoots, 'black', 'club');
    expect(focus).toHaveLength(4);
    expect(deferred).toHaveLength(0);
  });

  it('never hides a slot — everything is in one list or the other', () => {
    for (const id of ['new', 'beginner', 'improving', 'club', 'strong']) {
      const { focus, deferred } = focusedRoots(fourRoots, 'black', id);
      expect(focus.length + deferred.length).toBe(4);
    }
  });

  it('treats an unknown band as the full map rather than showing nothing', () => {
    expect(focusedRoots(fourRoots, 'black', 'nonsense').focus).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The measured-root override.
//
// This exists because patching only the DISPLAY produced a screen whose
// coverage summary said "1.e4, at 47% of games" directly above a row reading
// "75% of your games". Both are sums over `reach`, so both have to be seeded
// from the same place — and an override that reaches one of them and not the
// other is invisible in every unit test that checks only one.
// ─────────────────────────────────────────────────────────────────────────────
describe('measured root reach', () => {
  const blackRoots = (m: RepertoireMap) =>
    m.slots.filter(s => s.side === 'black' && s.origin === null);

  it('seeds the bracket from the override instead of the corpus share', () => {
    const m = shippedMap();
    const roots = blackRoots(m);
    expect(roots.length).toBeGreaterThan(1);
    const target = roots[0];

    const corpus = buildBracket(m, 'black', []);
    const mine = buildBracket(m, 'black', [], 3, s => (s.id === target.id ? 0.75 : 0));

    const before = corpus.find(n => n.slot.id === target.id)!.reach;
    const after = mine.find(n => n.slot.id === target.id)!.reach;
    expect(before).not.toBeCloseTo(0.75, 4);
    expect(after).toBeCloseTo(0.75, 6);
  });

  it('falls back to the corpus for a root the override declines', () => {
    // Returning null must mean "no measurement", never "zero".
    const m = shippedMap();
    const target = blackRoots(m)[0];
    const nulled = buildBracket(m, 'black', [], 3, () => null);
    const corpus = buildBracket(m, 'black', []);
    expect(nulled.find(n => n.slot.id === target.id)!.reach).toBeCloseTo(
      corpus.find(n => n.slot.id === target.id)!.reach,
      9
    );
  });

  it('reaches the coverage sum too, not only the displayed bracket', () => {
    // The regression, stated as a test. Pick something, then check that the
    // coverage number MOVES when the roots are measured — if the override
    // stopped at buildBracket, this number would be identical.
    const m = shippedMap();
    const roots = blackRoots(m);
    const target = roots[0];
    const choice = target.choices[0];
    expect(choice, 'need a curated choice to fill a slot with').toBeTruthy();
    const picks = [{ slotId: target.id, choiceId: choice.id, label: choice.name }];

    const corpus = coverage(m, 'black', picks);
    // Give that root ALL of their games: answering it must now answer far more.
    const mine = coverage(m, 'black', picks, s => (s.id === target.id ? 1 : 0));
    expect(mine.answered).toBeGreaterThan(corpus.answered);
  });

  it('leaves White alone, because White always makes the first move', () => {
    const m = shippedMap();
    const withOverride = buildBracket(m, 'white', [], 3, () => 0.1);
    expect(withOverride[0].reach).toBe(1);
  });
});
