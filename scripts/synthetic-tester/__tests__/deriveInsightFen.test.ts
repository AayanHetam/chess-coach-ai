import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import { Chess } from "chess.js";
import { deriveFenBefore, isLegalSan } from "../deriveInsightFen";
import { parseCoachInsights } from "../coachInsights";

const FIX_DIR = path.resolve(__dirname, "..");
const evalSet = JSON.parse(
  readFileSync(
    path.join(FIX_DIR, "fixtures/helpfulness/eval-set-50.json"),
    "utf8"
  )
) as {
  entries: {
    id: string;
    moveHistory: string[];
    fenBefore: string;
    movePlayedSan: string;
  }[];
};
const byId = new Map(evalSet.entries.map((e) => [e.id, e]));

describe("deriveFenBefore — off-by-one guard (the half-move bug)", () => {
  const evans = byId.get("fx-evans-gambit#15")!;

  it("7...dxc3 (black) is legal from the derived fenBefore", () => {
    const d = deriveFenBefore(evans.moveHistory, 7, "b");
    expect(d).not.toBeNull();
    expect(d!.ply).toBe(14);
    expect(isLegalSan(d!.fenBefore, "dxc3")).toBe(true);
  });

  it("8.Qb3 (white) reproduces the eval-set's OWN stored fenBefore byte-for-byte", () => {
    const d = deriveFenBefore(evans.moveHistory, 8, "w");
    expect(d).not.toBeNull();
    expect(d!.ply).toBe(15);
    expect(d!.fenBefore).toBe(evans.fenBefore);
  });

  it("the naive 2n-2 formula makes dxc3 illegal (regression on the off-by-one)", () => {
    // Replicate the buggy derivation: ply = 2*moveNumber - 1 for black (one
    // ply early vs. the correct 2*moveNumber).
    const naivePly = 2 * 7 - 1; // = 13, one short of the correct 14
    const g = new Chess();
    for (let i = 0; i < naivePly - 1; i++) g.move(evans.moveHistory[i]);
    expect(isLegalSan(g.fen(), "dxc3")).toBe(false);
  });

  it("returns null when the move number overruns the move history", () => {
    expect(deriveFenBefore(["e4", "e5"], 50, "w")).toBeNull();
  });
});

describe("deriveFenBefore — legality drop (coach mislabeled its move number)", () => {
  it("fx-scotch-gambit#15 header 8:b:dxc4 is dropped (illegal from derived fen)", () => {
    const scotch = byId.get("fx-scotch-gambit#15");
    expect(scotch).toBeDefined();
    const d = deriveFenBefore(scotch!.moveHistory, 8, "b");
    // Either derivation fails OR the played SAN is illegal — both => DROP.
    const dropped = !d || !isLegalSan(d.fenBefore, "dxc4");
    expect(dropped).toBe(true);
  });
});

// Glob every committed helpfulness run and assert the core invariant: for every
// insight that survives the guard (derivable + legal), movePlayedSan IS legal
// from the derived fenBefore. This is the property the /calibrate board relies
// on — board, move label, and prose all describe the same move.
const runsDir = path.join(FIX_DIR, "runs");
const runFiles = existsSync(runsDir)
  ? readdirSync(runsDir).filter(
      (f) => f.startsWith("helpbaseline-") && f.endsWith(".json")
    )
  : [];

describe("INVARIANT: every surviving insight's movePlayedSan is legal from its derived fen", () => {
  it("has at least one run JSON to iterate", () => {
    expect(runFiles.length).toBeGreaterThan(0);
  });

  let totalInsights = 0;
  let surviving = 0;
  let droppedIllegal = 0;
  let orphanRows = 0;

  for (const f of runFiles) {
    const run = JSON.parse(readFileSync(path.join(runsDir, f), "utf8")) as {
      rows: { id: string; coachText?: string }[];
    };
    for (const row of run.rows) {
      if (!row.coachText) continue;
      const entry = byId.get(row.id);
      if (!entry) {
        orphanRows += 1;
        continue;
      }
      const { insights } = parseCoachInsights(row.coachText);
      for (const ins of insights) {
        totalInsights += 1;
        const d = deriveFenBefore(entry.moveHistory, ins.moveNumber, ins.color);
        if (!d || !isLegalSan(d.fenBefore, ins.movePlayedSan)) {
          droppedIllegal += 1;
          continue;
        }
        surviving += 1;
        // THE INVARIANT.
        it(`${f}:${row.id} ${ins.moveNumber}${ins.color} ${ins.movePlayedSan} legal from derived fen`, () => {
          expect(isLegalSan(d.fenBefore, ins.movePlayedSan)).toBe(true);
        });
      }
    }
  }

  it("summary: surviving + dropped accounts for all parsed insights", () => {
    expect(surviving + droppedIllegal).toBe(totalInsights);
    expect(surviving).toBeGreaterThan(0);
    // Diagnostic only — not an assertion on exact counts (runs are dev data).
    console.log(
      `insights=${totalInsights} surviving=${surviving} dropped=${droppedIllegal} orphanRows=${orphanRows}`
    );
  });
});
