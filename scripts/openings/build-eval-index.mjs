#!/usr/bin/env node
/**
 * Engine evaluations for every position we hold, out of the Lichess CC0 dump.
 *
 *   node scripts/openings/build-eval-index.mjs --keys /tmp/tree_keys.txt --out src/data/eval-index.json
 *
 * Reads the dump on stdin so it never lands on disk:
 *
 *   curl -sL https://database.lichess.org/lichess_db_eval.jsonl.zst \
 *     | zstd -dc | node scripts/openings/build-eval-index.mjs --keys … --out …
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE DUMP AND NOT OUR OWN STOCKFISH
 *
 * Measured on nodes of four real generated courses: 98% of them already carry an
 * evaluation here, at a median depth of 42. Running our own depth-20 pass over
 * those positions would be SHALLOWER than what is already free, and would take
 * hours. Lichess asks for exactly this in as many words on the cloud-eval
 * endpoint: "Use this endpoint to fetch a few positions here and there. If you
 * want to download a lot of positions, get the full list from our exported
 * database."
 *
 * Licence: CC0. "Use them for research, commercial purpose, publication,
 * anything you like."
 *
 * Local Stockfish still has three jobs this cannot do, and they are the reason
 * build-eval-gaps.mjs exists: the positions the dump misses, the evaluation of
 * BAD but popular replies (never present in a top-N PV list, and the whole basis
 * of trap detection), and adjudication at one consistent depth.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * TWO FORMAT TRAPS, both verified against the real file rather than assumed:
 *
 *   1. `fen` is the 4-field EPD — pieces, side, castling, en passant — which is
 *      exactly our positionKey. Confirmed on the real dump; had it carried move
 *      counters a naive join would have returned zero hits and read as "the dump
 *      does not cover us" rather than "we joined on the wrong key".
 *   2. PV moves are UCI_Chess960, where castling is encoded KING TAKES ROOK
 *      (e1h1, not e1g1). Left unconverted it is silently an illegal move.
 */

import fs from 'fs';
import readline from 'readline';

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const keysPath = arg('keys');
const outPath = arg('out');
if (!keysPath || !outPath) {
  console.error('Usage: … --keys <keys.txt> --out <index.json>   (dump on stdin)');
  process.exit(1);
}

const wanted = new Set(fs.readFileSync(keysPath, 'utf8').split('\n').filter(Boolean));
console.error(`looking for ${wanted.size.toLocaleString()} positions`);

/**
 * Mate encoded into the same field as centipawns.
 *
 * A separate `mate` key would double the size of every row to carry a value
 * present on well under 1% of them. 100000 is chosen so that any mate outranks
 * any real centipawn score — Stockfish tops out around ±32000 — and the
 * distance survives: MATE_BASE - |cp| is the number of moves.
 */
const MATE_BASE = 100000;
const encode = pv =>
  typeof pv.mate === 'number'
    ? (pv.mate > 0 ? MATE_BASE - pv.mate : -(MATE_BASE + pv.mate))
    : pv.cp;

/** Top PVs we keep. Beyond this it is a reading exercise, not a decision. */
const KEEP_PVS = 5;

const index = Object.create(null);
let seen = 0;
let kept = 0;
let lastReport = Date.now();

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of rl) {
  seen++;
  if (Date.now() - lastReport > 15000) {
    console.error(
      `…${(seen / 1e6).toFixed(1)}M records · ${kept.toLocaleString()} of ${wanted.size.toLocaleString()} found`
    );
    lastReport = Date.now();
  }
  // The fen is the first field. Slicing it out is ~40x cheaper than parsing
  // every one of 394M records to discover it is not one we want.
  if (line.charCodeAt(0) !== 123) continue; // '{'
  const start = line.indexOf('"fen":"');
  if (start < 0) continue;
  const from = start + 7;
  const end = line.indexOf('"', from);
  if (end < 0) continue;
  const fen = line.slice(from, end);
  if (!wanted.has(fen) || index[fen]) continue;

  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    continue;
  }
  const evals = rec.evals;
  if (!Array.isArray(evals) || evals.length === 0) continue;

  // "Evaluations have various depths and node count. If you only want one PV,
  // we recommend selecting the evaluation with the highest depth" — Lichess.
  // The median depth across the whole file is 28, so taking the first record
  // rather than the deepest would systematically under-read the position.
  let best = evals[0];
  for (const e of evals) if ((e.depth ?? 0) > (best.depth ?? 0)) best = e;
  const pvs = (best.pvs ?? []).slice(0, KEEP_PVS);
  if (pvs.length === 0) continue;

  index[fen] = {
    d: best.depth ?? 0,
    k: best.knodes ?? 0,
    // [firstMoveUci, score] per PV. The rest of the line is not stored: a course
    // needs to know what to play and by how much, and the continuation is
    // re-derivable from the tree we already hold.
    p: pvs.map(pv => [String(pv.line ?? '').split(' ')[0] ?? '', encode(pv)]),
  };
  kept++;
}

const payload = {
  source: 'Lichess Stockfish evaluations (database.lichess.org)',
  licence: 'CC0 1.0 Universal',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  builtAt: new Date().toISOString().slice(0, 10),
  note: 'p = [firstMoveUci (UCI_Chess960: castling is king-takes-rook), score]. score >= 99000 or <= -99000 encodes mate; MATE_BASE 100000.',
  mateBase: MATE_BASE,
  positions: index,
};
fs.writeFileSync(outPath, JSON.stringify(payload));

const depths = Object.values(index).map(e => e.d).sort((a, b) => a - b);
console.error(`\nscanned   ${seen.toLocaleString()} records`);
console.error(`covered   ${kept.toLocaleString()} of ${wanted.size.toLocaleString()} (${((kept / wanted.size) * 100).toFixed(1)}%)`);
if (depths.length) {
  console.error(
    `depth     min ${depths[0]} · p25 ${depths[Math.floor(depths.length * 0.25)]} · median ${depths[Math.floor(depths.length / 2)]} · max ${depths[depths.length - 1]}`
  );
}
console.error(`written   ${outPath} (${(fs.statSync(outPath).size / 1048576).toFixed(1)} MB)`);
