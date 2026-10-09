/**
 * The turn-1 lift (pathway 4.1): a card the ladder passed, cut the way the
 * page cuts it, with every other field from the contract.
 *
 * Built on fixture 07 for real (chessdb offline): card M2 is 8. Nc7+, the
 * knight check that leaves Black's queen on c1 standing, and the engine's
 * line there is 8. Qxc1 Rb8 9. Qf4 f6.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Chess } from "chess.js";
import { buildCoachContract } from "@/lib/contract/builder";
import { getFenAtHalfMove } from "@/lib/contract/chessFormat";
import { renderInsightBlock } from "@/lib/contract/insightGrammar";
import {
  isTurnMomentsEnabled,
  LIFTED_STAGES,
  liftTurnMoment,
  TURN_MOMENT_PROOF_PLIES,
  turnMomentProse,
} from "@/lib/contract/turnMoments";
import type { LadderStage } from "@/lib/contract/ladder";
import type { CoachContract, InsightContract } from "@/lib/contract/types";
import type {
  GameEvalInput,
  GameHeadersInput,
} from "@/lib/contract/gameEvalSchema";
import { cardKey } from "@/lib/coach/turnMoment";
import { splitInsightWhy } from "@/components/preview-analysis/insightWhy";
import { engineLineAt } from "@/components/preview-analysis/coachLines";
import type { PositionEval } from "@/types/eval";
import {
  __setFetchForTesting,
  __resetFetchForTesting,
  __clearChessdbCache,
} from "@/lib/grounding/chessdb";

interface FixtureFile {
  moveHistory: string[];
  gameEval: GameEvalInput;
  playerColor: string;
  username?: string;
  userRating?: number;
  gameHeaders?: GameHeadersInput;
}

const FIXTURE = path.join(__dirname, "fixtures-real", "07_knight_fork.json");
const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as FixtureFile;

let contract: CoachContract;
let m2: InsightContract;

beforeAll(async () => {
  __setFetchForTesting(async () => {
    throw new Error("network disabled in turn-moment tests");
  });
  __clearChessdbCache();
  contract = await buildCoachContract({
    moveHistory: fixture.moveHistory,
    gameEval: fixture.gameEval,
    playerColor: fixture.playerColor,
    username: fixture.username,
    userRating: fixture.userRating,
    gameHeaders: fixture.gameHeaders,
    uid: "turn-moments",
    identity: {
      fen: getFenAtHalfMove(fixture.moveHistory, fixture.moveHistory.length),
      playerColor: fixture.playerColor || "w",
    },
  });
  m2 = contract.insights.find((i) => i.factIdPrefix === "M2")!;
}, 120_000);

afterAll(() => __resetFetchForTesting());
afterEach(() => vi.unstubAllEnvs());

/** The coach-proof-line e2e card, as the ladder ships it (header from the contract, the Solution line kept to what the line shows). */
const LEDE =
  "You spotted a fork, but there was something even bigger hiding in plain sight.";
const LABELLED_WHY = [
  "Idea: You saw the knight fork on c7 hitting the king and the rook on a8.",
  "Problem: The queen on c1 was hanging with no defenders, and 8. Qxc1 simply takes it.",
  "Solution: 8. Qxc1 takes the queen immediately, and the engine goes on with Rb8 9. Qf4.",
  "Outcome: The fork was real, but the free queen was bigger.",
  "The takeaway: collect the most valuable free piece before you start a combination.",
  "[CONTINUATION:8:w]",
  "[MAIA_CONTINUATION:8:w]",
].join("\n");
const LABELLED_BODY = [
  LEDE,
  "[WHY]",
  LABELLED_WHY,
  "[/WHY]",
  "[CONCEPT:hangingPiece:Hanging Piece Awareness]",
  "When an enemy piece has no defenders, take it before anything else.",
  "[/CONCEPT]",
].join("\n");

/** insightWhy.test.ts's gold-example body: flowing paragraphs, no labels. */
const FLOWING_WHY = [
  "You probably wanted to keep the queen connected to the rook, and that instinct is good! But this move hands White a resource: the knight hop to c5 forks the queen on d7 and the bishop on b7.",
  "The engine's path keeps everything safe: 18... Qe7 followed by Nf3 Rd8, and Black is still right in the game at -0.35.",
  "Here's the pattern to bank: before parking your queen, scan every knight-hop landing square around her AND your loose pieces.",
].join("\n");

/** insightWhy.test.ts's labelled body (fixture 05, 20. Rg3). */
const FIVE_LINE_WHY = [
  "Idea: You probably wanted to activate the rook and pile pressure on the g-file, which is a reasonable instinct when you're ahead.",
  "Problem: Your knight on a7 was already attacking the undefended bishop on c8, and the queen on f7 was under pressure. The position was screaming for an immediate capture, but 20. Rg3 left the rook where it could be taken.",
  "Solution: The engine's path is 20. Nxc8+, which takes the bishop on c8 and gives check. After the king steps to e8, 21. Nxf7 scoops the queen.",
  "Outcome: Instead, the rook on g3 became a liability the moment it landed, and White handed back a monster advantage.",
  "The takeaway: when you have a free piece sitting under attack AND a forcing check available, capture first, active pieces don't wait.",
  "[CONTINUATION:20:w]",
  "[MAIA_CONTINUATION:20:w]",
].join("\n");

const card = (insight: InsightContract, body: string) =>
  renderInsightBlock(insight, body);
const lift = (
  insight: InsightContract,
  body: string,
  stage: LadderStage = "pass"
) => liftTurnMoment({ insight, stage, finalText: card(insight, body) });

describe("isTurnMomentsEnabled", () => {
  it("reads COACH_TURN1_MOMENTS per call, off by default", () => {
    vi.stubEnv("COACH_TURN1_MOMENTS", "");
    expect(isTurnMomentsEnabled()).toBe(false);
    for (const on of ["1", "on", "true", " TRUE ", "On"]) {
      vi.stubEnv("COACH_TURN1_MOMENTS", on);
      expect(isTurnMomentsEnabled()).toBe(true);
    }
    for (const off of ["0", "off", "false", "yes", "2"]) {
      vi.stubEnv("COACH_TURN1_MOMENTS", off);
      expect(isTurnMomentsEnabled()).toBe(false);
    }
  });
});

describe("the fixture", () => {
  it("M2 is 8. Nc7+ before the queen is taken, with the engine's line 8. Qxc1", () => {
    expect(m2.ply).toBe(14);
    expect(m2.playedSan).toBe("Nc7+");
    expect(m2.fenBefore).toBe(
      "r1b1kbnr/pp1ppppp/2n5/1N6/4P3/5N2/P1P2PPP/2qQKB1R w Kkq - 0 8"
    );
    expect(m2.lines[0].san).toEqual(["Qxc1", "Rb8", "Qf4", "f6"]);
    expect(m2.lines[0].eval.display).toBe("+2.84");
    expect(m2.lines[0].eval.depth).toBe(16);
  });
});

describe("liftTurnMoment on a labelled card", () => {
  it("gives the wire example's fields exactly", () => {
    const finalText = card(m2, LABELLED_BODY);
    const moment = liftTurnMoment({ insight: m2, stage: "pass", finalText });
    expect(
      finalText.startsWith("[INSIGHT:8:w:blunder:+2.84:-2.11:Nc7+:Qxc1]\n")
    ).toBe(true);
    const fen = "r1b1kbnr/pp1ppppp/2n5/1N6/4P3/5N2/P1P2PPP/2qQKB1R w Kkq - 0 8";
    expect(moment).toEqual({
      idea: "You saw the knight fork on c7 hitting the king and the rook on a8.",
      happens:
        "The queen on c1 was hanging with no defenders, and 8. Qxc1 simply takes it.",
      proof: { kind: "engine", moveNumber: 8, color: "w" },
      lesson: {
        pattern: "",
        check:
          "collect the most valuable free piece before you start a combination.",
      },
      question: null,
      more: [
        "Solution: 8. Qxc1 takes the queen immediately, and the engine goes on with Rb8 9. Qf4.",
        "Outcome: The fork was real, but the free queen was bigger.",
      ].join("\n"),
      omitted: [],
      ply: 14,
      fen,
      move: {
        san: "Nc7+",
        moveNumber: 8,
        color: "w",
        verdict: "blunder",
        evalBefore: "+2.84",
        evalAfter: "-2.11",
      },
      annotations: [],
      proofLine: {
        kind: "engine",
        moveNumber: 8,
        color: "w",
        startFen: fen,
        startPly: 14,
        sans: ["Qxc1", "Rb8", "Qf4", "f6"],
        evalDisplay: "+2.84",
      },
      actions: [{ kind: "play_proof" }],
      card: {
        factIdPrefix: "M2",
        moveNumber: 8,
        color: "w",
        playedSan: "Nc7+",
        key: cardKey(finalText),
      },
    });
  });

  it("puts the lede outside [WHY] in no field", () => {
    const moment = lift(m2, LABELLED_BODY)!;
    expect(JSON.stringify(moment)).not.toContain("something even bigger");
    expect(JSON.stringify(moment)).not.toContain("When an enemy piece");
  });

  it("carries the line the page draws: engineLineAt from the same sweep", () => {
    const moment = lift(m2, LABELLED_BODY)!;
    const page = engineLineAt(
      fixture.gameEval.positions as unknown as PositionEval[],
      fixture.moveHistory,
      8,
      "w"
    );
    expect(page).not.toBeNull();
    expect(moment.proofLine!.sans).toEqual(page!.sans);
    expect(moment.proofLine!.startFen).toBe(page!.startFen);
    expect(moment.proofLine!.startPly).toBe(page!.anchorPly);
    expect(moment.proofLine!.evalDisplay).toBe(page!.evalDisplay);
  });

  it("keys the exact text, so one changed character is another key", () => {
    const a = lift(m2, LABELLED_BODY)!;
    const b = lift(m2, LABELLED_BODY.replace("bigger.", "bigger!"))!;
    expect(a.card.key).toMatch(/^[0-9a-f]{8}$/);
    expect(b.card.key).not.toBe(a.card.key);
  });
});

describe("turnMomentProse, the page's cut", () => {
  it("a flowing body: the first paragraph split at its first sentence, the middle behind the tap", () => {
    const prose = turnMomentProse({ why: FLOWING_WHY, headline: "A lede." })!;
    expect(prose.idea).toBe(
      "You probably wanted to keep the queen connected to the rook, and that instinct is good!"
    );
    expect(prose.happens).toBe(
      "But this move hands White a resource: the knight hop to c5 forks the queen on d7 and the bishop on b7."
    );
    expect(prose.more).toBe(
      "The engine's path keeps everything safe: 18... Qe7 followed by Nf3 Rd8, and Black is still right in the game at -0.35."
    );
    expect(prose.lesson).toEqual({
      pattern: "",
      check:
        "before parking your queen, scan every knight-hop landing square around her AND your loose pieces.",
    });
    expect(prose.question).toBeNull();
    expect(prose.omitted).toEqual([]);
  });

  it("a card with no [WHY] lifts from the lede", () => {
    const moment = lift(
      m2,
      "You went for the knight check on c7. Black's queen on c1 was free with 8. Qxc1."
    )!;
    expect(moment.idea).toBe("You went for the knight check on c7.");
    expect(moment.happens).toBe("Black's queen on c1 was free with 8. Qxc1.");
    expect(moment.lesson).toBeNull();
    expect(moment.more).toBeNull();
  });

  it("matches splitInsightWhy: idea and happens are the lead without labels, more the rest, the check the lesson", () => {
    const stripLabels = (lead: string) =>
      lead
        .split("\n")
        .map((l) => l.replace(/^(Idea|Problem)\s*:\s*/i, "").trim())
        .join(" ");
    for (const why of [LABELLED_WHY, FLOWING_WHY, FIVE_LINE_WHY]) {
      const cut = splitInsightWhy(why);
      const prose = turnMomentProse({ why, headline: LEDE })!;
      expect([prose.idea, prose.happens].filter(Boolean).join(" ")).toBe(
        stripLabels(cut.lead)
      );
      expect(prose.more).toBe(cut.rest || null);
      expect(prose.lesson?.check ?? null).toBe(cut.lesson);
    }
  });

  it("joins two Idea lines into one idea", () => {
    const prose = turnMomentProse({
      why: "Idea: You wanted the check.\nIdea: And the rook after it.\nProblem: The queen stayed free.",
      headline: "",
    })!;
    expect(prose.idea).toBe("You wanted the check. And the rook after it.");
    expect(prose.happens).toBe("The queen stayed free.");
  });

  it("is null when the cut gives neither line", () => {
    expect(
      turnMomentProse({
        why: "Solution: 8. Qxc1 takes the queen.\nOutcome: A queen up.",
        headline: LEDE,
      })
    ).toBeNull();
    expect(turnMomentProse({ why: "", headline: "" })).toBeNull();
  });
});

describe("liftTurnMoment refuses", () => {
  it("lifts only the stages that shipped the model's refereed prose", () => {
    expect(Array.from(LIFTED_STAGES).sort()).toEqual(
      ["edited", "pass", "regenerated", "sentence_drop"].sort()
    );
    for (const stage of Array.from(LIFTED_STAGES)) {
      expect(lift(m2, LABELLED_BODY, stage)).not.toBeNull();
    }
    expect(lift(m2, LABELLED_BODY, "templated")).toBeNull();
    expect(lift(m2, LABELLED_BODY, "passthrough_footnoted")).toBeNull();
  });

  it("a [WHY] with only Solution and Outcome", () => {
    expect(
      lift(
        m2,
        `${LEDE}\n[WHY]\nSolution: 8. Qxc1 takes the queen.\nOutcome: A queen up.\n[/WHY]`
      )
    ).toBeNull();
  });

  it("a card carrying a practice tag (the page strips those before it parses)", () => {
    expect(
      lift(m2, `${LABELLED_BODY}\n[PRACTICE:hangingPiece:Hanging Pieces]`)
    ).toBeNull();
  });

  it("a header for another move, and text that is not exactly one card", () => {
    const m1 = contract.insights.find((i) => i.factIdPrefix === "M1")!;
    expect(
      liftTurnMoment({
        insight: m2,
        stage: "pass",
        finalText: card(m1, LABELLED_BODY),
      })
    ).toBeNull();
    expect(
      liftTurnMoment({
        insight: m2,
        stage: "pass",
        finalText: `${card(m2, LABELLED_BODY)}\n\n${card(m1, LABELLED_BODY)}`,
      })
    ).toBeNull();
    expect(
      liftTurnMoment({
        insight: m2,
        stage: "pass",
        finalText: card(m2, LABELLED_BODY).replace("[/INSIGHT]", ""),
      })
    ).toBeNull();
  });
});

describe("the computed fields come from the contract", () => {
  it("a sentinel line gives no proof, no proof line and no action", () => {
    const top = m2.lines[0];
    for (const bad of [
      {
        ...top,
        eval: {
          ...top.eval,
          sentinel: true,
          depth: 0,
          display: "engine data unavailable",
        },
      },
      { ...top, eval: { ...top.eval, depth: 0 } },
      { ...top, san: [] },
    ]) {
      const moment = lift(
        { ...m2, lines: [bad, ...m2.lines.slice(1)] },
        LABELLED_BODY
      )!;
      expect(moment.proof).toBeNull();
      expect(moment.proofLine).toBeNull();
      expect(moment.actions).toEqual([]);
      expect(moment.idea).not.toBeNull();
    }
    const none = lift({ ...m2, lines: [] }, LABELLED_BODY)!;
    expect(none.proof).toBeNull();
    expect(none.actions).toEqual([]);
  });

  it("caps a long line at eight plies", () => {
    // A legal twelve-ply line: the engine's four plies, then the first legal move each turn.
    const g = new Chess(m2.fenBefore);
    for (const san of m2.lines[0].san) g.move(san);
    while (g.history().length < 12) g.move(g.moves()[0]);
    const long = g.history();
    expect(long).toHaveLength(12);
    const moment = lift(
      { ...m2, lines: [{ ...m2.lines[0], san: long }, ...m2.lines.slice(1)] },
      LABELLED_BODY
    )!;
    expect(TURN_MOMENT_PROOF_PLIES).toBe(8);
    expect(moment.proofLine!.sans).toEqual(long.slice(0, 8));
  });

  it("rewriting the body's moves leaves the move, the board and the line as they were", () => {
    const a = lift(m2, LABELLED_BODY)!;
    const b = lift(
      m2,
      LABELLED_BODY.split("Qxc1").join("Nd6+").split("Rb8").join("exd6")
    )!;
    expect(b.happens).not.toBe(a.happens);
    expect(b.move).toEqual(a.move);
    expect(b.fen).toBe(a.fen);
    expect(b.ply).toBe(a.ply);
    expect(b.proofLine).toEqual(a.proofLine);
    expect(b.card.key).not.toBe(a.card.key);
  });

  it("a sentinel or empty eval is null on the move", () => {
    const moment = lift(
      {
        ...m2,
        evalAfter: { ...m2.evalAfter, display: "" },
        evalBefore: { ...m2.evalBefore, sentinel: true },
      },
      LABELLED_BODY
    )!;
    expect(moment.move!.evalBefore).toBeNull();
    expect(moment.move!.evalAfter).toBeNull();
  });
});

describe("the page modules the server imports", () => {
  it("import nothing at runtime, so no React reaches the server bundle", () => {
    for (const rel of [
      "src/components/AICoachInsights.parser.ts",
      "src/components/preview-analysis/insightWhy.ts",
    ]) {
      const src = fs.readFileSync(
        path.join(__dirname, "../../../..", rel),
        "utf8"
      );
      const imports = (src.match(/^\s*import\b.*$/gm) ?? []).filter(
        (l) => !/^\s*import type\b/.test(l)
      );
      expect(imports, rel).toEqual([]);
      expect(src, rel).not.toMatch(/\brequire\(|\bimport\(/);
    }
  });
});
