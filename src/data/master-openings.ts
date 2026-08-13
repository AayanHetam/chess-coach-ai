/**
 * The master-games opening tree behind /api/opening-explorer.
 *
 * ONE corpus, one scale. This file used to serve two: ~78 hand-typed
 * positions carrying full-history Lichess Masters figures (8.4M for 1.e4),
 * overlaid on a generated tree built from a single month of Lichess Elite
 * (280K games). Both were looked up per position, so a line would cross
 * between them mid-opening and the counts would fall off a cliff — Ruy López
 * ply 9 read 380,000 and ply 10 read 1,472, a 258× drop for one move. In the
 * Najdorf it was worse than jarring: counts went 11.8K at ply 4 up to 340K at
 * ply 9, i.e. a position appeared in more games than the position it came
 * from, which cannot happen in a real game tree and told the user the numbers
 * were not measurements.
 *
 * The hand-typed table is gone. Everything here now comes from one generated
 * corpus with real, monotonic counts, and `masterCorpusMeta()` reports what
 * that corpus is so the UI can say so rather than implying "every master game
 * ever played".
 *
 * Regenerate with scripts/process-master-pgn.mjs — see docs in that file.
 */

import { Chess } from "chess.js";
import fs from "fs";
import path from "path";

export interface MasterMove {
  san: string;
  uci: string;
  count: number;
  topPlayer?: string | null;
  // Lichess-explorer-compatible fields so the client keeps a single code path.
  white: number;
  draws: number;
  black: number;
}

export interface IndexedEntry {
  moves: MasterMove[];
}

export interface MasterCorpusMeta {
  /** Games aggregated into the tree. */
  games: number;
  /** Positions retained after the frequency threshold. */
  positions: number;
  /** How deep into each game the aggregation walked. */
  maxPlies: number;
  /** Positions below this game count were dropped. */
  minGames: number;
  /** Human-readable corpus name, shown in the UI. */
  source: string;
  /** ISO date the tree was generated. */
  generatedAt: string;
}

const EMPTY_META: MasterCorpusMeta = {
  games: 0,
  positions: 0,
  maxPlies: 0,
  minGames: 0,
  source: "unavailable",
  generatedAt: "",
};

/**
 * A stored move row: `[san, count, white, draws]`.
 *
 * Black wins are `count - white - draws`, and UCI is recomputed from the
 * position when a row is read. Storing those two derived fields, with a JSON
 * key for each on all 509,680 rows, was 35 MB of the 48 MB verbose form —
 * and this file is read at module init on every cold start, so its size is
 * request latency. See scripts/compact-master-tree.mjs.
 */
type StoredMove = [san: string, count: number, white: number, draws: number];

// Large JSON — webpack used to bundle it into every server output
// (master-tree.json was a static `import`), which hung Vercel builds
// indefinitely on the 2-core runner. Loading at module-init via fs keeps
// webpack from touching it; next.config.ts's `outputFileTracingIncludes`
// ensures the file ships with the API bundle so the read works at runtime.
const loaded: {
  positions: Record<string, StoredMove[]>;
  meta: MasterCorpusMeta;
} = (() => {
  try {
    const filePath = path.join(
      process.cwd(),
      "src",
      "data",
      "master-tree.json"
    );
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (raw && typeof raw === "object" && raw.positions) {
      return {
        positions: raw.positions as Record<string, StoredMove[]>,
        meta: { ...EMPTY_META, ...(raw.meta ?? {}) } as MasterCorpusMeta,
      };
    }
    // No recognisable payload — treat as absent rather than guessing at a
    // shape. An older bare position map is not readable as StoredMove rows.
    throw new Error("master-tree.json has no `positions` key");
  } catch (err) {
    // SSR pre-pass (e.g. on a route that never calls into the explorer) may
    // run with a different cwd or without the file. Fall back to empty so the
    // build doesn't hard-fail; the API route reports the empty corpus.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[master-openings] processed tree unavailable:", err);
    }
    return { positions: {}, meta: EMPTY_META };
  }
})();

const TREE = loaded.positions;

/**
 * Expand stored rows for one position into the shape the API serves.
 *
 * Done per lookup, not at init: only the ~6 moves of the position actually
 * requested are ever materialised, so a 94,901-position tree costs one
 * `JSON.parse` at startup rather than half a million object allocations.
 */
function expand(fen: string, rows: StoredMove[]): IndexedEntry {
  const board = new Chess(`${normalizeFen(fen)} 0 1`);
  const moves: MasterMove[] = [];
  for (const [san, count, white, draws] of rows) {
    let uci = "";
    try {
      // chess.js mutates, so replay from a fresh copy of the position.
      const probe = new Chess(board.fen());
      const r = probe.move(san);
      if (!r) continue;
      uci = `${r.from}${r.to}${r.promotion ?? ""}`;
    } catch {
      // A row whose SAN is not legal here is corrupt; drop it rather than
      // emit a move the board can't play.
      continue;
    }
    moves.push({
      san,
      uci,
      count,
      white,
      draws,
      black: count - white - draws,
    });
  }
  return { moves };
}

/** Strip half-move + full-move counters so positions match regardless of how
 *  the player arrived (move counters can differ for the same board state).
 *  Returns "piece_placement active_color castling en_passant". */
export function normalizeFen(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

export function lookupCuratedPosition(fen: string): IndexedEntry | null {
  const rows = TREE[normalizeFen(fen)];
  if (!rows || rows.length === 0) return null;
  return expand(fen, rows);
}

/** Count of indexed positions — exported for observability / footer label. */
export function curatedPositionCount(): number {
  return loaded.meta.positions || Object.keys(TREE).length;
}

/** Corpus provenance, so the UI can state what the numbers are drawn from. */
export function masterCorpusMeta(): MasterCorpusMeta {
  return loaded.meta;
}
