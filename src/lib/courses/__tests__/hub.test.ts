// The hub's numbers are the trainer's numbers, or they are worse than nothing.
//
// A hub that says "24 decisions" and a session that asks 31 is not a rounding
// difference, it is the screen lying about the work. These tests hold the two
// to the same source, on the real shipped courses rather than a fixture that
// could agree with both.

import { afterEach, describe, expect, it } from 'vitest';
import { BANDS } from '@/lib/repertoire/levels';
import { loadCourse, loadCourseIndex, resetCourseCache } from '../load';
import { probesOf } from '../probes';
import { viewFor } from '../view';
import { hubFor, resetHubCache, unitsOf } from '../hub';

const band = (id: string) => BANDS.find(b => b.id === id)!;

afterEach(() => {
  resetHubCache();
  resetCourseCache();
});

describe('unitsOf', () => {
  it('counts every chapter exactly as probesOf does, on every shipped course', () => {
    const index = loadCourseIndex()!;
    let checked = 0;
    for (const entry of index.courses) {
      const course = loadCourse(entry.id)!;
      const view = viewFor(course, band('improving'));
      const units = unitsOf(view, course.meta.side);
      expect(units.map(u => u.i)).toEqual(view.chapters.map(c => c.i));
      for (const unit of units) {
        const { probes, total, capped } = probesOf(view, unit.i, course.meta.side);
        expect(unit.decisions).toBe(total);
        expect(unit.asked).toBe(probes.length);
        expect(unit.capped).toBe(capped);
        checked++;
      }
    }
    // The measurement this test would be worthless without: it actually ran.
    expect(checked).toBeGreaterThan(100);
  });

  it('never claims to ask more than it holds', () => {
    const course = loadCourse('w-london')!;
    const units = unitsOf(viewFor(course, band('club')), course.meta.side);
    for (const unit of units) expect(unit.asked).toBeLessThanOrEqual(unit.decisions);
  });

  it('splits a chapter into studies only where studies.ts says to', () => {
    const course = loadCourse('w-london')!;
    for (const id of ['new', 'beginner', 'improving', 'club', 'strong']) {
      for (const unit of unitsOf(viewFor(course, band(id)), course.meta.side)) {
        // One study is never a split, and a split is never one study.
        expect(unit.studies.length === 1).toBe(false);
      }
    }
  });
});

describe('hubFor', () => {
  it('adds the chapters up, both ways', () => {
    const hub = hubFor('w-london', band('improving'))!;
    expect(hub.decisions).toBe(hub.chapters.reduce((s, c) => s + c.decisions, 0));
    expect(hub.asked).toBe(hub.chapters.reduce((s, c) => s + c.asked, 0));
    expect(hub.asked).toBeGreaterThan(0);
  });

  // ── The bar that could never fill ──────────────────────────────────────────
  //
  // `probesOf` caps a chapter at 60 questions. Measured on the shipped courses,
  // that cap bites on 29 of 44 courses at the club band: the Reti holds 884
  // decisions and a session can reach 360. Progress drawn against 884 stops at
  // 41% however much is learned, which reads as a broken product.
  it('separates what the course holds from what a session can ask', () => {
    const hub = hubFor('w-nf3', band('club'))!;
    expect(hub.asked).toBeLessThan(hub.decisions);
    for (const unit of hub.chapters) expect(unit.asked).toBeLessThanOrEqual(unit.decisions);
    // The control: at a band where nothing is capped the two are the same
    // number, so the gap is the cap and not an accounting slip.
    const shallow = hubFor('w-nf3', band('beginner'))!;
    expect(shallow.asked).toBe(shallow.decisions);
  });

  // ── Zero by definition ──────────────────────────────────────────────────────
  it('is null for a course that does not exist, rather than an empty one', () => {
    expect(hubFor('not-a-course', band('improving'))).toBeNull();
    // Twice, because the null is cached and a cached null must stay null.
    expect(hubFor('not-a-course', band('improving'))).toBeNull();
  });

  it('gives a deeper band strictly more, and caches per band rather than per course', () => {
    // The cache key is the trap: keyed on the course alone, the first band to
    // ask would answer for every band, and the depth gate would be decided by
    // whoever loaded the page first.
    const shallow = hubFor('w-london', band('beginner'))!;
    const deep = hubFor('w-london', band('club'))!;
    expect(deep.theoryPlies).toBeGreaterThan(shallow.theoryPlies);
    expect(deep.decisions).toBeGreaterThan(shallow.decisions);
    expect(shallow.band).toBe('beginner');
    // And asking again returns the shallow answer, not the deep one.
    expect(hubFor('w-london', band('beginner'))!.decisions).toBe(shallow.decisions);
  });
});
