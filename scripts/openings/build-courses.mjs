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
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { buildCourse, countLines } from './lib/course.mjs';

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

const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));

function main() {
  const tree = read(path.join(ROOT, 'src/data/master-tree.json'));
  const catalogue = read(path.join(ROOT, 'scripts/openings/repertoire-catalogue.json'));
  const evals = fs.existsSync(EVALS_PATH)
    ? read(EVALS_PATH)
    : { positions: {} };

  if (Object.keys(evals.positions).length === 0) {
    console.error(
      'No eval index. Courses would be built from popularity alone, which is the\n' +
        'one thing this is designed not to do. Build it first:\n' +
        '  curl -sL https://database.lichess.org/lichess_db_eval.jsonl.zst | zstd -dc \\\n' +
        '    | node scripts/openings/build-eval-index.mjs --keys keys.txt --out src/data/eval-index.json'
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
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(OUT_DIR, f));
  }

  const problems = [];
  const index = [];
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

  for (const choice of catalogue.choices) {
    const root = choice.root;
    const course = buildCourse(tree, evals, {
      id: choice.id,
      name: choice.name,
      root,
      side: choice.side,
      maxPly: MAX_PLY,
      minShare: MIN_SHARE,
      minGames: MIN_GAMES,
      setup: choice.coverage === 'system' ? choice.setup ?? null : null,
    });

    problems.push(...course.problems);

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

    const file = path.join(OUT_DIR, `${choice.id}.json`);
    fs.writeFileSync(file, JSON.stringify(payload));
    const bytes = fs.statSync(file).size;
    totalBytes += bytes;

    index.push({
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

  fs.writeFileSync(
    path.join(OUT_DIR, 'index.json'),
    JSON.stringify({
      builtAt: new Date().toISOString().slice(0, 10),
      corpusSha,
      maxPly: MAX_PLY,
      minShare: MIN_SHARE,
      minGames: MIN_GAMES,
      courses: index,
    })
  );

  if (problems.length) {
    console.error(`\nGuard C-1: ${problems.length} move(s) far worse than the engine's own choice:\n`);
    for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
    process.exit(1);
  }

  const totalNodes = index.reduce((s, c) => s + c.nodes, 0);
  const totalLines = index.reduce((s, c) => s + c.lines, 0);
  const evaluated = index.reduce((s, c) => s + c.evaluated, 0);
  console.log(`\ncourses     ${index.length}`);
  console.log(`nodes       ${totalNodes.toLocaleString()}`);
  console.log(`lines       ${totalLines.toLocaleString()}`);
  console.log(`evaluated   ${((evaluated / totalNodes) * 100).toFixed(1)}%`);
  console.log(`written     src/data/courses/ (${(totalBytes / 1048576).toFixed(1)} MB across ${index.length} files)`);
}

main();
