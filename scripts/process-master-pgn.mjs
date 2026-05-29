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
  const [, , input, output, maxPliesArg] = process.argv;
  if (!input || !output) {
    console.error("Usage: node scripts/process-master-pgn.mjs <in.pgn> <out.json> [maxPlies=12]");
    process.exit(1);
  }
  const maxPlies = parseInt(maxPliesArg ?? "12", 10);

  // Stream-read the PGN so we don't blow memory on 5GB files
  const stream = fs.createReadStream(input);
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

  // Convert to output shape, keeping only positions with ≥3 master games
  // (cuts down noise; tweak this threshold)
  const MIN_GAMES_AT_POSITION = 3;
  const out = {};
  for (const [fen, moves] of tree) {
    const totalAtPos = Array.from(moves.values()).reduce(
      (acc, m) => acc + m.count,
      0
    );
    if (totalAtPos < MIN_GAMES_AT_POSITION) continue;

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

  fs.writeFileSync(output, JSON.stringify(out));
  const stats = fs.statSync(output);
  console.error(
    `\nWrote ${Object.keys(out).length.toLocaleString()} positions to ${output} (${(stats.size / 1024 / 1024).toFixed(1)} MB).`
  );
  console.error(
    "\nNext step: drop the file at src/data/master-openings.json and"
  );
  console.error(
    "wire it as a higher-priority source in the opening-explorer route."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
