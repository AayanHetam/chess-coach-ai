import { describe, it, expect } from "vitest";
import { Chess, type Move } from "chess.js";
import {
  findAllMoveRefs,
  findPlyForMoveRef,
  plyBeforeMove,
  buildRecommendedPreview,
  playSanOnFen,
  resolveMoveRef,
} from "@/components/preview-analysis/coachMoveRefs";

/**
 * Regression suite for the founder-reported bug (2026-08-10): the green
 * "recommended move" links in coach responses did nothing when clicked.
 *
 * Why no full render test: the repo's vitest setup is node-env (no jsdom /
 * emotion plumbing — see InlinePuzzleCoach.test.tsx for the precedent), so
 * we pin the exact logic chain a click runs through:
 *
 *   coach text → findAllMoveRefs (green detection)
 *             → findPlyForMoveRef returns null (move NOT in the game)
 *             → plyBeforeMove (anchor ply the alternative branches from)
 *             → buildRecommendedPreview (replay + play → board position)
 *
 * The old handler stopped at setCurrentPly(anchor) — a no-op when the user
 * was already on the mistake ply. The fix requires buildRecommendedPreview
 * to produce the ACTUAL post-move position for the board.
 */

// Short real game: 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O
function sampleMoves(): Move[] {
  const g = new Chess();
  for (const san of ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O"]) {
    g.move(san);
  }
  return g.history({ verbose: true }) as Move[];
}

describe("findAllMoveRefs — green (recommended) detection", () => {
  it("marks a move as recommended when preceded by 'best was'", () => {
    const refs = findAllMoveRefs("You played 3.Bb5, but best was 3.Bc4 here.");
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ san: "Bb5", recommended: false });
    expect(refs[1]).toMatchObject({ san: "Bc4", recommended: true, moveNumber: 3, isBlack: false });
  });

  it("parses black refs (3...Nf6) and forceRecommended overrides context", () => {
    const refs = findAllMoveRefs("3...Nf6 develops.", true);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ san: "Nf6", isBlack: true, recommended: true });
  });
});

describe("findPlyForMoveRef", () => {
  const moves = sampleMoves();

  it("resolves a played move to its 1-indexed ply", () => {
    expect(findPlyForMoveRef(moves, 2, false, "Nf3")).toBe(3);
    expect(findPlyForMoveRef(moves, 2, true, "Nc6")).toBe(4);
  });

  it("returns null for a recommended alternative that was never played", () => {
    expect(findPlyForMoveRef(moves, 3, false, "Bc4")).toBeNull();
  });
});

describe("plyBeforeMove", () => {
  it("gives the half-move count of the position the move is played FROM", () => {
    expect(plyBeforeMove(1, false)).toBe(0); // before 1.e4
    expect(plyBeforeMove(1, true)).toBe(1); // before 1...e5
    expect(plyBeforeMove(3, false)).toBe(4); // before 3.Bb5
    expect(plyBeforeMove(3, true)).toBe(5); // before 3...a6
  });
});

describe("buildRecommendedPreview — the click must load the line", () => {
  const moves = sampleMoves();

  it("replays to the anchor and plays the recommended alternative", () => {
    // Coach: "best was 3.Bc4" (game had 3.Bb5)
    const anchor = plyBeforeMove(3, false);
    const preview = buildRecommendedPreview(moves, anchor, "Bc4");
    expect(preview).not.toBeNull();
    expect(preview!.anchorPly).toBe(4);
    expect(preview!.san).toBe("Bc4");
    expect(preview!.from).toBe("f1");
    expect(preview!.to).toBe("c4");
    // The board position must be the mainline-through-2...Nc6 + Bc4:
    const expected = new Chess();
    for (const san of ["e4", "e5", "Nf3", "Nc6", "Bc4"]) expected.move(san);
    expect(preview!.fen).toBe(expected.fen());
  });

  it("end-to-end: green ref in coach prose produces a board position that differs from the mainline", () => {
    const text = "3.Bb5 was inaccurate — best was 3.Bc4 targeting f7.";
    const ref = findAllMoveRefs(text).find((r) => r.recommended)!;
    expect(ref.san).toBe("Bc4");
    // Not in the game → matchedPly null → anchor path (the green-link path)
    expect(findPlyForMoveRef(moves, ref.moveNumber, ref.isBlack, ref.san)).toBeNull();
    const anchor = plyBeforeMove(ref.moveNumber, ref.isBlack);
    const preview = buildRecommendedPreview(moves, anchor, ref.san)!;
    const mainlineAtAnchor = new Chess();
    for (let i = 0; i < anchor; i++) mainlineAtAnchor.move(moves[i].san);
    // The regression: the old handler left the board on mainlineAtAnchor
    // (or wherever it already was). The preview must be a NEW position.
    expect(preview.fen).not.toBe(mainlineAtAnchor.fen());
  });

  it("corrects a wrong-color coach ref via the ±1/±2 window", () => {
    // Coach writes "3...Bc4" (attributing White's move to Black). Anchor 5
    // is Black to move → Bc4 illegal → the +1 probe lands on anchor 6
    // (after 3...a6, White to move) where the b5-bishop can retreat-...
    // er, step to c4. The click still loads a real position with Bc4
    // played instead of dying.
    const preview = buildRecommendedPreview(moves, plyBeforeMove(3, true), "Bc4");
    expect(preview).not.toBeNull();
    expect(preview!.anchorPly).toBe(6);
    expect(preview!.san).toBe("Bc4");
    const expected = new Chess();
    for (const san of ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bc4"]) {
      expected.move(san);
    }
    expect(preview!.fen).toBe(expected.fen());
  });

  it("returns null for garbage SAN instead of throwing", () => {
    expect(buildRecommendedPreview(moves, 4, "Qz9")).toBeNull();
    expect(buildRecommendedPreview(moves, 999, "Bc4")).toBeNull();
  });
});

describe("resolveMoveRef — a recommended move that the game played LATER is still a hypothetical (founder bug 2026-09-05)", () => {
  // Fixture 07's game: 7...Qxc1 was played by BLACK at ply 14, and the coach
  // recommends 8.Qxc1 for WHITE (expected ply 15, where Nc7+ was played).
  // The old ±2 window matched Black's Qxc1 at ply 14 and the "you should
  // have played 8.Qxc1" link jumped to the opponent's move.
  function fixture07(): Move[] {
    const g = new Chess();
    for (const san of "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8 Nxa8 Qxd1+ Kxd1 e5".split(" ")) g.move(san);
    return g.history({ verbose: true }) as Move[];
  }
  const moves = fixture07();

  it("branches off at the stated move instead of jumping to the later occurrence", () => {
    // the old resolver's answer, pinned so the regression is visible
    expect(findPlyForMoveRef(moves, 8, false, "Qxc1")).toBe(14);
    const res = resolveMoveRef(moves, { moveNumber: 8, isBlack: false, san: "Qxc1", recommended: true });
    expect(res).toEqual({ kind: "hypothetical", anchorPly: 14, san: "Qxc1" });
    // and the click lands on the position AFTER 8.Qxc1, not on 7...Qxc1
    const preview = buildRecommendedPreview(moves, 14, "Qxc1")!;
    expect(preview.anchorPly).toBe(14);
    const expected = new Chess();
    for (const san of "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Qxc1".split(" ")) expected.move(san);
    expect(preview.fen).toBe(expected.fen());
  });

  it("legality at the stated position decides, even without 'should have' wording", () => {
    const res = resolveMoveRef(moves, { moveNumber: 8, isBlack: false, san: "Qxc1", recommended: false });
    expect(res).toEqual({ kind: "hypothetical", anchorPly: 14, san: "Qxc1" });
  });

  it("a move played exactly where the coach says is a jump", () => {
    expect(resolveMoveRef(moves, { moveNumber: 8, isBlack: false, san: "Nc7+", recommended: false })).toEqual({ kind: "played", ply: 15 });
    expect(resolveMoveRef(moves, { moveNumber: 7, isBlack: true, san: "Qxc1", recommended: false })).toEqual({ kind: "played", ply: 14 });
  });

  it("a genuine typo — illegal at the stated position — still falls back to the nearby played move", () => {
    // "9.Nxa8" is White's 9th move (ply 17). The coach writes "8.Nxa8": at ply 15's position Nxa8 is illegal (knight on b5), so the window finds ply 17.
    expect(resolveMoveRef(moves, { moveNumber: 8, isBlack: false, san: "Nxa8", recommended: false })).toEqual({ kind: "played", ply: 17 });
  });

  it("an unplayable, unrecommended reference is not a link", () => {
    expect(resolveMoveRef(moves, { moveNumber: 3, isBlack: false, san: "Qh5", recommended: false })).toBeNull();
    expect(resolveMoveRef(moves, { moveNumber: 30, isBlack: false, san: "Qh5", recommended: true })).toEqual({ kind: "hypothetical", anchorPly: 58, san: "Qh5" });
  });
});

describe("playSanOnFen — chained PV continuation clicks", () => {
  it("plays a legal SAN on an arbitrary displayed position", () => {
    const g = new Chess();
    for (const san of ["e4", "e5", "Nf3", "Nc6", "Bc4"]) g.move(san);
    const next = playSanOnFen(g.fen(), "Nf6");
    expect(next).not.toBeNull();
    g.move("Nf6");
    expect(next!.fen).toBe(g.fen());
  });

  it("returns null on an illegal move", () => {
    expect(playSanOnFen(new Chess().fen(), "Ke2")).toBeNull();
  });
});
