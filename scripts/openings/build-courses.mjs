#!/usr/bin/env node
// Builds src/data/courses/*.json: one course per curated opening.
//
//   node scripts/openings/build-courses.mjs [--evals path] [--max-ply 24]
//
// Inputs, all already in the repo except the eval index:
//   src/data/master-tree.json                  what people play, 24 plies
//   scripts/openings/repertoire-catalogue.json the 43 curated openings
//   src/data/eval-index.json                   engine truth, CC0 (build-eval-index.mjs)
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO GUARDS THAT FAIL THE BUILD
//
// Modelled on the five in build-repertoire-map.mjs and for the same reason:
// every failure here is SILENT in the product. A course that drills a bad move
// looks exactly like a course that drills a good one.
//
//   C-1  Our move is never far worse than the engine's own choice. The corpus
//        principal is "most played, not best" — brief() says so in its own
//        comment — so a course built on popularity inherits every popular
//        inaccuracy and teaches it at full confidence. Over MAX_ENGINE_LOSS_CP
//        the build stops and asks for a curated override.
//
//   C-2  No two courses may be the same course. Keyed on root AND setup,
//        because a system shares its root with the move that opens it — the
//        London and 1.d4 both start 1.d4 and are not the same thing. This guard
//        exists because the first build shipped TWENTY duplicates: the roots
//        were derived as `[...at, play]`, and `play` is the move that fills the
//        bracket SLOT, not the move that names the opening. Italian, Ruy and
//        Scotch all commit 2.Nf3 and all produced byte-identical trees.
//
//   C-3  This file may not import the Wikibooks loader. The excerpts are
//        CC BY-SA and may be quoted but never adapted; a course artifact that
//        contained one would make the course a derivative work. Enforced
//        structurally — the text is never in this process — rather than by
//        anybody remembering the rule. There is a test that greps for it.
//
//   C-4  No system move ships without its engine score. A setup move the
//        engine never rated is one the veto in chooseOurMove could not see, and
//        "unrated" is the signature of the moves that hang pieces — the dump
//        keeps five PVs and a blunder is in none of them. The 1.b3 course
//        shipped 5.Be2?? with a knight en prise exactly this way, under a card
//        that said "engine-checked". Over any unrated candidate the build stops
//        and asks for build-eval-gaps.mjs, which scores it with a local engine.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { buildCourse, countLines, mergeEvals } from './lib/course.mjs';
import { courseOptionsFor } from './lib/catalogue.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT_DIR = path.join(ROOT, 'src/data/courses');

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const MAX_PLY = Number(flag('max-ply', 24));
const MIN_SHARE = Number(flag('min-share', 0.02));
const MIN_GAMES = Number(flag('min-games', 50));
const EVALS_PATH = flag('evals', path.join(ROOT, 'src/data/eval-index.json'));
const GAPS_PATH = flag('gaps', path.join(ROOT, 'src/data/eval-gaps.json'));
/**
 * Rebuild only these course ids and leave every other artifact byte-identical.
 *
 * The full build needs the dump index for all 43. The system courses can be
 * built from the gaps file alone — build-eval-gaps.mjs evaluates every one of
 * their positions — so a fix to them does not have to wait for a 30 GB stream.
 */
const ONLY = flag('only', '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));

function main() {
  const tree = read(path.join(ROOT, 'src/data/master-tree.json'));
  const catalogue = read(path.join(ROOT, 'scripts/openings/repertoire-catalogue.json'));
  // A file with no positions in it is no index. build-eval-index.mjs writes its
  // payload whatever it matched, so a stale --keys file or a truncated stream
  // leaves a well-formed `{positions:{}}` on disk; taken at face value it would
  // rebuild every course from popularity and exit clean. Existence is not the
  // test. Content is.
  const nonEmpty = f => (f && Object.keys(f.positions ?? {}).length ? f : null);
  const evalIndex = nonEmpty(fs.existsSync(EVALS_PATH) ? read(EVALS_PATH) : null);
  const gaps = nonEmpty(fs.existsSync(GAPS_PATH) ? read(GAPS_PATH) : null);
  const evals = mergeEvals(evalIndex, gaps);

  if (!evalIndex && !gaps) {
    console.error(
      'No eval index. Courses would be built from popularity alone, which is the\n' +
        'one thing this is designed not to do. Build it first:\n' +
        '  curl -sL https://database.lichess.org/lichess_db_eval.jsonl.zst | zstd -dc \\\n' +
        '    | node scripts/openings/build-eval-index.mjs --keys keys.txt --out src/data/eval-index.json'
    );
    process.exit(1);
  }
  if (!evalIndex && ONLY.length === 0) {
    console.error(
      'Only the gaps file is present. It covers the system courses, not the other\n' +
        'forty; building those from it would be building them from popularity.\n' +
        'Pass --only <ids> for the courses the gaps file was built for.'
    );
    process.exit(1);
  }

  // Corpus fingerprint on every artifact. Building courses from a different
  // tree than the one that ships produces files that are fully self-consistent
  // and wrong, and there is no way to tell by looking at them.
  const corpusSha = crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, 'src/data/master-tree.json')))
    .digest('hex')
    .slice(0, 16);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const indexPath = path.join(OUT_DIR, 'index.json');
  // A partial rebuild keeps the other artifacts, and they must have been built
  // from THIS corpus: three courses from one tree beside forty from another is
  // the fully-self-consistent-and-wrong artifact the fingerprint exists to catch.
  const previous = ONLY.length && fs.existsSync(indexPath) ? read(indexPath) : null;
  if (ONLY.length && !previous) {
    // No index means no shipped set to rebuild beside — and no fingerprint to
    // check against. Writing an index of three would hide the other forty
    // files from the site (loadCourse rejects an id the index does not list).
    console.error(
      '--only rebuilds beside the shipped artifacts, and there is no index.json to\n' +
        'rebuild beside. Run a full build first.'
    );
    process.exit(1);
  }
  if (previous && previous.corpusSha !== corpusSha) {
    console.error(
      `--only rebuilds beside artifacts built from corpus ${previous.corpusSha}; this tree is ${corpusSha}.\n` +
        'Rebuild everything, or build against the tree the shipped courses came from.'
    );
    process.exit(1);
  }

  const problems = [];
  const unrated = [];
  const unratedIn = new Set();
  const built = [];
  // Nothing touches the directory until every guard has passed. A build that
  // failed C-1 or C-4 used to have already replaced the shipped files with the
  // provisional course it was refusing — nodes the ordinary rule decided in a
  // system's place, indistinguishable from a good build on disk and in the
  // artifact tests, one `git add -A` from shipping.
  const pending = [];
  let totalBytes = 0;

  // Guard C-2, before any work: two courses that are the same course.
  const identities = new Map();
  for (const choice of catalogue.choices) {
    if (!Array.isArray(choice.root) || choice.root.length === 0) {
      problems.push(`choice "${choice.id}" has no explicit root`);
      continue;
    }
    const identity = `${choice.side}:${choice.root.join(' ')}|${(choice.setup ?? []).join(' ')}`;
    if (identities.has(identity)) {
      problems.push(
        `choices "${choice.id}" and "${identities.get(identity)}" are the same course: ${identity}`
      );
    }
    identities.set(identity, choice.id);
  }
  if (problems.length) {
    console.error('Catalogue cannot produce distinct courses:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  const chosen = catalogue.choices.filter(c => ONLY.length === 0 || ONLY.includes(c.id));
  for (const id of ONLY) {
    if (!chosen.some(c => c.id === id)) {
      console.error(`--only: no course "${id}" in the catalogue`);
      process.exit(1);
    }
  }

  for (const choice of chosen) {
    const root = choice.root;
    const course = buildCourse(
      tree,
      evals,
      courseOptionsFor(choice, { maxPly: MAX_PLY, minShare: MIN_SHARE, minGames: MIN_GAMES })
    );

    problems.push(...course.problems);
    for (const u of course.unrated) {
      unrated.push(`${choice.id}: at ${u.key} setup move ${u.moves.join('/')} has no engine score`);
      unratedIn.add(choice.id);
    }

    const lines = countLines(course);
    const payload = {
      meta: {
        ...course.meta,
        lines,
        level: choice.level,
        load: choice.load,
        character: choice.character,
        coverage: choice.coverage,
        eco: choice.family ?? null,
        corpus: {
          source: tree.meta?.source ?? 'unknown',
          games: tree.meta?.games ?? 0,
          maxPlies: tree.meta?.maxPlies ?? 0,
          sha256: corpusSha,
        },
        evals: {
          source: evals.source ?? 'unknown',
          licence: evals.licence ?? 'unknown',
          covered: course.meta.evaluated,
          of: course.meta.nodes,
        },
        builtAt: new Date().toISOString().slice(0, 10),
      },
      chapters: course.chapters,
      nodes: course.nodes,
    };

    const json = JSON.stringify(payload);
    const bytes = Buffer.byteLength(json);
    totalBytes += bytes;
    pending.push({ file: path.join(OUT_DIR, `${choice.id}.json`), json });

    built.push({
      id: choice.id,
      name: choice.name,
      side: choice.side,
      level: choice.level,
      load: choice.load,
      character: choice.character,
      root,
      nodes: course.meta.nodes,
      lines,
      chapters: course.chapters.length,
      evaluated: course.meta.evaluated,
      bytes,
    });

    const cov = course.meta.nodes ? (course.meta.evaluated / course.meta.nodes) * 100 : 0;
    console.log(
      `  ${choice.id.padEnd(14)}${String(course.meta.nodes).padStart(6)} nodes ` +
        `${String(lines).padStart(6)} lines ${String(course.chapters.length).padStart(3)} ch ` +
        `${cov.toFixed(0).padStart(3)}% evaluated  ${(bytes / 1024).toFixed(0).padStart(5)} KB` +
        `  ${JSON.stringify(course.meta.bySource)}`
    );
  }

  // The catalogue's order, whether this run built all of it or three of it.
  const index = previous
    ? previous.courses.map(entry => built.find(c => c.id === entry.id) ?? entry)
    : built;
  for (const entry of built) if (!index.includes(entry)) index.push(entry);

  if (problems.length) {
    console.error(`\nGuard C-1: ${problems.length} move(s) far worse than the engine's own choice:\n`);
    for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
    process.exit(1);
  }
  if (unrated.length) {
    console.error(`\nGuard C-4: ${unrated.length} system move(s) the engine never scored:\n`);
    for (const u of unrated.slice(0, 20)) console.error(`  ${u}`);
    // Only the courses that actually have an unscored move. Naming the whole
    // catalogue here would send a full build's user into the gaps pass over
    // forty courses that cannot have one — days of engine time for nothing.
    console.error(
      '\nA setup move without a score cannot be vetoed, and the card would still say\n' +
        '"engine-checked". Score them first:\n' +
        `  node scripts/openings/build-eval-gaps.mjs --only ${Array.from(unratedIn).join(',')}`
    );
    process.exit(1);
  }

  // Every guard passed. Now, and only now, the directory changes.
  if (ONLY.length === 0) {
    for (const f of fs.readdirSync(OUT_DIR)) {
      if (f.endsWith('.json')) fs.unlinkSync(path.join(OUT_DIR, f));
    }
  }
  for (const { file, json } of pending) fs.writeFileSync(file, json);
  fs.writeFileSync(
    indexPath,
    JSON.stringify({
      builtAt: new Date().toISOString().slice(0, 10),
      corpusSha,
      maxPly: MAX_PLY,
      minShare: MIN_SHARE,
      minGames: MIN_GAMES,
      courses: index,
    })
  );

  const totalNodes = index.reduce((s, c) => s + c.nodes, 0);
  const totalLines = index.reduce((s, c) => s + c.lines, 0);
  const evaluated = index.reduce((s, c) => s + c.evaluated, 0);
  console.log(`\ncourses     ${index.length}${ONLY.length ? ` (${built.length} rebuilt)` : ''}`);
  console.log(`nodes       ${totalNodes.toLocaleString()}`);
  console.log(`lines       ${totalLines.toLocaleString()}`);
  console.log(`evaluated   ${((evaluated / totalNodes) * 100).toFixed(1)}%`);
  console.log(`written     src/data/courses/ (${(totalBytes / 1048576).toFixed(1)} MB across ${index.length} files)`);
}

main();
