import { describe, it, expect } from "vitest";
import {
  cpToBand,
  bandDistance,
  bandIsAdjacent,
  boundaryBetween,
  isWithinTolerance,
  evalToCp,
  MATE_CP_SENTINEL,
} from "../../validators/qualitativeBands";

describe("cpToBand", () => {
  it("respects band boundaries (half-open convention)", () => {
    expect(cpToBand(-1000)).toBe("losing");
    expect(cpToBand(-301)).toBe("losing");
    expect(cpToBand(-300)).toBe("losing");
    expect(cpToBand(-299)).toBe("much_worse");
    expect(cpToBand(-150)).toBe("much_worse");
    expect(cpToBand(-149)).toBe("slightly_worse");
    expect(cpToBand(-50)).toBe("slightly_worse");
    expect(cpToBand(-49)).toBe("equal");
    expect(cpToBand(0)).toBe("equal");
    expect(cpToBand(49)).toBe("equal");
    expect(cpToBand(50)).toBe("slightly_better");
    expect(cpToBand(149)).toBe("slightly_better");
    expect(cpToBand(150)).toBe("much_better");
    expect(cpToBand(299)).toBe("much_better");
    expect(cpToBand(300)).toBe("winning");
    expect(cpToBand(1000)).toBe("winning");
  });
});

describe("bandDistance", () => {
  it("is symmetric and bounded in [0, 6]", () => {
    expect(bandDistance("equal", "equal")).toBe(0);
    expect(bandDistance("losing", "winning")).toBe(6);
    expect(bandDistance("winning", "losing")).toBe(6);
    expect(bandDistance("equal", "slightly_better")).toBe(1);
    expect(bandDistance("slightly_better", "equal")).toBe(1);
  });
});

describe("bandIsAdjacent", () => {
  it("returns true for neighboring bands, false otherwise", () => {
    expect(bandIsAdjacent("equal", "slightly_better")).toBe(true);
    expect(bandIsAdjacent("equal", "slightly_worse")).toBe(true);
    expect(bandIsAdjacent("equal", "much_better")).toBe(false);
    expect(bandIsAdjacent("losing", "winning")).toBe(false);
    expect(bandIsAdjacent("equal", "equal")).toBe(false);
  });
});

describe("boundaryBetween", () => {
  it("returns the cp boundary between adjacent bands", () => {
    expect(boundaryBetween("equal", "slightly_better")).toBe(50);
    expect(boundaryBetween("slightly_better", "equal")).toBe(50);
    expect(boundaryBetween("losing", "much_worse")).toBe(-300);
    expect(boundaryBetween("much_better", "winning")).toBe(300);
  });

  it("returns null for non-adjacent bands", () => {
    expect(boundaryBetween("equal", "winning")).toBeNull();
    expect(boundaryBetween("losing", "slightly_better")).toBeNull();
  });
});

describe("isWithinTolerance", () => {
  it("same band always tolerated", () => {
    expect(isWithinTolerance(0, "equal", "equal")).toBe(true);
    expect(isWithinTolerance(500, "winning", "winning")).toBe(true);
  });

  it("adjacent band tolerated when stockfish is within 20 cp of boundary", () => {
    expect(isWithinTolerance(55, "equal", "slightly_better")).toBe(true);
    expect(isWithinTolerance(35, "slightly_better", "equal")).toBe(true);
    expect(isWithinTolerance(50, "slightly_better", "equal")).toBe(true);
    expect(isWithinTolerance(70, "slightly_better", "equal")).toBe(true);
  });

  it("adjacent band NOT tolerated when stockfish is >40 cp from boundary", () => {
    // Updated 2026-05-30 — ADJACENT_BAND_TOLERANCE_CP widened 20 → 40 to
    // forgive colloquial coach prose (e.g. +200 cp cited as "winning"
    // — adjacent to much_better at 300 cp boundary, 100 cp out of band).
    // Cases here remain out-of-tolerance even at the new wider threshold:
    //   |100 - 50| = 50 > 40  → still fires
    //   |15 - 50|  = 35 < 40  → NOW within tolerance (would have fired
    //                             at 20 cp threshold; intentional widening)
    expect(isWithinTolerance(100, "equal", "slightly_better")).toBe(false);
    expect(isWithinTolerance(95, "equal", "slightly_better")).toBe(false);
  });

  it("adjacent band tolerated when stockfish is ≤40 cp from boundary (post-2026-05-30 widening)", () => {
    // The colloquial-coach-prose cases the widening was sized to forgive:
    //   stockfish +200 (much_better, 100 cp deep into band), coach says
    //     "winning" — |200 - 300| = 100 > 40 → still fires (genuinely
    //     out-of-band; coach is overreaching)
    //   stockfish +15 (equal, 35 cp from slightly_better boundary at 50),
    //     coach says "slightly_better" — |15 - 50| = 35 ≤ 40 → forgive
    expect(isWithinTolerance(15, "slightly_better", "equal")).toBe(true);
    expect(isWithinTolerance(85, "equal", "slightly_better")).toBe(true);
  });

  it("non-adjacent bands never tolerated", () => {
    expect(isWithinTolerance(0, "equal", "winning")).toBe(false);
    expect(isWithinTolerance(0, "equal", "much_better")).toBe(false);
  });

  it("custom tolerance argument", () => {
    expect(isWithinTolerance(100, "equal", "slightly_better", 60)).toBe(true);
    expect(isWithinTolerance(100, "equal", "slightly_better", 40)).toBe(false);
  });
});

describe("evalToCp", () => {
  it("returns cp directly when no mate", () => {
    expect(evalToCp({ cp: 150 })).toBe(150);
    expect(evalToCp({ cp: -200 })).toBe(-200);
  });

  it("returns 0 when neither cp nor mate", () => {
    expect(evalToCp({})).toBe(0);
  });

  it("saturates to ±MATE_CP_SENTINEL on mate", () => {
    expect(evalToCp({ mate: 5 })).toBe(MATE_CP_SENTINEL);
    expect(evalToCp({ mate: -8 })).toBe(-MATE_CP_SENTINEL);
    expect(evalToCp({ mate: 1, cp: 9999 })).toBe(MATE_CP_SENTINEL);
  });
});
