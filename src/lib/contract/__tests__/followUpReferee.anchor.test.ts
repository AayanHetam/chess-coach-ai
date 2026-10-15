import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { refereeFollowUp } from "../followUpReferee";
import type { CompactContract } from "../followUp";

/**
 * The follow-up referee licenses a piece-on-square claim only on the board
 * under discussion or a reviewed insight's boards. A question about a move
 * that was never a card ("was 7... Qxc1 bad?") used to have every claim about
 * that board's pieces deleted. The anchor's boards and its narrated lines now
 * ride in as extra licences.
 */

const MOVES = [
  "e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4", "Qb6",
  "Nf3", "Qxb2", "Na3", "Qxa1", "Nb5", "Qxc1", "Nc7+", "Kd8",
];

function fenAfter(n: number): string {
  const g = new Chess();
  for (let i = 0; i < n; i++) g.move(MOVES[i]);
  return g.fen();
}

/** A contract with no insights at all: nothing is licensed by the review itself. */
const EMPTY_CONTRACT: CompactContract = {
  contractId: "c-empty",
  contractVersion: "1.0",
  playerColor: "w",
  resultText: "White resigned",
  finalMaterial: "level",
  accuracy: null,
  insights: [],
  forbiddenClaimClasses: [],
};

describe("refereeFollowUp — anchor licences", () => {
  it("drops a claim about a board that is neither viewed nor reviewed", () => {
    // The board under discussion is the start position; the queen on c1 is
    // a fact about the position after 7... Qxc1.
    const res = refereeFollowUp({
      reply: "Black's queen on c1 was undefended.",
      compact: EMPTY_CONTRACT,
      activeFen: new Chess().fen(),
      moveHistory: MOVES,
    });
    expect(res.text).not.toContain("queen on c1");
  });

  it("keeps the same claim when the anchor's boards are licensed", () => {
    const res = refereeFollowUp({
      reply: "Black's queen on c1 was undefended.",
      compact: EMPTY_CONTRACT,
      activeFen: new Chess().fen(),
      moveHistory: MOVES,
      extraFens: [fenAfter(14), fenAfter(15)],
    });
    expect(res.text).toContain("Black's queen on c1 was undefended.");
  });

  it("licenses a tactical word and a move that the anchor block narrates", () => {
    const anchorText = [
      "Engine line from before the move: 8. Qxc1 Rb8 9. Qf4 f6",
      "  what the engine line does:",
      "    - 8.Qxc1 — captures the queen on c1",
      "What the game did next: 8. Nc7+ Kd8",
      "    - 8.Nc7+ — gives check; forks the king on e8 and the rook on a8",
    ].join("\n");
    const reply = "8. Nc7+ forks the king and the rook, but 8. Qxc1 simply wins the queen.";
    const without = refereeFollowUp({
      reply,
      compact: EMPTY_CONTRACT,
      activeFen: new Chess().fen(),
      moveHistory: MOVES,
    });
    expect(without.dropped.map((d) => d.reason)).toContain("tactical:fork");
    const withAnchor = refereeFollowUp({
      reply,
      compact: EMPTY_CONTRACT,
      activeFen: new Chess().fen(),
      moveHistory: MOVES,
      extraFens: [fenAfter(14), fenAfter(15)],
      extraLicensedText: anchorText,
    });
    expect(withAnchor.dropped).toEqual([]);
    expect(withAnchor.text).toBe(reply);
  });
});
