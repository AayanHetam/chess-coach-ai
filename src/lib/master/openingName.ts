import { Chess } from "chess.js";
import fs from "fs";
import path from "path";

/**
 * The name of the opening a position IS, if it is a named one.
 *
 * Server-only: src/data/openings.json is read with `fs`, so the file is named
 * in `outputFileTracingIncludes` for every route that calls this. Keyed by
 * the piece placement (the first FEN field), which is how the library itself
 * identifies each opening: its `pgn` is one route to the position and is
 * absent for 182 of the 3,690 entries, so an index built by replaying PGNs
 * (the first version of this file) had no name for 1.e4 c5. The other way
 * round, 289 entries carry a PGN and no placement; those are replayed once
 * to get theirs. Placement alone ignores side to move and castling rights;
 * no two named openings share a placement and differ only in those.
 *
 * Positions past the last named one along a line get null. The caller says
 * "Move 14 · White to move" instead, which is true, rather than carrying a
 * name forward from a position that is no longer this one.
 */
export interface OpeningName {
  name: string;
  eco: string | null;
}

interface RawOpening {
  name: string;
  fen: string;
  eco: string | null;
  pgn: string | null;
}

let byPlacement: Map<string, OpeningName> | null = null;

function index(): Map<string, OpeningName> {
  if (byPlacement) return byPlacement;
  const map = new Map<string, OpeningName>();
  try {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "src", "data", "openings.json"),
        "utf-8"
      )
    ) as RawOpening[];
    for (const entry of raw) {
      if (!entry?.name) continue;
      const placement = entry.fen
        ? entry.fen.split(" ")[0]
        : placementAfter(entry.pgn);
      if (!placement) continue;
      const existing = map.get(placement);
      // A placement listed twice is the same opening under two move orders,
      // occasionally with an ECO code on only one of them: keep the one that
      // has it.
      if (!existing || (!existing.eco && entry.eco)) {
        map.set(placement, { name: entry.name, eco: entry.eco ?? null });
      }
    }
  } catch {
    // No library on this machine: every position is simply unnamed.
  }
  byPlacement = map;
  return map;
}

/** The placement a PGN movetext reaches, or null if it does not parse. */
function placementAfter(pgn: string | null): string | null {
  if (!pgn) return null;
  const sans = pgn
    .replace(/\d+\.(\.\.)?/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (sans.length === 0) return null;
  const game = new Chess();
  for (const san of sans) {
    try {
      if (!game.move(san)) return null;
    } catch {
      return null;
    }
  }
  return game.fen().split(" ")[0];
}

export function lookupOpeningByFen(fen: string): OpeningName | null {
  const placement = fen.split(" ")[0];
  if (!placement) return null;
  return index().get(placement) ?? null;
}

/** Test seam. */
export function resetOpeningNameIndexForTests(): void {
  byPlacement = null;
}
