/**
 * The verified game report on the two regression games: verdict, story, the
 * moments that decided it, credit, one habit — every fact replayed or read
 * off the engine with its depth. Depth 16 stands in for the browser's pass,
 * the stored depth-20 truth for the re-check of the flagged moments.
 */
import { describe, expect, it } from "vitest";
import { MoveClassification } from "@/types/enums";
import {
  buildGameReport,
  gameReportPromptBlock,
  gateBrilliantChips,
  renderReportHead,
  renderReportTail,
  type ReportInput,
} from "../gameReport";
import {
  positionsToRecheck,
  selectFlaggedMoments,
  type GameEvalRecheck,
} from "../deepRecheck";
import { loadGame, positionEvals, type GameId } from "./coachAccuracyFixtures";

function input(
  game: GameId,
  opts: { recheck?: boolean; playerColor?: "w" | "b" | null } = {}
): ReportInput {
  const moments = selectFlaggedMoments(positionEvals(game, 16), {
    playerColor: "w",
  });
  const deep = positionEvals(game, 20);
  const positions: GameEvalRecheck["positions"] = {};
  for (const idx of positionsToRecheck(moments))
    positions[String(idx)] = { lines: deep[idx].lines };
  return {
    sans: loadGame(game).sans,
    positions: positionEvals(game, 16),
    recheck:
      opts.recheck === false
        ? null
        : {
            engine: "Stockfish 17.1",
            depth: 20,
            positions,
            skipped: [],
            moments: moments.map((m) => m.move),
            budgetMs: 15_000,
            elapsedMs: 9_000,
          },
    playerColor: opts.playerColor === undefined ? "w" : opts.playerColor,
    result: "1-0",
    engine: "Stockfish 17 Lite",
  };
}

describe("Game B", () => {
  const report = buildGameReport(input("gameB"))!;
  const head = renderReportHead(report).text;
  const tail = renderReportTail(report).text;

  it("opens with the verdict: who you were, the result, one sentence", () => {
    expect(report.verdict).toBe(
      "You won with White by checkmate on move 22, after missing a forced mate and later letting a winning position slip."
    );
    expect(head.startsWith("**Verdict:** You won with White")).toBe(true);
  });

  it("tells the story in three to five verified sentences", () => {
    expect(report.story.length).toBeGreaterThanOrEqual(3);
    expect(report.story.length).toBeLessThanOrEqual(5);
    const story = report.story.join(" ");
    expect(story).toContain(
      "You had mate in 3 with 15.Nxe6+, but played 15.Qh7+ instead (+5.60, depth 20)."
    );
    expect(story).toContain(
      "19.Nxa8 took the rook on a8, and the evaluation went from +3.79 to +0.51 (depth 20)."
    );
    expect(story).toContain("allowed 22.g4#, checkmate.");
  });

  it("names the moments that decided it: the missed mate, 19.Nxa8, and 12.Ng5 with 12.Rb1 — never a hanging knight", () => {
    const byLabel = Object.fromEntries(report.moments.map((m) => [m.label, m]));
    expect(byLabel["15.Qh7+"]).toMatchObject({
      kind: "missed_mate",
      mateIn: 3,
      best: { label: "15.Nxe6+" },
    });
    expect(byLabel["19.Nxa8"]).toMatchObject({
      kind: "mistake",
      did: ["took the rook on a8"],
      best: { label: "19.Qh4" },
    });
    expect(byLabel["12.Ng5"]?.best?.label).toBe("12.Rb1");
    expect(head).not.toMatch(/hang|en prise/);
    expect(head).toContain("_Why it matters (opinion):");
  });

  it("credits the moves that had to be found — 10.Nb5 — and not the merely tempting 11.Bxh7+", () => {
    const labels = report.credit.map((c) => c.label);
    expect(labels).toContain("10.Nb5");
    expect(labels).not.toContain("11.Bxh7+");
    expect(report.credit.find((c) => c.label === "10.Nb5")).toMatchObject({
      reason: "only_good_move",
      brilliant: false,
    });
    expect(tail).toContain("**10.Nb5!** was the only good move");
  });

  it("gives exactly one habit, tied to what happened: mate before material", () => {
    expect(report.habit).toMatchObject({
      id: "mate_before_material",
      text: "When the enemy king is exposed, look for checks and mate before you take material.",
      evidence: ["15.Qh7+", "19.Nxa8"],
    });
    expect(tail.match(/One habit to work on/g)).toHaveLength(1);
  });

  it("says how every number was produced", () => {
    expect(tail).toContain(
      "Evaluations: Stockfish 17 Lite at depth 16; the decisive moments re-checked by Stockfish 17.1 at depth 20."
    );
  });

  it("labels its sentences: the 'why' as opinion, the numbers as engine", () => {
    const sources = [
      ...renderReportHead(report).sources,
      ...renderReportTail(report).sources,
    ];
    expect(
      sources.find((s) => s.text.startsWith("Why it matters"))?.source
    ).toBe("judgment");
    expect(sources.find((s) => s.text.includes("10.Nb5!"))?.source).toBe(
      "engine"
    );
  });

  it("hands the model the same facts, and only those", () => {
    const block = gameReportPromptBlock(report);
    expect(block).toMatch(/^REPORT FACTS/);
    expect(block).toContain('"move":"15.Qh7+"');
    expect(block).toContain(
      "Use no board facts beyond the contract and REPORT FACTS."
    );
  });
});

describe("the Opera Game", () => {
  const report = buildGameReport(input("operaGame"))!;

  it("has no phantom blunder once the re-check has looked, and credits Morphy's sacrifices as brilliant", () => {
    expect(report.verdict).toBe("You won with White by checkmate on move 17.");
    expect(report.moments.map((m) => m.label)).not.toContain("15.Bxd7+");
    expect(report.credit.map((c) => [c.label, c.brilliant])).toEqual([
      ["10.Nxb5", true],
      ["16.Qb8+", true],
    ]);
  });

  it("without the re-check, every number says it is depth 16", () => {
    const shallow = buildGameReport(input("operaGame", { recheck: false }))!;
    expect(renderReportTail(shallow).text).toContain(
      "Evaluations: Stockfish 17 Lite at depth 16._"
    );
    for (const m of shallow.moments) expect(m.after.depth).toBe(16);
  });
});

describe("brilliant chips", () => {
  it("Game B's 11.Bxh7+ does not earn one (it was not the only good move); the Opera Game's 10.Nxb5 does", () => {
    const b = input("gameB");
    const labelledB = positionEvals("gameB", 16);
    labelledB[21] = {
      ...labelledB[21],
      moveClassification: MoveClassification.Brilliant,
    };
    expect(gateBrilliantChips(b, labelledB)[21].moveClassification).toBe(
      MoveClassification.Best
    );

    const opera = input("operaGame");
    const labelledA = positionEvals("operaGame", 16);
    labelledA[19] = {
      ...labelledA[19],
      moveClassification: MoveClassification.Brilliant,
    };
    expect(gateBrilliantChips(opera, labelledA)[19].moveClassification).toBe(
      MoveClassification.Brilliant
    );
  });
});

describe("when the side is unknown", () => {
  it("speaks in the third person and credits both sides", () => {
    const report = buildGameReport(input("gameB", { playerColor: null }))!;
    expect(report.verdict).toBe("White won by checkmate on move 22.");
    expect(report.story.join(" ")).toContain(
      "White had mate in 3 with 15.Nxe6+, but played 15.Qh7+ instead"
    );
    expect(renderReportHead(report).text).toContain(
      "White had mate in 3 with 15.Nxe6+ (M+3, depth 20)"
    );
    expect(report.habit?.because).toContain(
      "At 15.Qh7+ White had mate in 3 with 15.Nxe6+"
    );
    const all = `${renderReportHead(report).text}\n${renderReportTail(report).text}`;
    expect(all).not.toMatch(/\byou had mate\b/i);
  });
});

describe("when you were Black", () => {
  it("White's missed mate is your opponent's, and not in your verdict", () => {
    const report = buildGameReport(input("gameB", { playerColor: "b" }))!;
    expect(report.verdict).toBe("You lost with Black by checkmate on move 22.");
    expect(report.story.join(" ")).toContain(
      "Your opponent had mate in 3 with 15.Nxe6+, but played 15.Qh7+ instead"
    );
    expect(renderReportHead(report).text).toContain(
      "Your opponent had mate in 3 with 15.Nxe6+"
    );
    expect(renderReportHead(report).text).not.toMatch(/\bYou had mate\b/);
  });
});
