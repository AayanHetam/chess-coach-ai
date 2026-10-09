import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { planFieldedTurn, type FieldedPlan } from "../fieldedFacts";
import type { VerifiedWhatIf } from "../clientEvals";
import { MOVES, anchor8, anchorAt, compact, gameEval } from "./fieldedFixture";

const plan = (over: Partial<Parameters<typeof planFieldedTurn>[0]> = {}) =>
  planFieldedTurn({
    anchor: anchor8,
    otherSide: null,
    compact,
    question: "Why was 8. Nc7+ a mistake?",
    playedMoves: MOVES,
    gameEval,
    playerColor: "w",
    whatIf: null,
    ...over,
  });

function facts(p: FieldedPlan) {
  if (!p.eligible) throw new Error(`ineligible: ${p.reason}`);
  return p.facts;
}

describe("planFieldedTurn", () => {
  it("fields a reviewed move with both lines, its own moves and the boards it may describe", () => {
    const fx = facts(plan());
    expect(fx.reviewed).toBe(true);
    expect(fx.label).toBe("8. Nc7+");
    expect(fx.facts.ply).toBe(14);
    expect(fx.facts.fen).toBe(anchor8.fenBefore);
    expect(fx.facts.ownMoves).toEqual(expect.arrayContaining(["Nc7+", "Qxc1"]));
    expect(fx.ownLabels).toEqual(
      expect.arrayContaining(["8. Nc7+", "8. Qxc1"])
    );
    expect(fx.hasEngineLine).toBe(true);
    expect(fx.hasPlayedLine).toBe(true);
    const engine = fx.facts.lines.find((l) => l.kind === "engine")!;
    expect(engine.sans).toEqual(["Qxc1", "Rb8", "Qf4"]);
    const played = fx.facts.lines.find((l) => l.kind === "played")!;
    expect(played.sans).toEqual(MOVES.slice(14, 20));
    // The board after the engine's best: a white queen on c1.
    expect(
      fx.facts.boards.some((f) => {
        const p = new Chess(f).get("c1");
        return p?.type === "q" && p.color === "w";
      })
    ).toBe(true);
  });

  it("licenses from the lines' stories and the finding's pools, never the relational headings", () => {
    const fx = facts(plan());
    const text = fx.facts.licence.join(" | ");
    expect(text).not.toContain("HANGING (");
    expect(text).not.toContain("ABSOLUTE PINS");
    expect(text).toContain("undefended");
  });

  it("an opponent's move with no finding and no engine line there is unreviewed, with the game's line only", () => {
    const fx = facts(plan({ anchor: anchorAt(15), question: "Why 8... Kd8?" }));
    expect(fx.reviewed).toBe(false);
    expect(fx.label).toBe("8... Kd8");
    expect(fx.hasEngineLine).toBe(false);
    expect(fx.hasPlayedLine).toBe(true);
    expect(fx.facts.licence.join(" ")).not.toContain("undefended");
  });

  it("a what-if puts its moves among the prose's own and its board among the boards", () => {
    const whatIf: VerifiedWhatIf = {
      index: 14,
      fenBefore: anchor8.fenBefore,
      moveNumber: 8,
      color: "w",
      depth: 16,
      moves: [
        {
          role: "asked",
          uci: "b5d6",
          san: "Nd6+",
          cp: -150,
          depth: 16,
          lineSan: ["Nd6+", "exd6"],
        },
        {
          role: "played",
          uci: "b5c7",
          san: "Nc7+",
          cp: -211,
          depth: 16,
          lineSan: ["Nc7+", "Kd8"],
        },
      ],
    };
    const fx = facts(
      plan({
        anchor: { ...anchor8, askedSan: "Nd6+", matched: "what-if" },
        whatIf,
      })
    );
    expect(fx.facts.ownMoves).toContain("Nd6+");
    expect(fx.askedLabel).toBe("8. Nd6+");
    expect(fx.facts.boards.length).toBeGreaterThanOrEqual(3);
  });

  it("a finding whose board is another position is not this move's", () => {
    const fx = facts(
      plan({
        compact: {
          ...compact,
          insights: [
            { ...compact.insights[0], fenBefore: anchorAt(12).fenBefore },
          ],
        },
      })
    );
    expect(fx.reviewed).toBe(false);
  });

  it("names why a turn is not fielded, in order", () => {
    const reason = (p: FieldedPlan) => (p.eligible ? null : p.reason);
    expect(reason(plan({ compact: undefined }))).toBe("no_contract");
    expect(reason(plan({ anchor: null }))).toBe("no_anchor");
    expect(reason(plan({ otherSide: "b" }))).toBe("other_side");
    expect(
      reason(plan({ question: "Walk me through 8. Nc7+ step by step" }))
    ).toBe("walkthrough");
    expect(reason(plan({ playedMoves: null as never }))).toBe("no_facts");
  });
});
