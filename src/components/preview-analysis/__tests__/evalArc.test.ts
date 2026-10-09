import { describe, expect, it } from "vitest";
import { decisiveLabel, decisiveMark } from "../evalArc";

const nc7 = { ply: 15, moveNumber: 8, color: "w" as const, san: "Nc7+" };

describe("decisiveMark", () => {
  it("sits where the arc puts the ply, and says what it is", () => {
    expect(decisiveMark(nc7, 21, { analyzing: false })).toEqual({
      ply: 15,
      percent: 75,
      label: "8. Nc7+",
      title: "8. Nc7+ decided the game",
      ariaLabel: "Go to 8. Nc7+, the move that decided the game",
    });
  });

  it("is not drawn while the sweep runs, for a short game, or off the arc", () => {
    expect(decisiveMark(nc7, 21, { analyzing: true })).toBeNull();
    expect(decisiveMark(nc7, 1, { analyzing: false })).toBeNull();
    expect(
      decisiveMark({ ...nc7, ply: 21 }, 21, { analyzing: false })
    ).toBeNull();
    expect(
      decisiveMark({ ...nc7, ply: 0 }, 21, { analyzing: false })
    ).toBeNull();
    expect(decisiveMark(null, 21, { analyzing: false })).toBeNull();
  });

  it("Black's move is written with three dots", () => {
    expect(
      decisiveLabel({ ply: 16, moveNumber: 8, color: "b", san: "Kd8" })
    ).toBe("8... Kd8");
  });
});
