#!/usr/bin/env node
/**
 * Process a master-games PGN dump into the master-openings JSON format.
 *
 * Walks every game in the PGN, plays the first N plies, and aggregates
 * counts of each (FEN → move) transition. Top players (Carlsen, Caruana,
 * Kasparov, etc.) are detected and attached to the moves they played.
 *
 * Usage:
 *   node scripts/process-master-pgn.mjs <input.pgn> <output.json> [maxPlies]
 *
 *   <input.pgn>     Path to a PGN file. Free dumps:
 *                   - https://caissabase.co.uk/  (~6M master games)
 *                   - https://www.pgnmentor.com/files.html
 *                   - Lichess monthly dumps (https://database.lichess.org/)
 *   <output.json>   Where to write the generated JSON tree.
 *   [maxPlies=12]   How deep to go per game. 12 = first 6 moves each side.
 *
 * Memory hint: tested with ~5M games. For very large PGNs use Node's
 *   --max-old-space-size=8192
 *
 * The output JSON shape matches what /api/opening-explorer expects from
 * its "curated" source — drop the file at src/data/master-openings.json
 * and the proxy can prefer it over the hand-curated module.
 */

import fs from "fs";
import readline from "readline";
import { Chess } from "chess.js";

const TOP_PLAYERS_REGEX = [
  { regex: /\bcarlsen\b.*\b[mM]\b|magnus carlsen/i, key: "carlsen", rank: 1 },
  { regex: /\bcaruana\b.*\b[fF]\b|fabiano caruana/i, key: "caruana", rank: 2 },
  { regex: /\bnakamura\b.*\b[hH]\b|hikaru nakamura/i, key: "nakamura", rank: 3 },
  { regex: /\bnepomniachtchi\b|nepomniashchy|ian nepom/i, key: "nepo", rank: 4 },
  { regex: /\bgiri\b.*\b[aA]\b|anish giri/i, key: "giri", rank: 5 },
  { regex: /\bding\b.*\b[lL]\b|ding liren/i, key: "ding", rank: 6 },
  { regex: /\bfirouzja\b|alireza/i, key: "firouzja", rank: 7 },
  { regex: /\bso\b.*\b[wW]\b|wesley so/i, key: "so", rank: 8 },
  { regex: /\baronian\b.*\b[lL]\b|levon aronian/i, key: "aronian", rank: 9 },
  { regex: /\brapport\b.*\b[rR]\b|richard rapport/i, key: "rapport", rank: 10 },
  { regex: /\bkasparov\b.*\b[gG]\b|garry kasparov/i, key: "kasparov", rank: 50 },
  { regex: /\btopalov\b.*\b[vV]\b|veselin topalov/i, key: "topalov", rank: 51 },
  { regex: /\bkramnik\b.*\b[vV]\b|vladimir kramnik/i, key: "kramnik", rank: 52 },
  { regex: /\banand\b.*\b[vV]\b|viswanathan anand/i, key: "anand", rank: 53 },
  { regex: /\bkarpov\b.*\b[aA]\b|anatoly karpov/i, key: "karpov", rank: 54 },
  { regex: /\bfischer\b.*\b[rR]\b|robert fischer|bobby fischer/i, key: "fischer", rank: 55 },
];

function matchTopPlayer(name) {
  if (!name) return null;
  for (const m of TOP_PLAYERS_REGEX) {
    if (m.regex.test(name)) return m;
  }
  return null;
}

function normalizeFen(fen) {
  return fen.split(" ").slice(0, 4).join(" ");
}

async function main() {
  const [, , input, output, maxPliesArg, minGamesArg] = process.argv;
  if (!input || !output) {
    console.error(
      "Usage: node scripts/process-master-pgn.mjs <in.pgn|-> <out.json> [maxPlies=12] [minGames=3]"
    );
    process.exit(1);
  }
  const maxPlies = parseInt(maxPliesArg ?? "12", 10);
  // Pruning threshold. Scales with corpus size: at 280K games ≥3 keeps the
  // tree honest; at 3M+ games ≥3 admits a huge tail of positions seen twice,
  // ballooning the artifact past what the runtime can load. Pass a number, or
  // "auto:<N>" to pick the lowest threshold that lands at ≤N positions.
  const minGamesRaw = minGamesArg ?? "3";
  const autoTarget = minGamesRaw.startsWith("auto")
    ? parseInt(minGamesRaw.split(":")[1] ?? "90000", 10)
    : null;
  const minGames = autoTarget ? 1 : parseInt(minGamesRaw, 10);

  /**
   * Memory ceiling for the aggregation pass.
   *
   * 3.4M games × 14 plies generates tens of millions of distinct positions
   * before pruning, the overwhelming majority seen exactly once — enough to
   * OOM Node even at --max-old-space-size=8192. Every SWEEP_EVERY games we
   * drop the singletons, which are precisely what the final threshold
   * discards anyway.
   *
   * The honest caveat: a position seen once before a sweep and once after
   * loses the first sighting, so counts in the rare tail can undercount by a
   * few. It cannot affect anything near the threshold we actually ship at
   * (hundreds of games), and positions in the tail are pruned regardless.
   */
  const SWEEP_EVERY = 400_000;
  const sweepSingletons = () => {
    let dropped = 0;
    for (const [fen, moves] of tree) {
      let total = 0;
      for (const m of moves.values()) total += m.count;
      if (total <= 1) {
        tree.delete(fen);
        dropped++;
      }
    }
    return dropped;
  };

  // Stream-read the PGN so we don't blow memory on multi-GB inputs. "-" reads
  // stdin, which is how several monthly dumps are fed through in one pass:
  //   for z in *.zip; do unzip -p "$z"; done | node this.mjs - out.json
  // Concatenating on stdin avoids ever materialising the ~9GB of unzipped PGN.
  const stream = input === "-" ? process.stdin : fs.createReadStream(input);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const tree = new Map(); // normalizedFen → Map<san, { count, players: Map<key, {rank,count}>, w, d, b }>
  let currentHeaders = {};
  let currentMoves = "";
  let gamesProcessed = 0;
  let inMoves = false;
  let lastReport = Date.now();

  const flushGame = () => {
    if (!currentMoves.trim()) {
      currentHeaders = {};
      currentMoves = "";
      inMoves = false;
      return;
    }
    const movesText = currentMoves
      .replace(/\{[^}]*\}/g, "") // strip comments
      .replace(/\d+\.+/g, "")
      .replace(/\$\d+/g, "")
      .replace(/\([^)]*\)/g, "") // strip variations
      .replace(/[10]\-[10]|1\/2\-1\/2|\*/g, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const whitePlayer = matchTopPlayer(currentHeaders.White);
    const blackPlayer = matchTopPlayer(currentHeaders.Black);
    const result = currentHeaders.Result ?? "*";

    const chess = new Chess();
    for (let ply = 0; ply < Math.min(movesText.length, maxPlies); ply++) {
      const san = movesText[ply];
      if (!san) break;

      const fenBefore = normalizeFen(chess.fen());
      let move;
      try {
        move = chess.move(san);
      } catch {
        break;
      }
      if (!move) break;

      // Record the move in our tree
      let positionMap = tree.get(fenBefore);
      if (!positionMap) {
        positionMap = new Map();
        tree.set(fenBefore, positionMap);
      }
      let entry = positionMap.get(move.san);
      if (!entry) {
        entry = { count: 0, w: 0, d: 0, b: 0, players: new Map() };
        positionMap.set(move.san, entry);
      }
      entry.count++;
      if (result === "1-0") entry.w++;
      else if (result === "0-1") entry.b++;
      else if (result === "1/2-1/2") entry.d++;

      // Mover at ply N: white if ply even, black if odd (0-indexed)
      const isWhitesMove = ply % 2 === 0;
      const mover = isWhitesMove ? whitePlayer : blackPlayer;
      if (mover) {
        const p = entry.players.get(mover.key);
        if (!p) entry.players.set(mover.key, { rank: mover.rank, count: 1 });
        else p.count++;
      }
    }
    gamesProcessed++;
    if (gamesProcessed % SWEEP_EVERY === 0) {
      const before = tree.size;
      const dropped = sweepSingletons();
      console.error(
        `  sweep @${gamesProcessed.toLocaleString()} games: ${before.toLocaleString()} → ${tree.size.toLocaleString()} positions (-${dropped.toLocaleString()} singletons)`
      );
    }
    if (Date.now() - lastReport > 5000) {
      console.error(
        `…${gamesProcessed.toLocaleString()} games · ${tree.size.toLocaleString()} positions`
      );
      lastReport = Date.now();
    }
    currentHeaders = {};
    currentMoves = "";
    inMoves = false;
  };

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (line.startsWith("[")) {
      if (inMoves) flushGame();
      const m = /^\[(\w+)\s+"(.*)"\]/.exec(line);
      if (m) currentHeaders[m[1]] = m[2];
    } else if (line === "") {
      if (inMoves) flushGame();
    } else {
      inMoves = true;
      currentMoves += " " + line;
    }
  }
  if (inMoves) flushGame();

  console.error(
    `\nProcessed ${gamesProcessed.toLocaleString()} games into ${tree.size.toLocaleString()} positions.`
  );

  // Precompute each position's total once — used by both the auto-threshold
  // search and the emit loop below.
  const totals = new Map();
  for (const [fen, moves] of tree) {
    let t = 0;
    for (const m of moves.values()) t += m.count;
    totals.set(fen, t);
  }

  let MIN_GAMES_AT_POSITION = minGames;
  if (autoTarget) {
    // Lowest threshold that lands at or under the target position count —
    // i.e. the deepest coverage that still fits the artifact budget.
    const sorted = Array.from(totals.values()).sort((a, b) => b - a);
    MIN_GAMES_AT_POSITION =
      sorted.length <= autoTarget ? 1 : sorted[autoTarget] + 1;
    console.error(
      `\nauto threshold: ${MIN_GAMES_AT_POSITION} games (target ≤${autoTarget.toLocaleString()} positions, have ${sorted.length.toLocaleString()})`
    );
  }
  let prunedPositions = 0;
  const out = {};
  for (const [fen, moves] of tree) {
    if (totals.get(fen) < MIN_GAMES_AT_POSITION) {
      prunedPositions++;
      continue;
    }

    const candidates = Array.from(moves.entries())
      .map(([san, info]) => {
        // Compute UCI from FEN + SAN
        const c = new Chess(fen + " 0 1"); // chess.js wants halfmove + fullmove
        const r = c.move(san);
        if (!r) return null;
        // Pick top player (highest rank = lowest number)
        let topPlayer = null;
        let bestRank = Infinity;
        for (const [key, p] of info.players) {
          if (p.rank < bestRank) {
            bestRank = p.rank;
            topPlayer = key;
          }
        }
        return {
          san,
          uci: `${r.from}${r.to}${r.promotion ?? ""}`,
          count: info.count,
          white: info.w,
          draws: info.d,
          black: info.b,
          topPlayer,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count);

    out[fen] = { moves: candidates };
  }

  // Emit corpus provenance alongside the tree. The UI states how many games
  // back the numbers it shows; without this it can only claim a total, which
  // is how the old hand-typed "8.4M master games" ended up on screen next to
  // counts from a corpus a fraction of that size.
  const payload = {
    meta: {
      games: gamesProcessed,
      positions: Object.keys(out).length,
      maxPlies,
      minGames: MIN_GAMES_AT_POSITION,
      prunedPositions,
      source: process.env.CORPUS_LABEL ?? "Lichess Elite (2300+)",
      generatedAt: new Date().toISOString().slice(0, 10),
    },
    positions: out,
  };

  fs.writeFileSync(output, JSON.stringify(payload));
  const stats = fs.statSync(output);
  console.error(
    `\nWrote ${Object.keys(out).length.toLocaleString()} positions to ${output} (${(stats.size / 1024 / 1024).toFixed(1)} MB).`
  );
  console.error(
    `Pruned ${prunedPositions.toLocaleString()} positions under the ${MIN_GAMES_AT_POSITION}-game threshold.`
  );
  console.error(
    `Corpus: ${gamesProcessed.toLocaleString()} games · maxPlies ${maxPlies}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
