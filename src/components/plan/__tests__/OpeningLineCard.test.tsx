// The browser test drives the happy path on a real page. These cover the states
// it cannot reach cheaply — no linked account, an error, a second-place line,
// and a hole with the optional engine fields absent.
//
// A throw in this card does not blank it. It takes /plan down with it, and every
// engine field here is optional somewhere.

import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Chess } from 'chess.js';
import OpeningLineCard, { type OpeningLineCardProps } from '@/components/plan/OpeningLineCard';
import type { RepertoireHole, RepertoireReport } from '@/lib/learn/repertoireHole';

const start = new Chess().fen();

const hole = (over: Partial<RepertoireHole> = {}): RepertoireHole => ({
  line: [
    { san: 'e4', side: 'you', games: 610 },
    { san: 'c5', side: 'opponent', games: 250 },
    { san: 'c3', side: 'you', games: 150 },
  ],
  fen: start,
  parentFen: start,
  color: 'white',
  tier: 'confirmed',
  diagnosis: 'position',
  games: 150,
  neff: 150,
  score: 0.3,
  shrunkScore: 0.31,
  baseline: 0.45,
  p: 0.0004,
  frequency: 0.25,
  deficit: 0.14,
  teachingValue: 0.035,
  ...over,
});

const report = (over: Partial<RepertoireReport> = {}): RepertoireReport => ({
  color: 'white',
  holes: [],
  baseline: 0.45,
  baselineGames: 610,
  baselineNeff: 610,
  tests: 6,
  threshold: 0.01,
  confirmed: false,
  evaluated: 12,
  unavailable: 0,
  budgetExhausted: false,
  insufficientData: false,
  ...over,
});

/**
 * React SSR writes `<!-- -->` between adjacent interpolated values. It is not
 * visible text, and leaving it in makes assertions that span an interpolation
 * boundary fail on a page that reads perfectly.
 */
const visible = (html: string) => html.replace(/<!-- -->/g, '');

function render(props: Partial<OpeningLineCardProps> = {}) {
  return visible(
    renderToString(
    <OpeningLineCard
      phase="idle"
      label=""
      reports={[]}
      line={null}
      error={null}
      cachedAt={null}
      username="me"
      onRun={() => {}}
      {...props}
    />
    )
  );
}

describe('OpeningLineCard', () => {
  it('asks for an account rather than offering a button that cannot work', () => {
    const html = render({ username: null });
    expect(html).toMatch(/Link a chess\.com or Lichess account/i);
    expect(html).not.toMatch(/FIND MY WEAKEST LINE/);
  });

  it('offers the run without spending anything', () => {
    expect(render()).toContain('FIND MY WEAKEST LINE');
  });

  it('says what it is doing while it runs', () => {
    const html = render({ phase: 'building', label: 'Checking your games as Black' });
    expect(html).toContain('Checking your games as Black');
  });

  it('shows an error as an error', () => {
    const html = render({ phase: 'error', error: 'Could not read your games.' });
    expect(html).toContain('Could not read your games.');
  });

  it('separates "nothing is wrong" from "we could not measure you"', () => {
    const measured = render({
      phase: 'ready',
      reports: [report({ tests: 6 })],
      line: null,
    });
    expect(measured).toMatch(/no line where you score measurably below/i);
    expect(measured).not.toMatch(/Not enough games/i);

    const thin = render({
      phase: 'ready',
      reports: [report({ tests: 0, insufficientData: true })],
      line: null,
    });
    expect(thin).toMatch(/Not enough games/i);
    expect(thin).not.toMatch(/no line where you score measurably below/i);
  });

  it('renders a line with the engine fields absent', () => {
    const top = hole();
    const html = render({
      phase: 'ready',
      reports: [report({ holes: [top] })],
      line: top,
    });
    expect(html).toContain('1.e4 c5 2.c3');
    expect(html).toContain('CONFIRMED');
    expect(html).toContain('30%');
    expect(html).toContain('45%');
    // p is small enough that a fixed decimal would print 0.000, which reads as
    // exactly zero.
    expect(html).toContain('&lt;0.001');
    expect(html).toMatch(/sound move/i);
  });

  it('names the replacement when the engine has one', () => {
    const top = hole({ diagnosis: 'move', cpLoss: 120, betterMove: 'Nf3' });
    const html = render({ phase: 'ready', reports: [report({ holes: [top] })], line: top });
    expect(html).toContain('Nf3');
    expect(html).toContain('120cp');
  });

  it('marks an unproven line as a signal, not a finding', () => {
    const top = hole({ tier: 'signal', p: 0.04 });
    const html = render({ phase: 'ready', reports: [report({ holes: [top] })], line: top });
    expect(html).toContain('SIGNAL');
    expect(html).not.toContain('CONFIRMED');
    expect(html).toContain('0.040');
  });

  it('lists the runners-up without repeating the headline', () => {
    const top = hole();
    const second = hole({
      line: [
        { san: 'd4', side: 'opponent', games: 200 },
        { san: 'Nf6', side: 'you', games: 180 },
        { san: 'c4', side: 'opponent', games: 170 },
        { san: 'g6', side: 'you', games: 90 },
      ],
      color: 'black',
      fen: 'other',
      tier: 'signal',
      score: 0.34,
      games: 90,
    });
    const html = render({
      phase: 'ready',
      reports: [report({ holes: [top] }), report({ color: 'black', holes: [second] })],
      line: top,
    });
    expect(html).toContain('Also leaking');
    expect(html).toContain('1.d4 Nf6 2.c4 g6');
    // The headline must not also appear in its own runners-up list.
    expect(html.match(/1\.e4 c5 2\.c3/g) ?? []).toHaveLength(1);
  });

  it('says when the answer is a cached one', () => {
    const top = hole();
    const html = render({
      phase: 'ready',
      reports: [report({ holes: [top] })],
      line: top,
      cachedAt: Date.UTC(2026, 0, 15),
    });
    expect(html).toMatch(/measured/i);
    expect(html).toContain('610');
    expect(html).toContain('6 independent lines tested');
  });
});
