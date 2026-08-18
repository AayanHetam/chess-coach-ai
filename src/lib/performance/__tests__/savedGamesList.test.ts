import { describe, expect, it } from "vitest";
import {
  describeSavedGamesList,
  SAVED_GAMES_LIMIT,
} from "@/lib/performance/savedGamesList";

describe("describeSavedGamesList — how many rows", () => {
  it("shows everything when the library fits", () => {
    const s = describeSavedGamesList(4, false);
    expect(s.visibleCount).toBe(4);
    expect(s.hiddenCount).toBe(0);
    expect(s.toggleLabel).toBeNull();
  });

  it("caps at the limit once the library is bigger", () => {
    const s = describeSavedGamesList(60, false);
    expect(s.visibleCount).toBe(SAVED_GAMES_LIMIT);
    expect(s.hiddenCount).toBe(50);
  });

  it("shows everything when expanded", () => {
    const s = describeSavedGamesList(60, true);
    expect(s.visibleCount).toBe(60);
    expect(s.hiddenCount).toBe(0);
  });

  it("does not offer a toggle at exactly the limit", () => {
    // 10 saved games are all visible; a "Show 0 older" would be nonsense.
    expect(
      describeSavedGamesList(SAVED_GAMES_LIMIT, false).toggleLabel
    ).toBeNull();
    expect(
      describeSavedGamesList(SAVED_GAMES_LIMIT + 1, false).toggleLabel
    ).not.toBeNull();
  });

  it("handles an empty library without producing negatives", () => {
    const s = describeSavedGamesList(0, false);
    expect(s.visibleCount).toBe(0);
    expect(s.hiddenCount).toBe(0);
    expect(s.subtitle).toBeUndefined();
    expect(s.toggleLabel).toBeNull();
  });

  it("survives a nonsense total rather than rendering NaN rows", () => {
    expect(describeSavedGamesList(Number.NaN, false).visibleCount).toBe(0);
    expect(describeSavedGamesList(-5, false).visibleCount).toBe(0);
  });
});

describe("describeSavedGamesList — wording", () => {
  it("pluralises 'analysis' correctly", () => {
    // The bug this exists to prevent: a naive + "es" gives "analysises".
    expect(
      describeSavedGamesList(SAVED_GAMES_LIMIT + 1, false).toggleLabel
    ).toBe("Show 1 older analysis");
    expect(
      describeSavedGamesList(SAVED_GAMES_LIMIT + 3, false).toggleLabel
    ).toBe("Show 3 older analyses");
  });

  it("names both numbers when the list is capped", () => {
    // "10 saved games" for someone holding 60 misreports their own library.
    expect(describeSavedGamesList(60, false).subtitle).toBe(
      "Showing your 10 most recent of 60 saved games"
    );
  });

  it("states the plain total when nothing is hidden", () => {
    expect(describeSavedGamesList(3, false).subtitle).toBe(
      "3 saved games, coach conversations included"
    );
    expect(describeSavedGamesList(1, false).subtitle).toBe(
      "1 saved game, coach conversations included"
    );
  });

  it("offers a way back once expanded", () => {
    // The bug this exists to prevent: keying the toggle off hiddenCount makes
    // it vanish while expanded, with no way to collapse again.
    expect(describeSavedGamesList(60, true).toggleLabel).toBe("Show fewer");
  });

  it("drops the toggle when deletions shrink the list to the limit", () => {
    // Expanded, then the user deletes down to 10. A lingering "Show fewer"
    // would hide nothing.
    expect(
      describeSavedGamesList(SAVED_GAMES_LIMIT, true).toggleLabel
    ).toBeNull();
  });
});
