// Which line the trainer was asked for.
//
// The failure worth guarding is quiet: a link that opens a DIFFERENT line than
// the one clicked. The board would be the only clue, and a player who has just
// been shown a specific weakness would be drilled on another one without ever
// being told.

import { describe, expect, it } from 'vitest';
import {
  modeOf,
  parseTrainerQuery,
  resolveHole,
  reviewHref,
  trainerHref,
} from '@/lib/learn/trainerRoute';
import { lineKeyOf } from '@/lib/learn/trainerProgress';
import type { RepertoireHole, RepertoireReport } from '@/lib/learn/repertoireHole';

function hole(moves: string[], color: 'white' | 'black', value: number, tier: RepertoireHole['tier'] = 'confirmed'): RepertoireHole {
  return {
    fen: `fen-${moves.join('')}`,
    parentFen: 'parent',
    color,
    line: moves.map((san, i) => ({ san, side: i % 2 === 0 ? 'you' : 'opponent', games: 10 })),
    games: 30,
    score: 0.3,
    baseline: 0.5,
    frequency: 0.1,
    deficit: 0.2,
    teachingValue: value,
    tier,
    diagnosis: 'move',
  } as unknown as RepertoireHole;
}
const report = (holes: RepertoireHole[]): RepertoireReport[] =>
  [{ holes, tests: holes.length, insufficientData: false } as unknown as RepertoireReport];

describe('parseTrainerQuery', () => {
  it('defaults to today', () => {
    expect(parseTrainerQuery({})).toEqual({ kind: 'today' });
    expect(parseTrainerQuery({ line: '' })).toEqual({ kind: 'today' });
  });

  it('reads a named line and a review', () => {
    expect(parseTrainerQuery({ line: 'white:e4 c5' })).toEqual({ kind: 'line', lineKey: 'white:e4 c5' });
    expect(parseTrainerQuery({ review: 'white:e4 c5' })).toEqual({ kind: 'review', lineKey: 'white:e4 c5' });
  });

  it('prefers the review when a link carries both', () => {
    // There is no sensible reading of "review this AND start it fresh"; the
    // one that keeps a schedule loses less.
    expect(parseTrainerQuery({ line: 'a', review: 'b' })).toEqual({ kind: 'review', lineKey: 'b' });
  });

  it('takes the first of a repeated parameter rather than crashing on an array', () => {
    expect(parseTrainerQuery({ line: ['x', 'y'] })).toEqual({ kind: 'line', lineKey: 'x' });
  });

  it('maps only reviews to review mode', () => {
    expect(modeOf({ kind: 'review', lineKey: 'x' })).toBe('review');
    expect(modeOf({ kind: 'line', lineKey: 'x' })).toBe('repair');
    expect(modeOf({ kind: 'today' })).toBe('repair');
  });
});

describe('links', () => {
  it('round-trip: a link built from a hole resolves back to that hole', () => {
    // The whole feature rests on this. One identity, shared with saved
    // sessions and review cards.
    const h = hole(['e4', 'c5', 'c3'], 'white', 1);
    const req = parseTrainerQuery({ line: decodeURIComponent(trainerHref(h).split('line=')[1]) });
    expect(resolveHole(report([h]), req)).toEqual({ status: 'ready', hole: h });
  });

  it('escapes a line whose notation would truncate a URL', () => {
    // A mating move ends in '#', which starts a fragment: unescaped, the
    // server never sees the rest of the key.
    const h = hole(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'], 'white', 1);
    expect(trainerHref(h)).not.toContain('#');
    expect(trainerHref(h)).not.toContain(' ');
  });

  it('sends a lapsed line to the full repair instead of a one-run review', () => {
    expect(reviewHref('white:e4', false)).toContain('review=');
    expect(reviewHref('white:e4', true)).toContain('line=');
    expect(reviewHref('white:e4', true)).not.toContain('review=');
  });
});

describe('resolveHole', () => {
  const big = hole(['e4', 'c5', 'c3'], 'white', 9);
  const small = hole(['d4', 'Nf6', 'Bf4'], 'black', 2);

  it('gives the highest-value line when nothing is named', () => {
    expect(resolveHole(report([small, big]), { kind: 'today' })).toEqual({ status: 'ready', hole: big });
  });

  it('gives the line that was actually asked for, not the best one', () => {
    const req = { kind: 'line' as const, lineKey: lineKeyOf({ moves: ['d4', 'Nf6', 'Bf4'], color: 'black' }) };
    expect(resolveHole(report([small, big]), req)).toEqual({ status: 'ready', hole: small });
  });

  it('reports a named line that is gone rather than substituting another', () => {
    // Silently swapping would drill a position they did not ask about.
    const res = resolveHole(report([big]), { kind: 'line', lineKey: 'black:d4 Nf6 Bf4' });
    expect(res).toEqual({ status: 'missing' });
  });

  it('says nothing-measured only when nothing is measured', () => {
    expect(resolveHole([], { kind: 'today' })).toEqual({ status: 'none' });
    expect(resolveHole(report([]), { kind: 'today' })).toEqual({ status: 'none' });
  });

  it('ranks every confirmed line above every suspected one', () => {
    const suspected = hole(['e4', 'e5', 'f4'], 'white', 100, 'suspected');
    const confirmed = hole(['d4', 'd5', 'Bf4'], 'white', 1);
    // A far larger estimate does not outrank a measurement.
    expect(resolveHole(report([suspected, confirmed]), { kind: 'today' })).toEqual({
      status: 'ready',
      hole: confirmed,
    });
  });
});
