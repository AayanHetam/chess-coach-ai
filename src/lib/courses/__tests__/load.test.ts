// The loader degrades; it never throws. A missing artifact must cost the course
// surface, never the page it sits on.

import { afterEach, describe, expect, it } from 'vitest';
import { loadCourse, loadCourseIndex, resetCourseCache } from '../load';

afterEach(() => resetCourseCache());

describe('loadCourseIndex', () => {
  it('reads the generated catalogue', () => {
    const index = loadCourseIndex();
    expect(index).not.toBeNull();
    expect(index!.courses.length).toBeGreaterThan(0);
    expect(index!.corpusSha).toMatch(/^[0-9a-f]{16}$/);
  });

  it('gives every course a distinct id, which is what makes it a course', () => {
    const ids = loadCourseIndex()!.courses.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('loadCourse', () => {
  it('loads a real course with a traversable graph', () => {
    const course = loadCourse('b-caro');
    expect(course).not.toBeNull();
    expect(course!.meta.side).toBe('black');
    for (const node of Object.values(course!.nodes)) {
      for (const reply of node.them ?? []) expect(course!.nodes[reply.to]).toBeDefined();
      if (node.next) expect(course!.nodes[node.next]).toBeDefined();
    }
  });

  it('names the corpus and the engine behind every course', () => {
    // A course that cannot say where its moves came from cannot be audited.
    const course = loadCourse('w-london')!;
    expect(course.meta.corpus.games).toBeGreaterThan(0);
    expect(course.meta.corpus.sha256).toHaveLength(16);
    expect(course.meta.evals.licence).toMatch(/CC0/);
  });

  it('returns null for an id that is not in the catalogue, without touching disk', () => {
    // The id builds a path, so it is validated against the index rather than
    // sanitised: an id that is not a course is not a course, whatever it would
    // resolve to.
    expect(loadCourse('../../../etc/passwd')).toBeNull();
    expect(loadCourse('does-not-exist')).toBeNull();
  });
});
