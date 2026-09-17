#!/usr/bin/env node
// Engine evaluations the Lichess dump cannot give us, from our own Stockfish.
//
//   node scripts/openings/build-eval-gaps.mjs --only w-b3,w-london,w-tromp
//        [--depth 18] [--candidate-depth 14] [--movetime 20000]
//        [--threads 5] [--hash 512] [--engine stockfish]
//        [--evals src/data/eval-index.json] [--out src/data/eval-gaps.json]
//        [--limit N] [--max-ply 24] [--min-share 0.02] [--min-games 50]
//
// Two depths. The position itself is searched to --depth, multipv, because
// those scores choose moves and are shown on the page. A setup CANDIDATE that
// the multipv list did not rank is scored with a single-move search to
// --candidate-depth, because the only question asked of that number is "is
// this a blunder" — a 150cp veto — and a hanging piece is visible at depth one.
// Measured: a full-depth single-move search cost as much as the multipv search
// it followed, tripling the run for no change in any veto.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILLS, AND WHY THE DUMP CANNOT
//
// build-eval-index.mjs says it in its own header: the dump is deeper than
// anything we could run, and it is free. It has two structural holes.
//
//   1. Positions it never saw. ~17% of a course's nodes at the horizon.
//   2. Moves its top-FIVE PV list never mentions. A system's setup move —
//      "play Be2 here because that is what the system does" — is often not in
//      any engine's top five, and when it is not, the reason is usually that
//      it is bad. The 1.b3 course shipped 5.Be2 with its knight en prise this
//      way: unrated, so unvetoed, so drilled and labelled engine-checked.
//
// So this pass rates exactly what chooseOurMove reports it could not decide on
// (`unrated`) and what the walk found no evaluation for (`unevaluated`), with
// `searchmoves` for the setup candidates so a move the engine would never rank
// still gets a number. The build then refuses to ship a setup move without one
// (guard C-4 in build-courses.mjs).
//
// FIXPOINT, not one pass. Rating a setup move can veto it, the line then takes
// a different move, and the positions below it are ones nobody has evaluated
// yet. Build → evaluate what is missing → build again, until a build reports
// nothing. Decision nodes go first, so a subtree the next build will abandon
// does not soak up engine time.
//
// RESUMABLE. The out file is rewritten after every position, and an existing
// file is merged in at start, so a run killed at position 300 costs nothing.
//
// The scores are OUR OWN and are dedicated CC0, the same terms as the dump, so
// a course built on the merge can carry one licence line.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { Chess } from 'chess.js';
import { MATE_BASE, buildCourse, canonicalUci, mergeEvals } from './lib/course.mjs';
import { courseOptionsFor } from './lib/catalogue.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const ONLY = flag('only', '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const DEPTH = Number(flag('depth', 18));
const CANDIDATE_DEPTH = Number(flag('candidate-depth', 14));
const MOVETIME = Number(flag('movetime', 20000));
const THREADS = Number(flag('threads', 5));
const HASH = Number(flag('hash', 512));
const ENGINE = flag('engine', 'stockfish');
const LIMIT = Number(flag('limit', Infinity));
const MAX_PLY = Number(flag('max-ply', 24));
const MIN_SHARE = Number(flag('min-share', 0.02));
const MIN_GAMES = Number(flag('min-games', 50));
const EVALS_PATH = flag('evals', path.join(ROOT, 'src/data/eval-index.json'));
const OUT_PATH = flag('out', path.join(ROOT, 'src/data/eval-gaps.json'));

/** PVs kept on our turn. The dump's own KEEP_PVS, so the two sources look alike. */
const OUR_PVS = 5;

const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const log = s => process.stderr.write(s + '\n');

/**
 * A UCI engine, driven one search at a time.
 *
 * Nothing clever: write a command, collect `info` lines until `bestmove`. The
 * only care taken is with WHICH info lines count — `upperbound`/`lowerbound`
 * lines are fail-high/fail-low reports, not scores, and `currmove` lines carry
 * no score at all.
 */
class Engine {
  constructor(bin) {
    this.proc = spawn(bin);
    this.buf = '';
    this.onLine = null;
    this.name = bin;
    this.proc.stdout.on('data', chunk => {
      this.buf += chunk;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (this.onLine) this.onLine(line);
      }
    });
    this.proc.on('exit', code => {
      if (code !== 0 && code !== null) {
        log(`engine exited with ${code}`);
        process.exit(1);
      }
    });
  }

  send(cmd) {
    this.proc.stdin.write(cmd + '\n');
  }

  until(pred) {
    return new Promise(resolve => {
      this.onLine = line => {
        if (pred(line)) {
          this.onLine = null;
          resolve(line);
        }
      };
    });
  }

  async init() {
    this.send('uci');
    await new Promise(resolve => {
      this.onLine = line => {
        if (line.startsWith('id name ')) this.name = line.slice(8);
        if (line === 'uciok') {
          this.onLine = null;
          resolve();
        }
      };
    });
    this.send(`setoption name Threads value ${THREADS}`);
    this.send(`setoption name Hash value ${HASH}`);
    this.send('isready');
    await this.until(l => l === 'readyok');
  }

  /**
   * One search. Returns the last exact score per multipv slot:
   *   Map<slot, { depth, kind: 'cp'|'mate', value, nodes, move }>
   * Scores are from the SIDE TO MOVE, as UCI defines them; the caller flips.
   */
  search(fen, { multipv, searchmoves, depth = DEPTH }) {
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send(`position fen ${fen}`);
    const infos = new Map();
    const done = new Promise(resolve => {
      this.onLine = line => {
        if (line.startsWith('bestmove')) {
          this.onLine = null;
          resolve(infos);
          return;
        }
        if (!line.startsWith('info ') || !line.includes(' score ') || !line.includes(' pv ')) return;
        if (line.includes('bound')) return;
        const m =
          /\bdepth (\d+)\b.*?\bmultipv (\d+)\b.*?\bscore (cp|mate) (-?\d+)\b.*?\bnodes (\d+)\b.*?\bpv (\S+)/.exec(
            line
          );
        if (!m) return;
        infos.set(Number(m[2]), {
          depth: Number(m[1]),
          kind: m[3],
          value: Number(m[4]),
          nodes: Number(m[5]),
          move: m[6],
        });
      };
    });
    const moves = searchmoves?.length ? ` searchmoves ${searchmoves.join(' ')}` : '';
    this.send(`go depth ${depth} movetime ${MOVETIME}${moves}`);
    return done;
  }

  quit() {
    this.send('quit');
  }
}

/**
 * A side-to-move UCI score as the WHITE-relative integer the index stores.
 * Mate uses the encoding from build-eval-index.mjs so isMate() reads both.
 */
function whiteRelative(info, stm) {
  const raw =
    info.kind === 'mate'
      ? info.value > 0
        ? MATE_BASE - info.value
        : -(MATE_BASE + info.value)
      : info.value;
  return stm === 'w' ? raw : -raw;
}

/** chess.js's spelling, which is also the engine's: what `searchmoves` needs. */
const uciOf = m => m.from + m.to + (m.promotion ?? '');

async function main() {
  const tree = read(path.join(ROOT, 'src/data/master-tree.json'));
  const catalogue = read(path.join(ROOT, 'scripts/openings/repertoire-catalogue.json'));
  const index = fs.existsSync(EVALS_PATH) ? read(EVALS_PATH) : { positions: {} };
  const choices = catalogue.choices.filter(c => ONLY.length === 0 || ONLY.includes(c.id));
  if (choices.length === 0) {
    log(`no course matches --only ${ONLY.join(',')}`);
    process.exit(1);
  }
  const flags = { maxPly: MAX_PLY, minShare: MIN_SHARE, minGames: MIN_GAMES };

  const engine = new Engine(ENGINE);
  await engine.init();

  const gaps = fs.existsSync(OUT_PATH)
    ? read(OUT_PATH)
    : { source: '', licence: 'CC0 1.0 Universal', engine: {}, positions: {} };
  gaps.source = `${engine.name}, our own run at depth ${DEPTH}`;
  gaps.licence = 'CC0 1.0 Universal';
  gaps.engine = {
    name: engine.name,
    depth: DEPTH,
    candidateDepth: CANDIDATE_DEPTH,
    movetime: MOVETIME,
    threads: THREADS,
    hash: HASH,
  };
  gaps.generatedAt = new Date().toISOString().slice(0, 10);
  const save = () => fs.writeFileSync(OUT_PATH, JSON.stringify(gaps));

  const attempted = new Set();
  let evaluated = 0;
  let pass = 0;
  const started = Date.now();

  for (;;) {
    pass++;
    const evals = mergeEvals(index, gaps);
    const work = new Map();
    const add = (key, item) => {
      const have = work.get(key);
      if (!have) work.set(key, item);
      else work.set(key, { ...have, needPosition: have.needPosition || item.needPosition });
    };
    for (const choice of choices) {
      const opts = courseOptionsFor(choice, flags);
      // Discovery: walk the tree the system INTENDS, so the positions scored
      // are the ones the real build will visit once the setup moves are rated.
      const course = buildCourse(tree, evals, { ...opts, assumeSetup: true });
      for (const u of course.unevaluated) {
        add(u.key, { fen: u.fen, ours: u.ours, needPosition: true, setup: opts.setup, course: choice.id });
      }
      for (const u of course.unrated) {
        add(u.key, { fen: u.fen, ours: true, needPosition: false, setup: opts.setup, course: choice.id });
      }
    }

    // Anything attempted this run and still missing is a position the engine
    // returned nothing for (checkmate, stalemate). Not a loop.
    const items = Array.from(work.entries()).filter(([key]) => !attempted.has(key));
    if (items.length === 0) {
      log(`pass ${pass}: nothing left to evaluate`);
      break;
    }
    // Decisions first: they shape the tree, and a their-turn node in a subtree
    // the next build abandons is engine time thrown away.
    const decisive = items.filter(([, it]) => it.ours);
    const batch = decisive.length ? decisive : items;
    log(
      `pass ${pass}: ${work.size} positions missing, evaluating ${batch.length} ` +
        `(${decisive.length ? 'our turn' : 'their turn'})`
    );

    let n = 0;
    for (const [key, item] of batch) {
      if (evaluated >= LIMIT) break;
      attempted.add(key);
      n++;
      const t0 = Date.now();
      const stm = item.fen.split(' ')[1];
      const entry = gaps.positions[key] ?? null;
      const p = entry ? entry.p.map(x => [...x]) : [];
      // Everything stored and compared is in the DUMP's spelling (castling as
      // king takes rook), so a merge never lists O-O twice. The engine is spoken
      // to in its own.
      const rated = new Set(
        [...(index.positions?.[key]?.p ?? []), ...p].map(([uci]) => canonicalUci(key, uci))
      );
      let depth = entry?.d ?? 0;
      let knodes = entry?.k ?? 0;
      let searched = 0;

      if (item.needPosition && p.length === 0 && !index.positions?.[key]) {
        const infos = await engine.search(item.fen, { multipv: item.ours ? OUR_PVS : 1 });
        searched++;
        for (const slot of Array.from(infos.keys()).sort((a, b) => a - b)) {
          const info = infos.get(slot);
          const stored = canonicalUci(key, info.move);
          if (rated.has(stored)) continue;
          p.push([stored, whiteRelative(info, stm)]);
          rated.add(stored);
        }
        depth = infos.get(1)?.depth ?? depth;
        knodes = Math.round((infos.get(1)?.nodes ?? 0) / 1000);
      }

      // Every legal setup candidate, not just the first: the walk stops at the
      // first unrated one, and a second pass for the second candidate would
      // cost a whole rebuild for a two-second search.
      let candidates = 0;
      if (item.ours && item.setup?.length) {
        const legal = new Chess(item.fen).moves({ verbose: true });
        for (const san of item.setup) {
          const mv = legal.find(x => x.san === san);
          if (!mv) continue;
          const uci = uciOf(mv);
          const stored = canonicalUci(key, uci);
          if (rated.has(stored)) continue;
          const infos = await engine.search(item.fen, {
            multipv: 1,
            searchmoves: [uci],
            depth: CANDIDATE_DEPTH,
          });
          searched++;
          const info = infos.get(1);
          if (!info) continue;
          p.push([stored, whiteRelative(info, stm)]);
          rated.add(stored);
          candidates++;
          if (!depth) depth = info.depth;
        }
      }

      gaps.positions[key] = { d: depth, k: knodes, p };
      evaluated++;
      save();
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      log(
        `  [${pass}] ${String(n).padStart(4)}/${batch.length} ${item.course.padEnd(9)} ` +
          `${item.ours ? 'us  ' : 'them'} d${depth} ${p.length} pv${candidates ? ` +${candidates} setup` : ''} ` +
          `${searched} search ${secs}s  ${key}`
      );
    }
    if (evaluated >= LIMIT) {
      log(`--limit ${LIMIT} reached`);
      break;
    }
  }

  engine.quit();
  const mins = ((Date.now() - started) / 60000).toFixed(1);
  log(`evaluated ${evaluated} positions in ${mins} min → ${path.relative(ROOT, OUT_PATH)}`);
  log(`positions in gaps file: ${Object.keys(gaps.positions).length}`);
}

main().catch(e => {
  log(String(e?.stack ?? e));
  process.exit(1);
});
