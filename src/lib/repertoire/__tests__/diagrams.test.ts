// Every choice card draws a board. The board has to be that opening's board.
//
// ─────────────────────────────────────────────────────────────────────────────
// The bug this file exists to prevent, found by looking at a screenshot rather
// than by any assertion:
//
// `diagramLine()` walks the corpus principal from a choice's `root`. The London
// System is a SYSTEM -- a set of our moves in no fixed order -- so its root was
// the bare first move, `["d4"]`, identical to plain "1.d4". Both therefore
// walked to the same principal, the Nimzo-Indian, and the London System, whose
// entire identity is Bf4, shipped with a picture that does not contain Bf4 and
// was pixel-identical to the card next to it.
//
// The existing guard could not see it: it checked that a diagram contains the
// choice's own committing move, and the London's committing move is `d4`, which
// was present. The move was right and the opening was wrong.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import map from '@/data/repertoire-map.json';
import type { RepertoireMap } from '@/types/repertoire';

const choices = (map as unknown as RepertoireMap).slots.flatMap(slot =>
  slot.choices.map(choice => ({ slot, choice }))
);

describe('choice diagrams', () => {
  it('there are diagrams to check, so this cannot pass vacuously', () => {
    expect(choices.length).toBeGreaterThan(20);
    expect(choices.every(({ choice }) => choice.diagram.length > 0)).toBe(true);
  });

  // ── The collision that produced the bug ──────────────────────────────────
  it('no two choices draw the same board', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const { choice } of choices) {
      const key = choice.diagram.join(' ');
      const first = seen.get(key);
      if (first) clashes.push(`${first} and ${choice.id} both draw: ${key}`);
      else seen.set(key, choice.id);
    }
    // Two identical pictures under two different names is worse than no
    // picture: it looks like information and it is wrong.
    expect(clashes).toEqual([]);
  });

  it('every diagram is a legal game', () => {
    const broken: string[] = [];
    for (const { choice } of choices) {
      const board = new Chess();
      for (const san of choice.diagram) {
        try {
          if (!board.move(san)) throw new Error('rejected');
        } catch {
          broken.push(`${choice.id}: ${choice.diagram.join(' ')} (at ${san})`);
          break;
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('every diagram plays the move the choice actually commits to', () => {
    const wrong = choices
      .filter(({ choice }) => !choice.diagram.includes(choice.play))
      .map(({ choice }) => `${choice.id} plays ${choice.play}, diagram has none`);
    expect(wrong).toEqual([]);
  });

  // ── The named regression ─────────────────────────────────────────────────
  it('the London System has a bishop on f4', () => {
    const london = choices.find(c => c.choice.id === 'w-london')?.choice;
    expect(london).toBeDefined();
    expect(london!.diagram).toContain('Bf4');
    // And is not the Nimzo-Indian it used to draw.
    expect(london!.diagram.join(' ')).not.toContain('Bb4');

    // Asserted on the BOARD as well as the move list, because a `Bf4` early in
    // a line that later trades it off would satisfy the string check while
    // drawing a board with nothing on f4 — which is what the card shows.
    const board = new Chess();
    for (const san of london!.diagram) board.move(san);
    expect(board.get('f4')).toMatchObject({ type: 'b', color: 'w' });
  });
});
