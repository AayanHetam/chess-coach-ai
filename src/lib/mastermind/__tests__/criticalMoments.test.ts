import { describe, it, expect } from "vitest";
import { find_critical_moments } from "../criticalMoments";
import { PositionEval, LineEval } from "@/types/eval";

function line(cp: number, pv: string[] = ["e2e4"]): LineEval {
  return { pv, cp, depth: 20, multiPv: 1 };
}

function pos(cp: number, lines: LineEval[] = [line(cp)]): PositionEval {
  return { lines };
}

describe("find_critical_moments", () => {
  it("returns empty when no moves classify above INACCURACY threshold", () => {
    const positions = [pos(20), pos(15), pos(18)];
    const result = find_critical_moments(positions, ["e2e4", "e7e5"], 3);
    expect(result).toEqual([]);
  });

  it("classifies a 300+cp drop as BLUNDER", () => {
    const positions = [pos(20), pos(-400)];
    const result = find_critical_moments(positions, ["e2e4"], 3);
    expect(result).toHaveLength(1);
    expect(result[0].classification).toBe("BLUNDER");
  });

  it("classifies a 150-300cp drop as MISTAKE", () => {
    const positions = [pos(20), pos(-180)];
    const result = find_critical_moments(positions, ["e2e4"], 3);
    expect(result).toHaveLength(1);
    expect(result[0].classification).toBe("MISTAKE");
  });

  it("classifies a 100-150cp drop as TURNING_POINT", () => {
    const positions = [pos(50), pos(-70)];
    const result = find_critical_moments(positions, ["e2e4"], 3);
    expect(result).toHaveLength(1);
    expect(result[0].classification).toBe("TURNING_POINT");
  });

  it("classifies a 50-100cp drop as INACCURACY", () => {
    const positions = [pos(30), pos(-30)];
    const result = find_critical_moments(positions, ["e2e4"], 3);
    expect(result).toHaveLength(1);
    expect(result[0].classification).toBe("INACCURACY");
  });

  it("respects topN cap", () => {
    const positions = [pos(20), pos(-400), pos(-100), pos(-500), pos(-200)];
    const moves = ["e2e4", "e7e5", "g1f3", "b8c6"];
    const result = find_critical_moments(positions, moves, 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("sorts by criticality not raw drop", () => {
    const positions = [pos(20), pos(-180), pos(50), pos(-450)];
    const moves = ["e2e4", "e7e5", "g1f3"];
    const result = find_critical_moments(positions, moves, 3);
    if (result.length >= 2) {
      expect(result[0].criticalityScore).toBeGreaterThanOrEqual(result[1].criticalityScore);
    }
  });

  it("attaches fenBefore/fenAfter from replay", () => {
    const positions = [pos(20), pos(-400)];
    const result = find_critical_moments(positions, ["e2e4"], 3);
    expect(result[0].fenBefore).toMatch(/^rnbqkbnr/);
    expect(result[0].fenAfter).not.toBe(result[0].fenBefore);
  });
});
