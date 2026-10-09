import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compareTwo } from "../compareVerdict";
import type { ScoredMove } from "@/lib/engine/gradeMove";

/**
 * The coach is sent the compare's numbers from the first partial at depth
 * 10 or deeper, and the page keeps deepening to 16 (pathway 3.5). The
 * engine's verdict on the pair must not turn round between the two: at
 * every depth from 10, the move it prefers is the one it prefers at 16,
 * or neither, never the other move.
 *
 * Read over the committed measurement of the shipped engine
 * (scripts/engine/evaluate-moves-headless.mjs --compare, the latest
 * scripts/engine/results/compare-depths-*.json), whose scores are the side
 * to move's as the engine reports them: they are turned White-relative
 * here, as evaluateMoves turns them.
 */

const RESULTS = path.join(process.cwd(), "scripts/engine/results");

interface Row {
  case: string;
  compare?: boolean;
  fen: string;
  asked: string[];
  depth: number;
  ok: boolean;
  scored: Array<{
    uci: string;
    depth: number;
    kind: "cp" | "mate";
    value: number;
  }>;
}

function latest(): { file: string; results: Row[] } {
  const files = fs
    .readdirSync(RESULTS)
    .filter((f) => /^compare-depths-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  expect(
    files.length,
    "a committed compare-depths measurement"
  ).toBeGreaterThan(0);
  const file = files[files.length - 1];
  const data = JSON.parse(fs.readFileSync(path.join(RESULTS, file), "utf8"));
  return { file, results: data.results as Row[] };
}

/** The engine's scores, White-relative. */
function whiteRelative(row: Row): ScoredMove[] {
  const sign = row.fen.split(" ")[1] === "b" ? -1 : 1;
  return row.scored.map((s) =>
    s.kind === "mate"
      ? { uci: s.uci, mate: sign * s.value, depth: s.depth }
      : { uci: s.uci, cp: sign * s.value, depth: s.depth }
  );
}

describe("the compare's verdict across depths", () => {
  const { file, results } = latest();
  const compares = results.filter((r) => r.compare);
  const cases = Array.from(new Set(compares.map((r) => r.case)));

  it(`measures the four pairs at 10, 12, 14 and 16 (${file})`, () => {
    expect(cases).toHaveLength(4);
    for (const c of cases) {
      const depths = compares
        .filter((r) => r.case === c)
        .map((r) => r.depth)
        .sort((a, b) => a - b);
      expect(depths, c).toEqual([10, 12, 14, 16]);
    }
    for (const r of compares) {
      expect(r.ok, `${r.case} d${r.depth}`).toBe(true);
      expect(r.asked, r.case).toHaveLength(2);
    }
  });

  it("never prefers the other move at a shallower depth than at 16", () => {
    for (const c of cases) {
      const rows = compares.filter((r) => r.case === c);
      const verdictAt = (row: Row) => {
        const v = compareTwo(
          { fen: row.fen, moves: whiteRelative(row) },
          row.asked[0],
          row.asked[1]
        );
        expect(v, `${c} d${row.depth}`).not.toBeNull();
        return v!;
      };
      const final = verdictAt(rows.find((r) => r.depth === 16)!);
      for (const row of rows.filter((r) => r.depth >= 10)) {
        const v = verdictAt(row);
        // The depth-16 move, or no preference at all.
        if (v.preferred !== null)
          expect(
            v.preferred,
            `${c}: d${row.depth} prefers ${v.preferred}, d16 ${final.preferred}`
          ).toBe(final.preferred);
      }
    }
  });

  it("reads Black's scores from Black's side: a6 and Nf6 after 3. Bb5 are both sound", () => {
    const ruy = compares.filter((r) => r.case.includes("Ruy Lopez"));
    expect(ruy.length).toBe(4);
    for (const row of ruy) {
      const v = compareTwo(
        { fen: row.fen, moves: whiteRelative(row) },
        row.asked[0],
        row.asked[1]
      )!;
      expect(v.mover).toBe("b");
      // Two book replies: neither loses outright for Black.
      expect(["close", "prefers"]).toContain(v.kind);
      if (v.kind === "prefers") expect(v.margin).toBe("clear");
    }
  });
});
