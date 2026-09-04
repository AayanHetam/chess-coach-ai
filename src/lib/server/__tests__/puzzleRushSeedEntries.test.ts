// Placeholder rows shown while the board is too empty to read. They are not
// real players, so the things worth pinning are the ones that keep them from
// behaving like real data: they never reach storage, they never collide with a
// real handle, they never survive the cutoff, and a real player's rank counts
// them — because the player can see them.

import { describe, expect, it } from "vitest";
import {
  SEED_ENTRIES,
  SEED_UNTIL_REAL_ENTRIES,
  seedEntriesAbove,
  seedEntriesFor,
  withSeedEntries,
} from "../puzzleRushSeedEntries";

const real = (handle: string, score: number) => ({ handle, score });

describe("seedEntriesFor", () => {
  it("omits a mode the placeholder has no result in", () => {
    // A zero means no result, exactly as it does for a real account.
    const handles = seedEntriesFor("fiveMin").map((e) => e.handle);
    expect(handles).not.toContain("pawnstorm88");
    expect(seedEntriesFor("fiveMin").every((e) => e.score > 0)).toBe(true);
  });

  it("keeps every score inside a believable range", () => {
    for (const mode of ["threeMin", "fiveMin", "survivalBest"] as const) {
      for (const entry of seedEntriesFor(mode)) {
        expect(entry.score).toBeGreaterThan(0);
        expect(entry.score).toBeLessThanOrEqual(40);
      }
    }
  });

  it("spans low scores as well as high ones", () => {
    // A board of uniformly strong results tells a beginner they are last.
    const scores = seedEntriesFor("threeMin").map((e) => e.score);
    expect(Math.min(...scores)).toBeLessThanOrEqual(5);
  });

  it("uses a distinct handle per row", () => {
    const handles = SEED_ENTRIES.map((e) => e.handle);
    expect(new Set(handles).size).toBe(handles.length);
  });
});

describe("withSeedEntries", () => {
  it("fills a nearly empty board, ordered with the real rows", () => {
    const merged = withSeedEntries([real("Zach", 5)], "threeMin", 1, 50);
    expect(merged.length).toBeGreaterThan(1);
    const scores = merged.map((e) => e.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(merged).toContainEqual(real("Zach", 5));
  });

  it("stops entirely once the board has enough real players", () => {
    const only = [real("Zach", 5)];
    expect(
      withSeedEntries(only, "threeMin", SEED_UNTIL_REAL_ENTRIES, 50)
    ).toEqual(only);
  });

  it("keeps seeding right up to the cutoff", () => {
    const merged = withSeedEntries(
      [real("Zach", 5)],
      "threeMin",
      SEED_UNTIL_REAL_ENTRIES - 1,
      50
    );
    expect(merged.length).toBeGreaterThan(1);
  });

  it("yields to a real account that registered the same handle", () => {
    // Handles are unique per account, so the real player owns the name. Two
    // identical rows would also make the client highlight the wrong one.
    const taken = SEED_ENTRIES[0].handle;
    const merged = withSeedEntries([real(taken, 2)], "threeMin", 1, 50);
    expect(merged.filter((e) => e.handle === taken)).toEqual([real(taken, 2)]);
  });

  it("honours the row limit", () => {
    expect(withSeedEntries([], "threeMin", 0, 3)).toHaveLength(3);
  });
});

describe("seedEntriesAbove", () => {
  it("counts the placeholders a player can actually see above them", () => {
    const above = seedEntriesAbove("threeMin", 15, 1);
    const expected = seedEntriesFor("threeMin").filter((e) => e.score > 15);
    expect(above).toBe(expected.length);
    expect(above).toBeGreaterThan(0);
  });

  it("counts none once the placeholders are gone", () => {
    expect(seedEntriesAbove("threeMin", 15, SEED_UNTIL_REAL_ENTRIES)).toBe(0);
  });

  it("counts none for a score above every placeholder", () => {
    expect(seedEntriesAbove("threeMin", 999, 1)).toBe(0);
  });
});
