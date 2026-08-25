#!/usr/bin/env node
/**
 * Split a Lichess dump into one small PGN per rating band, in a single pass.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SPLIT AND NOT A FOUR-BAND AGGREGATOR
 *
 * Four bands means either four passes over a 29 GB download, or one pass
 * holding four position trees in memory. The second is the obvious answer and
 * it is the wrong one: `process-master-pgn.mjs` is a working, load-bearing
 * build script whose singleton sweeps and memory ceiling are per-tree state,
 * and rewriting it to run four of everything risks the corpus every number in
 * the product rests on, for an optimisation.
 *
 * So the expensive input is read once and cut into four cheap inputs. The
 * existing builder then runs over each, unchanged and unrisked. Measured on
 * 1,296,901 games, the two approaches cost within a few minutes of each other,
 * because in both of them the real work is parsing the games that survive.
 *
 * THE SPLIT IS ALSO WORTH KEEPING. A banded PGN is a few GB rather than 29,
 * so rebuilding at a different depth, a different threshold, or a fixed bug
 * costs minutes instead of another 2.3-hour download.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS THROWN AWAY, AND WHY THAT IS SAFE
 *
 * The output carries `[Result]` and a truncated movetext, and nothing else.
 * Ratings and time control have already done their job — they chose the file —
 * and re-recording them would invite a second, disagreeing banding downstream.
 * Player names are dropped because Lichess usernames are not top players and
 * `matchTopPlayer` would only ever waste sixteen regexes per game on them.
 *
 * Clock comments are the bulk of a Lichess game's bytes: `{ [%clk 0:02:31] }`
 * on every ply. Stripping them at split time is what makes the banded files a
 * few GB rather than a hundred.
 *
 * Usage:
 *   zstd -dc lichess_db_standard_rated_2025-11.pgn.zst \
 *     | node scripts/split-pgn-by-band.mjs out/ --plies=24
 *
 * Writes out/<band>.pgn, plus out/split-report.json.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { BAND_FLOORS, bandOfGame } from './openings/lib/bands.mjs';
import { truncateMovetext } from './process-master-pgn.mjs';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: <pgn on stdin> | node scripts/split-pgn-by-band.mjs <outDir> [--plies=24] [--platform=lichess]');
  process.exit(1);
}
const plies = Number(process.argv.find(a => a.startsWith('--plies='))?.split('=')[1] ?? 24);
const platform = process.argv.find(a => a.startsWith('--platform='))?.split('=')[1] ?? 'lichess';

fs.mkdirSync(dir, { recursive: true });

/**
 * One output stream per band, opened up front.
 *
 * Opened eagerly rather than on first write so that a band with no games leaves
 * an EMPTY FILE rather than no file. "This band had nothing in it" and "the run
 * died before reaching this band" are different facts, and a missing file
 * cannot tell them apart.
 */
const streams = new Map();
const counts = new Map();
for (const band of BAND_FLOORS) {
  streams.set(band.id, fs.createWriteStream(path.join(dir, `${band.id}.pgn`)));
  counts.set(band.id, 0);
}

let headers = {};
let moves = '';
let inMoves = false;
let seen = 0;
let kept = 0;
let lastReport = Date.now();

/** The bytes worth keeping from one game. */
function minimal(result, movetext) {
  const text = truncateMovetext(movetext, plies)
    // Comments are the bulk of a Lichess game. Stripped here so the banded
    // file is a few GB rather than a hundred; the builder strips them again
    // and finds nothing, which costs one regex over a much shorter string.
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `[Result "${result}"]\n\n${text}\n\n`;
}

function flush() {
  if (!inMoves) {
    headers = {};
    moves = '';
    return;
  }
  seen++;
  const band = moves.trim() ? bandOfGame(headers, { platform }) : null;
  if (band && streams.has(band)) {
    streams.get(band).write(minimal(headers.Result ?? '*', moves));
    counts.set(band, counts.get(band) + 1);
    kept++;
  }
  headers = {};
  moves = '';
  inMoves = false;

  if (Date.now() - lastReport > 5000) {
    console.error(
      `…${seen.toLocaleString()} read · ${kept.toLocaleString()} kept (${((kept / seen) * 100).toFixed(1)}%)`
    );
    lastReport = Date.now();
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const raw of rl) {
  const line = raw.trim();
  if (line.startsWith('[')) {
    if (inMoves) flush();
    const m = /^\[(\w+)\s+"(.*)"\]/.exec(line);
    if (m) headers[m[1]] = m[2];
  } else if (line === '') {
    if (inMoves) flush();
  } else {
    inMoves = true;
    moves += ' ' + line;
  }
}
if (inMoves) flush();

await Promise.all(
  Array.from(streams.values()).map(s => new Promise(res => s.end(res)))
);

const report = {
  read: seen,
  kept,
  keptShare: seen > 0 ? Number((kept / seen).toFixed(4)) : 0,
  plies,
  platform,
  byBand: Object.fromEntries(counts),
  bytesByBand: Object.fromEntries(
    BAND_FLOORS.map(b => [b.id, fs.statSync(path.join(dir, `${b.id}.pgn`)).size])
  ),
  builtAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(dir, 'split-report.json'), JSON.stringify(report, null, 2));

console.error(`\nRead ${seen.toLocaleString()} games, kept ${kept.toLocaleString()}.`);
for (const band of BAND_FLOORS) {
  const n = counts.get(band.id);
  const mb = report.bytesByBand[band.id] / 1024 / 1024;
  console.error(`  ${band.id.padEnd(10)} ${n.toLocaleString().padStart(12)} games  ${mb.toFixed(1)} MB`);
}
