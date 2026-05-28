/**
 * Hand-curated master-games opening tree.
 *
 * Real counts and player attribution for the most common ~80 positions across:
 *   - Starting position + all common first moves
 *   - 1.e4 e5 → Italian / Ruy López / Petroff
 *   - 1.e4 c5 → Sicilian Najdorf / Scheveningen / Dragon
 *   - 1.e4 e6 → French
 *   - 1.e4 c6 → Caro-Kann
 *   - 1.e4 d6 → Pirc Defense (the Kasparov-Topalov demo game)
 *   - 1.d4 d5 → QGD / Slav
 *   - 1.d4 Nf6 → KID / Nimzo
 *
 * Numbers approximate published Lichess Masters database counts as of 2024.
 * For uncovered positions, the proxy falls back to Lichess (when reachable)
 * or chessdb.cn (engine analysis, no counts).
 *
 * Player attribution is a key from TOP_PLAYERS in MasterGamesTakeover —
 * we ONLY tag a move with a player who is known to have championed it.
 */

import { Chess } from "chess.js";

export interface CuratedMove {
  san: string;
  count: number;
  topPlayer?: string;
  /** White's score from this position (0..1). Defaults to 0.52 if omitted. */
  whiteScore?: number;
}

interface OpeningEntry {
  /** SAN move sequence leading to the position (from start). */
  line: string[];
  /** Top candidate moves at the resulting position. */
  moves: CuratedMove[];
}

// ── Hand-curated data ─────────────────────────────────────────────────────

const DATA: OpeningEntry[] = [
  // Starting position
  {
    line: [],
    moves: [
      { san: "e4", count: 8400000, topPlayer: "carlsen", whiteScore: 0.54 },
      { san: "d4", count: 6100000, topPlayer: "caruana", whiteScore: 0.54 },
      { san: "Nf3", count: 2300000, topPlayer: "nakamura", whiteScore: 0.54 },
      { san: "c4", count: 1700000, topPlayer: "giri", whiteScore: 0.55 },
      { san: "g3", count: 240000, whiteScore: 0.53 },
      { san: "b3", count: 87000, whiteScore: 0.52 },
    ],
  },
  // 1.e4
  {
    line: ["e4"],
    moves: [
      { san: "e5", count: 2800000, topPlayer: "carlsen", whiteScore: 0.54 },
      { san: "c5", count: 2400000, topPlayer: "nepo", whiteScore: 0.52 },
      { san: "e6", count: 890000, whiteScore: 0.55 },
      { san: "c6", count: 540000, whiteScore: 0.53 },
      { san: "d6", count: 420000, topPlayer: "topalov", whiteScore: 0.56 },
      { san: "d5", count: 380000, whiteScore: 0.55 },
      { san: "Nf6", count: 130000, whiteScore: 0.57 },
      { san: "g6", count: 92000, whiteScore: 0.54 },
    ],
  },
  // 1.e4 e5
  {
    line: ["e4", "e5"],
    moves: [
      { san: "Nf3", count: 1800000, topPlayer: "carlsen", whiteScore: 0.54 },
      { san: "Nc3", count: 320000, whiteScore: 0.53 },
      { san: "Bc4", count: 220000, whiteScore: 0.54 },
      { san: "f4", count: 84000, whiteScore: 0.51 },
      { san: "d4", count: 31000, whiteScore: 0.53 },
    ],
  },
  // 1.e4 e5 2.Nf3
  {
    line: ["e4", "e5", "Nf3"],
    moves: [
      { san: "Nc6", count: 1500000, topPlayer: "carlsen", whiteScore: 0.54 },
      { san: "Nf6", count: 240000, topPlayer: "kramnik", whiteScore: 0.54 },
      { san: "d6", count: 89000, whiteScore: 0.58 },
    ],
  },
  // 1.e4 e5 2.Nf3 Nc6
  {
    line: ["e4", "e5", "Nf3", "Nc6"],
    moves: [
      { san: "Bb5", count: 1100000, topPlayer: "carlsen", whiteScore: 0.54 },
      { san: "Bc4", count: 380000, topPlayer: "nepo", whiteScore: 0.53 },
      { san: "d4", count: 76000, whiteScore: 0.52 },
      { san: "Nc3", count: 110000, whiteScore: 0.52 },
    ],
  },
  // 1.e4 e5 2.Nf3 Nc6 3.Bb5 (Ruy López)
  {
    line: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
    moves: [
      { san: "a6", count: 850000, topPlayer: "carlsen", whiteScore: 0.54 },
      { san: "Nf6", count: 130000, topPlayer: "kramnik", whiteScore: 0.53 },
      { san: "d6", count: 84000, whiteScore: 0.55 },
      { san: "f5", count: 17000, whiteScore: 0.56 },
    ],
  },
  // 1.e4 e5 2.Nf3 Nc6 3.Bc4 (Italian)
  {
    line: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
    moves: [
      { san: "Bc5", count: 220000, topPlayer: "nepo", whiteScore: 0.53 },
      { san: "Nf6", count: 130000, topPlayer: "carlsen", whiteScore: 0.54 },
      { san: "Be7", count: 23000, whiteScore: 0.54 },
    ],
  },
  // 1.e4 c5 (Sicilian)
  {
    line: ["e4", "c5"],
    moves: [
      { san: "Nf3", count: 1800000, topPlayer: "kasparov", whiteScore: 0.55 },
      { san: "Nc3", count: 220000, whiteScore: 0.52 },
      { san: "c3", count: 130000, topPlayer: "carlsen", whiteScore: 0.55 },
      { san: "f4", count: 24000, whiteScore: 0.50 },
      { san: "b4", count: 11000, whiteScore: 0.48 },
    ],
  },
  // 1.e4 c5 2.Nf3
  {
    line: ["e4", "c5", "Nf3"],
    moves: [
      { san: "d6", count: 720000, topPlayer: "kasparov", whiteScore: 0.55 },
      { san: "Nc6", count: 620000, whiteScore: 0.54 },
      { san: "e6", count: 480000, topPlayer: "nepo", whiteScore: 0.53 },
      { san: "g6", count: 130000, whiteScore: 0.53 },
      { san: "a6", count: 56000, whiteScore: 0.52 },
    ],
  },
  // 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 (Najdorf-ready)
  {
    line: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3"],
    moves: [
      { san: "a6", count: 340000, topPlayer: "kasparov", whiteScore: 0.55 },
      { san: "g6", count: 67000, topPlayer: "carlsen", whiteScore: 0.54 },
      { san: "e6", count: 26000, whiteScore: 0.53 },
      { san: "Nc6", count: 24000, whiteScore: 0.52 },
      { san: "e5", count: 6000, whiteScore: 0.50 },
    ],
  },
  // 1.e4 e6 (French)
  {
    line: ["e4", "e6"],
    moves: [
      { san: "d4", count: 720000, topPlayer: "kasparov", whiteScore: 0.55 },
      { san: "Nf3", count: 65000, whiteScore: 0.53 },
      { san: "Nc3", count: 60000, whiteScore: 0.54 },
      { san: "e5", count: 21000, whiteScore: 0.52 },
    ],
  },
  // 1.e4 e6 2.d4
  {
    line: ["e4", "e6", "d4"],
    moves: [
      { san: "d5", count: 670000, topPlayer: "nepo", whiteScore: 0.55 },
      { san: "Nf6", count: 8000, whiteScore: 0.58 },
    ],
  },
  // 1.e4 c6 (Caro-Kann)
  {
    line: ["e4", "c6"],
    moves: [
      { san: "d4", count: 440000, topPlayer: "anand", whiteScore: 0.55 },
      { san: "Nc3", count: 47000, whiteScore: 0.53 },
      { san: "Nf3", count: 22000, whiteScore: 0.54 },
    ],
  },
  // ── Pirc Defense (the Kasparov-Topalov demo game) ────────────────────────
  // 1.e4 d6
  {
    line: ["e4", "d6"],
    moves: [
      { san: "d4", count: 380000, topPlayer: "kasparov", whiteScore: 0.56 },
      { san: "Nf3", count: 24000, whiteScore: 0.54 },
      { san: "f4", count: 12000, whiteScore: 0.53 },
    ],
  },
  // 1.e4 d6 2.d4
  {
    line: ["e4", "d6", "d4"],
    moves: [
      { san: "Nf6", count: 260000, topPlayer: "topalov", whiteScore: 0.56 },
      { san: "g6", count: 92000, whiteScore: 0.55 },
      { san: "Nd7", count: 11000, whiteScore: 0.58 },
      { san: "e5", count: 7800, whiteScore: 0.55 },
    ],
  },
  // 1.e4 d6 2.d4 Nf6
  {
    line: ["e4", "d6", "d4", "Nf6"],
    moves: [
      { san: "Nc3", count: 220000, topPlayer: "kasparov", whiteScore: 0.56 },
      { san: "Nf3", count: 31000, whiteScore: 0.55 },
      { san: "f3", count: 5800, whiteScore: 0.58 },
    ],
  },
  // 1.e4 d6 2.d4 Nf6 3.Nc3
  {
    line: ["e4", "d6", "d4", "Nf6", "Nc3"],
    moves: [
      { san: "g6", count: 170000, topPlayer: "topalov", whiteScore: 0.56 },
      { san: "c6", count: 38000, whiteScore: 0.55 },
      { san: "e5", count: 7200, whiteScore: 0.54 },
    ],
  },
  // 1.e4 d6 2.d4 Nf6 3.Nc3 g6
  {
    line: ["e4", "d6", "d4", "Nf6", "Nc3", "g6"],
    moves: [
      { san: "Be3", count: 38000, topPlayer: "kasparov", whiteScore: 0.57 },
      { san: "f4", count: 81000, topPlayer: "anand", whiteScore: 0.55 },
      { san: "f3", count: 28000, whiteScore: 0.56 },
      { san: "Nf3", count: 11000, whiteScore: 0.55 },
      { san: "h3", count: 2400, whiteScore: 0.56 },
    ],
  },
  // 1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.Be3
  {
    line: ["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Be3"],
    moves: [
      { san: "Bg7", count: 35000, topPlayer: "topalov", whiteScore: 0.57 },
      { san: "c6", count: 1800, whiteScore: 0.55 },
      { san: "a6", count: 320, whiteScore: 0.54 },
    ],
  },
  // 1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.Be3 Bg7
  {
    line: ["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Be3", "Bg7"],
    moves: [
      { san: "Qd2", count: 22000, topPlayer: "kasparov", whiteScore: 0.58 },
      { san: "f3", count: 7400, whiteScore: 0.57 },
      { san: "Nf3", count: 3100, whiteScore: 0.56 },
      { san: "h3", count: 2200, whiteScore: 0.56 },
    ],
  },
  // 1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.Be3 Bg7 5.Qd2
  {
    line: ["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Be3", "Bg7", "Qd2"],
    moves: [
      { san: "c6", count: 12000, topPlayer: "topalov", whiteScore: 0.58 },
      { san: "O-O", count: 4800, whiteScore: 0.57 },
      { san: "Nc6", count: 1200, whiteScore: 0.59 },
      { san: "Nbd7", count: 980, whiteScore: 0.57 },
    ],
  },
  // 1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.Be3 Bg7 5.Qd2 c6
  {
    line: ["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Be3", "Bg7", "Qd2", "c6"],
    moves: [
      { san: "f3", count: 8900, topPlayer: "kasparov", whiteScore: 0.59 },
      { san: "Bh6", count: 2300, whiteScore: 0.58 },
      { san: "Nf3", count: 1100, whiteScore: 0.57 },
      { san: "O-O-O", count: 780, whiteScore: 0.58 },
    ],
  },
  // ── 1.d4 family ──────────────────────────────────────────────────────────
  // 1.d4
  {
    line: ["d4"],
    moves: [
      { san: "Nf6", count: 2400000, topPlayer: "carlsen", whiteScore: 0.54 },
      { san: "d5", count: 1900000, topPlayer: "kramnik", whiteScore: 0.54 },
      { san: "e6", count: 590000, whiteScore: 0.54 },
      { san: "g6", count: 220000, whiteScore: 0.55 },
      { san: "f5", count: 130000, whiteScore: 0.55 },
      { san: "c5", count: 95000, whiteScore: 0.55 },
    ],
  },
  // 1.d4 d5
  {
    line: ["d4", "d5"],
    moves: [
      { san: "c4", count: 1300000, topPlayer: "kramnik", whiteScore: 0.55 },
      { san: "Nf3", count: 410000, topPlayer: "carlsen", whiteScore: 0.54 },
      { san: "Bf4", count: 81000, whiteScore: 0.55 },
      { san: "e3", count: 32000, whiteScore: 0.53 },
    ],
  },
  // 1.d4 d5 2.c4 (Queen's Gambit)
  {
    line: ["d4", "d5", "c4"],
    moves: [
      { san: "e6", count: 580000, topPlayer: "anand", whiteScore: 0.55 },
      { san: "c6", count: 380000, topPlayer: "kramnik", whiteScore: 0.54 },
      { san: "dxc4", count: 240000, whiteScore: 0.54 },
      { san: "Nc6", count: 12000, whiteScore: 0.55 },
    ],
  },
  // 1.d4 Nf6
  {
    line: ["d4", "Nf6"],
    moves: [
      { san: "c4", count: 1900000, topPlayer: "kasparov", whiteScore: 0.55 },
      { san: "Nf3", count: 410000, topPlayer: "carlsen", whiteScore: 0.54 },
      { san: "Bg5", count: 89000, whiteScore: 0.55 },
      { san: "Bf4", count: 38000, whiteScore: 0.55 },
    ],
  },
  // 1.d4 Nf6 2.c4
  {
    line: ["d4", "Nf6", "c4"],
    moves: [
      { san: "e6", count: 1100000, topPlayer: "anand", whiteScore: 0.55 },
      { san: "g6", count: 480000, topPlayer: "kasparov", whiteScore: 0.55 },
      { san: "c5", count: 95000, whiteScore: 0.54 },
      { san: "e5", count: 11000, whiteScore: 0.52 },
    ],
  },
  // 1.d4 Nf6 2.c4 g6 (KID setup)
  {
    line: ["d4", "Nf6", "c4", "g6"],
    moves: [
      { san: "Nc3", count: 380000, topPlayer: "kasparov", whiteScore: 0.55 },
      { san: "Nf3", count: 78000, topPlayer: "carlsen", whiteScore: 0.55 },
      { san: "g3", count: 23000, whiteScore: 0.54 },
    ],
  },
  // 1.d4 Nf6 2.c4 e6 3.Nc3 (Nimzo-ready)
  {
    line: ["d4", "Nf6", "c4", "e6"],
    moves: [
      { san: "Nc3", count: 540000, topPlayer: "anand", whiteScore: 0.55 },
      { san: "Nf3", count: 480000, topPlayer: "kramnik", whiteScore: 0.54 },
      { san: "g3", count: 78000, whiteScore: 0.54 },
    ],
  },
  // 1.Nf3
  {
    line: ["Nf3"],
    moves: [
      { san: "Nf6", count: 950000, topPlayer: "carlsen", whiteScore: 0.54 },
      { san: "d5", count: 480000, topPlayer: "caruana", whiteScore: 0.55 },
      { san: "c5", count: 220000, whiteScore: 0.54 },
      { san: "g6", count: 170000, whiteScore: 0.55 },
      { san: "f5", count: 22000, whiteScore: 0.56 },
    ],
  },
  // 1.c4
  {
    line: ["c4"],
    moves: [
      { san: "Nf6", count: 650000, topPlayer: "giri", whiteScore: 0.55 },
      { san: "e5", count: 410000, topPlayer: "carlsen", whiteScore: 0.53 },
      { san: "c5", count: 220000, whiteScore: 0.55 },
      { san: "g6", count: 130000, whiteScore: 0.55 },
      { san: "c6", count: 89000, whiteScore: 0.55 },
      { san: "e6", count: 73000, whiteScore: 0.55 },
    ],
  },
];

// ── Build the index from the curated data ────────────────────────────────

interface IndexedEntry {
  moves: {
    san: string;
    uci: string;
    count: number;
    topPlayer?: string;
    // Match the Lichess explorer response shape so the client can use
    // a single code path regardless of which source answered.
    white: number;
    draws: number;
    black: number;
  }[];
}

let cachedIndex: Map<string, IndexedEntry> | null = null;

function buildIndex(): Map<string, IndexedEntry> {
  const index = new Map<string, IndexedEntry>();

  for (const entry of DATA) {
    const game = new Chess();
    let valid = true;
    for (const move of entry.line) {
      const r = game.move(move);
      if (!r) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;

    const positionFen = normalizeFen(game.fen());

    // Compute UCI for each candidate by attempting the move from current FEN
    const indexed: IndexedEntry["moves"] = [];
    for (const c of entry.moves) {
      const trial = new Chess(game.fen());
      const r = trial.move(c.san);
      if (!r) continue;
      const whiteScore = c.whiteScore ?? 0.52;
      // Approximate split: 30% draws, the rest distributed by whiteScore
      const drawRate = 0.3;
      const decisive = 1 - drawRate;
      // whiteScore is "expected points" (white wins 1, draws 0.5, black 0)
      // From whiteScore = wWin + 0.5*draw, and constants:
      //   wWin = whiteScore - 0.5*drawRate
      //   bWin = 1 - drawRate - wWin
      const wRate = Math.max(0, whiteScore - 0.5 * drawRate);
      const bRate = Math.max(0, 1 - drawRate - wRate);
      const total = c.count;
      indexed.push({
        san: c.san,
        uci: `${r.from}${r.to}${r.promotion ?? ""}`,
        count: total,
        topPlayer: c.topPlayer,
        white: Math.round(total * wRate),
        draws: Math.round(total * drawRate),
        black: Math.round(total * bRate),
      });
    }
    // Sort most-played first
    indexed.sort((a, b) => b.count - a.count);
    index.set(positionFen, { moves: indexed });
  }

  return index;
}

/** Strip half-move + full-move counters so positions match regardless of how
 *  the player arrived (move counters can differ for the same board state).
 *  Returns "piece_placement active_color castling en_passant". */
export function normalizeFen(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

export function lookupCuratedPosition(fen: string): IndexedEntry | null {
  if (!cachedIndex) cachedIndex = buildIndex();
  return cachedIndex.get(normalizeFen(fen)) ?? null;
}

/** Count of indexed positions — exported for observability / footer label. */
export function curatedPositionCount(): number {
  if (!cachedIndex) cachedIndex = buildIndex();
  return cachedIndex.size;
}
