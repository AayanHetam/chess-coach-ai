// The shipped courses, checked as data.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE ARTIFACTS ARE TESTED AND NOT ONLY THE BUILDER
//
// The builder has unit tests; the JSON it wrote is what the trainer reads. A
// guard added to the builder after the artifacts were written protects nothing
// until they are rebuilt, and nothing on a screen distinguishes a course built
// before the guard from one built after. So the invariants are asserted on the
// files in src/data/courses/, the way quarantine.test.ts asserts C-3 on them.
//
// The case that made this necessary: 1.b3 e5 2.Bb2 Nc6 3.e3 Nf6 4.Nf3 e4, where
// the course played 5.Be2 with the knight en prise on f3 and the card said
// "this system's setup, engine-checked". 209 setup moves shipped without a
// score across the three system courses. A learner reported it (2026-09-09).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Chess } from 'chess.js';
import type { Course } from '@/types/course';
import { MAX_ENGINE_LOSS_CP } from '../../../../scripts/openings/lib/course.mjs';

const DIR = path.join(process.cwd(), 'src/data/courses');
const files = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'index.json')
  : [];
const load = (f: string): Course => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

describe.skipIf(files.length === 0)('shipped courses', () => {
  it('never ship a system move without its engine score (guard C-4)', () => {
    const unscored: string[] = [];
    for (const f of files) {
      const course = load(f);
      for (const [key, node] of Object.entries(course.nodes)) {
        if (node.src === 'setup' && node.loss === undefined) unscored.push(`${f} ${key} ${node.us}`);
      }
    }
    expect(unscored).toEqual([]);
  });

  it('never ship a scored move worse than the veto allows (guard C-1)', () => {
    const bad: string[] = [];
    for (const f of files) {
      const course = load(f);
      for (const [key, node] of Object.entries(course.nodes)) {
        if (node.loss !== undefined && node.loss > MAX_ENGINE_LOSS_CP) bad.push(`${f} ${key} ${node.us} ${node.loss}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('never ship a move that is not legal in its own position', { timeout: 90_000 }, () => {
    // The class of bug is silent: a node's `us` is played on the board by the
    // trainer, and an illegal one is a question with no answer. Twenty thousand
    // boards is a few seconds alone and far more under a parallel suite, hence
    // the timeout.
    const illegal: string[] = [];
    for (const f of files) {
      const course = load(f);
      for (const [key, node] of Object.entries(course.nodes)) {
        if (!node.us) continue;
        const board = new Chess(`${key} 0 1`);
        let ok = false;
        try {
          ok = Boolean(board.move(node.us));
        } catch {
          ok = false;
        }
        if (!ok) illegal.push(`${f} ${key} ${node.us}`);
      }
    }
    expect(illegal).toEqual([]);
  });

  it('the 1.b3 course no longer hangs its knight on move five', () => {
    if (!files.includes('w-b3.json')) return;
    const course = load('w-b3.json');
    // 1.b3 e5 2.Bb2 Nc6 3.e3 Nf6 4.Nf3 e4 — the screenshot. And the same
    // shape with 3...d5, the other screenshot. Both were 5.Be2?? exf3.
    const positions = [
      'r1bqkb1r/pppp1ppp/2n2n2/8/4p3/1P2PN2/PBPP1PPP/RN1QKB1R w KQkq -',
      'r1bqkbnr/ppp2ppp/2n5/3p4/4p3/1P2PN2/PBPP1PPP/RN1QKB1R w KQkq -',
    ];
    for (const key of positions) {
      const node = course.nodes[key];
      if (!node?.us) continue; // pruned at this band — nothing to teach, nothing wrong
      expect(node.us, key).not.toBe('Be2');
      // Whatever it plays, the knight is not left to be taken for nothing.
      const board = new Chess(`${key} 0 1`);
      board.move(node.us);
      expect(board.moves().includes('exf3'), `${key} → ${node.us} still allows exf3`).toBe(false);
    }
  });
});
