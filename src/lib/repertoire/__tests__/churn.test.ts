// "How much of what you already play are you willing to give up?"
//
// The failure this guards is the one that makes the question pointless: asking
// somebody how much they want to change and then ordering the list exactly the
// same way whatever they answer. Three answers have to produce three orderings,
// and the difference has to be visible on real data.
//
// The other failure is the opposite — letting `keep` bury a warning. Somebody
// who says "keep what I play" and already plays the Najdorf at 900 should see
// the Najdorf FIRST and still be told what it costs. Ordering is not the place
// to argue with an answer; the tag is.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHURN_FIT_BONUS, EMPTY, loadBracket, rankChoices, type Churn } from '@/lib/repertoire/store';
import { bandFor, levelFit } from '@/lib/repertoire/levels';
import map from '@/data/repertoire-map.json';
import type { RepertoireChoice, RepertoireMap } from '@/types/repertoire';

const shipped = map as unknown as RepertoireMap;
const slotOf = (id: string) => {
  const s = shipped.slots.find(x => x.id === id);
  if (!s) throw new Error(`no slot ${id}`);
  return s;
};

const QUIZ = { load: 'light' as const, character: 'solid' as const };
const names = (cs: RepertoireChoice[]) => cs.map(c => c.name);

describe('churn changes the order, and differently per answer', () => {
  // 1...c5 at black:e4 — the four Sicilians. A `heavy`/`counterattack` player
  // would already be shown them; this quiz asks for `light`/`solid`, so without
  // a churn signal they sit well down the list. That gap is what makes the
  // three orderings distinguishable.
  const slot = slotOf('black:e4');
  const band = bandFor(1300);
  const rank = (churn: Churn | null, youPlay: string | null) =>
    names(rankChoices(slot.choices, QUIZ, band, { churn, youPlay }));

  it('has a baseline that does NOT put the Sicilians first', () => {
    // The control. Without it, every assertion below could be describing the
    // list's natural order rather than anything churn did.
    const baseline = rank(null, null);
    expect(baseline[0]).not.toMatch(/Sicilian/);
  });

  it('keep: what they play goes to the top, above level', () => {
    const kept = rank('keep', 'c5');
    expect(kept[0]).toMatch(/Sicilian/);
    // ALL of them, because all four commit to c5 at this slot.
    expect(kept.slice(0, 4).every(n => /Sicilian/.test(n))).toBe(true);
  });

  it('rebuild: what they play is not an argument at all', () => {
    expect(rank('rebuild', 'c5')).toEqual(rank(null, null));
  });

  it('some: it counts, but it does not outrank level', () => {
    const some = rank('some', 'c5');
    const baseline = rank(null, null);
    const keep = rank('keep', 'c5');
    // Moved off the baseline...
    expect(some).not.toEqual(baseline);
    // ...but not all the way to `keep`, which is the whole distinction.
    expect(some).not.toEqual(keep);
  });

  it('changes nothing when they do not play the move', () => {
    // The input whose answer is zero by definition: no measured move means no
    // signal, so every churn answer must produce the baseline.
    const baseline = rank(null, null);
    for (const churn of ['keep', 'some', 'rebuild'] as Churn[]) {
      expect(rank(churn, null), churn).toEqual(baseline);
      // And a move nobody in this slot commits to is the same as no move.
      expect(rank(churn, 'Nh6'), churn).toEqual(baseline);
    }
  });

  it('never drops or duplicates a choice, whatever the answer', () => {
    const expected = slot.choices.length;
    for (const churn of [null, 'keep', 'some', 'rebuild'] as Array<Churn | null>) {
      const out = rank(churn, 'c5');
      expect(out).toHaveLength(expected);
      expect(new Set(out).size).toBe(expected);
    }
  });

  it('keep does not silence what a choice costs', () => {
    // Ordering is not the place to argue with their answer, so `keep` puts the
    // Najdorf first for a 900 — and the level judgement it carries is untouched,
    // which is what the card renders the warning from.
    const beginner = bandFor(700);
    const kept = rankChoices(slot.choices, QUIZ, beginner, { churn: 'keep', youPlay: 'c5' });
    expect(kept[0].name).toMatch(/Sicilian/);
    // The claim is about the JUDGEMENT surviving, not about which Sicilian
    // wins the tie-break inside the kept group: every Sicilian is at least two
    // bands above a 700, so whichever lands first still carries the warning the
    // card renders from.
    expect(levelFit(kept[0], beginner)).toBeLessThan(0);
  });

  it('the bonus table gives keep nothing to add, because it pre-sorts', () => {
    // Guards against someone "fixing" the zero by giving keep a fit bonus,
    // which would make it a stronger `some` rather than a pre-sort.
    expect(CHURN_FIT_BONUS.keep).toBe(0);
    expect(CHURN_FIT_BONUS.rebuild).toBe(0);
    expect(CHURN_FIT_BONUS.some).toBeGreaterThan(0);
  });
});

/** loadBracket guards `typeof window`, so without this the whole block passes
 *  vacuously by taking the server-side early return. */
function fakeWindow(store: Record<string, string> = {}) {
  return {
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the stored bracket', () => {
  const seed = (value: unknown) => {
    const store: Record<string, string> = {
      'cm.repertoire.bracket.v1:someone': JSON.stringify(value),
    };
    vi.stubGlobal('window', fakeWindow(store));
  };

  it('is inert with no window, so the tests below cannot pass vacuously', () => {
    vi.stubGlobal('window', undefined);
    expect(loadBracket('someone')).toEqual(EMPTY);
  });
  it('starts with nothing asked and nothing locked', () => {
    expect(EMPTY.churn).toBeNull();
    expect(EMPTY.locked).toEqual({ white: false, black: false });
  });

  it('reads a bracket saved before either field existed', () => {
    // The migration that matters. Bumping the version would have thrown away
    // every repertoire anybody had already built, in order to add a question.
    const legacy = {
      v: 1,
      quiz: { load: 'heavy', character: 'attack' },
      white: [{ slotId: 'white:', choiceId: '1.e4', label: '1.e4' }],
      black: [],
      updatedAt: 5,
    };
    seed(legacy);
    const read = loadBracket('someone');
    expect(read.white).toHaveLength(1);
    expect(read.quiz).toEqual({ load: 'heavy', character: 'attack' });
    expect(read.churn).toBeNull();
    expect(read.locked).toEqual({ white: false, black: false });
  });

  it('refuses a churn value it does not recognise', () => {
    seed({ v: 1, quiz: null, churn: 'obliterate', white: [], black: [], updatedAt: 1 });
    expect(loadBracket('someone').churn).toBeNull();
  });

  it('treats a truthy-but-wrong lock as unlocked', () => {
    // `locked: { white: 'yes' }` must not read as committed. Committing is a
    // deliberate act and a corrupt store is not one.
    seed({ v: 1, quiz: null, locked: { white: 'yes', black: 1 }, white: [], black: [], updatedAt: 1 });
    expect(loadBracket('someone').locked).toEqual({ white: false, black: false });
  });
});
