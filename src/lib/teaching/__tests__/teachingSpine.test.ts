import { describe, it, expect } from "vitest";
import { buildTeachingSpine } from "@/lib/teaching/teachingSpine";

/**
 * Phase-2 integration test: proves the GROUNDED TEACHING SPINE is (a) computed
 * from the before/after FENs of a real move and (b) emits the exact markdown
 * labels the enhanced-analysis route injects into the coach's CHESS
 * INTELLIGENCE LAYER context ("CONCEPT DELTA ...", "OPPONENT THREATS TO COUNT
 * ...").  featureDelta / threatTree have unit tests in isolation; this closes
 * the gap that nothing proved the spine wires them together into the string the
 * coach actually reads.
 */
describe("buildTeachingSpine", () => {
  // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 — White to move.
  const ITALIAN_BEFORE =
    "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
  // 4.Nxe5?? — hangs the knight; ...Nxe5 wins a piece for a pawn.
  const ITALIAN_AFTER_BLUNDER =
    "r1bqk1nr/pppp1ppp/2n5/2b1N3/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 0 4";
  // Best PV refutation of the blunder (Nxe5) in UCI.
  const REFUTATION_PV = ["c6e5"];

  it("renders a grounded concept-delta + threat spine for a real blunder", () => {
    const spine = buildTeachingSpine(
      ITALIAN_BEFORE,
      ITALIAN_AFTER_BLUNDER,
      REFUTATION_PV
    );

    // Both labelled sections the route splices into the coach context appear.
    expect(spine).toContain("CONCEPT DELTA (what the move changed):");
    expect(spine).toContain("OPPONENT THREATS TO COUNT:");

    // The delta is GROUNDED in the actual material swing the blunder caused:
    // Nxe5 loses ~2 points (knight for pawn) relative to White.
    expect(spine).toContain("material swung ~2 point(s) toward Black");

    // Deliberately terse: the CONCEPT DELTA line names at most 2 sub-deltas
    // (token/latency guard), so it never dumps the whole feature tree.
    const conceptLine = spine
      .split("\n")
      .find((l) => l.startsWith("CONCEPT DELTA"))!;
    expect(conceptLine.split(" | ").length).toBeLessThanOrEqual(2);

    // Threats section enumerates concrete SANs the opponent can play.
    const threatLine = spine
      .split("\n")
      .find((l) => l.startsWith("OPPONENT THREATS TO COUNT"))!;
    expect(threatLine).toMatch(/[NBRQK]?[a-h]?x?[a-h][1-8]/); // a SAN token
  });

  it("is sensitive to the after-FEN: same before, quiet after ⇒ no material-swing claim", () => {
    // 4.O-O (castles) — a quiet, non-losing move from the same position.
    const quietAfter =
      "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4";
    const quietSpine = buildTeachingSpine(ITALIAN_BEFORE, quietAfter, [
      "g8f6",
    ]);
    // The blunder claimed a 2-point swing; the quiet move must not.
    expect(quietSpine).not.toContain("material swung ~2 point(s)");
  });

  it("returns an empty string when there is nothing grounded to teach", () => {
    // Quiet king shuffle in a bare K vs K endgame: empty delta, no threats.
    const before = "8/8/4k3/8/8/4K3/8/8 w - - 0 1";
    const after = "8/8/4k3/8/8/3K4/8/8 b - - 1 1";
    expect(buildTeachingSpine(before, after, [])).toBe("");
  });

  it("enumerates mate/check threats from the before-FEN", () => {
    // Black to move under a Scholar's-mate-style attack: concrete checks exist.
    const fen =
      "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P2Q/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3";
    const spine = buildTeachingSpine(fen, fen, []);
    expect(spine).toContain("OPPONENT THREATS TO COUNT:");
    // At least one enumerated threat is tagged as a check or mate.
    expect(spine).toMatch(/\((check|MATE)\)/);
  });

  it("caps enumerated threats at three (terseness guard)", () => {
    const fen =
      "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P2Q/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3";
    const threatLine = buildTeachingSpine(fen, fen, [])
      .split("\n")
      .find((l) => l.startsWith("OPPONENT THREATS TO COUNT"))!;
    // Comma-separated list of at most 3 threats.
    const count = threatLine
      .replace("OPPONENT THREATS TO COUNT: ", "")
      .split(", ").length;
    expect(count).toBeLessThanOrEqual(3);
  });
});
