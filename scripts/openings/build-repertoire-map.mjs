#!/usr/bin/env node
// Builds src/data/repertoire-map.json: the slots a repertoire has to fill, the
// choices that fill them, and what each choice leaves open.
//
//   node scripts/openings/build-repertoire-map.mjs
//
// Inputs are both already in the repo and neither is fetched at runtime:
//   src/data/master-tree.json  3.4M games, Lichess Elite 2300+, for frequencies
//   src/data/openings.json     3,690 named openings, for coverage and labels
//
// Run it when either input changes. The output is committed, because deriving
// it takes about a minute and none of it depends on the user.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE GUARDS, AND WHY EACH ONE EXISTS
//
// Every failure this build can have is SILENT in the product. A choice that
// covers nothing looks exactly like a choice with a lot of gaps, and the
// bracket renders either one without complaint. So each is checked here and
// each one fails the build:
//
//   1. A `family` prefix matching no lines. A typo reads as "this opening
//      covers none of its own theory" and fills the bracket with phantom slots.
//      This has already happened once, to a curly apostrophe.
//   2. A choice whose `play` move is illegal at the position it claims to
//      answer. Silently produces a slot nobody can fill.
//   3. A slot with no reachable choices at all: a dead end in the bracket.
//   4. Shares that do not sum to roughly 1 at a slot, which would mean the
//      frequency data and the walk disagree about what is reachable.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  brief,
  buildLabeller,
  familyPositions,
  fenAfter,
  findGaps,
  positionKey,
  repliesAt,
  steerability,
} from './lib/coverage.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'src/data/repertoire-map.json');

/** How far past a slot a branch still counts as a REPERTOIRE decision. */
const GAP_MAX_PLY = 3;
/** A branch below this share of the games reaching a slot is not a decision. */
const GAP_MIN_SHARE = 0.02;
/** Gaps surfaced per choice. Beyond this it is a reading exercise, not a plan. */
const GAP_LIMIT = 8;
/** Lookahead for "does this transpose into what I already play". */
const STEER_PLY = 8;
/** Replies offered as choices at a derived slot. */
const MOVES_PER_SLOT = 6;

const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

function main() {
  const openings = read('src/data/openings.json');
  const tree = read('src/data/master-tree.json');
  const catalogue = read('scripts/openings/repertoire-catalogue.json');
  const label = buildLabeller(openings);
  const problems = [];
  const thin = [];

  // ── Guard 1: every curated family must match real lines ────────────────────
  for (const choice of catalogue.choices) {
    if (!choice.family) continue;
    const trunk = [...choice.at, choice.play];
    const fam = familyPositions(openings, choice.family, trunk);
    if (!fam) {
      problems.push(
        `choice "${choice.id}": family "${choice.family}" matches no line reachable via ${trunk.join(' ') || '(start)'}`
      );
    } else if (fam.lines < 2 && choice.coverage === 'family') {
      problems.push(
        `choice "${choice.id}": family "${choice.family}" matches only ${fam.lines} line; too thin to prove coverage with. Use coverage "system".`
      );
    } else if (fam.lines < 12 && choice.coverage === 'family') {
      // Not fatal, but worth seeing. A thinly-named family UNDER-claims, and
      // an under-claim shows up as invented branches rather than as an error.
      thin.push(`  ${String(fam.lines).padStart(3)} lines  ${choice.id} (${choice.family})`);
    }
  }

  // ── Guard 2: level and reasoning are required, not optional ────────────────
  // A choice with no level silently sorts as neutral for every band, which
  // looks exactly like a deliberate "suits everyone" and is never what was
  // meant. Same for `why`: a recommendation with no reason attached is the
  // thing this whole page exists not to be.
  const LEVELS = ['new', 'beginner', 'improving', 'club', 'strong'];
  for (const choice of catalogue.choices) {
    if (!LEVELS.includes(choice.level)) {
      problems.push(`choice "${choice.id}": level "${choice.level}" is not one of ${LEVELS.join(', ')}`);
    }
    if (!choice.why || choice.why.length < 40) {
      problems.push(`choice "${choice.id}": needs a "why" saying what the level costs or buys`);
    }
  }

  // Every slot we curate must have SOMETHING a near-beginner can play. A slot
  // whose cheapest option is two bands above them shows a 700 a list where
  // every entry is flagged as a mistake, which is worse than showing no levels
  // at all. 1.d4 d5 shipped exactly like that until this guard was written.
  const ORDER = ['new', 'beginner', 'improving', 'club', 'strong'];
  const bySlot = new Map();
  for (const choice of catalogue.choices) {
    const id = `${choice.side}:${choice.at.join(' ')}`;
    const rank = ORDER.indexOf(choice.level);
    bySlot.set(id, Math.min(bySlot.get(id) ?? 99, rank < 0 ? 99 : rank));
  }
  for (const [id, lowest] of bySlot) {
    if (lowest > 1) {
      problems.push(
        `slot "${id}": cheapest option is "${ORDER[lowest]}"; a beginner opening this has nothing to pick`
      );
    }
  }

  // ── Guard 3: every curated move must be legal where it is claimed ──────────
  for (const choice of catalogue.choices) {
    if (!fenAfter([...choice.at, choice.play])) {
      problems.push(`choice "${choice.id}": ${choice.play} is not legal after ${choice.at.join(' ') || '(start)'}`);
    }
  }

  if (problems.length) {
    console.error('Catalogue is inconsistent with the data:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  if (thin.length) {
    console.warn('Thinly-named families — these under-claim, check their gap lists:');
    for (const t of thin) console.warn(t);
    console.warn('');
  }

  const slots = new Map();
  const cache = new Map();

  /** Register a slot, keyed by the position it asks about. */
  function slotFor(line, side, share, origin) {
    const fen = fenAfter(line);
    if (!fen) return null;
    const key = positionKey(fen);
    const id = `${side}:${line.join(' ')}`;
    const existing = slots.get(id);
    if (existing) {
      existing.share = Math.max(existing.share, share);
      return existing;
    }
    const named = label(key);
    const slot = {
      id,
      side,
      line,
      fen,
      key,
      share,
      origin,
      // What to call it. A named opening beats a move, because "against the
      // Trompowsky" is something a player recognises and "against 2.Bg5" is
      // something they have to decode.
      name: named?.name ?? null,
      eco: named?.eco ?? null,
      moves: [],
      brief: null,
      choices: [],
    };
    slots.set(id, slot);
    return slot;
  }

  /** The replies actually played here, named, as fallback choices. */
  function movesFor(slot) {
    return repliesAt(tree, slot.fen)
      .slice(0, MOVES_PER_SLOT)
      .map(reply => {
        const next = fenAfter([...slot.line, reply.san]);
        const named = next ? label(positionKey(next)) : null;
        return {
          san: reply.san,
          share: Number(reply.share.toFixed(4)),
          name: named?.name ?? null,
          eco: named?.eco ?? null,
        };
      });
  }

  // ── Roots ──────────────────────────────────────────────────────────────────
  // White has ONE root: their first move. Black has one per White first move
  // that is played often enough to need an answer, plus a bucket for the rest,
  // because a repertoire that answers 1.e4 and 1.d4 and stops is not finished.
  const rootShare = new Map(repliesAt(tree, fenAfter([])).map(r => [r.san, r.share]));
  slotFor([], 'white', 1, null);

  const BLACK_ROOTS = ['e4', 'd4', 'Nf3', 'c4'];
  let namedRootShare = 0;
  for (const san of BLACK_ROOTS) {
    const share = rootShare.get(san) ?? 0;
    namedRootShare += share;
    slotFor([san], 'black', share, null);
  }
  const rest = Math.max(0, 1 - namedRootShare);

  // ── Attach choices, derive their gaps, recurse one level ───────────────────
  const curatedBySlot = new Map();
  for (const choice of catalogue.choices) {
    const id = `${choice.side}:${choice.at.join(' ')}`;
    if (!curatedBySlot.has(id)) curatedBySlot.set(id, []);
    curatedBySlot.get(id).push(choice);
  }

  const queue = [...slots.values()];
  const done = new Set();
  while (queue.length) {
    const slot = queue.shift();
    if (done.has(slot.id)) continue;
    done.add(slot.id);
    slot.moves = movesFor(slot);
    // Understanding for positions no book names. 35% of these slots have no
    // prose written about them anywhere, because they are positions rather
    // than openings; this is what can be measured instead.
    slot.brief = brief(tree, slot.line);

    for (const choice of curatedBySlot.get(slot.id) ?? []) {
      const trunk = [...choice.at, choice.play];
      const fam = choice.family ? familyPositions(openings, choice.family, trunk) : null;
      const ourSide = slot.side === 'white' ? 'w' : 'b';

      // A system plays its own moves whatever the opponent does, so it has no
      // separate branches to fill. Deriving gaps from ECO names would invent
      // them: the London has 6 named lines to the Caro-Kann's 103, and the
      // difference is a fact about the naming, not about the opening.
      const gaps =
        choice.coverage === 'system'
          ? []
          : findGaps(tree, fam, trunk, {
              maxPly: trunk.length + GAP_MAX_PLY,
              minShare: GAP_MIN_SHARE,
              limit: GAP_LIMIT,
            });

      const open = gaps.reduce((sum, g) => sum + g.share, 0);
      const gapSlots = [];
      for (const gap of gaps) {
        const child = slotFor(gap.line, slot.side, slot.share * gap.share, choice.id);
        if (!child) continue;
        gapSlots.push({ slot: child.id, share: Number(gap.share.toFixed(4)) });
        if (!done.has(child.id)) queue.push(child);
      }

      slot.choices.push({
        id: choice.id,
        name: choice.name,
        play: choice.play,
        coverage: choice.coverage,
        family: choice.family ?? null,
        load: choice.load,
        level: choice.level,
        character: choice.character,
        blurb: choice.blurb,
        why: choice.why,
        /** Share of what follows that this choice answers by itself. */
        absorbs: Number((1 - open).toFixed(4)),
        gaps: gapSlots,
        namedLines: fam?.lines ?? null,
        own: fam ? [...fam.own] : null,
      });
    }
  }

  // ── Transposition: which chosen system does an open branch flow back into ──
  // The honest form of "a Grünfeld covers 1.c4". It does not: it covers about a
  // quarter of it, and only when White cooperates by playing d4.
  const ownByChoice = new Map();
  for (const slot of slots.values()) {
    for (const choice of slot.choices) {
      if (choice.own && choice.own.length) {
        ownByChoice.set(choice.id, { own: new Set(choice.own), side: slot.side, at: slot.id });
      }
      delete choice.own; // working set only; never shipped
    }
  }
  const transpositions = [];
  for (const slot of slots.values()) {
    if (slot.side !== 'black' || slot.line.length !== 1) continue;
    const ourSide = 'b';
    for (const [choiceId, entry] of ownByChoice) {
      // Same side only. A Black player asking "what covers 1.c4" does not care
      // that White's English covers it, and the answer would be 100% because
      // the position IS the English.
      if (entry.side !== slot.side) continue;
      // And never a choice that already lives at this slot: "your Reversed
      // Sicilian transposes into your Reversed Sicilian" is not information.
      if (entry.at === slot.id) continue;
      const p = steerability(slot.fen, entry.own, ourSide, STEER_PLY, tree, cache);
      if (p >= 0.05) {
        transpositions.push({
          slot: slot.id,
          choice: choiceId,
          // A lower bound: the search has a horizon, so a transposition first
          // available deeper than it is simply not counted.
          atLeast: Number(p.toFixed(3)),
        });
      }
    }
  }

  // ── Guard 3 + 4 ────────────────────────────────────────────────────────────
  const late = [];
  for (const slot of slots.values()) {
    if (slot.moves.length === 0 && slot.choices.length === 0) {
      late.push(`slot "${slot.id}" is a dead end: no measured replies and no choices`);
    }
    const total = slot.moves.reduce((s, m) => s + m.share, 0);
    if (slot.moves.length > 0 && total > 1.0001) {
      late.push(`slot "${slot.id}" reply shares sum to ${total.toFixed(3)}`);
    }
  }
  if (late.length) {
    console.error('Derived map is inconsistent:\n');
    for (const p of late) console.error(`  ${p}`);
    process.exit(1);
  }

  const out = {
    meta: {
      source: tree.meta?.source ?? 'unknown',
      games: tree.meta?.games ?? 0,
      openings: openings.length,
      generatedFrom: 'scripts/openings/build-repertoire-map.mjs',
      gapMaxPly: GAP_MAX_PLY,
      gapMinShare: GAP_MIN_SHARE,
      steerPly: STEER_PLY,
      /** Share of White first moves outside the named Black roots. */
      otherFirstMoves: Number(rest.toFixed(4)),
    },
    slots: [...slots.values()].map(s => ({
      id: s.id,
      side: s.side,
      line: s.line,
      fen: s.fen,
      share: Number(s.share.toFixed(4)),
      name: s.name,
      eco: s.eco,
      origin: s.origin,
      moves: s.moves,
      brief: s.brief ?? null,
      choices: s.choices,
    })),
    transpositions,
  };
  fs.writeFileSync(OUT, JSON.stringify(out));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);

  console.log(`slots        ${out.slots.length}`);
  console.log(`choices      ${out.slots.reduce((n, s) => n + s.choices.length, 0)}`);
  console.log(`transposals  ${transpositions.length}`);
  console.log(`written      src/data/repertoire-map.json (${kb} KB)`);
  console.log('');
  for (const s of out.slots.filter(s => s.choices.length)) {
    console.log(`  ${s.id.padEnd(22)} ${s.name ?? ''}`);
    for (const c of s.choices) {
      console.log(
        `      ${c.name.padEnd(30)} answers ${(100 * c.absorbs).toFixed(0).padStart(3)}%` +
          `  leaves ${String(c.gaps.length).padStart(2)} branch${c.gaps.length === 1 ? '' : 'es'}`
      );
    }
  }
}

main();
