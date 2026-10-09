import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore } from "jotai";
import { DEFAULT_EASE_FACTOR } from "@/lib/spacedRepetition";
import { puzzleThemeSrsAtom } from "@/lib/curriculum/puzzleThemeSrs";
import {
  CAUSE_SRS_STORAGE_KEY,
  DRILL_CAUSE_STORAGE_KEY,
  causeCardId,
  causeSrsAtom,
  drillCauseAtom,
  reviewCause,
} from "../causeSrs";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe("reviewCause", () => {
  it("names a card by its cause", () => {
    expect(causeCardId("hanging")).toBe("cause:hanging");
    expect(causeCardId("guess")).toBe("cause:guess");
  });

  it("a solve is quality 4 through SM-2: a new card is due in a day", () => {
    const cards = reviewCause({}, "hanging", true, NOW);
    expect(Object.keys(cards)).toEqual(["cause:hanging"]);
    expect(cards["cause:hanging"]).toMatchObject({
      themeId: "cause:hanging",
      attempts: 1,
      interval: 1,
      lastReviewed: NOW,
      nextReview: NOW + DAY,
    });
    // Quality 4 leaves the ease where it was.
    expect(cards["cause:hanging"].easeFactor).toBeCloseTo(
      DEFAULT_EASE_FACTOR,
      5
    );
  });

  it("a miss is quality 1: the interval starts over and the ease drops", () => {
    let cards = reviewCause({}, "fork", true, NOW);
    cards = reviewCause(cards, "fork", true, NOW + DAY);
    expect(cards["cause:fork"].interval).toBeGreaterThan(1);
    cards = reviewCause(cards, "fork", false, NOW + 2 * DAY);
    expect(cards["cause:fork"]).toMatchObject({
      attempts: 3,
      interval: 1,
      nextReview: NOW + 3 * DAY,
    });
    expect(cards["cause:fork"].easeFactor).toBeLessThan(DEFAULT_EASE_FACTOR);
  });

  it("touches only its own card", () => {
    const before = reviewCause({}, "check", false, NOW);
    const after = reviewCause(before, "calculation", true, NOW);
    expect(after["cause:check"]).toBe(before["cause:check"]);
    expect(Object.keys(after).sort()).toEqual([
      "cause:calculation",
      "cause:check",
    ]);
  });
});

describe("the cause atoms", () => {
  const store: Record<string, string> = {};
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    const localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = String(v);
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage },
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("live under their own keys, never the theme cards' that /plan reads and /api/progress syncs", () => {
    expect(CAUSE_SRS_STORAGE_KEY).toBe("chessMastiCauseSrs");
    expect(DRILL_CAUSE_STORAGE_KEY).toBe("chessMastiDrillCause");
    const jar = createStore();
    jar.set(causeSrsAtom, (c) => reviewCause(c, "hanging", false, NOW));
    jar.set(drillCauseAtom, { cause: "hanging", ids: ["g-1-14"] });
    expect(Object.keys(store).sort()).toEqual([
      "chessMastiCauseSrs",
      "chessMastiDrillCause",
    ]);
    expect(JSON.parse(store.chessMastiCauseSrs)).toHaveProperty(
      "cause:hanging.attempts",
      1
    );
    expect(jar.get(puzzleThemeSrsAtom)).toEqual({});
    expect(store).not.toHaveProperty("chessMastiPuzzleThemeSrs");
  });
});
