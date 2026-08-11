import { describe, expect, it } from "vitest";

import { maskMoveNumberDots, splitLineSentences, splitProseSentences } from "@/lib/contract/sentences";

/**
 * These cases are lifted verbatim from the sentences that BROKE on the
 * 2026-08-10 CI-4 verification run — the naive split fragmented them, the
 * ladder then excised a fragment, and the shipped card carried a stub.
 */
describe("chess-aware sentence splitting", () => {
  it("does not split on a white move number", () => {
    expect(splitProseSentences("Idea: White pushed 8. e5 hoping to attack your Nf6.")).toEqual([
      "Idea: White pushed 8. e5 hoping to attack your Nf6.",
    ]);
  });

  it("does not split on a black move ellipsis", () => {
    expect(
      splitProseSentences("Problem: After 5... exd4, White recaptures and gets a strong centre."),
    ).toEqual(["Problem: After 5... exd4, White recaptures and gets a strong centre."]);
  });

  it("keeps a multi-move quoted line in one sentence", () => {
    const s = "The engine line shows 8... Ba5+ 9. Bd2 Bb4 [F:I1.pv0] — the bishop harasses.";
    expect(splitProseSentences(s)).toEqual([s]);
  });

  it("still splits genuine sentence ends after a number", () => {
    expect(splitProseSentences("This is a forced mate in 4. The position is winning.")).toEqual([
      "This is a forced mate in 4.",
      "The position is winning.",
    ]);
  });

  it("still splits ordinary prose", () => {
    expect(splitProseSentences("You wanted activity. The knight had other ideas.")).toEqual([
      "You wanted activity.",
      "The knight had other ideas.",
    ]);
  });

  it("splits on newlines but splitLineSentences does not", () => {
    expect(splitProseSentences("One line\nSecond line")).toEqual(["One line", "Second line"]);
    expect(splitLineSentences("One line\nSecond line")).toEqual(["One line\nSecond line"]);
  });

  it("masking is length-preserving (offsets into the text survive)", () => {
    const s = "After 12. Qxf7+ Kd8 31... h5 the game turns.";
    expect(maskMoveNumberDots(s)).toHaveLength(s.length);
  });

  it("round-trips text unchanged", () => {
    const s = "Idea: 22. Rfd1 is natural. Problem: 22... h6 wins a tempo. Outcome: level.";
    expect(splitProseSentences(s).join(" ")).toBe(s);
  });

  it("handles castling and capture notation as SAN starters", () => {
    expect(splitProseSentences("The engine wants 14. O-O first.")).toEqual([
      "The engine wants 14. O-O first.",
    ]);
    expect(splitProseSentences("The engine wants 14. Nxe5 first.")).toEqual([
      "The engine wants 14. Nxe5 first.",
    ]);
  });
});
