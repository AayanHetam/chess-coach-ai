// The coverage sentence is the thing a player actually reads. A number that is
// right and a sentence that is wrong is still a wrong page.

import { describe, expect, it } from 'vitest';
import { coverageSentence, facing, unfilledSentence } from '../sentences';

const slot = (over: Partial<{ line: string[]; name: string | null; share: number }> = {}) => ({
  line: [] as string[],
  name: null as string | null,
  share: 0.3,
  ...over,
});

const choice = (over: Partial<Parameters<typeof coverageSentence>[0]> = {}) =>
  ({
    name: 'The Grünfeld',
    coverage: 'family' as const,
    absorbs: 0.7,
    gaps: [] as Array<{ slot: string; share: number }>,
    ...over,
  }) as Parameters<typeof coverageSentence>[0];

describe('facing', () => {
  it('uses the opening name when there is one', () => {
    expect(facing(slot({ name: 'Sicilian Defense' }))).toBe('the Sicilian Defense');
  });

  it('falls back to the numbered line, never a bare move list', () => {
    expect(facing(slot({ line: ['e4', 'c5', 'Nf3'] }))).toBe('1.e4 c5 2.Nf3');
  });

  it('says what the first slot is', () => {
    expect(facing(slot())).toBe('your first move');
  });

  it('does not article a name that is a move or already has one', () => {
    // "the 1.e4" and "the The London System" both read as a bug.
    expect(facing(slot({ name: '1.e4' }))).toBe('1.e4');
    expect(facing(slot({ name: 'The London System' }))).toBe('The London System');
  });
});

describe('coverageSentence', () => {
  it('says an opening answers everything when it leaves no gaps', () => {
    const text = coverageSentence(choice({ name: 'The Caro-Kann', absorbs: 1, gaps: [] }), slot({ name: '1.e4' }));
    expect(text).toBe('The Caro-Kann answers everything after 1.e4.');
  });

  it('names the biggest thing still missing, not just the percentage', () => {
    // Aayan's own framing: "this covers all your theory against 1.e4 while this
    // only covers 70% of theory against 1.d4".
    const text = coverageSentence(
      choice({ absorbs: 0.7, gaps: [{ slot: 'black:d4 Nf6 Bf4', share: 0.2 }] }),
      slot({ name: '1.d4' })
    );
    expect(text).toMatch(/answers 70% of 1\.d4/);
    expect(text).toMatch(/other 30%/);
    expect(text).toMatch(/1\.d4 Nf6 2\.Bf4/);
  });

  it('picks the biggest gap, not the first one listed', () => {
    const text = coverageSentence(
      choice({
        gaps: [
          { slot: 'black:d4 Nf6 Nf3', share: 0.05 },
          { slot: 'black:d4 Nf6 Bf4', share: 0.25 },
        ],
      }),
      slot({ name: '1.d4' })
    );
    expect(text).toMatch(/mostly 1\.d4 Nf6 2\.Bf4/);
    expect(text).toMatch(/1 smaller branch\./);
  });

  it('never prices a first move as though it were an answer', () => {
    // "1.e4 answers 3%" is arithmetically true and useless — the move was never
    // a claim to answer anything, and types/repertoire.ts says so on the field.
    const text = coverageSentence(
      choice({ name: '1.e4', coverage: 'move', absorbs: 0.03, gaps: [{ slot: 'white:e4 c5', share: 0.4 }] }),
      slot()
    );
    expect(text).not.toMatch(/3%/);
    expect(text).toMatch(/not an answer/);
  });

  it('says a system has nothing left to decide', () => {
    const text = coverageSentence(
      choice({ name: 'The London', coverage: 'system', absorbs: 1, gaps: [] }),
      slot({ name: '1.d4' })
    );
    expect(text).toMatch(/one setup you play whatever they do/);
  });

  it('never rounds a real branch away to nothing', () => {
    const text = coverageSentence(
      choice({ absorbs: 0.999, gaps: [{ slot: 'black:d4 Nf6 Bf4', share: 0.001 }] }),
      slot({ name: '1.d4' })
    );
    expect(text).toMatch(/<1%/);
    expect(text).not.toMatch(/other 0%/);
  });
});

describe('unfilledSentence', () => {
  it('leads with how often they will meet it', () => {
    expect(unfilledSentence(slot({ share: 0.37, name: 'Sicilian Defense' }))).toBe(
      '37% of your games. Nothing chosen for the Sicilian Defense yet.'
    );
  });
});
