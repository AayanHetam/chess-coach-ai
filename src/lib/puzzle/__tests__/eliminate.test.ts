import { describe, expect, it } from "vitest";
import {
  ELIMINATED_SQUARE_STYLE,
  eliminatedUnderlay,
  toggleEliminated,
} from "@/lib/puzzle/eliminate";

describe("toggleEliminated", () => {
  it("adds a square that isn't marked", () => {
    expect(Array.from(toggleEliminated(new Set(), "e4"))).toEqual(["e4"]);
  });

  it("removes a square that is marked", () => {
    expect(toggleEliminated(new Set(["e4"]), "e4").size).toBe(0);
  });

  it("leaves other marks alone", () => {
    const next = toggleEliminated(new Set(["e4", "d5"]), "e4");
    expect(Array.from(next)).toEqual(["d5"]);
  });

  it("does not mutate the input", () => {
    const before = new Set(["e4"]);
    toggleEliminated(before, "d5");
    expect(Array.from(before)).toEqual(["e4"]);
  });
});

describe("eliminatedUnderlay", () => {
  it("returns a style per marked square", () => {
    const styles = eliminatedUnderlay(new Set(["e4", "d5"]));
    expect(Object.keys(styles).sort()).toEqual(["d5", "e4"]);
    expect(styles.e4).toEqual(ELIMINATED_SQUARE_STYLE);
  });

  it("is empty for no marks", () => {
    expect(eliminatedUnderlay(new Set())).toEqual({});
  });

  it("drops malformed keys rather than painting phantom squares", () => {
    // The underlay seam is keyed by square name and shared with the coach's
    // highlights; a junk key would paint nothing visible but would pollute a
    // shared object other code merges into.
    const styles = eliminatedUnderlay(
      new Set(["e4", "z9", "", "e44", "E4", "a0"]),
    );
    expect(Object.keys(styles)).toEqual(["e4"]);
  });

  it("accepts every real square", () => {
    const all: string[] = [];
    for (const f of "abcdefgh") for (let r = 1; r <= 8; r++) all.push(`${f}${r}`);
    expect(Object.keys(eliminatedUnderlay(new Set(all)))).toHaveLength(64);
  });
});
