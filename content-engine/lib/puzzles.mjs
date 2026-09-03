/**
 * Puzzle pool: load -> verify -> classify -> select.
 *
 * Everything here is deterministic and engine-free. Legality and mate are
 * proven by replaying the line with chess.js. Material is counted, not
 * evaluated. No claim that needs Stockfish is ever produced by this file
 * (see evals.mjs on the Mac for anything stronger).
 */
import fs from "node:fs";
import path from "node:path";
import { Chess } from "chess.js";

const CSV = path.resolve(
  process.cwd(),
  "../public/data/lichess_puzzles_100k.csv",
);

/** Difficulty tiers. Colour drives the badge, the timer ring and the countdown. */
export const TIERS = [
  { id: "warmup", label: "WARM-UP", min: 800, max: 1099, color: "#4ADE80" },
  { id: "steady", label: "STEADY", min: 1100, max: 1499, color: "#38BDF8" },
  { id: "sharp", label: "SHARP", min: 1500, max: 1899, color: "#F97316" },
  { id: "brutal", label: "BRUTAL", min: 1900, max: 2200, color: "#F43F5E" },
];

/**
 * Goal types. `themes` is the Lichess tag set that qualifies a puzzle;
 * `goal` is the on-frame line. Every goal is checkable without an engine:
 * mate goals are replayed to checkmate, the rest are replayed to a
 * counted material gain.
 */
export const GOALS = [
  {
    id: "mate",
    themes: ["mateIn1", "mateIn2", "mateIn3"],
    kind: "mate",
    goal: (p) => `MATE IN ${p.mateIn}`,
    sub: "Finish it.",
  },
  {
    id: "fork",
    themes: ["fork"],
    kind: "material",
    goal: () => "FORK IT",
    sub: "Hit two things at once.",
  },
  {
    id: "pin",
    themes: ["pin", "skewer"],
    kind: "material",
    goal: () => "PIN OR SKEWER",
    sub: "Line them up. Take the back one.",
  },
  {
    id: "hanging",
    themes: ["hangingPiece", "capturingDefender", "discoveredAttack"],
    kind: "material",
    goal: () => "SOMETHING IS LOOSE",
    sub: "Find it before they do.",
  },
  {
    id: "sacrifice",
    themes: ["sacrifice", "deflection", "attraction", "clearance"],
    kind: "material",
    goal: () => "GIVE IT UP",
    sub: "The give-away is the point.",
  },
];

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function material(chess, color) {
  let total = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.color === color) total += PIECE_VALUE[sq.type];
    }
  }
  return total;
}

/**
 * Replay a puzzle with chess.js. Returns null the moment anything refuses to
 * replay — a line that will not replay is dropped, never shipped.
 */
export function verify(row) {
  let chess;
  try {
    chess = new Chess(row.fen);
  } catch {
    return null;
  }

  const uci = row.moves;
  if (uci.length < 2) return null;

  // Lichess convention: moves[0] is the opponent's setup move, moves[1+] is
  // the solver's line. The side to move AFTER the setup move is our side.
  const applied = [];
  for (const m of uci) {
    let move;
    try {
      move = chess.move({
        from: m.slice(0, 2),
        to: m.slice(2, 4),
        promotion: m.length > 4 ? m[4] : undefined,
      });
    } catch {
      return null;
    }
    if (!move) return null;
    applied.push(move);
  }

  const setup = applied[0];
  const solverColor = setup.color === "w" ? "b" : "w";
  const oppColor = solverColor === "w" ? "b" : "w";

  // Position the viewer actually solves from.
  const start = new Chess(row.fen);
  start.move({
    from: uci[0].slice(0, 2),
    to: uci[0].slice(2, 4),
    promotion: uci[0].length > 4 ? uci[0][4] : undefined,
  });
  const puzzleFen = start.fen();
  if (start.turn() !== solverColor) return null;

  const solverMoves = applied.slice(1);
  if (solverMoves.length === 0) return null;

  // Mate is proven, not asserted.
  const isMate = chess.isCheckmate();
  const mateIn = isMate ? Math.ceil(solverMoves.length / 2) : 0;

  // Material is counted, not evaluated.
  const before = material(start, solverColor) - material(start, oppColor);
  const after = material(chess, solverColor) - material(chess, oppColor);

  return {
    id: row.id,
    fen: row.fen,
    puzzleFen,
    setupUci: uci[0],
    setupSan: setup.san,
    setupFrom: uci[0].slice(0, 2),
    setupTo: uci[0].slice(2, 4),
    solutionUci: uci.slice(1),
    solutionSan: solverMoves.map((m) => m.san),
    solverColor,
    rating: row.rating,
    nbPlays: row.nbPlays,
    themes: row.themes,
    gameUrl: row.gameUrl,
    isMate,
    mateIn,
    materialGain: after - before,
  };
}

/** Parse the bundled Lichess CSV. 10 columns, no quoted fields. */
export function loadRows() {
  const text = fs.readFileSync(CSV, "utf8");
  const lines = text.split("\n");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const c = line.split(",");
    if (c.length < 9) continue;
    out.push({
      id: c[0],
      fen: c[1],
      moves: c[2].split(" ").filter(Boolean),
      rating: Number(c[3]),
      popularity: Number(c[5]),
      nbPlays: Number(c[6]),
      themes: c[7].split(" ").filter(Boolean),
      gameUrl: c[8],
    });
  }
  return out;
}

function tierOf(rating) {
  return TIERS.find((t) => rating >= t.min && rating <= t.max) ?? null;
}

function goalOf(themes) {
  // Mate wins ties: if a puzzle mates, that is the honest headline.
  for (const g of GOALS) {
    if (g.kind === "mate" && g.themes.some((t) => themes.includes(t))) return g;
  }
  for (const g of GOALS) {
    if (g.themes.some((t) => themes.includes(t))) return g;
  }
  return null;
}

/**
 * selectDiverse walks 4 difficulty tiers against 5 goal types. They are
 * coprime, so all 20 combinations cycle before repeating and no two
 * consecutive posts share a tier or a goal.
 */
export function selectDiverse(count, posted = new Set(), seed = 7) {
  const rows = loadRows();

  // Bucket first, verify lazily — verifying 100k puzzles is wasted work.
  const buckets = new Map();
  for (const row of rows) {
    if (posted.has(row.id)) continue;
    if (row.nbPlays < 1000) continue; // thin sample, skip
    if (row.popularity < 80) continue; // community disliked it
    const tier = tierOf(row.rating);
    if (!tier) continue;
    const goal = goalOf(row.themes);
    if (!goal) continue;
    const key = `${tier.id}:${goal.id}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  // Deterministic shuffle so a rerun with the same ledger is reproducible.
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (const list of buckets.values()) {
    list.sort((a, b) => b.popularity - a.popularity || (a.id < b.id ? -1 : 1));
    // Draw from the top slice so every reel is a well-liked puzzle.
    const top = list.slice(0, 400);
    for (let i = top.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [top[i], top[j]] = [top[j], top[i]];
    }
    list.length = 0;
    list.push(...top);
  }

  const picked = [];
  const used = new Set(posted);
  for (let i = 0; picked.length < count && i < count * 20; i++) {
    const tier = TIERS[i % TIERS.length];
    const goal = GOALS[i % GOALS.length];
    const list = buckets.get(`${tier.id}:${goal.id}`) ?? [];
    while (list.length) {
      const row = list.shift();
      if (used.has(row.id)) continue;
      const v = verify(row);
      if (!v) continue; // will not replay — dropped
      if (goal.kind === "mate" && !v.isMate) continue; // mate claim unproven
      if (goal.kind === "material" && v.materialGain < 1 && !v.isMate) continue;
      used.add(row.id);
      picked.push({ ...v, tier, goal });
      break;
    }
  }
  return picked;
}

/** End-card link band. The /puzzles/<band> grid is 600-2200 in 100s. */
export function linkBand(rating) {
  const band = Math.floor(rating / 100) * 100;
  return Math.min(2200, Math.max(600, band));
}
