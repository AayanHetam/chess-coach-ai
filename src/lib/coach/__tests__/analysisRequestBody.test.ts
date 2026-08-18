import { describe, expect, it } from "vitest";
import {
  buildAnalysisRequestBody,
  type AnalysisRequestBodyInput,
} from "../analysisRequestBody";

/**
 * A1 (SILENT_SUBSTITUTION_HANDOFF §3 Group A).
 *
 * This builder is the one AnalysisImpl calls, so these assertions are about
 * the bytes that leave the browser — not about a copy of the logic.
 *
 * The server's rating chain is `body ?? firestoreProfile ?? pgnHeaderElo`.
 * A number in the body wins it outright. So the only way the two lower tiers
 * stay reachable is for the body to OMIT the field when the client has no
 * rating. Anything else — 1500, 0, null — is a silent substitution.
 */

const base: AnalysisRequestBodyInput = {
  userMessage: "why was that a mistake?",
  moveHistory: ["e4", "e5", "Nf3"],
  viewedPly: 3,
  fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
  gameEval: { positions: [] },
  conversationHistory: [],
  userRating: undefined,
};

/** What actually crosses the wire — undefined-valued keys do not survive. */
function wire(input: AnalysisRequestBodyInput): Record<string, unknown> {
  return JSON.parse(JSON.stringify(buildAnalysisRequestBody(input)));
}

describe("buildAnalysisRequestBody — rating is forwarded, never invented", () => {
  it("forwards a real rating verbatim", () => {
    expect(wire({ ...base, userRating: 1873 }).userRating).toBe(1873);
  });

  it("omits the field entirely when the user has no rating", () => {
    const body = wire(base);
    expect("userRating" in body).toBe(false);
  });

  it("never substitutes 1500 (the A1 regression)", () => {
    // The literal that shipped for months. If this ever passes again, the
    // server's profile + PGN-header fallbacks are dead code once more.
    expect(wire(base).userRating).not.toBe(1500);
    expect(JSON.stringify(buildAnalysisRequestBody(base))).not.toContain(
      '"userRating":1500'
    );
  });

  it("does not smuggle a zero or null in place of absence", () => {
    // `?? 0` and `|| null` are the two refactors most likely to reintroduce
    // this: both are falsy and both would be read as a real rating server-side
    // or crash the range guard.
    const raw = buildAnalysisRequestBody(base);
    expect(raw.userRating).toBeUndefined();
    expect(raw.userRating).not.toBeNull();
  });
});

describe("buildAnalysisRequestBody — the rest of the contract is unchanged", () => {
  it("carries the fields the server needs to ground the answer", () => {
    const body = wire({ ...base, userRating: 1200 });
    expect(body.userMessage).toBe(base.userMessage);
    expect(body.moveHistory).toEqual(["e4", "e5", "Nf3"]);
    expect(body.fen).toBe(base.fen);
    expect(body.stream).toBe(true);
  });

  it("sends the FULL game history, not a slice to the cursor", () => {
    // Regression guard for the documented bug where slicing to `currentPly`
    // made "analyze my game" arrive with zero moves at ply 0.
    const moves = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"];
    expect(wire({ ...base, moveHistory: moves }).moveHistory).toHaveLength(6);
  });

  it("includes gameHeaders only when at least one tag is present", () => {
    expect("gameHeaders" in wire(base)).toBe(false);
    expect("gameHeaders" in wire({ ...base, gameHeaders: {} })).toBe(false);
    expect(
      "gameHeaders" in
        wire({ ...base, gameHeaders: { white: undefined, black: undefined } })
    ).toBe(false);
    const withHeaders = wire({ ...base, gameHeaders: { white: "alice" } });
    expect(withHeaders.gameHeaders).toEqual({ white: "alice" });
  });

  it("forwards the personalization fields the prompt builder reads", () => {
    const body = wire({
      ...base,
      userRating: 1600,
      playerColor: "b",
      playerColorName: "black",
      boardOrientation: "black",
      username: "alice",
      chesscomUsername: "alice_chess",
      lichessUsername: "alice_lichess",
      personalityId: "grandmaster",
    });
    expect(body).toMatchObject({
      playerColor: "b",
      playerColorName: "black",
      boardOrientation: "black",
      username: "alice",
      chesscomUsername: "alice_chess",
      lichessUsername: "alice_lichess",
      personalityId: "grandmaster",
    });
  });
});
