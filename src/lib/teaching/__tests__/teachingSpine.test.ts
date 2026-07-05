import { describe, it, expect } from "vitest";
import {
  buildTeachingSpine,
  buildTimeoutTeachingMessage,
} from "@/lib/teaching/teachingSpine";
import type { MasterySummary } from "@/lib/teaching/relevanceFilter";

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

/**
 * Phase-2 TIMEOUT FALLBACK test. Proves that when the Mastermind pipeline times
 * out, the route can hand back a SHORT, engine-grounded coaching turn instead of
 * the dead "ask again" stub — and that it degrades to "" (⇒ the neutral stub)
 * when there is nothing grounded to teach. This is the deterministic
 * teaching-presence guard the P1 fallback-rate todo optimizes against; it needs
 * no LLM, so it composes with the truthfulness floor.
 */
describe("buildTimeoutTeachingMessage", () => {
  // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.Nxe5?? — the Italian knight-hang blunder.
  const ITALIAN_BEFORE =
    "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
  const ITALIAN_AFTER_BLUNDER =
    "r1bqk1nr/pppp1ppp/2n5/2b1N3/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 0 4";

  // 4.Ng5 — provokes the Missed Tactics / Piece Activity delta the relevance
  // filter re-weights (same fixture as relevanceFilter.test.ts).
  const NG5_BEFORE =
    "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
  const NG5_AFTER =
    "r1bqk1nr/pppp1ppp/2n5/2b1p1N1/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 5 4";

  function summaryWith(category: string): MasterySummary {
    return {
      gamesAnalyzed: 5,
      weaknesses: [{ category, severity: "critical", frequency: 0.6 }],
    };
  }

  it("renders a grounded, user-facing coaching turn for a real blunder", () => {
    const msg = buildTimeoutTeachingMessage(
      ITALIAN_BEFORE,
      ITALIAN_AFTER_BLUNDER,
      ["c6e5"],
      "Nxe5"
    );

    // Non-empty ⇒ the route uses it INSTEAD of the neutral stub.
    expect(msg).not.toBe("");
    // Names the move the user just played.
    expect(msg).toContain("Nxe5");
    // Grounded in the actual material swing (knight for pawn ≈ 2 points).
    expect(msg).toContain("material swung ~2 point(s) toward Black");
    // Enumerates opponent forcing replies to count.
    expect(msg).toMatch(/forcing replies:/);
    // Reads like a coaching turn, not a dead stub — offers a path forward.
    expect(msg).toContain("Ask again");
    // Must NOT be the neutral "ask again or rephrase" dead stub.
    expect(msg).not.toContain("Please ask again or rephrase");
  });

  it("returns '' (⇒ neutral stub) when there is nothing grounded to teach", () => {
    // Bare K vs K king step: empty delta, no threats.
    const before = "8/8/4k3/8/8/4K3/8/8 w - - 0 1";
    const after = "8/8/4k3/8/8/3K4/8/8 b - - 1 1";
    expect(buildTimeoutTeachingMessage(before, after, [], "Kd3")).toBe("");
  });

  it("is behavior-preserving on the mastery arg (null === undefined)", () => {
    const base = buildTimeoutTeachingMessage(NG5_BEFORE, NG5_AFTER, [], "Ng5");
    expect(buildTimeoutTeachingMessage(NG5_BEFORE, NG5_AFTER, [], "Ng5", null)).toBe(base);
    expect(base).not.toContain("recurring");
  });

  it("adds a personalized line when cross-game memory flips the primary idea", () => {
    const msg = buildTimeoutTeachingMessage(
      NG5_BEFORE,
      NG5_AFTER,
      [],
      "Ng5",
      summaryWith("Piece Activity")
    );
    expect(msg).toContain("recurring **Piece Activity** weakness");
  });

  it("omits the personalized line when memory does NOT flip the choice", () => {
    const msg = buildTimeoutTeachingMessage(
      NG5_BEFORE,
      NG5_AFTER,
      [],
      "Ng5",
      summaryWith("Missed Tactics")
    );
    expect(msg).not.toContain("recurring");
  });

  it("works without a move SAN (falls back to 'that move')", () => {
    const msg = buildTimeoutTeachingMessage(
      ITALIAN_BEFORE,
      ITALIAN_AFTER_BLUNDER,
      ["c6e5"]
    );
    expect(msg).not.toBe("");
    expect(msg).toContain("that move");
  });
});
