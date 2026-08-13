import { describe, it, expect } from "vitest";

import { pickDisplayEval, satisfiesRequest } from "../pickDisplayEval";
import type { PositionEval } from "@/types/eval";

const evalWith = (
  depth: number,
  lineCount: number,
  source?: "local" | "cloud"
): PositionEval => ({
  lines: Array.from({ length: lineCount }, (_, i) => ({
    pv: ["e2e4"],
    cp: 20 - i,
    depth,
    multiPv: i + 1,
  })),
  ...(source ? { source } : {}),
});

/**
 * Which evaluation the Lines tab shows.
 *
 * The bug: `saved` (the whole-game review pass) was preferred whenever it
 * existed, so asking the Lines tab for more depth than the review had run at
 * changed nothing — the shallower answer kept being served and the depth
 * control appeared to do nothing.
 */
describe("pickDisplayEval", () => {
  it("prefers the deeper answer over the review pass", () => {
    const saved = evalWith(16, 3);
    const live = evalWith(26, 3);
    // The regression: this returned `saved`, so d26 never reached the screen.
    expect(pickDisplayEval(saved, live)).toBe(live);
  });

  it("keeps the review pass when it is the deeper of the two", () => {
    const saved = evalWith(26, 3);
    const live = evalWith(14, 3);
    expect(pickDisplayEval(saved, live)).toBe(saved);
  });

  it("breaks a depth tie on the number of lines", () => {
    const saved = evalWith(20, 3);
    const live = evalWith(20, 5);
    expect(pickDisplayEval(saved, live)).toBe(live);
  });

  it("ignores an eval with no lines in it", () => {
    const empty: PositionEval = { lines: [] };
    const live = evalWith(12, 2);
    expect(pickDisplayEval(empty, live)).toBe(live);
    expect(pickDisplayEval(live, empty)).toBe(live);
    expect(pickDisplayEval(empty, empty)).toBeNull();
  });

  it("returns null when neither side has anything", () => {
    expect(pickDisplayEval(null, undefined)).toBeNull();
  });
});

describe("satisfiesRequest", () => {
  it("is false when the answer is shallower than asked", () => {
    expect(satisfiesRequest(evalWith(16, 3), 22, 3)).toBe(false);
  });

  it("is false when it is deep enough but has too few lines", () => {
    // Both dimensions matter: a depth-30 single line does not answer a
    // request for three candidate moves.
    expect(satisfiesRequest(evalWith(30, 1), 22, 3)).toBe(false);
  });

  it("is true once depth and line count are both met", () => {
    expect(satisfiesRequest(evalWith(22, 3), 22, 3)).toBe(true);
    expect(satisfiesRequest(evalWith(60, 5), 22, 3)).toBe(true);
  });

  it("is false for a missing or empty eval", () => {
    expect(satisfiesRequest(null, 10, 2)).toBe(false);
    expect(satisfiesRequest({ lines: [] }, 10, 2)).toBe(false);
  });
});

describe("eval provenance", () => {
  it("carries the source through selection, so the UI can name it", () => {
    // Without this the panel labels a Lichess cloud answer with the local
    // engine's name, which makes the engine selector a lie.
    const cloud = evalWith(60, 3, "cloud");
    const local = evalWith(18, 3, "local");
    expect(pickDisplayEval(local, cloud)?.source).toBe("cloud");
    expect(pickDisplayEval(cloud, local)?.source).toBe("cloud");
  });
});
