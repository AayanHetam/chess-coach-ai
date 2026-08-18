#!/usr/bin/env node
/**
 * Compact a generated master tree into the form the app actually ships.
 *
 * Step 2 of the pipeline:
 *   1. process-master-pgn.mjs  — aggregate PGNs into a verbose tree (slow,
 *      ~45 min for 3.4M games; run once)
 *   2. this                    — re-prune and shrink for shipping (seconds;
 *      re-run freely to trade coverage against artifact size)
 *
 * Why it exists: the verbose form of a 3.4M-game corpus is 48 MB. The app
 * reads this file at module init on every cold start, so size is latency.
 * Two changes get it to a third of that with no loss of information:
 *
 *   • Arrays, not objects. `{"san":"Nf3","uci":"g1f3","count":1,"white":1,
 *     "draws":0,"black":0,"topPlayer":null}` → `["Nf3",1,1,0]`. Keys repeated
 *     500K times are most of the file.
 *   • Derived fields dropped. `black` is `count - white - draws`. `uci` is
 *     recomputed from the position's FEN when a row is actually read, which
 *     is one chess.js move on the ~6 moves of one position per request.
 *
 * PLAYER ATTRIBUTION IS DROPPED BY DEFAULT, and that is not a size decision.
 * process-master-pgn.mjs matches players by regex against PGN name headers,
 * which works on over-the-board files ("Carlsen, Magnus"). Lichess corpora
 * carry usernames instead, and the result on the 3.4M-game Elite corpus was
 * 2,308 attributed rows, every single one of them "firouzja" — the pattern
 * `\bfirouzja\b|alireza` matching any username containing a common first
 * name. Shipping that would put "Alireza Firouzja played this" on thousands
 * of moves played by people who are not him. Pass --keep-attribution when the
 * corpus genuinely has real names in its headers.
 *
 * Usage:
 *   node scripts/compact-master-tree.mjs <verbose.json> <out.json> \
 *        [--max-positions=N] [--keep-attribution]
 */

import fs from "fs";

const [, , input, output, ...flags] = process.argv;
if (!input || !output) {
  console.error(
    "Usage: node scripts/compact-master-tree.mjs <verbose.json> <out.json> [--max-positions=N] [--keep-attribution]"
  );
  process.exit(1);
}

const maxPositions = Number(
  flags.find((f) => f.startsWith("--max-positions="))?.split("=")[1] ?? 0
);
const keepAttribution = flags.includes("--keep-attribution");

const raw = JSON.parse(fs.readFileSync(input, "utf-8"));
const positions = raw.positions ?? raw;
const meta = raw.meta ?? {};

const entries = Object.entries(positions).map(([fen, entry]) => {
  const moves = entry.moves ?? [];
  const total = moves.reduce((s, m) => s + m.count, 0);
  return { fen, moves, total };
});

// Re-prune to a position budget by keeping the most-played positions. The
// threshold is reported so the shipped artifact can state it.
let kept = entries;
let minGames = meta.minGames ?? 0;
if (maxPositions && entries.length > maxPositions) {
  kept = entries.sort((a, b) => b.total - a.total).slice(0, maxPositions);
  minGames = kept[kept.length - 1].total;
}

const out = {};
let rows = 0;
for (const { fen, moves } of kept) {
  out[fen] = moves.map((m) => {
    rows++;
    // [san, count, white, draws] — black is count-white-draws, uci derived.
    const row = [m.san, m.count, m.white, m.draws];
    if (keepAttribution && m.topPlayer) row.push(m.topPlayer);
    return row;
  });
}

const payload = {
  meta: {
    ...meta,
    positions: kept.length,
    minGames,
    attribution: keepAttribution,
    /** Row schema, so a reader never has to guess the tuple order. */
    format: "v2:[san,count,white,draws]",
  },
  positions: out,
};

fs.writeFileSync(output, JSON.stringify(payload));
const before = fs.statSync(input).size;
const after = fs.statSync(output).size;
console.error(
  `${kept.length.toLocaleString()} positions · ${rows.toLocaleString()} move rows`
);
console.error(
  `${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB (${(
    (after / before) *
    100
  ).toFixed(0)}%)`
);
console.error(
  `threshold: ≥${minGames.toLocaleString()} games · attribution: ${keepAttribution ? "kept" : "dropped"}`
);
