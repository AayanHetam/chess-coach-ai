#!/usr/bin/env node
/**
 * The book a player at one rating band is actually in.
 *
 *   node scripts/openings/build-opening-book.mjs <compactTreeDir> <band|all>
 *        [--min-games=10] [--min-share=0.02]
 *
 * Reads the compacted banded trees (build inputs, never shipped) and writes one
 * small artifact per band: for every position the band's games reach often
 * enough to describe, the moves those players actually play there, with shares.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT JUST THE TREE
 *
 * The tree carries counts, results and provenance for 100,000 positions per
 * band — 11 MB, and nothing at runtime needs any of it to answer "was this move
 * in book". The book keeps two facts per position and drops the rest, which is
 * the difference between 11 MB and 3 MB, read once per request.
 *
 * NO TOP-N CAP ON MOVES. Every move at or above `--min-share` is kept, however
 * many that is. A cap would be a display decision leaking into a MEMBERSHIP
 * test: a move played by 3% of the band but ranked seventh would be judged
 * out of book, which is a false accusation about a real person's game. The
 * caller may show three of them; the book must know all of them.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const BANDS = ['new', 'beginner', 'improving', 'club', 'strong'];

const [, , dir, which] = process.argv;
const arg = (name, fallback) =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;

if (!dir || !which || (which !== 'all' && !BANDS.includes(which))) {
  console.error(
    `Usage: node scripts/openings/build-opening-book.mjs <compactTreeDir> <all|${BANDS.join('|')}>`
  );
  process.exit(1);
}

/**
 * Games through a position before we are willing to describe it.
 *
 * Ten, because a share computed over three games is not a share — one player's
 * pet line reads as 33% of the band. Under the floor the position is left OUT
 * of the book entirely, which downstream reports as "we have no data here", a
 * different answer from "you left theory" and one that must never print as it.
 */
const MIN_GAMES = Number(arg('min-games', 10));

/**
 * How rare a move has to be before it is out of book.
 *
 * Two percent — one game in fifty. Below that the move is genuinely off the
 * beaten path for this band, which is the claim being made and the only claim
 * being made. Nothing here calls a move bad; frequency is not quality, and no
 * engine has been consulted.
 */
const MIN_SHARE = Number(arg('min-share', 0.02));

function buildOne(band) {
  const src = path.join(path.isAbsolute(dir) ? dir : path.join(ROOT, dir), `${band}.json`);
  const tree = JSON.parse(fs.readFileSync(src, 'utf8'));
  const positions = tree.positions ?? {};

  const book = {};
  let described = 0;
  let tooThin = 0;
  for (const key of Object.keys(positions)) {
    const rows = positions[key];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const total = rows.reduce((a, r) => a + r[1], 0);
    if (total < MIN_GAMES) {
      tooThin++;
      continue;
    }
    const moves = rows
      .filter(r => r[1] / total >= MIN_SHARE)
      .map(r => [r[0], Math.round((r[1] / total) * 1000)]);
    if (moves.length === 0) continue;
    book[key] = moves;
    described++;
  }

  const out = {
    meta: {
      band,
      // Carried through from the tree, NOT restated. The scale is the trap the
      // banded maps documented: BANDS floors are chess.com numbers and the
      // dumps carry raw Lichess Elo, so a book that lost this field would be
      // silently mis-banded and every number would still look reasonable.
      bandScale: tree.meta?.bandScale ?? null,
      source: tree.meta?.source ?? null,
      games: tree.meta?.games ?? null,
      maxPly: tree.meta?.maxPlies ?? null,
      corpusPositions: Object.keys(positions).length,
      positions: described,
      minGames: MIN_GAMES,
      minShare: MIN_SHARE,
      generatedFrom: 'scripts/openings/build-opening-book.mjs',
      shares: 'per mille of games from this position, integer',
    },
    book,
  };

  const dest = path.join(ROOT, 'src/data', `opening-book.${band}.json`);
  fs.writeFileSync(dest, JSON.stringify(out));
  const bytes = fs.statSync(dest).size;
  console.log(
    `${band.padEnd(10)} ${String(described).padStart(6)} positions described, ` +
      `${String(tooThin).padStart(6)} under ${MIN_GAMES} games, ` +
      `${(bytes / 1e6).toFixed(2)} MB  ->  ${path.relative(ROOT, dest)}`
  );
  return bytes;
}

const bands = which === 'all' ? BANDS : [which];
const total = bands.map(buildOne).reduce((a, b) => a + b, 0);
console.log(`\ntotal ${(total / 1e6).toFixed(2)} MB across ${bands.length} band(s)`);
