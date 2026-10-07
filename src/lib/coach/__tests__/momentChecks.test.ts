/**
 * The checks over a fielded moment, on fixture 07 throughout: White's
 * 8.Nc7+ (played) against 8.Qxc1 (the engine's best), the game going
 * Kd8 Nxa8 Qxd1+ Kxd1. Same compact contract the follow-up referee's
 * tests build, so the two nets are judged on one board.
 */
import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { toCompactContract } from "@/lib/contract/followUp";
import { buildLineStory } from "@/lib/contract/lineStory";
import {
  lineFact,
  makeContract,
  makeInsight,
} from "@/lib/contract/__tests__/insightFactory";
import {
  checkBudget,
  checkLesson,
  checkMoment,
  checkProof,
  factsFromCompactInsight,
  omitFailedFields,
  plyOf,
  replayLine,
  resolveProof,
  type MomentFacts,
} from "../momentChecks";
import { ABSENCE_CLAUSE, momentToText, type MomentEnvelope } from "../moment";

const MOVES =
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8 Nxa8 Qxd1+ Kxd1 e5".split(
    " "
  );
function fenAfter(n: number): string {
  const g = new Chess();
  MOVES.slice(0, n).forEach((m) => g.move(m));
  return g.fen();
}
const fenBefore8 = fenAfter(14);
const insight = makeInsight({
  factIdPrefix: "M1",
  ply: 14,
  moveNumber: 8,
  color: "w",
  colorName: "White",
  playedSan: "Nc7+",
  bestSan: "Qxc1",
  fenBefore: fenBefore8,
  fenAfter: fenAfter(15),
  motifs: [],
  allowedTacticalKeywords: [],
  evalBefore: {
    cp: 284,
    mate: null,
    depth: 16,
    sentinel: false,
    display: "+2.84",
    provenance: {
      source: "stockfish_client",
      confidence: "client_reported",
      depth: 16,
    },
  },
  evalAfter: {
    cp: -211,
    mate: null,
    depth: 16,
    sentinel: false,
    display: "-2.11",
    provenance: {
      source: "stockfish_client",
      confidence: "client_reported",
      depth: 16,
    },
  },
  lines: [
    {
      ...lineFact("M1.pv0", ["Qxc1", "Rb8", "Qf4"], ["d1c1", "a8b8", "c1f4"], {
        cp: 284,
        display: "+2.84",
      }),
      story: buildLineStory(fenBefore8, ["Qxc1", "Rb8", "Qf4"]),
    },
  ],
  gameStory: buildLineStory(fenBefore8, [
    "Nc7+",
    "Kd8",
    "Nxa8",
    "Qxd1+",
    "Kxd1",
  ]),
  sayables: {
    motifs: [],
    relationalCaptures: [],
    relationalHanging: ["The q on c1 is undefended."],
    relationalPins: [],
  },
});
const compact = toCompactContract(makeContract([insight]), ["M1"]);
const facts = factsFromCompactInsight(compact.insights[0], compact, MOVES);

const clean: MomentEnvelope = {
  idea: "You went for the check because a knight that hits the king and the rook looks like it wins material.",
  happens:
    "The queen on c1 was already hanging, and after the king steps aside the knight is the piece that is lost.",
  proof: { kind: "engine", moveNumber: 8, color: "w" },
  lesson: {
    pattern: "Take what is hanging first",
    check:
      "Before any check or fork, list every capture your opponent has in reply.",
  },
  question: "Which of your pieces is loose after the king steps to d8?",
};

describe("facts from the compact contract", () => {
  it("places the moment before the move, with both proof candidates and the licence text", () => {
    expect(plyOf(8, "w")).toBe(14);
    expect(plyOf(8, "b")).toBe(15);
    expect(facts.ply).toBe(14);
    expect(facts.fen).toBe(fenBefore8);
    expect(facts.playerColor).toBe("w");
    expect(facts.ownMoves).toEqual(["Nc7+", "Qxc1"]);
    expect(
      facts.lines.map((l) => `${l.kind}:${l.moveNumber}:${l.color}`)
    ).toEqual(["engine:8:w", "played:8:w"]);
    expect(facts.lines[0].sans).toEqual(["Qxc1", "Rb8", "Qf4"]);
    expect(facts.lines[0].evalDisplay).toBe("+2.84");
    expect(facts.lines[1].sans).toEqual([
      "Nc7+",
      "Kd8",
      "Nxa8",
      "Qxd1+",
      "Kxd1",
      "e5",
    ]);
    expect(facts.lines[1].startPly).toBe(14);
    expect(facts.licence.join(" ")).toContain("undefended");
    expect(facts.boards).toEqual([fenAfter(15)]);
  });
});

describe("a clean moment passes", () => {
  it("reports nothing", () => {
    expect(checkMoment(clean, facts)).toEqual([]);
  });

  it("licenses a fork the game story confirms, and definitional prose", () => {
    expect(
      checkMoment(
        {
          ...clean,
          happens:
            "Your knight check on c7 forks the king on e8 and the rook on a8.",
        },
        facts
      )
    ).toEqual([]);
    expect(
      checkMoment(
        {
          ...clean,
          happens: "A fork is when one piece attacks two enemy pieces at once.",
        },
        facts
      )
    ).toEqual([]);
  });
});

describe("the proof", () => {
  it("resolves a reference to the line the app holds", () => {
    const p = resolveProof(
      { kind: "played", moveNumber: 8, color: "w" },
      facts
    );
    expect(p).not.toBeNull();
    expect(p!.sans[0]).toBe("Nc7+");
    expect(p!.startFen).toBe(fenBefore8);
    expect(p!.evalDisplay).toBeNull();
    expect(
      resolveProof({ kind: "engine", moveNumber: 9, color: "w" }, facts)
    ).toBeNull();
  });

  it("fails a reference the facts do not hold, naming what they do hold", () => {
    const f = checkProof({ kind: "engine", moveNumber: 9, color: "b" }, facts);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      field: "proof",
      check: "proof_unresolved",
      kind: "fact",
      computed: {
        kind: "engine",
        moveNumber: 9,
        color: "b",
        available: ["engine:8:w", "played:8:w"],
      },
    });
    expect(f[0].detail).toContain("engine:8:w, played:8:w");
  });

  it("replays the line and fails at the first illegal move, with the count of legal plies", () => {
    expect(replayLine(fenBefore8, ["Qxc1", "Rb8", "Qf4"])).toEqual({
      legalPlies: 3,
      failedSan: null,
    });
    const broken: MomentFacts = {
      ...facts,
      lines: [{ ...facts.lines[0], sans: ["Qxc1", "Zz9", "Qf4"] }],
    };
    const f = checkProof({ kind: "engine", moveNumber: 8, color: "w" }, broken);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      check: "proof_illegal",
      kind: "fact",
      computed: { legalPlies: 1, failedSan: "Zz9", plies: 3 },
    });
    expect(f[0].detail).toContain("Zz9 is not legal after 1 ply");
  });

  it("a null proof is not a failure", () => {
    expect(checkProof(null, facts)).toEqual([]);
  });
});

describe("moves and evaluations in the prose", () => {
  it("allows the moment's own move and flags any other move as the app's to draw", () => {
    expect(
      checkMoment(
        { ...clean, happens: "Instead 8. Qxc1 takes the queen for nothing." },
        facts
      )
    ).toEqual([]);
    const f = checkMoment(
      { ...clean, happens: "After 8. Qxc1 Rb8 9. Qf4 you are a queen up." },
      facts
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      field: "happens",
      check: "san_in_prose",
      kind: "shape",
      span: "Rb8 Qf4",
      computed: { moves: ["Rb8", "Qf4"], ownMoves: ["Nc7+", "Qxc1"] },
    });
  });

  it("flags an evaluation figure with the figure", () => {
    const f = checkMoment(
      { ...clean, idea: "It drops the eval to -2.11 at once." },
      facts
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      field: "idea",
      check: "eval_in_prose",
      kind: "shape",
      span: "-2.11",
      computed: { figure: "-2.11" },
    });
  });
});

describe("tactical words and pieces on squares", () => {
  it("fails an unlicensed tactical word and says what the board actually holds", () => {
    // Not definitional: it puts a piece on a square, so the tactical word is a claim.
    const f = checkMoment(
      {
        ...clean,
        happens:
          "Black then had a skewer on the c-file against the rook on a8.",
      },
      facts
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      field: "happens",
      check: "tactical_keyword",
      kind: "fact",
      span: "skewer",
    });
    expect(Array.isArray(f[0].computed.hangingSquares)).toBe(true);
    expect(Array.isArray(f[0].computed.pinnedSquares)).toBe(true);
    expect(f[0].detail).toMatch(
      /^Nothing in the facts for this move confirms a skewer; on this board the hanging pieces are /
    );
  });

  it("licenses 'hanging' from the review's board read even with an empty licence pool", () => {
    const bare: MomentFacts = { ...facts, licence: [] };
    // Before 8.Nc7+ Black's queen on c1 is attacked by the queen on d1 and defended by nothing.
    expect(
      checkMoment({ ...clean, happens: "The queen on c1 is hanging." }, bare)
    ).toEqual([]);
  });

  it("fails a piece that does not stand where the prose puts it, naming what does", () => {
    const f = checkMoment(
      { ...clean, happens: "The rook on c8 covers the file." },
      facts
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      field: "happens",
      check: "piece_on_square",
      kind: "fact",
      span: "rook on c8",
      computed: { square: "c8", claimed: "rook", found: "black bishop" },
    });
    expect(f[0].detail).toBe(
      "There is no rook on c8: on this board c8 is a black bishop."
    );
  });

  it("reads 'your' as the player's colour and an empty square as empty", () => {
    // The player is White; the queen on c1 is Black's.
    const f = checkMoment(
      { ...clean, idea: "Your queen on c1 was hanging." },
      facts
    );
    expect(f.map((x) => x.check)).toEqual(["piece_on_square"]);
    expect(f[0].computed).toEqual({
      square: "c1",
      claimed: "white queen",
      found: "black queen",
    });
    const g = checkMoment(
      { ...clean, idea: "The knight on e5 was loose." },
      facts
    );
    expect(g[0].computed).toEqual({
      square: "e5",
      claimed: "knight",
      found: "empty",
    });
    expect(g[0].detail).toBe(
      "There is no knight on e5: on this board e5 is empty."
    );
  });

  it("accepts a piece on the board after the move too", () => {
    // After 8.Nc7+ the knight stands on c7.
    expect(
      checkMoment(
        {
          ...clean,
          happens: "The knight on c7 gives check and attacks the rook on a8.",
        },
        facts
      )
    ).toEqual([]);
  });

  it("checks the question the same way", () => {
    const f = checkMoment(
      { ...clean, question: "What does your rook on c8 do now?" },
      facts
    );
    expect(f.map((x) => `${x.field}:${x.check}`)).toEqual([
      "question:piece_on_square",
    ]);
  });
});

describe("the lesson is a teaching class", () => {
  it("passes a pattern and a check with no board in them", () => {
    expect(checkLesson(clean.lesson)).toEqual([]);
    expect(checkLesson(null)).toEqual([]);
  });

  it("fails a check that names a square, a move or an evaluation", () => {
    const sq = checkLesson({
      pattern: "Loose pieces",
      check: "Always take the queen on c1 first.",
    });
    expect(sq).toHaveLength(1);
    expect(sq[0]).toMatchObject({
      field: "lesson",
      check: "lesson_not_teaching",
      kind: "fact",
      computed: { part: "check", squares: ["c1"] },
    });
    const mv = checkLesson({
      pattern: "Play 8. Qxc1 when you can",
      check: "Count the captures.",
    });
    expect(mv[0].computed).toMatchObject({ part: "pattern", moves: ["Qxc1"] });
    const ev = checkLesson({
      pattern: "Material first",
      check: "A +2.84 position is won.",
    });
    expect(ev[0].computed).toMatchObject({ part: "check", evals: ["+2.84"] });
    expect(ev[0].detail).toContain("the evaluation +2.84");
  });
});

describe("the budget", () => {
  it("counts sentences and words against the follow-up's budget", () => {
    const long = {
      ...clean,
      idea: "One sentence. Two sentences.",
      happens: "a ".repeat(50).trim(),
      lesson: { pattern: "Pattern", check: "word ".repeat(40).trim() },
      question: "One? Two?",
    };
    const f = checkBudget(long);
    expect(f.map((x) => `${x.field}:${x.check}`)).toEqual([
      "idea:budget",
      "happens:budget",
      "lesson:budget",
      "question:budget",
    ]);
    expect(f.every((x) => x.kind === "shape")).toBe(true);
    expect(f[0].computed).toEqual({ sentences: 2, limit: 1 });
    expect(f[1].computed).toEqual({ words: 54, limit: 45 });
    expect(f[2].computed).toEqual({ words: 41, limit: 35 });
    expect(f[3].computed).toEqual({ sentences: 2, limit: 1 });
  });

  it("takes an override", () => {
    expect(
      checkBudget({ ...clean, idea: "One. Two." }, { ideaSentences: 2 })
    ).toEqual([]);
  });

  it("an empty idea or happens is a fact failure", () => {
    const f = checkMoment({ ...clean, idea: "  " }, facts);
    expect(f.map((x) => `${x.field}:${x.check}:${x.kind}`)).toEqual([
      "idea:empty:fact",
    ]);
  });
});

describe("omitting failed fields (drop, never hedge)", () => {
  it("removes the fields with fact failures and keeps the ones with shape failures", () => {
    const envelope: MomentEnvelope = {
      ...clean,
      idea: "It drops the eval to -2.11 at once.",
      happens: "The rook on c8 covers the file.",
      lesson: {
        pattern: "Loose pieces",
        check: "Always take the queen on c1 first.",
      },
      proof: { kind: "engine", moveNumber: 9, color: "w" },
    };
    const failures = checkMoment(envelope, facts);
    const prose = omitFailedFields(envelope, failures, facts);
    expect(prose.omitted).toEqual(["happens", "proof", "lesson"]);
    expect(prose.idea).toBe(envelope.idea);
    expect(prose.happens).toBeNull();
    expect(prose.proof).toBeNull();
    expect(prose.lesson).toBeNull();
    expect(prose.question).toBe(clean.question);
    const text = momentToText(prose);
    expect(text).toBe(
      [
        `It drops the eval to -2.11 at once. ${ABSENCE_CLAUSE.happens} ${ABSENCE_CLAUSE.proof}`,
        `Your turn: ${clean.question}`,
      ].join("\n\n")
    );
  });

  it("a proof the facts cannot resolve is absent even when nothing checked it", () => {
    const prose = omitFailedFields(
      { ...clean, proof: { kind: "played", moveNumber: 30, color: "b" } },
      [],
      facts
    );
    expect(prose.omitted).toEqual(["proof"]);
    expect(prose.proof).toBeNull();
  });

  it("with no failures nothing is omitted", () => {
    const prose = omitFailedFields(clean, [], facts);
    expect(prose.omitted).toEqual([]);
    expect(prose.proof).toEqual(clean.proof);
  });
});
