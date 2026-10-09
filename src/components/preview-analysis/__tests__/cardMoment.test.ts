import { afterEach, describe, expect, it, vi } from "vitest";
import { cardKey } from "@/lib/coach/turnMoment";
import {
  LADDER_NOTE_KIND_PRIORITY,
  renderLadderNote,
  type LadderNoteKind,
} from "@/lib/contract/ladderNote";
import { parseInsights } from "@/components/AICoachInsights.parser";
import {
  TURN1_MOMENTS_DEFAULT,
  insightBlockKeys,
  insightMoments,
  isTurnMomentsEnabledPublic,
  ladderNoteIn,
  momentForInsight,
  readTurnMoment,
  type CardMoment,
} from "../cardMoment";

const FEN = "r1b1kbnr/pp1ppppp/2n5/1N6/4P3/5N2/P1P2PPP/2qQKB1R w Kkq - 0 8";

const CARD_8 = [
  "[INSIGHT:8:w:blunder:+2.84:-2.11:Nc7+:Qxc1]",
  "You spotted a fork, but the free queen was the bigger prize.",
  "[WHY]",
  "Idea: You saw the knight fork on c7 hitting the king and the rook on a8.",
  "Problem: The queen on c1 was hanging with no defenders.",
  "Solution: 8. Qxc1 takes the queen immediately.",
  "The takeaway: collect the most valuable free piece before you start a combination.",
  "[/WHY]",
  "[/INSIGHT]",
].join("\n");

const CARD_9 = [
  "[INSIGHT:9:w:mistake:-2.11:-4.90:Nxa8:Qxa1]",
  "The rook was a smaller prize than it looked.",
  "[WHY]",
  "Idea: You took the rook in the corner.",
  "Problem: The queen on d1 was the piece to save first.",
  "[/WHY]",
  "[/INSIGHT]",
].join("\n");

/** A lifted moment as the wire carries it (turnMoments.ts, fixture 07's M2). */
const WIRE = {
  idea: "You saw the knight fork on c7 hitting the king and the rook on a8.",
  happens: "The queen on c1 was hanging with no defenders.",
  proof: { kind: "engine", moveNumber: 8, color: "w" },
  lesson: {
    pattern: "",
    check:
      "collect the most valuable free piece before you start a combination.",
  },
  question: null,
  more: "Solution: 8. Qxc1 takes the queen immediately.",
  omitted: [],
  ply: 14,
  fen: FEN,
  move: {
    san: "Nc7+",
    moveNumber: 8,
    color: "w",
    verdict: "blunder",
    evalBefore: "+2.84",
    evalAfter: "-2.11",
  },
  annotations: [{ kind: "square", square: "c1", by: "engine" }],
  proofLine: {
    kind: "engine",
    moveNumber: 8,
    color: "w",
    startFen: FEN,
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
    key: cardKey(CARD_8),
  },
};

describe("the turn-1 moments flag", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is off by default and the env turns it either way", () => {
    expect(TURN1_MOMENTS_DEFAULT).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_COACH_TURN1_MOMENTS", "");
    expect(isTurnMomentsEnabledPublic()).toBe(false);
    for (const on of ["1", "on", "true", " TRUE "]) {
      vi.stubEnv("NEXT_PUBLIC_COACH_TURN1_MOMENTS", on);
      expect(isTurnMomentsEnabledPublic()).toBe(true);
    }
    for (const off of ["0", "off", "false", "yes"]) {
      vi.stubEnv("NEXT_PUBLIC_COACH_TURN1_MOMENTS", off);
      expect(isTurnMomentsEnabledPublic()).toBe(false);
    }
  });
});

describe("readTurnMoment", () => {
  it("keeps the card and the prose, and nothing computed on the moment", () => {
    const read = readTurnMoment(JSON.parse(JSON.stringify(WIRE)))!;
    expect(read).toEqual({
      card: WIRE.card,
      prose: {
        idea: WIRE.idea,
        happens: WIRE.happens,
        proof: WIRE.proof,
        lesson: WIRE.lesson,
        question: null,
        more: WIRE.more,
        omitted: [],
      },
    });
    // Nothing that could reach the board: no position, no move, no line,
    // no marks and no actions.
    expect(Object.keys(read).sort()).toEqual(["card", "prose"]);
    for (const k of [
      "fen",
      "ply",
      "move",
      "annotations",
      "proofLine",
      "actions",
    ])
      expect(JSON.stringify(read)).not.toContain(`"${k}"`);
  });

  it("refuses a card reference of the wrong shape", () => {
    const withCard = (patch: Record<string, unknown>) =>
      readTurnMoment({ ...WIRE, card: { ...WIRE.card, ...patch } });
    expect(withCard({ key: "ABCDEF12" })).toBeNull();
    expect(withCard({ key: "abc" })).toBeNull();
    expect(withCard({ key: 12345678 })).toBeNull();
    expect(withCard({ color: "white" })).toBeNull();
    expect(withCard({ moveNumber: 0 })).toBeNull();
    expect(withCard({ moveNumber: 1000 })).toBeNull();
    expect(withCard({ moveNumber: 8.5 })).toBeNull();
    expect(withCard({ playedSan: "" })).toBeNull();
    expect(withCard({ factIdPrefix: " " })).toBeNull();
    expect(readTurnMoment({ ...WIRE, card: undefined })).toBeNull();
  });

  it("refuses prose of the wrong shape, a question, or neither line", () => {
    expect(readTurnMoment({ ...WIRE, idea: 3 })).toBeNull();
    expect(readTurnMoment({ ...WIRE, lesson: "a lesson" })).toBeNull();
    expect(readTurnMoment({ ...WIRE, omitted: ["board"] })).toBeNull();
    expect(
      readTurnMoment({ ...WIRE, question: "Which piece can take it" })
    ).toBeNull();
    expect(readTurnMoment({ ...WIRE, idea: null, happens: " " })).toBeNull();
    expect(readTurnMoment(null)).toBeNull();
    expect(readTurnMoment([WIRE])).toBeNull();
    // One line is enough.
    expect(readTurnMoment({ ...WIRE, idea: null })?.prose.happens).toBe(
      WIRE.happens
    );
  });
});

describe("insightBlockKeys", () => {
  it("keys each closed card on its exact text, by header, and stops at an unclosed tail", () => {
    const review = [
      "The fork was tempting.",
      "",
      CARD_8,
      "",
      CARD_9,
      "",
      "[INSIGHT:10:w:blunder:-4.90:-9.00:Kxd1:Kxd1]",
      "Still streaming",
    ].join("\n");
    expect(insightBlockKeys(review)).toEqual([
      { moveNumber: 8, color: "w", playedMove: "Nc7+", key: cardKey(CARD_8) },
      { moveNumber: 9, color: "w", playedMove: "Nxa8", key: cardKey(CARD_9) },
    ]);
  });

  it("skips a header parseInsights would drop, and keeps scanning", () => {
    const bad = "[INSIGHT:8:w:blunder]\nNo header.\n[/INSIGHT]";
    expect(insightBlockKeys(`${bad}\n${CARD_9}`)).toEqual([
      { moveNumber: 9, color: "w", playedMove: "Nxa8", key: cardKey(CARD_9) },
    ]);
    expect(parseInsights(`${bad}\n${CARD_9}`).insights).toHaveLength(1);
  });
});

describe("momentForInsight", () => {
  const moment = readTurnMoment(WIRE)!;
  const review = `Intro.\n\n${CARD_8}\n\n${CARD_9}`;
  const blocks = insightBlockKeys(review);
  const [i8, i9] = parseInsights(review).insights;

  it("draws the moment beside the card it was lifted from, and no other", () => {
    expect(momentForInsight([moment], blocks, i8)).toEqual(moment.prose);
    expect(momentForInsight([moment], blocks, i9)).toBeNull();
    expect(momentForInsight(undefined, blocks, i8)).toBeNull();
    expect(insightMoments([moment], review, [i8, i9])).toEqual([
      moment.prose,
      null,
    ]);
  });

  it("refuses a moment whose key is another text's", () => {
    const edited = review.replace("bigger prize", "bigger prize!");
    const [e8] = parseInsights(edited).insights;
    expect(momentForInsight([moment], insightBlockKeys(edited), e8)).toBe(null);
    const stale: CardMoment = {
      ...moment,
      card: { ...moment.card, key: cardKey(CARD_9) },
    };
    expect(momentForInsight([stale], blocks, i8)).toBeNull();
  });

  it("refuses a moment that names another move than the card's", () => {
    const other: CardMoment = {
      ...moment,
      card: { ...moment.card, playedSan: "Nd6+" },
    };
    expect(momentForInsight([other], blocks, i8)).toBeNull();
    expect(
      momentForInsight([moment], blocks, { ...i8, playedMove: "Nd6+" })
    ).toBeNull();
    const black: CardMoment = {
      ...moment,
      card: { ...moment.card, color: "b" },
    };
    expect(momentForInsight([black], blocks, i8)).toBeNull();
  });

  it("two cards for one move each take the moment of their own text", () => {
    const second = CARD_8.replace(
      "the bigger prize.",
      "the bigger prize, again."
    );
    const twice = `${CARD_8}\n\n${second}`;
    const m2: CardMoment = {
      card: { ...moment.card, key: cardKey(second) },
      prose: { ...moment.prose, idea: "The second card's idea." },
    };
    const insights = parseInsights(twice).insights;
    expect(insightMoments([m2, moment], twice, insights)).toEqual([
      moment.prose,
      m2.prose,
    ]);
    expect(insightMoments([m2], twice, insights)).toEqual([null, m2.prose]);
  });
});

describe("ladderNoteIn", () => {
  const kindSets: LadderNoteKind[][] = [
    ...LADDER_NOTE_KIND_PRIORITY.map((k) => [k]),
    ...LADDER_NOTE_KIND_PRIORITY.map((k) => [k, k, k]),
    ["move", "tactic"],
    ["pieces", "evaluation"],
    ["point", "move"],
    ["tactic", "evaluation", "move", "pieces"],
  ];

  it("finds every line the ladder can write, on a line of its own in the lede", () => {
    for (const kinds of kindSets) {
      const note = renderLadderNote(kinds)!;
      expect(ladderNoteIn(`You went for the fork.\n${note}`)).toBe(note);
      expect(ladderNoteIn(note)).toBe(note);
    }
  });

  it("finds nothing in prose the ladder did not write", () => {
    expect(ladderNoteIn(undefined)).toBeNull();
    expect(ladderNoteIn("You went for the fork.")).toBeNull();
    expect(
      ladderNoteIn(
        "You went for the fork. I left out a tactic I couldn't check."
      )
    ).toBeNull();
    expect(ladderNoteIn("I left out the rook I couldn't save.")).toBeNull();
  });
});
