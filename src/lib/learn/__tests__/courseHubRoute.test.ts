// Links out of the hub. Two of these reach a graph walk and a `nodes[key]`
// lookup, so their inputs are shape-checked rather than trusted.

import { describe, expect, it } from 'vitest';
import {
  chapterReaderHref,
  drillHref,
  isDrill,
  isStudyId,
  lineParam,
  readerLineHref,
  studyParam,
} from '@/lib/learn/courseHubRoute';

describe('the reader', () => {
  it('opens a chapter, and a study inside it', () => {
    expect(chapterReaderHref('w-london', 0)).toBe('/learn/w-london/0');
    expect(chapterReaderHref('w-london', 2, 'Qxd5')).toBe('/learn/w-london/2?study=Qxd5');
  });

  it('opens an exact line, readable in a status bar', () => {
    expect(readerLineHref('w-london', 0, ['d4', 'd5', 'Bf4'])).toBe(
      '/learn/w-london/0?line=d4_d5_Bf4'
    );
    // Zero by definition: no line is the chapter itself, not `?line=`.
    expect(readerLineHref('w-london', 0, [])).toBe('/learn/w-london/0');
  });
});

describe('drill', () => {
  it('is a picker, a chapter, or a study of one', () => {
    expect(drillHref('w-london')).toBe('/train/course/w-london/drill');
    expect(drillHref('w-london', 3)).toBe('/train/course/w-london/3?drill=1');
    expect(drillHref('w-london', 3, 'Qxd5')).toBe('/train/course/w-london/3?drill=1&study=Qxd5');
  });

  it('reads its own flag, and nothing else as it', () => {
    expect(isDrill('1')).toBe(true);
    expect(isDrill('')).toBe(true);
    expect(isDrill(undefined)).toBe(false);
    expect(isDrill('0')).toBe(false);
    expect(isDrill('no')).toBe(false);
  });
});

describe('a study id', () => {
  it('is SAN, including the awkward ones', () => {
    for (const san of ['Qxd5', 'e4', 'O-O', 'O-O-O', 'exd6', 'Ngf3', 'a8=Q', 'Qh4+', 'Rxf7#']) {
      expect(isStudyId(san), san).toBe(true);
    }
  });

  it('is not a path, a script, or a novel', () => {
    for (const bad of ['../../etc/passwd', '<script>', 'e', '', 'a'.repeat(40), 42, null]) {
      expect(isStudyId(bad), String(bad)).toBe(false);
    }
    expect(studyParam(['Qxd5'])).toBe('Qxd5');
    expect(studyParam('../x')).toBeNull();
  });
});

describe('lineParam', () => {
  it('reads a line of moves', () => {
    expect(lineParam('d4_d5_Bf4')).toEqual(['d4', 'd5', 'Bf4']);
    expect(lineParam(['d4_d5'])).toEqual(['d4', 'd5']);
  });

  it('refuses anything that is not moves', () => {
    for (const bad of ['', '../../x', 'd4_<script>', 'x'.repeat(500), undefined, 7]) {
      expect(lineParam(bad), String(bad)).toBeNull();
    }
  });

  it('refuses a line longer than any course is deep', () => {
    expect(lineParam(Array.from({ length: 61 }, () => 'e4').join('_'))).toBeNull();
    // The control: one shorter is fine.
    expect(lineParam(Array.from({ length: 60 }, () => 'e4').join('_'))).toHaveLength(60);
  });
});
