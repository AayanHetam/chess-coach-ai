// The importer's extraction, tested against real page shapes.
//
// This runs once, by hand, and its output is committed — so a bug here does not
// show up as a failing request, it shows up as three thousand quietly wrong
// paragraphs that nobody re-derives for months. Two of these assertions exist
// because the bug had already happened during the coverage study.

import { describe, expect, it } from 'vitest';
// Plain ESM build script — untyped by design, so everything it returns is any.
import { sanOf, positionOf, headerOf, excerptOf, buildIndex, positionKey } from '../../../../scripts/openings/build-wikibooks-theory.mjs';

const PREFIX = 'Chess Opening Theory/';

describe('sanOf', () => {
  it("reads White's move", () => {
    expect(sanOf('1. e4')).toBe('e4');
    expect(sanOf('12. Nxd4')).toBe('Nxd4');
  });

  it("reads Black's move, which is written with three dots", () => {
    // Stripping "1." before "1..." leaves "..Nc6", which is illegal in every
    // position. That bug silently voided a whole coverage measurement, and it
    // fails invisibly: every Black move drops out and the index just looks thin.
    expect(sanOf('1...c5')).toBe('c5');
    expect(sanOf('10...Nfd7')).toBe('Nfd7');
  });

  it('handles the spacing the book actually uses', () => {
    expect(sanOf('2. c3')).toBe('c3');
    expect(sanOf('2...d5')).toBe('d5');
  });
});

describe('positionOf', () => {
  it('replays a title to its position', () => {
    const fen = positionOf(`${PREFIX}1. e4/1...c5/2. c3`);
    expect(fen).toContain('rnbqkbnr/pp1ppppp/8/2p5/4P3/2P5/PP1P1PPP/RNBQKBNR b');
  });

  it('gives transpositions the same key, which is the whole point', () => {
    // The book files these as two different URLs. They are one position, and
    // pooling them is worth 42 points of real-world coverage.
    const viaSicilian = positionOf(`${PREFIX}1. e4/1...c5/2. Nf3/2...d6/3. d4`);
    const viaReti = positionOf(`${PREFIX}1. Nf3/1...c5/2. e4/2...d6/3. d4`);
    expect(viaSicilian).not.toBeNull();
    expect(positionKey(viaSicilian)).toBe(positionKey(viaReti));
  });

  it('returns null for a title whose moves do not play', () => {
    expect(positionOf(`${PREFIX}1. e4/1...e5/2. Qxf7`)).toBeNull();
  });
});

describe('headerOf', () => {
  it('reads the opening name and ECO from the position template', () => {
    const wikitext = `{{Chess Opening Theory/Position
|Alapin variation
|eco=[[Chess/ECOB|B22]]
|parent=[[../|Sicilian defence]]
}}
== 2. c3 · Alapin variation ==
Text.`;
    expect(headerOf(wikitext)).toEqual({ name: 'Alapin variation', eco: 'B22' });
  });

  it('survives a page with no template at all', () => {
    expect(headerOf('Just prose.')).toEqual({});
  });
});

describe('excerptOf', () => {
  const page = (body: string) => `{{Chess Opening Theory/Position\n|Name\n}}\n== 2. c3 ==\n${body}`;

  it('takes the lead prose and drops the markup', () => {
    const out = excerptOf(
      page("This is an '''anti-Sicilian'''. If [[/2...Nc6|'''2...Nc6!?''']], then 3. d4.")
    );
    expect(out).toBe('This is an anti-Sicilian. If 2...Nc6!?, then 3. d4.');
  });

  it('stops before the history and the theory table', () => {
    const out = excerptOf(
      page('The ideas.\n\n=== History ===\nPlayed by Alapin in 1898.\n\n==Theory table==\n{{Chess Opening Theory/Table}}')
    );
    expect(out).toBe('The ideas.');
    expect(out).not.toContain('Alapin in 1898');
  });

  it('strips footnotes without eating the sentence around them', () => {
    const out = excerptOf(page('Carlsen plays it.<ref>[https://example.com A game]</ref> So does everyone.'));
    expect(out).toBe('Carlsen plays it. So does everyone.');
  });

  it('never stops mid-sentence at a move number', () => {
    // Chess prose is full of ". " that is not a sentence end. Trimming at the
    // last one cut the real Alapin page at "However, 2." — a fragment that reads
    // as a truncation bug to anyone who sees it.
    // Multi-sentence paragraphs, sized so the 700-character boundary falls in
    // the MIDDLE of the third. With short uniform paragraphs the two code paths
    // coincide — the fallback's sentence trim lands on the same paragraph break
    // the cap would have chosen — and the fixture proves nothing.
    const paras = Array.from(
      { length: 4 },
      (_, i) =>
        `Paragraph ${i}: White supports the centre and prepares 3. d4. Black must choose between an early ...d5 and a slower setup. The resulting structures favour whoever knows the plans, which at this level is preparation rather than calculation.`
    );
    const out = excerptOf(page(paras.join('\n\n')));

    expect(out.length).toBeLessThanOrEqual(700);
    expect(out).not.toMatch(/\d\.$/);
    expect(out.trimEnd()).toMatch(/\.$/);

    // Whole paragraphs only. Without the cap the excerpt would run into the
    // third paragraph and stop at a sentence end inside it — legal-looking,
    // right length, and a truncation the reader can see.
    const kept = out.split(/\n{2,}/);
    expect(kept).toHaveLength(2);
    kept.forEach((para: string, i: number) => expect(para).toBe(paras[i]));
  });

  it('returns the whole thing when it already fits', () => {
    expect(excerptOf(page('Short and complete.'))).toBe('Short and complete.');
  });
});

describe('buildIndex', () => {
  const positionPage = (name: string, body: string) =>
    `{{Chess Opening Theory/Position\n|${name}\n}}\n== x ==\n${body}`;

  it('keeps the best-written page when several share a position', () => {
    // 1.d4 Nf6 2.Nf3 e6 3.c4 d5 and the Queen's Gambit Declined move order are
    // the same position; only one of them carries the explanation, and the
    // shortest path is not reliably the one that does.
    const thin = `${PREFIX}1. d4/1...Nf6/2. Nf3/2...e6/3. c4/3...d5`;
    const rich = `${PREFIX}1. d4/1...d5/2. c4/2...e6/3. Nf3/3...Nf6`;
    const { byPosition } = buildIndex([
      {
        title: thin,
        wikitext: positionPage(
          'Indian',
          'A brief note that this move order transposes, long enough to clear the minimum and so to actually compete.'
        ),
      },
      {
        title: rich,
        wikitext: positionPage(
          'Queen',
          'A much longer explanation of the Queen’s Gambit Declined, its plans, its pawn structures, and what both sides are trying to achieve over the coming moves.'
        ),
      },
    ]);
    expect(byPosition.size).toBe(1);
    expect(Array.from(byPosition.values())[0].t).toBe(rich);
  });

  it('drops navigation nodes that say nothing', () => {
    const { byPosition, stats } = buildIndex([
      { title: `${PREFIX}1. e4`, wikitext: positionPage('KP', 'Tiny.') },
    ]);
    expect(byPosition.size).toBe(0);
    expect(stats.empty).toBe(1);
  });

  it('counts titles it cannot replay instead of silently dropping them', () => {
    const { stats } = buildIndex([
      { title: `${PREFIX}1. e4/1...e5/2. Qxf7`, wikitext: positionPage('Nope', 'Long enough prose to pass the minimum length gate for an excerpt.') },
    ]);
    expect(stats.unplayable).toBe(1);
  });
});
