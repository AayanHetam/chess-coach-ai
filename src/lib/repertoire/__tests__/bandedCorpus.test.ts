import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { BANDS } from '../levels';
import { BANDED_MAPS, loadRepertoireMap, resetRepertoireMapCache } from '../load';
import type { RepertoireMap } from '@/types/repertoire';

// The acceptance test for the whole banding programme, run against the files
// that actually ship rather than against a build artifact.
//
// The claim being made is not "we added some files". It is that /learn was
// describing the wrong population: every share came from Lichess Elite 2300+,
// where the Sicilian is the commonest answer to 1.e4. Under 800 it is the
// FOURTH commonest, behind 1...e5 by a factor of fourteen. If that difference
// is not present in the shipped data then the banding is cosmetic, and this
// file is how anyone finds that out.

const ROOT = process.cwd();
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as RepertoireMap;
const banded = (id: string) => read(`src/data/repertoire-map.${id}.json`);
const elite = () => read('src/data/repertoire-map.json');

/** How often Black answers 1.e4 with this move, in this corpus. */
function replyToE4(map: RepertoireMap, san: string): number {
  const slot = map.slots.find(s => s.id === 'black:e4');
  return slot?.moves.find(m => m.san === san)?.share ?? 0;
}

const RANKED = ['new', 'beginner', 'improving', 'club', 'strong'] as const;

describe('banded corpora', () => {
  it('ships one map per band, each stating its own band and scale', () => {
    for (const band of BANDS) {
      const map = banded(band.id);
      expect(map.meta.band, `${band.id} map must say which band it is`).toBe(band.id);
      // R3: the scale is the thing a consumer cannot infer and must not guess.
      expect(map.meta.bandScale, `${band.id} map must say which scale it was banded on`).toContain(
        'common (chess.com)'
      );
      expect(map.slots.length).toBeGreaterThan(100);
    }
  });

  // The control. The default map is the Elite corpus and must keep saying so,
  // because it is what every band falls back to when its own file is missing.
  it('leaves the default map declaring no band at all', () => {
    expect(elite().meta.band).toBeNull();
    expect(elite().meta.bandScale).toBeNull();
  });

  it('measures the Sicilian rising monotonically with rating', () => {
    const shares = RANKED.map(id => replyToE4(banded(id), 'c5'));
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i], `${RANKED[i]} must meet the Sicilian more than ${RANKED[i - 1]}`).toBeGreaterThan(
        shares[i - 1]
      );
    }
    // Monotone is the strong claim; a gradient this clean is not what a bug
    // produces. The magnitude is the product-relevant one.
    expect(shares[0]).toBeLessThan(0.06);
    expect(shares[shares.length - 1]).toBeGreaterThan(0.3);
  });

  it('measures 1...e5 falling as rating rises', () => {
    const shares = RANKED.map(id => replyToE4(banded(id), 'e5'));
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i], `${RANKED[i]} must meet 1...e5 less than ${RANKED[i - 1]}`).toBeLessThan(shares[i - 1]);
    }
  });

  // The inversion itself, stated as the thing a player would notice.
  it('inverts which answer to 1.e4 is the common one, between the weakest band and Elite', () => {
    const weak = banded('new');
    expect(replyToE4(weak, 'e5')).toBeGreaterThan(replyToE4(weak, 'c5') * 10);
    expect(replyToE4(elite(), 'c5')).toBeGreaterThan(replyToE4(elite(), 'e5'));
  });

  it('keeps every band’s reply list an honest description of the position', () => {
    // The build guard enforces this; asserted again here because the guard
    // lives in a script nothing in CI runs, and a hand-edited data file would
    // sail past it.
    for (const band of BANDS) {
      for (const slot of banded(band.id).slots) {
        if (!slot.moves.length) continue;
        const total = slot.moves.reduce((s, m) => s + m.share, 0);
        expect(total, `${band.id} ${slot.id} shows too little of the position`).toBeGreaterThan(0.8);
        // Rounding budget: each share is stored to 4dp.
        expect(total, `${band.id} ${slot.id} shares sum above 1`).toBeLessThanOrEqual(
          1 + slot.moves.length * 5e-5 + 1e-9
        );
      }
    }
  });
});

// Consistency between the two screens that make the same claim.
//
// /learn says "share of your games" off the banded map; /courses ranks its
// "Answers the most on its own" shelf by slot share × absorbs and its note
// says the same words. If those read different corpora the product
// contradicts itself, and the contradiction is invisible — both numbers
// render fine.
describe('the ranked "answers the most" shelf', () => {
  /** What /courses ranks by, reproduced: slot share × what the choice absorbs. */
  function topAnswers(map: RepertoireMap, n = 8): string[] {
    const scored: Array<[string, number]> = [];
    for (const slot of map.slots) {
      for (const choice of slot.choices) scored.push([choice.name, slot.share * choice.absorbs]);
    }
    return scored
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name]) => name);
  }

  // The premise for reading the band's map on /courses. If the ranking were
  // the same everywhere, the Elite map would have been fine and nothing would
  // be at stake.
  //
  // NOT asserted on any single choice's score: for the Caro-Kann the two
  // effects very nearly cancel — the slot share rises 47%→68% as absorbs falls
  // 100%→70%, leaving the product within 3%. The ORDER is what the shelf
  // shows, so the order is what this measures.
  it('reorders between a beginner and Elite', () => {
    const weak = topAnswers(banded('new'));
    const strong = topAnswers(elite());
    const shared = weak.filter(name => strong.includes(name));
    // Measured: the King's Gambit, the Italian and the Ruy Lopez are top-eight
    // for a sub-800 player and absent from Elite's eight; the Trompowsky and
    // the Réti go the other way.
    expect(weak.length - shared.length).toBeGreaterThanOrEqual(2);
  });

  // The control: the input whose answer is zero by definition. The same corpus
  // ranked twice must reorder by nothing at all, or the comparison above is
  // measuring instability rather than the bands.
  it('is stable when the corpus does not change', () => {
    const once = topAnswers(banded('new'));
    const twice = topAnswers(banded('new'));
    expect(twice).toEqual(once);
  });
});

// The gap that let a shipped file go unread.
//
// `BANDED_MAPS` originally listed four bands while five were shipped, so
// `repertoire-map.strong.json` was built, committed, asserted correct by the
// tests above — and never loaded by anything, because the loader quietly fell
// back to Elite for a band it did not recognise. Existence and correctness
// were both tested; reachability was not.
describe('every band the loader knows and every file that ships', () => {
  it('are the same set, in both directions', () => {
    const shipped = fs
      .readdirSync(path.join(ROOT, 'src/data'))
      .map(f => /^repertoire-map\.([a-z]+)\.json$/.exec(f)?.[1])
      .filter((x): x is string => Boolean(x))
      .sort();
    expect([...BANDED_MAPS].sort()).toEqual(shipped);
    // And the set is the product's own bands, not a list that drifted from it.
    expect([...BANDED_MAPS].sort()).toEqual(BANDS.map(b => b.id).sort());
  });

  it('resolves each band to its own corpus rather than to the fallback', () => {
    resetRepertoireMapCache();
    for (const band of BANDS) {
      expect(loadRepertoireMap(band.id)?.meta.band, `${band.id} must not fall back`).toBe(band.id);
    }
    resetRepertoireMapCache();
  });
});
