import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Chess } from "chess.js";
import { getMovesClassification } from "@/lib/engine/helpers/moveClassification";
import type { PositionEval } from "@/types/eval";

/**
 * The review's win-percentage bands (pathway 3.5).
 *
 * The snapshot pins what the review's classifier says over all ten real
 * fixture games. It was taken before the bands moved out of
 * moveClassification.ts into winBands.ts, so the move must leave every
 * verdict where it was.
 */

const REAL = path.join(
  process.cwd(),
  "src/lib/contract/__tests__/fixtures-real"
);

interface Fixture {
  moveHistory: string[];
  gameEval: { positions: PositionEval[] };
}

/** The game's moves as UCI and the board before each, as far as they replay. */
function replay(sans: readonly string[]): { uci: string[]; fens: string[] } {
  const g = new Chess();
  const uci: string[] = [];
  const fens: string[] = [g.fen()];
  for (const san of sans) {
    let m;
    try {
      m = g.move(san);
    } catch {
      break;
    }
    if (!m) break;
    uci.push(`${m.from}${m.to}${m.promotion ?? ""}`);
    fens.push(g.fen());
  }
  return { uci, fens };
}

/**
 * The stored sweep has one line at most positions, which the classifier
 * reads as a forced move before any band is consulted. `twoLines` repeats
 * each lone line with no move, so the bands decide every move that is not
 * an opening, a best or a forced one, and stops before a position with no
 * line (a mate's final board), where the classifier throws.
 */
function classify(fx: Fixture, twoLines = false): string[] {
  const { uci, fens } = replay(fx.moveHistory);
  const lineless = fx.gameEval.positions.findIndex((p) => !p.lines?.length);
  const n = Math.min(
    fens.length,
    twoLines && lineless >= 0 ? lineless : fx.gameEval.positions.length
  );
  const positions = (
    JSON.parse(
      JSON.stringify(fx.gameEval.positions.slice(0, n))
    ) as PositionEval[]
  ).map((p) =>
    twoLines && p.lines.length === 1
      ? { ...p, lines: [p.lines[0], { ...p.lines[0], pv: [], multiPv: 2 }] }
      : p
  );
  try {
    return getMovesClassification(positions, uci, fens.slice(0, n)).map(
      (p, i) =>
        `${i} ${i > 0 ? fx.moveHistory[i - 1] : "start"} ${p.moveClassification ?? "-"}${p.opening ? ` (${p.opening})` : ""}`
    );
  } catch (err) {
    return [`throws: ${(err as Error).message}`];
  }
}

describe("the review's classification over the real fixtures", () => {
  it("is what it was before the bands moved", () => {
    const out: Record<string, string[]> = {};
    for (const f of fs
      .readdirSync(REAL)
      .filter((f) => f.endsWith(".json"))
      .sort()) {
      const fx = JSON.parse(
        fs.readFileSync(path.join(REAL, f), "utf8")
      ) as Fixture;
      out[f] = classify(fx);
      out[`${f}:two-lines`] = classify(fx, true);
    }
    expect(Object.keys(out)).toHaveLength(20);
    expect(out).toMatchSnapshot();
  });
});
