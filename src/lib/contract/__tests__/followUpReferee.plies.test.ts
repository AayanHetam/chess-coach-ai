import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { refereeFollowUp } from "../followUpReferee";
import type { CompactContract, CompactInsight } from "../followUp";

/**
 * A move with a number is licensed only at that number.
 *
 * Live on production, 2026-09-26: asked about 8. Nc7+, the coach wrote
 * "after 8. Qxc1, Black recaptures with 8... Kxc7". There is no knight on c7
 * in that line; Kxc7 is real one move later, in the review's line for
 * 9. Nxa8 (9. Qxc1 Kxc7). The referee accepted any move that appeared
 * anywhere in the licensed lines, whatever its number, so the sentence
 * survived three times in four answers. Now a numbered move must be the
 * game's move at that ply, a licensed line's move at that ply, or a legal
 * alternative there; and once a sentence has placed itself in a line, its
 * following moves are read as that line.
 */

const MOVES = [
  "e4",
  "c5",
  "Nf3",
  "Nc6",
  "d4",
  "cxd4",
  "Nxd4",
  "Qb6",
  "Nf3",
  "Qxb2",
  "Na3",
  "Qxa1",
  "Nb5",
  "Qxc1",
  "Nc7+",
  "Kd8",
  "Nxa8",
  "Qxd1+",
  "Kxd1",
  "e5",
];

function fenAfter(n: number): string {
  const g = new Chess();
  for (let i = 0; i < n; i++) g.move(MOVES[i]);
  return g.fen();
}

function insight(
  over: Partial<CompactInsight> &
    Pick<
      CompactInsight,
      | "moveNumber"
      | "color"
      | "playedSan"
      | "bestSan"
      | "bestLineSan"
      | "fenBefore"
      | "fenAfter"
    >
): CompactInsight {
  return {
    factId: `f${over.moveNumber}${over.color}`,
    colorName: over.color === "w" ? "White" : "Black",
    classification: "blunder",
    evalBeforeDisplay: "+2.84",
    evalAfterDisplay: "-2.11",
    severityDropCp: 495,
    bestLineTruncated: false,
    allowedTacticalKeywords: ["fork", "hanging"],
    motifSayables: [],
    bestLineStory: [],
    gameStory: [],
    relationalSayables: [],
    shipped: true,
    ...over,
  };
}

// The review's two key moments: the fork at move 8 (engine: take the queen)
// and the rook grab at move 9 (engine: take the queen, then Black's king
// takes the knight on c7 — the line "Kxc7" is real in).
const CONTRACT: CompactContract = {
  contractId: "c-plies",
  contractVersion: "1.0",
  playerColor: "w",
  resultText: "Black won",
  finalMaterial: "Black up a bishop",
  accuracy: null,
  insights: [
    insight({
      moveNumber: 8,
      color: "w",
      playedSan: "Nc7+",
      bestSan: "Qxc1",
      bestLineSan: ["Qxc1", "Rb8", "Qf4", "f6"],
      fenBefore: fenAfter(14),
      fenAfter: fenAfter(15),
    }),
    insight({
      moveNumber: 9,
      color: "w",
      playedSan: "Nxa8",
      bestSan: "Qxc1",
      bestLineSan: ["Qxc1", "Kxc7", "Bb5", "f6"],
      fenBefore: fenAfter(16),
      fenAfter: fenAfter(17),
    }),
  ],
  forbiddenClaimClasses: [],
};

const base = {
  compact: CONTRACT,
  activeFen: fenAfter(15),
  activePly: 15,
  moveHistory: MOVES,
  extraFens: [fenAfter(14), fenAfter(15)],
};

describe("refereeFollowUp — a numbered move is licensed only at its own number", () => {
  it("drops the live hallucination: a move borrowed from another key moment's line", () => {
    for (const reply of [
      "Your turn: After 8. Qxc1, Black recaptures with 8... Kxc7. What is White's plan?",
      "After Black recaptures with 8... Kxc7 (the only way to get the knight), you've won Black's queen.",
      "8. Qxc1 Kxc7 — Black's king has to recapture the knight; that's the only legal move.",
    ]) {
      const res = refereeFollowUp({ ...base, reply });
      expect(res.text, reply).not.toContain("Kxc7");
      expect(res.dropped.map((d) => d.reason).join(" ")).toMatch(/san:.*Kxc7/);
    }
  });

  it("keeps the same move where it is real: the move-9 line", () => {
    const res = refereeFollowUp({
      ...base,
      reply: "9. Qxc1 wins the queen, and after Kxc7 the knight is gone.",
    });
    expect(res.text).toContain("Kxc7");
    expect(res.dropped).toEqual([]);
  });

  it("keeps a line the review carries, numbered or continued without numbers", () => {
    const res = refereeFollowUp({
      ...base,
      reply:
        "The engine's line continues 8... Rb8 9. Qf4 f6, and White stays a queen up.",
    });
    expect(res.dropped).toEqual([]);
  });

  it("keeps the game's own moves in sequence", () => {
    const res = refereeFollowUp({
      ...base,
      reply:
        "After 8. Nc7+ Kd8, your knight grabbed the rook on a8, but then Black played 9... Qxd1+ and your queen came off.",
    });
    expect(res.dropped).toEqual([]);
  });

  it("keeps a plain mention of a licensed move in a sentence that walks no line", () => {
    const res = refereeFollowUp({
      ...base,
      reply: "Qxc1 was simply winning, and the fork was the flashier choice.",
    });
    expect(res.dropped).toEqual([]);
  });

  it("drops a legal-looking move given the wrong number", () => {
    // Qf4 is the engine's 9th move in the move-8 line; at move 10 of the
    // game (after 9... Qxd1+) it is nonsense.
    const res = refereeFollowUp({
      ...base,
      reply: "Then 10. Qf4 finishes the attack.",
    });
    expect(res.text).not.toContain("Qf4");
  });

  it("licenses the anchor's engine line by ply when the route passes it", () => {
    const anchorLine = {
      startFen: fenAfter(14),
      startPly: 14,
      sans: ["Qxc1", "Rb8", "Qf4", "Nf6", "Bd3", "a6", "Nc7+", "Kd8"],
    };
    const empty: CompactContract = { ...CONTRACT, insights: [] };
    const kept = refereeFollowUp({
      ...base,
      compact: empty,
      extraLines: [anchorLine],
      reply:
        "After 8. Qxc1 Rb8 9. Qf4 Nf6 10. Bd3 the knight is safe and 11. Nc7+ still comes.",
    });
    expect(kept.dropped).toEqual([]);
    const dropped = refereeFollowUp({
      ...base,
      compact: empty,
      extraLines: [anchorLine],
      reply: "After 8. Qxc1 Kxc7 the knight is gone.",
    });
    expect(dropped.text).not.toContain("Kxc7");
  });
});
