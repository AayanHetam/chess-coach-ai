// Every book that ships is reachable, and everything reachable ships.
//
// The banded corpus shipped `repertoire-map.strong.json`, asserted it correct,
// and left it out of the loader's band list — a file built, committed, tested
// and read by nothing. Existence and correctness are not reachability, and only
// a both-directions set equality catches the gap.

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { BOOK_BANDS, loadOpeningBook, resetOpeningBookCache } from '../load';
import { BANDS } from '@/lib/repertoire/levels';
import { bookExit } from '../bookExit';

const DATA = path.join(process.cwd(), 'src/data');
const shipped = () =>
  fs
    .readdirSync(DATA)
    .map(f => /^opening-book\.(.+)\.json$/.exec(f)?.[1])
    .filter((b): b is string => Boolean(b))
    .sort();

describe('the shipped set and the loadable set', () => {
  it('are the same set, in both directions', () => {
    expect(shipped()).toEqual([...BOOK_BANDS].sort());
  });

  it('covers every band a reader can be put in', () => {
    // A band with no book answers "no data for your level" to somebody we do
    // have data for, and nothing anywhere would report it.
    expect([...BOOK_BANDS].sort()).toEqual(BANDS.map(b => b.id).sort());
  });

  it('actually loads each one', () => {
    resetOpeningBookCache();
    for (const band of BOOK_BANDS) {
      const book = loadOpeningBook(band);
      expect(book, `band ${band} did not load`).not.toBeNull();
      expect(book!.meta.band).toBe(band);
    }
  });
});

describe('what each book says about itself', () => {
  const books = BOOK_BANDS.map(b => [b, loadOpeningBook(b)!] as const);

  it('records the scale it was cut on', () => {
    // BANDS floors are chess.com numbers; the dumps carry raw Lichess Elo. A
    // book that lost this would file a Lichess 1200 under improving and every
    // share would still look completely reasonable.
    for (const [band, book] of books) {
      expect(book.meta.bandScale, band).toMatch(/^common \(chess\.com\)/);
    }
  });

  it('names its corpus and its floors, so a screen never has to guess', () => {
    for (const [band, book] of books) {
      expect(book.meta.source, band).toBeTruthy();
      expect(book.meta.games, band).toBeGreaterThan(0);
      expect(book.meta.minGames, band).toBeGreaterThanOrEqual(10);
      expect(book.meta.minShare, band).toBeGreaterThan(0);
    }
  });
});

describe('the real books, walked', () => {
  it('follows a main line past the point the old maps stopped', () => {
    // The repertoire map's slots stop around ply 8. This is the whole reason
    // the book exists: "you left theory at move 7" needs fourteen plies.
    const italian = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6'];
    for (const band of ['beginner', 'improving', 'club'] as const) {
      const exit = bookExit(italian, 'white', loadOpeningBook(band)!);
      expect(exit.outcome, `${band}: ${exit.outcome} at ply ${exit.ply}`).toBe('in-book');
    }
  });

  it('finds a real exit for a move nobody at that level plays', () => {
    // The control for the test above: same book, a move that is genuinely off
    // the beaten path, and it has to be found rather than waved through.
    const exit = bookExit(['e4', 'e5', 'Nf3', 'Nc6', 'Ba6'], 'white', loadOpeningBook('improving')!);
    expect(exit.outcome).toBe('left');
    expect(exit.san).toBe('Ba6');
    expect(exit.common.length).toBeGreaterThan(0);
  });
});
