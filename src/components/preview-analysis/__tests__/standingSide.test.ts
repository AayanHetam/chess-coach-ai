import { describe, expect, it, afterEach, vi } from "vitest";
import {
  moveNumberSide,
  readPerspectiveEcho,
  standingAfterEcho,
  standingStripWords,
  strippedSide,
  whatIfDefaultSide,
} from "../standingSide";
import { isPerspectiveEnabledPublic } from "@/lib/coach/questionPerspective";

const echo = (over: Record<string, unknown> = {}) => ({
  side: "b",
  source: "words",
  rule: "colour_view",
  version: "1",
  ...over,
});

describe("readPerspectiveEcho", () => {
  it("reads the route's echo", () => {
    expect(readPerspectiveEcho(echo())).toEqual(echo());
    expect(readPerspectiveEcho(echo({ yielded: "anchor" }))).toMatchObject({
      yielded: "anchor",
    });
  });
  it.each([
    undefined,
    null,
    "b",
    echo({ side: "black" }),
    echo({ source: "page" }),
    echo({ rule: 3 }),
    echo({ version: 1 }),
    echo({ yielded: "always" }),
  ])("%j is no echo", (raw) => {
    expect(readPerspectiveEcho(raw)).toBeNull();
  });
});

describe("standingAfterEcho", () => {
  const after = (
    e: Record<string, unknown> | null,
    standing: "w" | "b" | null
  ) => standingAfterEcho(e ? readPerspectiveEcho(e) : null, standing, "w");

  it("a view of the game from a side becomes the standing side", () => {
    expect(after(echo(), null)).toBe("b");
    expect(after(echo({ rule: "opponent_view" }), null)).toBe("b");
    expect(after(echo({ source: "history" }), null)).toBe("b");
  });

  it("the player's own side named ends a standing side", () => {
    expect(after(echo({ side: "w", rule: "player" }), "b")).toBe("w");
    expect(after(echo({ side: "w", rule: "colour_view" }), "b")).toBe("w");
  });

  it("every other reading is that turn's only", () => {
    for (const rule of [
      "opponent_thinking",
      "colour_moments",
      "opponent_decision",
      "colour_best",
      "colour_should",
      "field",
    ])
      expect(after(echo({ rule }), null), rule).toBeUndefined();
  });

  it("the field's own echo, a yield, an unknown version or no echo change nothing", () => {
    expect(
      after(echo({ source: "field", rule: "field" }), "b")
    ).toBeUndefined();
    expect(after(echo({ yielded: "words" }), null)).toBeUndefined();
    expect(after(echo({ version: "2" }), null)).toBeUndefined();
    expect(after(null, "b")).toBeUndefined();
  });

  it("no change for the side already standing, or the player's side with none", () => {
    expect(after(echo(), "b")).toBeUndefined();
    expect(after(echo({ side: "w", rule: "player" }), null)).toBeUndefined();
  });
});

describe("the sides the page reads", () => {
  it("the strip shows a standing side that is not the player's", () => {
    expect(strippedSide("b", "w")).toBe("b");
    expect(strippedSide("w", "w")).toBeNull();
    expect(strippedSide(null, "w")).toBeNull();
  });

  it("a bare move N follows a standing side, as the coach's field does", () => {
    expect(moveNumberSide("b", "w")).toBe("b");
    expect(moveNumberSide("w", "w")).toBe("w");
    expect(moveNumberSide(null, "b")).toBe("b");
  });

  it("the what-if tie-break: the words, else the standing side unless the words are the player's", () => {
    expect(
      whatIfDefaultSide(
        "from Black's side, what about move 8?",
        "w",
        true,
        null
      )
    ).toBe("b");
    expect(whatIfDefaultSide("what about move 8?", "w", true, "b")).toBe("b");
    expect(
      whatIfDefaultSide(
        "what if I had played move 8 differently?",
        "w",
        true,
        "b"
      )
    ).toBeUndefined();
    // The first person as the one asking keeps the standing side.
    expect(
      whatIfDefaultSide("Can we try Nd5 on move 4?", "w", true, "b")
    ).toBe("b");
    expect(
      whatIfDefaultSide("what about move 8?", "w", true, null)
    ).toBeUndefined();
    expect(
      whatIfDefaultSide("what about move 8?", "w", true, "w")
    ).toBeUndefined();
  });

  it("the strip's words", () => {
    expect(standingStripWords("b")).toEqual({
      label: "Black's side",
      short: "Black",
      text: "Answers are about Black's moves",
      back: "Back to my side",
    });
    // With the side unknown the page cannot say whose side "back" is.
    expect(standingStripWords("b", false).back).toBe("Back");
  });
});

describe("isPerspectiveEnabledPublic", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("off by default, the env either way", () => {
    vi.stubEnv("NEXT_PUBLIC_COACH_PERSPECTIVE", "");
    expect(isPerspectiveEnabledPublic()).toBe(false);
    for (const v of ["1", "on", "true", " TRUE "]) {
      vi.stubEnv("NEXT_PUBLIC_COACH_PERSPECTIVE", v);
      expect(isPerspectiveEnabledPublic(), v).toBe(true);
    }
    for (const v of ["0", "off", "false", "maybe"]) {
      vi.stubEnv("NEXT_PUBLIC_COACH_PERSPECTIVE", v);
      expect(isPerspectiveEnabledPublic(), v).toBe(false);
    }
  });
});
