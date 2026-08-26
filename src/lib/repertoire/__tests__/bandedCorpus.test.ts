import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { BANDS } from '../levels';
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
