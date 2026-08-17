// The scout page is behind auth, so this panel cannot be driven in a browser
// without credentials. It can still be rendered.
//
// That matters more than it sounds: a throw inside this component does not
// degrade to a missing section, it takes the whole /scout page down with it, and
// `next build` never exercises it. Rendering to a string with real report data
// catches the undefined-access class of crash, which is the one that would
// actually happen — every field the panel touches is optional somewhere.

import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Chess } from 'chess.js';
import PrepLinesPanel from '@/components/scout/PrepLinesPanel';
import { buildHoleReport } from '@/lib/scout/buildHoleReport';
import type { HoleFinderProviders, HoleReport } from '@/lib/scout/holeFinder';
import type { HoleProgress } from '@/lib/scout/buildHoleReport';
import type { ScoutGame } from '@/types/scout';

let nextId = 0;
function batch(moves: string[], n: number, theyScore: number): ScoutGame[] {
  const out: ScoutGame[] = [];
  const wins = Math.round(n * theyScore);
  for (let i = 0; i < n; i++) {
    out.push({
      id: `g${nextId++}`,
      platform: 'chess.com',
      moves,
      whiteUsername: 'other',
      blackUsername: 'them',
      whiteRating: 1500,
      blackRating: 1500,
      result: (i < wins ? '0-1' : '1-0') as ScoutGame['result'],
      timeClass: 'blitz',
      date: Date.UTC(2026, 0, 1),
    });
  }
  return out;
}

const neutral = (): HoleFinderProviders => ({
  async evaluate(fen: string) {
    return { bestMove: new Chess(fen).moves()[0] ?? '', cp: 0 };
  },
});

const IDLE: HoleProgress = { phase: 'idle', fraction: 0, label: '' };

function render(props: Partial<Parameters<typeof PrepLinesPanel>[0]> = {}) {
  return renderToString(
    <PrepLinesPanel
      report={null}
      progress={IDLE}
      error={null}
      theirName="chilllychess"
      yourColor="white"
      onColorChange={() => {}}
      onRun={() => {}}
      {...props}
    />
  );
}

describe('PrepLinesPanel', () => {
  it('renders before anything has been run', () => {
    const html = render();
    expect(html).toContain('BUILD MY PREP');
    expect(html).toContain('chilllychess');
  });

  it('renders while a run is in flight', () => {
    const html = render({
      progress: { phase: 'evaluating', fraction: 0.42, label: 'Checking positions — 40 of 96' },
    });
    expect(html).toContain('Checking positions');
  });

  it('renders an error', () => {
    const html = render({ error: 'No games found where chilllychess plays black.' });
    expect(html).toContain('No games found');
  });

  it('renders a confirmed weakness with real report data', async () => {
    const report = await buildHoleReport(
      [
        ...batch(['e4', 'e5', 'Nf3', 'Nc6'], 400, 0.5),
        ...batch(['e4', 'c6', 'd4', 'd5', 'c4', 'Nf6'], 120, 0.1),
      ],
      'them',
      'white',
      { makeProvider: neutral }
    );
    expect(report!.confirmedWeakness).toBe(true);

    const html = render({ report, progress: { phase: 'done', fraction: 1, label: '' } });
    expect(html).toContain('Weakness confirmed');
    expect(html).toContain('Confirmed');
    // The evidence footer must always state what the claim rests on.
    expect(html).toMatch(/independent lines/);
  });

  it('renders the honest empty answer without pretending', async () => {
    // A dead engine drops every candidate.
    const report = await buildHoleReport(
      [
        ...batch(['e4', 'e5', 'Nf3', 'Nc6'], 400, 0.5),
        ...batch(['e4', 'c6', 'd4', 'd5', 'c4', 'Nf6'], 120, 0.1),
      ],
      'them',
      'white',
      { makeProvider: () => ({ evaluate: async () => null }) }
    );
    expect(report!.noHoleFound).toBe(true);

    const html = render({ report });
    expect(html).toContain('Nothing worth recommending');
    expect(html).not.toContain('Weakness confirmed');
  });

  it('survives a hole with every optional field absent', () => {
    // p, cpLoss, betterMove, punish and keyMove are all optional, and the
    // `prep` tier is exactly the case where most of them are missing.
    const bare: HoleReport = {
      holes: [
        {
          line: [{ san: 'e4', side: 'you', games: 10 }],
          fen: new Chess().fen(),
          kind: 'results',
          tier: 'prep',
          games: 12,
          neff: 12,
          score: 0.3,
          shrunkScore: 0.4,
          baseline: 0.5,
          scoreUpper: 0.6,
          concessionCp: 0,
          reach: 0.5,
          confirmedEdge: 0,
          edge: 0.1,
          benefit: 0.05,
        },
      ],
      baseline: 0.5,
      baselineGames: 520,
      baselineNeff: 520,
      tests: 12,
      threshold: 0,
      confirmedWeakness: false,
      evaluated: 30,
      budgetExhausted: false,
      unavailable: 0,
      noHoleFound: false,
    };

    const html = render({ report: bare });
    expect(html).toContain('Prep only');
    // Untested lines must say so rather than show a p-value.
    expect(html).toContain('Sample too small to test');
  });
});
