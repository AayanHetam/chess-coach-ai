#!/usr/bin/env node
/**
 * How players at one rating band actually lose an opening.
 *
 *   node scripts/openings/build-traps.mjs <compactTreeDir> <all|band>
 *        [--z=4] [--effect=0.10] [--min-move=30] [--min-share=0.03]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO ENGINE. NONE IS NEEDED, AND AN ENGINE WOULD ANSWER A DIFFERENT QUESTION.
 *
 * The corpus rows are `[san, games, whiteWins, draws]`, so the RESULT
 * distribution is already there. "This is played often at your level and loses"
 * is a counting question. An engine would say a move is objectively bad; the
 * results say players at this level actually lose after it, and only the second
 * is a claim about the reader's own opponents. The hole finder settled this
 * argument once already: the signal is the scoreline, not the engine's opinion.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SIGNIFICANCE TEST AND NOT A THRESHOLD
 *
 * The first version of this scan used fixed thresholds — 200 games at the
 * position, 50 on the move, 0.15 below baseline — and produced 2/5/5/1/0
 * candidates across the five bands: traps low down, none at the top, exactly
 * the gradient the plan predicts and exactly what anyone would want to see.
 *
 * The control killed it. Ask each band the same question at MATCHED power, by
 * scaling the thresholds to its corpus size, and `strong` — 28k games against
 * improving's 233k — produces 207 candidates, more than any other band. The
 * whole gradient was corpus size wearing a gradient's clothes.
 *
 * So a move is flagged only when the gap between its score and the score of
 * everything else played from the same position survives a z test, and `--z`
 * defaults to 4 rather than the usual 1.96 because this runs tens of thousands
 * of tests. At p<0.05, half a million tests yield 25,000 false positives, and
 * 25,000 findings look precisely like a discovery. The expected false-positive
 * count is printed next to every result rather than left for the reader to
 * assume is zero.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Chess } from 'chess.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const BANDS = ['new', 'beginner', 'improving', 'club', 'strong'];

const [, , dir, which] = process.argv;
const num = (n, d) => Number(process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1] ?? d);

if (!dir || !which || (which !== 'all' && !BANDS.includes(which))) {
  console.error(`Usage: node scripts/openings/build-traps.mjs <compactTreeDir> <all|${BANDS.join('|')}>`);
  process.exit(1);
}

/** Standard errors below the alternatives before we will say anything. */
const Z = num('z', 4);
/** And how much worse in absolute score, so a significant triviality is not a trap. */
const EFFECT = num('effect', 0.1);
/** Games on the move itself. Under this the score is one player's afternoon. */
const MIN_MOVE = num('min-move', 30);
/** Share of play. A move nobody makes is not a trap, however badly it scores. */
const MIN_SHARE = num('min-share', 0.03);
/** Games through the position, so the comparison has something to compare to. */
const MIN_POSITION = num('min-position', 100);
/** Plies. Past the corpus wall there is nothing to read. */
const MAX_PLY = 14;

const key = fen => fen.split(' ').slice(0, 4).join(' ');

/**
 * Score statistics for one row, from the point of view of the side to move.
 *
 * A result is 1, 0.5 or 0, so the variance comes from that three-point
 * distribution rather than a binomial. Counting a draw as half a win AND as a
 * Bernoulli trial understates the spread and makes everything look more
 * significant than it is.
 */
function stats(row, side) {
  const [, n, w, d] = row;
  const wins = side === 'w' ? w : n - w - d;
  const mean = (wins + d / 2) / n;
  const ex2 = (wins + d * 0.25) / n;
  return { n, mean, variance: Math.max(ex2 - mean * mean, 0) };
}

function pooled(parts) {
  const n = parts.reduce((a, p) => a + p.n, 0);
  if (n === 0) return { n: 0, mean: 0, variance: 0 };
  const mean = parts.reduce((a, p) => a + p.mean * p.n, 0) / n;
  const variance = parts.reduce((a, p) => a + p.n * (p.variance + (p.mean - mean) ** 2), 0) / n;
  return { n, mean, variance };
}

/**
 * The shortest line the band's own play reaches each wanted position by.
 *
 * A trap named by FEN is a trap nobody can read. Breadth-first over the tree
 * itself rather than over all legal moves, so the line shown is one these
 * players actually walk down.
 */
function shortestLines(positions, wanted) {
  const found = new Map();
  const seen = new Set();
  let frontier = [{ fen: new Chess().fen(), sans: [] }];
  seen.add(key(frontier[0].fen));
  for (let ply = 0; ply <= MAX_PLY && frontier.length && found.size < wanted.size; ply++) {
    const next = [];
    for (const node of frontier) {
      const k = key(node.fen);
      if (wanted.has(k) && !found.has(k)) found.set(k, node.sans);
      const rows = positions[k];
      if (!rows) continue;
      for (const row of rows) {
        const board = new Chess(node.fen);
        try {
          board.move(row[0]);
        } catch {
          continue;
        }
        const nk = key(board.fen());
        if (seen.has(nk)) continue;
        seen.add(nk);
        next.push({ fen: board.fen(), sans: [...node.sans, row[0]] });
      }
    }
    frontier = next;
  }
  return found;
}

function buildOne(band) {
  const src = path.join(path.isAbsolute(dir) ? dir : path.join(ROOT, dir), `${band}.json`);
  const tree = JSON.parse(fs.readFileSync(src, 'utf8'));
  const positions = tree.positions ?? {};

  const hits = [];
  let tests = 0;
  for (const k of Object.keys(positions)) {
    const rows = positions[k];
    const side = k.split(' ')[1];
    const total = rows.reduce((a, r) => a + r[1], 0);
    if (total < MIN_POSITION) continue;
    const all = rows.map(r => ({ san: r[0], share: r[1] / total, ...stats(r, side) }));
    for (const move of all) {
      if (move.n < MIN_MOVE || move.share < MIN_SHARE) continue;
      const rest = pooled(all.filter(o => o.san !== move.san));
      if (rest.n < MIN_MOVE) continue;
      const se = Math.sqrt(move.variance / move.n + rest.variance / rest.n);
      if (!(se > 0)) continue;
      tests++;
      const z = (rest.mean - move.mean) / se;
      const effect = rest.mean - move.mean;
      if (z < Z || effect < EFFECT) continue;
      hits.push({
        fen: k,
        san: move.san,
        side: side === 'w' ? 'white' : 'black',
        share: round(move.share),
        games: move.n,
        score: round(move.mean),
        baseline: round(rest.mean),
        z: round(z, 1),
        // What the same players do instead, best-scoring first. This is the
        // half a reader can act on; the trap alone is only half a lesson.
        instead: all
          .filter(o => o.san !== move.san && o.n >= MIN_MOVE)
          .sort((a, b) => b.mean - a.mean)
          .slice(0, 3)
          .map(o => ({ san: o.san, share: round(o.share), score: round(o.mean), games: o.n })),
      });
    }
  }

  const lines = shortestLines(positions, new Set(hits.map(h => h.fen)));
  const traps = hits
    .filter(h => lines.has(h.fen))
    .map(h => ({ ...h, line: lines.get(h.fen) }))
    .sort((a, b) => b.z - a.z);

  // The two-sided normal tail, times the number of tests. Stated in the file
  // rather than in a commit message, so anything that reads these numbers can
  // read the noise floor next to them.
  const tail = Math.exp(-(Z * Z) / 2) / (Z * Math.sqrt(2 * Math.PI));
  const out = {
    meta: {
      band,
      bandScale: tree.meta?.bandScale ?? null,
      source: tree.meta?.source ?? null,
      games: tree.meta?.games ?? null,
      generatedFrom: 'scripts/openings/build-traps.mjs',
      signal: 'game results only; no engine was consulted',
      z: Z,
      minEffect: EFFECT,
      minMoveGames: MIN_MOVE,
      minShare: MIN_SHARE,
      tests,
      expectedFalsePositives: round(tail * tests, 2),
      traps: traps.length,
    },
    traps,
  };
  const dest = path.join(ROOT, 'src/data', `traps.${band}.json`);
  fs.writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log(
    `${band.padEnd(10)} ${String(traps.length).padStart(4)} traps from ${String(tests).padStart(6)} tests ` +
      `(expected false positives ${out.meta.expectedFalsePositives})  ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`
  );
  return out;
}

const round = (v, dp = 4) => Number(v.toFixed(dp));

const bands = which === 'all' ? BANDS : [which];
const built = bands.map(buildOne);

// The gradient, named. Traps that a low band loses to and a high band does not
// are the whole claim; printing the count alone is what produced a gradient
// that turned out to be corpus size.
if (bands.length === BANDS.length) {
  const at = band => new Set(built.find(b => b.meta.band === band).traps.map(t => `${t.fen}|${t.san}`));
  const low = new Set([...at('new'), ...at('beginner')]);
  const high = new Set([...at('club'), ...at('strong')]);
  const only = [...low].filter(k => !high.has(k));
  console.log(`\nflagged in a low band and not in a high one: ${only.length} of ${low.size}`);
}
