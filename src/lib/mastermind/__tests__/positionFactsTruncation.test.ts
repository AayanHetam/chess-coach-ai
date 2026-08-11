import { describe, expect, it } from "vitest";
import { buildCurrentPositionFacts } from "../positionFacts";

/**
 * E3 (SILENT_SUBSTITUTION_HANDOFF §3 Group E) — SAN-replay truncation is loud
 * on the deep path and silent on the follow-up path.
 *
 * `buildCurrentPositionFacts` replays the move list and `break`s at the first
 * illegal SAN, with no flag. Two consequences:
 *
 *  1. The board it describes silently covers fewer moves than the game, and
 *     nothing tells the model that.
 *  2. Worse, the caption:
 *
 *         moveHistory[played - 1] ?? moveHistory[moveHistory.length - 1]
 *
 *     When the FIRST move fails to replay, `played === 0`, `moveHistory[-1]` is
 *     `undefined`, and the `??` falls back to the LAST move of the game. So the
 *     model is handed a STARTING-POSITION piece map captioned
 *     "Last move played: Qxh7#" — a mate that is nowhere on the board it is
 *     looking at.
 *
 * The deep path already warns ("analysis covers the first N moves… Do NOT
 * comment on moves after this point"); this path should not be quieter about
 * the same fact.
 */

// A legal opening followed by a move that cannot be played in that position.
const TRUNCATED = ["e4", "e5", "Nf3", "Qxh7#"];
// The very first SAN is illegal — nothing replays at all.
const UNPLAYABLE_FROM_START = ["Qxh7#", "e5", "Nf3"];

describe("E3 — truncated SAN replay is declared, not papered over", () => {
  it("never captions the board with a move that was not played", () => {
    // The bug in its purest form: zero moves replayed, yet the caption names
    // the last move of the game.
    const out = buildCurrentPositionFacts(UNPLAYABLE_FROM_START);
    expect(out).not.toContain("Last move played: Nf3");
    expect(out).not.toContain("Qxh7#");
  });

  it("omits the last-move caption entirely when nothing replayed", () => {
    const out = buildCurrentPositionFacts(UNPLAYABLE_FROM_START);
    expect(out).not.toContain("Last move played");
    // The rest of the block is still useful — it is the starting position.
    expect(out).toContain("FEN: ");
    expect(out).toContain("to move.");
  });

  it("says the position is truncated so the model does not narrate past it", () => {
    const out = buildCurrentPositionFacts(TRUNCATED);
    expect(out).toMatch(/covers the first 3 half-move/i);
    expect(out).toMatch(/do not comment on moves after this point/i);
  });

  it("captions the last move that actually replayed", () => {
    expect(buildCurrentPositionFacts(TRUNCATED)).toContain(
      "Last move played: Nf3."
    );
  });

  it("stays silent about truncation when the whole game replayed", () => {
    // No false alarms: a clean game must render exactly as before.
    const out = buildCurrentPositionFacts(["e4", "e5", "Nf3", "Nc6"]);
    expect(out).not.toMatch(/covers the first/i);
    expect(out).toContain("Last move played: Nc6.");
  });

  it("returns empty for an empty history, as before", () => {
    expect(buildCurrentPositionFacts([])).toBe("");
    expect(buildCurrentPositionFacts(undefined)).toBe("");
  });
});
