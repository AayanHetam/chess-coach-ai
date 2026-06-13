import { describe, it, expect } from "vitest";
import { conceptKeysToThemes, enrollThemesIntoSrs } from "../playToLearn";
import { createCard, type ThemeSrsCard } from "../puzzleThemeSrs";

describe("conceptKeysToThemes", () => {
  it("maps direct camelCase concept keys to kebab curriculum themes", () => {
    expect(conceptKeysToThemes(["fork", "pin", "skewer"])).toEqual([
      "fork",
      "pin",
      "skewer",
    ]);
    expect(
      conceptKeysToThemes(["hangingPiece", "exposedKing", "discoveredAttack"])
    ).toEqual(["hanging-piece", "exposed-king", "discovered-attack"]);
  });

  it("maps fine-grained / mate variants onto the nearest curriculum theme", () => {
    expect(conceptKeysToThemes(["backRankMate"])).toEqual(["back-rank"]);
    expect(conceptKeysToThemes(["mateIn2", "smotheredMate", "mate"])).toEqual([
      "mating-attack",
    ]);
    expect(conceptKeysToThemes(["knightFork"])).toEqual(["fork"]);
    expect(conceptKeysToThemes(["bishopEndgame"])).toEqual(["endgame"]);
    expect(conceptKeysToThemes(["xRayAttack"])).toEqual(["x-ray"]);
  });

  it("dedupes and drops unmappable keys", () => {
    expect(conceptKeysToThemes(["fork", "knightFork", "pawnFork"])).toEqual([
      "fork",
    ]);
    expect(conceptKeysToThemes(["totallyUnknownConcept", ""])).toEqual([]);
  });
});

describe("enrollThemesIntoSrs", () => {
  it("seeds a fresh card for each new theme and is idempotent", () => {
    const now = 1_000_000;
    const empty: Record<string, ThemeSrsCard> = {};
    const after = enrollThemesIntoSrs(["fork", "pin"], empty, now);
    expect(Object.keys(after).sort()).toEqual(["fork", "pin"]);
    expect(after.fork.attempts).toBe(0); // brand-new card → due immediately

    // Existing card preserved; same reference returned when nothing changes.
    const withFork = { fork: createCard("fork") };
    const same = enrollThemesIntoSrs(["fork"], withFork, now);
    expect(same).toBe(withFork);
  });

  it("only adds the missing themes", () => {
    const now = 1_000_000;
    const existing = { fork: createCard("fork") };
    const after = enrollThemesIntoSrs(["fork", "back-rank"], existing, now);
    expect(Object.keys(after).sort()).toEqual(["back-rank", "fork"]);
    expect(after.fork).toBe(existing.fork); // untouched
  });
});
