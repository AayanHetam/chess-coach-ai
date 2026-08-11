import { describe, expect, it } from "vitest";
import {
  buildPositionUnderDiscussion,
  POSITION_UNDER_DISCUSSION_HEADER,
} from "../positionUnderDiscussion";
import { buildCurrentPositionFacts } from "@/lib/mastermind/positionFacts";

/**
 * B3 (SILENT_SUBSTITUTION_HANDOFF §3 Group B) — the deep path discarded the
 * viewed position.
 *
 * `handleAskCoachAboutMove` deliberately computes the FEN at the clicked ply
 * ("not at the current display position"). When that click is the session's
 * first coach message — the common entry: click a mistake row, the coach opens
 * — the DEEP path fires, and it had no field for a viewed ply at all. The
 * answer came back about the end of the game.
 */

// 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6
const MOVES = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"];

describe("buildPositionUnderDiscussion", () => {
  it("describes the board at the viewed ply, not the end of the game", () => {
    const out = buildPositionUnderDiscussion(MOVES, 4);
    expect(out).toContain(POSITION_UNDER_DISCUSSION_HEADER);
    // After 4 half-moves the bishop has NOT yet gone to b5.
    expect(out).toContain("Bf1");
    expect(out).not.toContain("Bb5");
  });

  it("names the move that produced the position", () => {
    expect(buildPositionUnderDiscussion(MOVES, 4)).toContain("Nc6");
  });

  it("says out loud that this is not the end of the game", () => {
    const out = buildPositionUnderDiscussion(MOVES, 4);
    expect(out).toContain("NOT the end of the game");
    expect(out).toContain("Answer about THIS board");
  });

  it("emits exactly one heading — no competing 'which board is current' claim", () => {
    // B2's failure mode was two blocks each claiming to be the live board.
    const out = buildPositionUnderDiscussion(MOVES, 4);
    expect(out.match(/^## /gm) ?? []).toHaveLength(1);
    expect(out).not.toContain("CURRENTLY VIEWED POSITION");
  });

  it("does not duplicate the final position when the user is at the end", () => {
    // The FINAL POSITION block already covers that board; a second copy would
    // recreate exactly the ambiguity B2 was about.
    expect(buildPositionUnderDiscussion(MOVES, MOVES.length)).toBe("");
  });

  it("is inert for older clients that send no viewedPly", () => {
    expect(buildPositionUnderDiscussion(MOVES, undefined)).toBe("");
  });

  it("is inert for out-of-range or empty input", () => {
    expect(buildPositionUnderDiscussion(MOVES, -1)).toBe("");
    expect(buildPositionUnderDiscussion(MOVES, 99)).toBe("");
    expect(buildPositionUnderDiscussion([], 0)).toBe("");
    expect(buildPositionUnderDiscussion(undefined, 2)).toBe("");
  });

  it("handles the starting position without inventing a last move", () => {
    const out = buildPositionUnderDiscussion(MOVES, 0);
    expect(out).toContain("starting position");
    expect(out).toContain(POSITION_UNDER_DISCUSSION_HEADER);
  });

  it("cannot be confused with the FINAL POSITION block", () => {
    // The two blocks coexist in one prompt, so their headers must differ and
    // neither may claim the other's role.
    const viewed = buildPositionUnderDiscussion(MOVES, 4);
    const final = buildCurrentPositionFacts(MOVES);
    expect(final).toContain("## FINAL POSITION");
    expect(viewed).not.toContain("## FINAL POSITION");
    expect(final).not.toContain(POSITION_UNDER_DISCUSSION_HEADER);
  });
});
