import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";

import {
  fenAtPly,
  stepBackPreview,
  type ExplorationStep,
} from "../exploration";

const GAME = ["e4", "c5", "Nf3", "d6", "d4"].map((san) => ({ san }));

function after(sans: string[], root?: string): string {
  const g = root ? new Chess(root) : new Chess();
  sans.forEach((s) => g.move(s));
  return g.fen();
}

describe("fenAtPly", () => {
  it("replays the mainline to a half-move count", () => {
    expect(fenAtPly(GAME, 0)).toBe(new Chess().fen());
    expect(fenAtPly(GAME, 3)).toBe(after(["e4", "c5", "Nf3"]));
    expect(fenAtPly(GAME, 99)).toBe(after(["e4", "c5", "Nf3", "d6", "d4"]));
  });

  it("starts from the game's own root when it was loaded from a FEN", () => {
    const root = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
    expect(fenAtPly([{ san: "Nf3" }], 1, root)).toBe(after(["Nf3"], root));
  });
});

describe("stepBackPreview", () => {
  // Left the mainline after 1.e4 c5 (ply 2) and played 2.Nc3 Nc6.
  const twoDeep: ExplorationStep = {
    fen: after(["e4", "c5", "Nc3", "Nc6"]),
    from: "b8",
    to: "c6",
    san: "Nc6",
    path: ["Nc3", "Nc6"],
    anchorPly: 2,
  };

  it("takes the last explored move back and keeps the rest of the branch", () => {
    const shorter = stepBackPreview(twoDeep, GAME)!;
    expect(shorter.path).toEqual(["Nc3"]);
    expect(shorter.san).toBe("Nc3");
    expect(shorter.from).toBe("b1");
    expect(shorter.to).toBe("c3");
    expect(shorter.fen).toBe(after(["e4", "c5", "Nc3"]));
    expect(shorter.anchorPly).toBe(2);
  });

  it("is null once the branch is one move long: the next step back is the anchor", () => {
    const oneDeep = stepBackPreview(twoDeep, GAME)!;
    expect(stepBackPreview(oneDeep, GAME)).toBeNull();
  });

  it("is null when the kept part of the branch can no longer be replayed", () => {
    // The move taken back is never replayed; one that stays in the path is.
    expect(
      stepBackPreview({ ...twoDeep, path: ["Kxe8", "Nc6"] }, GAME)
    ).toBeNull();
  });
});
