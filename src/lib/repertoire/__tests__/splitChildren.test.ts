// A hole is not a decision.
//
// The bracket generates a row for every branch a choice leaves open. Measured
// on the shipped map, 120 of the 126 reachable branches have NO curated choice
// behind them — so choosing the Alapin answered the Sicilian and then handed the
// player four fresh tasks the product cannot advise on. This file pins the
// split, and in particular pins the one case that must never be collapsed: a
// branch the player has already answered themselves.

import { describe, expect, it } from 'vitest';
import { shareOf, splitChildren, type BracketNode } from '@/lib/repertoire/bracket';
import type { RepertoireChoice, RepertoirePick, RepertoireSlot } from '@/types/repertoire';
import map from '@/data/repertoire-map.json';

const choice = (id: string): RepertoireChoice =>
  ({ id, name: id, play: 'e4', coverage: 'family', family: null, load: 'light',
     level: 'new', character: 'attack', blurb: '', why: '', absorbs: 0.5,
     gaps: [], diagram: [], namedLines: null }) as RepertoireChoice;

const slot = (
  id: string,
  choices: RepertoireChoice[] = [],
  name: string | null = null
): RepertoireSlot =>
  ({ id, side: 'white', line: [], fen: '', share: 0.1, name, eco: null,
     origin: null, moves: [], replyCoverage: 1, brief: null, choices }) as RepertoireSlot;

const node = (
  id: string,
  opts: {
    choices?: RepertoireChoice[];
    pick?: RepertoirePick | null;
    reach?: number;
    name?: string | null;
  } = {}
): BracketNode => ({
  slot: slot(id, opts.choices ?? [], opts.name ?? null),
  pick: opts.pick ?? null,
  reach: opts.reach ?? 0.1,
  children: [],
  depth: 1,
});

const pick = (slotId: string): RepertoirePick => ({ slotId, label: 'Something', san: 'e4' });

describe('splitChildren', () => {
  // ── The two cases the rule exists to tell apart ──────────────────────────
  it('keeps a NAMED opening as a decision, with no curated choice needed', () => {
    // The Trompowsky after the Grünfeld: no choices behind it, and still a
    // real decision — it is a different opening, and it is 6% of their games.
    const trompowsky = node('white:d4 Nf6 Bg5', { name: 'Trompowsky Attack' });
    expect(trompowsky.slot.choices).toHaveLength(0);
    expect(splitChildren([trompowsky]).decisions).toEqual([trompowsky]);
  });

  it('collapses an UNNAMED position inside a line already committed to', () => {
    // ...e6 against the Alapin. Not a different opening, so not a decision.
    const alapinReply = node('white:e4 c5 c3 e6');
    expect(splitChildren([alapinReply]).unhelped).toEqual([alapinReply]);
    expect(splitChildren([alapinReply]).decisions).toEqual([]);
  });

  it('keeps a branch we hold curated choices for even when unnamed', () => {
    const n = node('has-choices', { choices: [choice('a')] });
    expect(splitChildren([n]).decisions).toEqual([n]);
  });

  // ── The case that must never regress ─────────────────────────────────────
  // A player can fill any slot from the library, including an unnamed one we
  // have no opinion about. Collapsing it afterwards would take their own
  // answer off the screen — the page would look like they never made it.
  it('never collapses a branch the player has already answered', () => {
    const n = node('bare-but-mine', { pick: pick('bare-but-mine') });
    expect(n.slot.choices).toHaveLength(0);
    expect(n.slot.name).toBeNull();
    expect(splitChildren([n]).decisions).toEqual([n]);
    expect(splitChildren([n]).unhelped).toEqual([]);
  });

  it('preserves order and loses nothing', () => {
    const kids = [
      node('a', { choices: [choice('x')] }),
      node('b'),
      node('c', { pick: pick('c') }),
      node('d', { name: 'Torre Attack' }),
    ];
    const { decisions, unhelped } = splitChildren(kids);
    expect([...decisions, ...unhelped]).toHaveLength(kids.length);
    expect(decisions.map(n => n.slot.id)).toEqual(['a', 'c', 'd']);
    expect(unhelped.map(n => n.slot.id)).toEqual(['b']);
  });

  it('treats an empty name as no name, not as a decision', () => {
    // A blank string is falsy, and must stay falsy: a slot whose name failed to
    // build is not an opening the opponent chose.
    expect(splitChildren([node('blank', { name: '' })]).unhelped).toHaveLength(1);
  });

  // ── Zero by definition ───────────────────────────────────────────────────
  it('splits nothing into nothing', () => {
    expect(splitChildren([])).toEqual({ decisions: [], unhelped: [] });
    expect(shareOf([])).toBe(0);
  });
});

describe('shareOf', () => {
  it('adds the reaches, which are already shares of THEIR games', () => {
    expect(shareOf([node('a', { reach: 0.1 }), node('b', { reach: 0.05 })])).toBeCloseTo(0.15, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The measurement that motivated the split, run against the real map so it
// cannot drift into a fixture's fiction.
// ─────────────────────────────────────────────────────────────────────────────
describe('the shipped map', () => {
  const all = (map as { slots: RepertoireSlot[] }).slots;
  const slots = new Map(all.map(s => [s.id, s]));
  const asNode = (s: RepertoireSlot): BracketNode =>
    ({ slot: s, pick: null, reach: s.share, children: [], depth: 1 });
  const gapsOf = (name: string): BracketNode[] => {
    for (const s of all) {
      for (const c of s.choices) {
        if (c.name === name) {
          return c.gaps.map(g => slots.get(g.slot)).filter(Boolean).map(x => asNode(x!));
        }
      }
    }
    throw new Error(`no choice named ${name} in the shipped map`);
  };

  // ── The thesis of the page, pinned against the real catalogue ────────────
  it('surfaces the Trompowsky and the London after the Grünfeld', () => {
    const { decisions, unhelped } = splitChildren(gapsOf('Grünfeld Defence'));
    const names = decisions.map(n => n.slot.name ?? '').join(' | ');
    expect(names).toMatch(/Trompowsky/);
    expect(names).toMatch(/London/);
    // Choosing the Grünfeld answers 1.d4 and leaves REAL work. If this ever
    // reads zero, the feature has been deleted.
    expect(decisions.length).toBeGreaterThanOrEqual(4);
    expect(unhelped.length).toBeLessThan(decisions.length);
  });

  // ── And the complaint that motivated the split ───────────────────────────
  it('collapses every branch of the Alapin, because none of them is an opening', () => {
    const { decisions, unhelped } = splitChildren(gapsOf('Alapin'));
    expect(decisions).toEqual([]);
    expect(unhelped.length).toBeGreaterThan(0);
    expect(unhelped.every(n => !n.slot.name)).toBe(true);
  });

  it('keeps the Pirc and the Scandinavian as decisions under 1.e4', () => {
    const names = splitChildren(gapsOf('1.e4')).decisions.map(n => n.slot.name ?? '').join(' | ');
    expect(names).toMatch(/Pirc/);
    expect(names).toMatch(/Scandinavian/);
  });

  it('collapses a minority overall, so the page is not gutted', () => {
    const gapIds = new Set<string>();
    all.forEach(s => s.choices.forEach(c => c.gaps.forEach(g => gapIds.add(g.slot))));
    const nodes = Array.from(gapIds).map(id => slots.get(id)).filter(Boolean).map(x => asNode(x!));
    const { decisions, unhelped } = splitChildren(nodes);
    expect(nodes.length).toBeGreaterThan(50);
    // Measured at 82 / 44 when written.
    expect(decisions.length).toBeGreaterThan(unhelped.length);
    // ...and the collapse still fires, or the split is dead code.
    expect(unhelped.length).toBeGreaterThan(0);
  });
});
