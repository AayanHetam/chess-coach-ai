import { describe, expect, it } from "vitest";
import {
  achievedDepth,
  isComparableDepthPair,
  requestedDepth,
  shallowSearchPlies,
} from "../evalDepth";

/** T8 primitives (SILENT_SUBSTITUTION_HANDOFF §4). */

const at = (depth: number) => ({ lines: [{ pv: [], cp: 0, depth, multiPv: 1 }] });

describe("achievedDepth", () => {
  it("reads the principal line's depth", () => {
    expect(achievedDepth(at(16))).toBe(16);
  });

  it("returns null for the shapes that are not a completed search", () => {
    // depth 0 is BOTH the client-timeout sentinel and the stamp on terminal
    // (checkmate/stalemate) positions. Neither is a search result.
    expect(achievedDepth(at(0))).toBeNull();
    expect(achievedDepth({ lines: [] })).toBeNull();
    expect(achievedDepth({})).toBeNull();
    expect(achievedDepth(undefined)).toBeNull();
    expect(achievedDepth(null)).toBeNull();
  });
});

describe("requestedDepth", () => {
  it("reads what the sweep asked for", () => {
    expect(requestedDepth({ settings: { depth: 16 } })).toBe(16);
  });

  it("is null when the payload declares nothing", () => {
    // The partial `{positions}` payload the client sends mid-sweep, and every
    // hand-authored fixture.
    expect(requestedDepth({})).toBeNull();
    expect(requestedDepth(undefined)).toBeNull();
    expect(requestedDepth({ settings: { depth: 0 } })).toBeNull();
  });
});

describe("isComparableDepthPair", () => {
  it("admits two searches of the same size", () => {
    expect(isComparableDepthPair(at(16), at(16), 16)).toBe(true);
    // Uniformly shallow is a valid analysis: the rule is about disagreement,
    // not about the depth being low.
    expect(isComparableDepthPair(at(12), at(12), 12)).toBe(true);
  });

  it("refuses a pair where one side is the shallower retry", () => {
    expect(isComparableDepthPair(at(16), at(12), 16)).toBe(false);
    expect(isComparableDepthPair(at(12), at(16), 16)).toBe(false);
  });

  it("refuses anything that is not two real searches", () => {
    expect(isComparableDepthPair(at(16), at(0), 16)).toBe(false);
    expect(isComparableDepthPair(undefined, at(16), 16)).toBe(false);
  });

  it("admits differing depths when no request was declared", () => {
    // Deliberate: "shallow" is only meaningful against a depth that was asked
    // for, and inferring one from the data would be the same substitution this
    // programme exists to remove. See the module doc.
    expect(isComparableDepthPair(at(16), at(12), null)).toBe(true);
  });
});

describe("shallowSearchPlies", () => {
  it("names the plies the engine did not finish at full depth", () => {
    const r = shallowSearchPlies([at(16), at(12), at(16), at(8)]);
    expect(r.plies).toEqual([1, 3]);
    expect(r.maxDepth).toBe(16);
    expect(r.minDepth).toBe(8);
  });

  it("reports nothing for a clean uniform sweep", () => {
    const r = shallowSearchPlies([at(16), at(16), at(16)]);
    expect(r.plies).toEqual([]);
    expect(r.minDepth).toBe(16);
  });

  it("ignores sentinels rather than counting them as shallow", () => {
    // A sentinel is already refused by every scan on its own terms; counting
    // it here would double-report one problem as two.
    const r = shallowSearchPlies([at(16), at(0), at(16)]);
    expect(r.plies).toEqual([]);
    expect(r.minDepth).toBe(16);
  });

  it("survives junk (gameEval is z.any() at the request boundary)", () => {
    expect(shallowSearchPlies(undefined)).toEqual({ plies: [], maxDepth: 0, minDepth: 0 });
    expect(shallowSearchPlies([])).toEqual({ plies: [], maxDepth: 0, minDepth: 0 });
    expect(shallowSearchPlies([null, {}, at(0)])).toEqual({ plies: [], maxDepth: 0, minDepth: 0 });
  });
});
