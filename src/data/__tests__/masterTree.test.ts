import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";

import {
  lookupCuratedPosition,
  masterCorpusMeta,
  normalizeFen,
} from "../master-openings";

/**
 * Invariants of the master-games tree.
 *
 * The bug these exist for: the tree served two corpora at once — ~78
 * hand-typed positions carrying full-history Lichess Masters figures, over a
 * tree generated from one month of Lichess Elite. Lookups crossed between
 * them mid-line, so counts fell off a cliff (Ruy López ply 9 = 380,000, ply
 * 10 = 1,472) and, in the Najdorf, rose with depth — 10,316 games at one ply
 * and 463,000 at the next.
 *
 * NOTE ON THE OBVIOUS-LOOKING INVARIANT. "A position can't occur in more
 * games than the position it came from" is FALSE here, and asserting it fails
 * on correct data. Positions are keyed by FEN, so transpositions merge: the
 * Najdorf tabiya is reached by several move orders and legitimately holds
 * more games than any one of its parents (10,316 → 10,474 in the real
 * corpus). This is a position graph, not a game tree.
 *
 * What IS sound, and is what catches the mixing: no position may claim more
 * games than the corpus contains. A hand-typed 8.4M figure sitting on a
 * 3.4M-game corpus violates that no matter how it was reached.
 */

const LINES: Record<string, string[]> = {
  "Ruy López": [
    "e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7",
  ],
  Najdorf: [
    "e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6",
  ],
  "Queen's Gambit Declined": [
    "d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3", "O-O",
  ],
};

/** Total games recorded at a position, or null if it isn't in the tree. */
function totalAt(fen: string): number | null {
  const entry = lookupCuratedPosition(fen);
  if (!entry) return null;
  return entry.moves.reduce((sum, m) => sum + m.count, 0);
}

describe("master tree — game counts are measurements, not decoration", () => {
  it.each(Object.entries(LINES))(
    "%s: no position claims more games than the corpus holds",
    (_name, sans) => {
      const corpus = masterCorpusMeta().games;
      expect(corpus, "corpus size unknown — nothing to check against").toBeGreaterThan(0);

      const game = new Chess();
      const seen: { move: string; total: number }[] = [];
      for (const san of ["", ...sans]) {
        if (san) game.move(san);
        const total = totalAt(game.fen());
        // Falling off the end of the tree is fine — that is coverage, not a
        // contradiction.
        if (total === null) break;
        seen.push({ move: san || "start", total });
        expect(
          total,
          `after ${san || "start"} the position reports ${total} games from a corpus of ${corpus} — a second, larger-scaled source has been mixed in`
        ).toBeLessThanOrEqual(corpus);
      }

      // Guard the guard: a tree that returned null immediately would pass the
      // loop above vacuously.
      expect(
        seen.length,
        "the tree covers none of this mainline, so nothing was actually checked"
      ).toBeGreaterThanOrEqual(6);
    }
  );

  // NOTE: there is no sound bound in EITHER direction between a move's count
  // and the total at the position it leads to, so neither is asserted.
  //   • child > parent-move: transpositions merge into one FEN key, so other
  //     move orders pour in (1.e4 c5 2.Nf3 d6 3.d4 and 2...d6 3.Nf3 land in
  //     the same place).
  //   • child < parent-move: a position's total is the sum of moves played
  //     FROM it, so every game that ENDS there contributes to the move in and
  //     nothing to the total out. Measured: 1.e4 is played in 1,601,750 games
  //     while the position after it totals 1,601,306 — 444 games ended on
  //     move one.
  // What remains sound is asserted above and below.

  it("reaches deep enough into a mainline to be worth opening", () => {
    // The depth complaint: the tab ran out of data almost immediately. This
    // pins the coverage floor so a future regeneration can't quietly ship a
    // shallower tree.
    const game = new Chess();
    let plies = 0;
    for (const san of LINES["Ruy López"]) {
      if (!lookupCuratedPosition(game.fen())) break;
      game.move(san);
      plies++;
    }
    expect(
      plies,
      "the tree runs out before move 5 of the most common opening in chess"
    ).toBeGreaterThanOrEqual(10);
  });

  it("a move's count never exceeds the total at its own position", () => {
    const game = new Chess();
    for (const san of LINES["Ruy López"]) {
      const entry = lookupCuratedPosition(game.fen());
      if (!entry) break;
      const total = entry.moves.reduce((s, m) => s + m.count, 0);
      for (const m of entry.moves) {
        expect(m.count).toBeLessThanOrEqual(total);
        expect(m.count).toBeGreaterThan(0);
      }
      game.move(san);
    }
  });

  it("reports the corpus it is built from, so the UI can name it", () => {
    const meta = masterCorpusMeta();
    expect(meta.games, "no corpus metadata — the UI would have to guess").toBeGreaterThan(0);
    expect(meta.source).toBeTruthy();
    expect(meta.positions).toBeGreaterThan(0);
  });

  it("matches positions regardless of move counters", () => {
    // Two routes to the same position differ only in the halfmove/fullmove
    // fields; the tree is keyed on the first four FEN fields for that reason.
    const a = new Chess();
    ["e4", "e5", "Nf3"].forEach((s) => a.move(s));
    const withCounters = a.fen();
    const stripped = normalizeFen(withCounters);
    expect(stripped.split(" ")).toHaveLength(4);
    expect(lookupCuratedPosition(withCounters)).toEqual(
      lookupCuratedPosition(stripped)
    );
  });
});
