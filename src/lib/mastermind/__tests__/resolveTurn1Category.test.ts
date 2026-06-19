import { describe, it, expect } from "vitest";
import { resolveTurn1Category } from "../routeHelpers";

describe("resolveTurn1Category — turn-1 game reviews must not default to meta_motivational", () => {
  it("forces game_review when there is a game but no user question", () => {
    expect(resolveTurn1Category("", ["e4", "e5", "Nf3"])).toBe("game_review");
    expect(resolveTurn1Category(undefined, ["e4", "e5"])).toBe("game_review");
    expect(resolveTurn1Category("   ", ["e4"])).toBe("game_review"); // whitespace-only = no question
  });

  it("defers to the classifier (returns null) when there IS a user question", () => {
    expect(resolveTurn1Category("why did I lose?", ["e4", "e5"])).toBeNull();
  });

  it("defers to the classifier when there is no game to review", () => {
    expect(resolveTurn1Category("", [])).toBeNull();
    expect(resolveTurn1Category("", undefined)).toBeNull();
  });
});
