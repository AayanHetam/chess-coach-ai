#!/usr/bin/env node
// Opening prose out of public-domain chess books, keyed by position.
//
//   node scripts/openings/build-book-theory.mjs .cache/books
//
// ─────────────────────────────────────────────────────────────────────────────
// PROVENANCE, WHICH IS THE WHOLE REASON THIS SOURCE IS USABLE
//
// Every book here is out of copyright. Not "free to read" — out of copyright,
// which is a different thing and the only one that matters. Chess.com's opening
// pages are free to read and are somebody's property; Edward Lasker's 1915
// Chess Strategy is nobody's.
//
// Project Gutenberg's own position: the underlying texts are public domain, and
// their licence attaches to the Gutenberg trademark and packaging rather than
// to the words. So the header and footer are stripped and the trademark is not
// used, which is exactly what their licence asks for. We still record the book,
// the author and the year on every excerpt, because a claim about chess should
// carry the source it came from whether or not a licence demands it.
//
// The catalogue feed is used rather than the search page, because Gutenberg
// asks for that in as many words on the search page itself.
// ─────────────────────────────────────────────────────────────────────────────
//
// The hard part is not the licence, it is the notation. Every one of these
// books predates algebraic, so see scripts/openings/lib/descriptive.mjs.

import fs from 'fs';
import path from 'path';
import { Chess } from 'chess.js';
import { convertLine, tokenise } from './lib/descriptive.mjs';

const OUT = 'src/data/book-theory.json';

/** Public-domain, and each one actually explains openings rather than listing them. */
const BOOKS = [
  { id: '5614', title: 'Chess Strategy', author: 'Edward Lasker', year: 1915 },
  { id: '33870', title: 'Chess Fundamentals', author: 'José Raúl Capablanca', year: 1921 },
  { id: '4913', title: 'Chess and Checkers: the Way to Mastership', author: 'Edward Lasker', year: 1918 },
  { id: '16377', title: 'The Blue Book of Chess', author: 'Howard Staunton', year: 1908 },
  { id: '55278', title: 'Chess Generalship', author: 'Franklin K. Young', year: 1910 },
];

/** Shortest converted line we will attach prose to. */
const MIN_PLIES = 4;
/** Deep enough and it is a game, not an opening. */
const MAX_PLIES = 14;
const MIN_PROSE = 140;
const MAX_PROSE = 700;

const positionKey = fen => fen.split(' ').slice(0, 4).join(' ');

/**
 * Gutenberg's header and footer, removed.
 *
 * The words between them are public domain; the markers themselves carry the
 * trademark this is deliberately not using.
 */
function stripGutenberg(text) {
  const start = text.search(/\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG/i);
  const end = text.search(/\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG/i);
  let body = text;
  if (start >= 0) body = body.slice(body.indexOf('\n', start) + 1);
  if (end >= 0) {
    const cut = body.search(/\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG/i);
    if (cut >= 0) body = body.slice(0, cut);
  }
  return body;
}

/** Prose, tidied but never reworded. Quoting is the licence-safe operation. */
function clean(paragraph) {
  return paragraph
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\[Illustration[^\]]*\]/gi, ' ')
    .replace(/_+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Enough words that it is an explanation rather than a caption or an index row. */
function isProse(text) {
  if (text.length < MIN_PROSE) return false;
  const words = text.split(/\s+/);
  if (words.length < 25) return false;
  // Index and score-table lines are mostly digits and punctuation.
  const letters = (text.match(/[a-z]/gi) ?? []).length;
  return letters / text.length > 0.6;
}

function main() {
  const dir = process.argv[2] ?? '.cache/books';
  const positions = new Map();
  const stats = [];

  for (const book of BOOKS) {
    const file = path.join(dir, `${book.id}.txt`);
    if (!fs.existsSync(file)) {
      stats.push({ ...book, kept: 0, note: 'not downloaded' });
      continue;
    }
    const body = stripGutenberg(fs.readFileSync(file, 'utf-8'));
    const paragraphs = body.split(/\n\s*\n/);
    let kept = 0;
    let lines = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const raw = paragraphs[i];
      const tokens = tokenise(raw);
      if (tokens.length < MIN_PLIES) continue;
      const { sans } = convertLine(tokens.slice(0, MAX_PLIES));
      if (sans.length < MIN_PLIES) continue;
      lines += 1;

      // The prose is what surrounds the line, not the line itself. A paragraph
      // that is only moves is a score; the explanation is next to it.
      const around = [paragraphs[i - 1], raw, paragraphs[i + 1]]
        .filter(Boolean)
        .map(clean)
        .filter(isProse);
      if (around.length === 0) continue;
      const excerpt = around.join(' ').slice(0, MAX_PROSE);

      const board = new Chess();
      for (const san of sans) board.move(san);
      const key = positionKey(board.fen());
      const existing = positions.get(key);
      // Keep the fullest explanation when two books reach the same position.
      if (existing && existing.x.length >= excerpt.length) continue;
      positions.set(key, {
        x: excerpt,
        line: sans,
        b: book.title,
        a: book.author,
        y: book.year,
        g: book.id,
      });
      kept += 1;
    }
    stats.push({ ...book, lines, kept });
  }

  const out = {
    source: 'Public-domain chess books via Project Gutenberg',
    licence: 'Public domain (copyright expired)',
    builtAt: new Date().toISOString().slice(0, 10),
    books: BOOKS,
    positions: Object.fromEntries(positions),
  };
  fs.writeFileSync(OUT, JSON.stringify(out));

  for (const s of stats) {
    console.log(
      `  ${String(s.kept).padStart(4)} kept  ${String(s.lines ?? 0).padStart(4)} lines found   ` +
        `${s.title} (${s.year})${s.note ? ' — ' + s.note : ''}`
    );
  }
  console.log(`\npositions: ${positions.size}`);
  console.log(`written:   ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}

main();
