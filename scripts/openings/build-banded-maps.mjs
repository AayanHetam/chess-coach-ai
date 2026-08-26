#!/usr/bin/env node
/**
 * Build one rating band's repertoire map, end to end.
 *
 *   node scripts/openings/build-banded-maps.mjs <bandsDir> <band|all>
 *        [--plies=14] [--min-games=3] [--moves-per-slot=10]
 *
 * `bandsDir` holds the per-band PGNs written by scripts/split-pgn-by-band.mjs.
 * The three steps are the same ones the Elite corpus goes through, in the same
 * order, run by the same scripts:
 *
 *   1. process-master-pgn.mjs  aggregate the band's PGN into a verbose tree
 *   2. compact-master-tree.mjs shrink it to the shipped row format
 *   3. build-repertoire-map.mjs derive the bracket from it
 *
 * That reuse is the point and not an economy. A second implementation of the
 * walk would make every difference between a band map and the Elite map
 * ambiguous between "these players differ" and "this code differs", and the
 * whole claim being made here is the first one.
 *
 * Only step 3's output is committed. The trees are build inputs: 8 MB verbose
 * and 1-3 MB compacted per band, against a 145 KB map, and nothing at runtime
 * reads a tree that a course was not already generated from.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const BANDS = ['new', 'beginner', 'improving', 'club', 'strong'];

const [, , dir, band] = process.argv;
const arg = (name, fallback) =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;

if (!dir || !BANDS.includes(band)) {
  console.error(
    `Usage: node scripts/openings/build-banded-maps.mjs <bandsDir> <${BANDS.join('|')}> ` +
      `[--plies=14] [--min-games=3]`
  );
  process.exit(1);
}

const plies = arg('plies', '14');
/**
 * Replies shown per derived slot, and it is the SAME number for every band on
 * purpose.
 *
 * Ten rather than the Elite build's six because the bands need it: measured on
 * sub-800 games, `1.e4 e6 2.Bc4` takes seven replies to reach 80% of real play
 * and ten to reach 90%, where one reply is 80% of it in Elite games. Six would
 * not have shown less — it would have shown six replies and a coverage of 0.71
 * while claiming to describe the position, and the build guard says so.
 *
 * Uniform across bands because comparing bands is the entire point. A cap
 * tuned per band would make every difference between two band maps ambiguous
 * between "these players differ" and "these builds differ", which is the one
 * question this data exists to answer.
 */
const movesPerSlot = arg('moves-per-slot', '10');
/**
 * Pruning threshold, and it is deliberately far below the Elite tree's 50.
 *
 * The Elite corpus is 3.4M games; the biggest band here is 260k. A threshold
 * scaled to the former amputates the latter, and the amputation is invisible:
 * a slot whose replies were pruned still renders six replies and still sums
 * its shares to 1.0. That is exactly the failure guard 5 exists for, so the
 * threshold is set low and the guard is left to judge the result.
 */
const minGames = arg('min-games', '3');

const pgn = path.join(dir, `${band}.pgn`);
if (!fs.existsSync(pgn)) {
  console.error(`No ${pgn}. Run scripts/split-pgn-by-band.mjs first.`);
  process.exit(1);
}

const verbose = path.join(dir, 'trees', `${band}.json`);
const compact = path.join(dir, 'compact', `${band}.json`);
const out = path.join(ROOT, 'src/data', `repertoire-map.${band}.json`);
fs.mkdirSync(path.dirname(verbose), { recursive: true });
fs.mkdirSync(path.dirname(compact), { recursive: true });

const run = (args, env = {}) =>
  execFileSync('node', args, { stdio: 'inherit', cwd: ROOT, env: { ...process.env, ...env } });

if (!fs.existsSync(verbose)) {
  run(
    [
      '--max-old-space-size=8192',
      'scripts/process-master-pgn.mjs',
      pgn,
      verbose,
      plies,
      minGames,
      `--band-label=${band}`,
    ],
    { CORPUS_LABEL: 'Lichess (all rated blitz+rapid, banded)' }
  );
}
/**
 * The corpus label, set here rather than left to an env var so a rebuild
 * cannot quietly produce a different one. It names the population and the
 * month; the band is a separate field and is not repeated into the label.
 */
const SOURCE = 'Lichess rated blitz and rapid, 2025-11';
run(['scripts/compact-master-tree.mjs', verbose, compact, `--source=${SOURCE}`]);
run([
  'scripts/openings/build-repertoire-map.mjs',
  `--tree=${compact}`,
  `--out=${out}`,
  `--band=${band}`,
  `--moves-per-slot=${movesPerSlot}`,
]);

console.log(`\n${band}: ${path.relative(ROOT, out)}`);
