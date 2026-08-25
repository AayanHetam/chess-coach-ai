import { describe, expect, it } from 'vitest';
import { chapterParam, courseReaderHref, courseTrainerHref, isCourseId, roundParam } from '../courseRoute';

describe('courseTrainerHref', () => {
  it('leaves round 1 implied', () => {
    expect(courseTrainerHref('w-london', 0)).toBe('/train/course/w-london/0');
    expect(courseTrainerHref('w-london', 0, 1)).toBe('/train/course/w-london/0');
  });

  it('names a later round', () => {
    expect(courseTrainerHref('b-caro', 2, 3)).toBe('/train/course/b-caro/2?round=3');
  });

  it('round-trips back to the reader', () => {
    expect(courseReaderHref('w-london')).toBe('/learn/w-london');
  });
});

describe('isCourseId', () => {
  it('accepts the ids the catalogue actually uses', () => {
    for (const id of ['w-london', 'b-sicilian-najdorf', 'w-e4', 'b-e5']) {
      expect(isCourseId(id)).toBe(true);
    }
  });

  it('refuses anything that could become a path', () => {
    // THE ZERO: the number of accepted ids containing a separator is zero.
    for (const id of ['../users', 'a/b', 'w london', '', 'UPPER', 'x'.repeat(41), null, 7]) {
      expect(isCourseId(id)).toBe(false);
    }
  });
});

describe('chapterParam', () => {
  it('reads a chapter', () => {
    expect(chapterParam('0')).toBe(0);
    expect(chapterParam('7')).toBe(7);
    expect(chapterParam(['3'])).toBe(3);
  });

  it('refuses an empty parameter rather than calling it chapter 0', () => {
    // Number('') is 0. A caller who forgot the parameter would otherwise open
    // the first chapter and look like it worked.
    expect(chapterParam('')).toBeNull();
    expect(chapterParam('  ')).toBeNull();
    expect(chapterParam(undefined)).toBeNull();
  });

  it('refuses anything that is not a small whole number', () => {
    for (const v of ['-1', '1.5', 'x', '100', 'Infinity', 'NaN']) {
      expect(chapterParam(v)).toBeNull();
    }
  });
});

describe('roundParam', () => {
  it('reads a round inside the sitting', () => {
    expect(roundParam('3', 4)).toBe(3);
    expect(roundParam(['2'], 4)).toBe(2);
  });

  it('treats every unusable value as the first round', () => {
    // A bad round number is not worth a 404: the round is a position in a
    // sitting, not an identity, and starting at the beginning always works.
    for (const v of [undefined, '', 'x', '0', '-2', '1.5']) {
      expect(roundParam(v, 4)).toBe(1);
    }
  });

  it('cannot point past the end of the sitting', () => {
    expect(roundParam('99', 4)).toBe(4);
  });
});
