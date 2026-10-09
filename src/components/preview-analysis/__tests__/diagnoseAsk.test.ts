import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Chess } from "chess.js";
import type { PositionEval } from "@/types/eval";
import type { GameStoryInput } from "@/lib/coach/gameStory";
import { resolveQuestionAnchor } from "@/lib/coach/questionAnchor";
import { parsePageTurn } from "@/lib/coach/pageActions";
import type { CompactContract } from "@/lib/contract/followUp";
import {
  refereeFollowUp,
  type LicensedLine,
} from "@/lib/contract/followUpReferee";
import {
  diagnoseMomentAt,
  findDiagnoseMoment,
  threatAt,
  type DiagnoseMoment,
  type ThreatTruth,
} from "@/lib/diagnose/decisiveMoment";
import {
  gradeAnswer,
  type DiagnoseCause,
  type DiagnoseResult,
} from "@/lib/diagnose/gradeAnswer";
import {
  answerEcho,
  askedKey,
  diagnoseAskText,
  diagnoseDue,
  diagnoseStripWords,
  diagnoseVariant,
  gradedReplyText,
  markAsked,
  planPrefill,
  readTypedAnswer,
  replyMood,
  skipReplyText,
  typePlaceholder,
  wasAsked,
  type DiagnoseDueInput,
} from "../diagnoseAsk";

const REAL = path.join(
  process.cwd(),
  "src/lib/contract/__tests__/fixtures-real"
);

function fixture07(player: "w" | "b" | null): GameStoryInput {
  const fx = JSON.parse(
    fs.readFileSync(path.join(REAL, "07_knight_fork.json"), "utf8")
  );
  return {
    positions: fx.gameEval.positions,
    sans: fx.moveHistory,
    white: fx.gameHeaders?.white ?? null,
    black: fx.gameHeaders?.black ?? null,
    result: fx.gameHeaders?.result ?? null,
    playerColor: player,
    declaredDepth: fx.gameEval.settings?.depth ?? null,
  };
}

const WHITE = fixture07("w");
const BLACK = fixture07("b");
/** Black's costliest move, 7... Qxc1, and the queen 8. Qxc1 takes back. */
const BLACK_MOMENT = findDiagnoseMoment(BLACK)!;
const BLACK_TRUTH = threatAt(BLACK_MOMENT, BLACK.positions!)!;
/** The move the game turned on, 8. Nc7+, whose reply (8... Kd8) is no threat. */
const WHITE_MOMENT = findDiagnoseMoment(WHITE)!;
/** 6. Na3, asked about from its card: 6... Qxa1 takes the rook. */
const ASKED_MOMENT = diagnoseMomentAt(WHITE, 11)!;

const due = (over: Partial<DiagnoseDueInput> = {}): DiagnoseDueInput => ({
  enabled: true,
  storyReady: true,
  sweepLanded: true,
  sideKnown: true,
  streaming: false,
  drilling: false,
  askedThisLoad: false,
  askedBefore: false,
  ...over,
});

const result = (
  truth: ThreatTruth,
  over: Partial<DiagnoseResult>
): DiagnoseResult => ({
  grade: "miss",
  cause: "hanging",
  partialBy: null,
  answer: null,
  truth,
  ...over,
});

describe("diagnoseDue", () => {
  it("asks only when every condition holds", () => {
    expect(diagnoseDue(due())).toBe(true);
    const blockers: Partial<DiagnoseDueInput>[] = [
      { enabled: false },
      { storyReady: false },
      { sweepLanded: false },
      { sideKnown: false },
      { streaming: true },
      { drilling: true },
      { askedThisLoad: true },
      { askedBefore: true },
    ];
    for (const b of blockers)
      expect(diagnoseDue(due(b)), JSON.stringify(b)).toBe(false);
  });
});

describe("diagnoseVariant", () => {
  it("is the threat with a concrete reply, the plan without one and only for a reader who can send it", () => {
    expect(diagnoseVariant(BLACK_TRUTH, true)).toBe("threat");
    expect(diagnoseVariant(BLACK_TRUTH, false)).toBe("threat");
    expect(diagnoseVariant(null, true)).toBe("plan");
    expect(diagnoseVariant(null, false)).toBeNull();
  });
});

describe("the copy, on fixture 07 for both sides", () => {
  it("picks the moments the copy is about", () => {
    expect(BLACK_MOMENT).toMatchObject({ label: "7... Qxc1", source: "swing" });
    expect(BLACK_TRUTH.label).toBe("8. Qxc1");
    expect(WHITE_MOMENT).toMatchObject({
      label: "8. Nc7+",
      source: "decisive",
    });
    expect(threatAt(WHITE_MOMENT, WHITE.positions!)).toBeNull();
    expect(ASKED_MOMENT).toMatchObject({ label: "6. Na3", source: "asked" });
  });

  it("asks the threat, the plan, and at a move the reader asked about", () => {
    expect(diagnoseAskText(BLACK_MOMENT, "threat")).toBe(
      "Let's go back to 7... Qxc1, the move that cost you the most.\n\nYour turn: After 7... Qxc1, what was White threatening? Show me White's move."
    );
    expect(diagnoseAskText(WHITE_MOMENT, "plan")).toBe(
      "Let's go back to 8. Nc7+, the move the game turned on.\n\nYour turn: What was your plan with 8. Nc7+?"
    );
    expect(diagnoseAskText(ASKED_MOMENT, "threat")).toBe(
      "Let's look at 6. Na3.\n\nYour turn: After 6. Na3, what was Black threatening? Show me Black's move."
    );
  });

  it("fills the composer and says what it is for", () => {
    expect(planPrefill(WHITE_MOMENT)).toBe("My plan with 8. Nc7+ was ");
    expect(typePlaceholder(BLACK_MOMENT)).toBe(
      "Type the move you think White wanted"
    );
    expect(typePlaceholder(ASKED_MOMENT)).toBe(
      "Type the move you think Black wanted"
    );
  });

  it("says each grade in its own first sentence, then the line and the lesson", () => {
    const m = BLACK_MOMENT;
    const t = BLACK_TRUTH;
    const tail = (cause: string) =>
      `\n\n[CONTINUATION:8:w]\n\nLesson: ${cause}`;
    const exact = gradeAnswer(m.fenAfter, m.ply, t, {
      kind: "move",
      uci: "d1c1",
    })!;
    expect(gradedReplyText(m, exact)).toBe(
      "You saw it: 8. Qxc1 was the threat. The slip came after, when 7... Qxc1 didn't stop it." +
        tail(
          "Seen, then played into. When you spot a threat, picture the board after your move and look for it again before you play."
        )
    );
    const threat = gradeAnswer(m.fenAfter, m.ply, t, {
      kind: "move",
      uci: "b5c7",
    })!;
    expect(threat).toMatchObject({ grade: "partial", partialBy: "threat" });
    expect(gradedReplyText(m, threat)).toBe(
      "8. Nc7+ was a real threat too, but 8. Qxc1 was the one that hurt." +
        tail(
          "A loose piece. Before each move, count attackers and defenders on every piece you leave behind, and fix the one that comes up short."
        )
    );
    const first = (r: DiagnoseResult) => gradedReplyText(m, r).split("\n\n")[0];
    expect(first(result(t, { grade: "partial", partialBy: "target" }))).toBe(
      "Right square, wrong move. The threat was 8. Qxc1."
    );
    expect(first(result(t, { grade: "partial", partialBy: "piece" }))).toBe(
      "Right piece, wrong move. The threat was 8. Qxc1."
    );
    expect(first(result(t, { grade: "partial", partialBy: "weakness" }))).toBe(
      "You found a weak spot, but the threat was 8. Qxc1."
    );
    const miss = gradeAnswer(m.fenAfter, m.ply, t, {
      kind: "move",
      uci: "h2h3",
    })!;
    expect(miss.grade).toBe("miss");
    expect(first(miss)).toBe("Not that one. The threat was 8. Qxc1.");
    const noIdea = gradeAnswer(m.fenAfter, m.ply, t, { kind: "no-idea" })!;
    expect(gradedReplyText(m, noIdea)).toBe(
      "That's what this is for. The threat was 8. Qxc1." +
        tail(
          "Moving without the blunder check. Before every move, ask what your opponent wants to do next: checks first, then captures, then threats."
        )
    );
    expect(skipReplyText(m)).toBe("Skipped. Ask me about 7... Qxc1 any time.");
    // White's reply at a Black move is Black's line: 6... Qxa1.
    const asked = threatAt(ASKED_MOMENT, WHITE.positions!)!;
    const askedNoIdea = gradeAnswer(
      ASKED_MOMENT.fenAfter,
      ASKED_MOMENT.ply,
      asked,
      { kind: "no-idea" }
    )!;
    expect(gradedReplyText(ASKED_MOMENT, askedNoIdea)).toMatch(
      /^That's what this is for\. The threat was 6\.\.\. Qxa1\.\n\n\[CONTINUATION:6:b\]\n\nLesson: /
    );
  });

  it("echoes the answer, picks Masti's face, and words the strip", () => {
    const t = BLACK_TRUTH;
    const answered = {
      uci: "d1c1",
      san: "Qxc1",
      label: "8. Qxc1",
    };
    expect(answerEcho(result(t, { grade: "exact", answer: answered }))).toBe(
      "8. Qxc1"
    );
    expect(answerEcho(result(t, { grade: "no-idea" }))).toBe("No idea");
    expect(answerEcho("skip")).toBe("Skip");
    expect(replyMood(result(t, { grade: "exact" }))).toBe("excited");
    expect(replyMood(result(t, { grade: "partial" }))).toBe("idea");
    expect(replyMood(result(t, { grade: "miss" }))).toBe("pointing");
    expect(replyMood(result(t, { grade: "no-idea" }))).toBe("pointing");
    expect(replyMood("skip")).toBe("wave");
    expect(diagnoseStripWords(BLACK_MOMENT, null)).toEqual({
      eyebrow: "Your answer",
      text: "White to move after 7... Qxc1",
    });
    expect(diagnoseStripWords(BLACK_MOMENT, "8. Qxc1")).toEqual({
      eyebrow: "Your answer",
      text: "8. Qxc1",
    });
  });

  it("has no dash and no semicolon anywhere", () => {
    const t = BLACK_TRUTH;
    const all: string[] = [
      diagnoseAskText(BLACK_MOMENT, "threat"),
      diagnoseAskText(WHITE_MOMENT, "plan"),
      diagnoseAskText(ASKED_MOMENT, "threat"),
      planPrefill(WHITE_MOMENT),
      typePlaceholder(BLACK_MOMENT),
      skipReplyText(BLACK_MOMENT),
      diagnoseStripWords(BLACK_MOMENT, null).text,
      diagnoseStripWords(BLACK_MOMENT, null).eyebrow,
    ];
    for (const grade of ["exact", "partial", "miss", "no-idea"] as const)
      for (const partialBy of [
        "threat",
        "target",
        "piece",
        "weakness",
        null,
      ] as const)
        all.push(
          gradedReplyText(
            BLACK_MOMENT,
            result(t, {
              grade,
              partialBy,
              answer: { uci: "b5c7", san: "Nc7+", label: "8. Nc7+" },
            })
          )
        );
    for (const text of all) expect(text).not.toMatch(/[—;]/);
  });
});

describe("readTypedAnswer", () => {
  const fen = BLACK_MOMENT.fenAfter;
  it("reads a whole-message move, 'no idea' and 'skip'", () => {
    for (const text of [
      "Qxc1",
      "8. Qxc1",
      "8\u2026 Qxc1",
      "...Qxc1",
      "d1c1",
      "Qxc1!",
      " Qc1 ",
    ])
      expect(readTypedAnswer(text, fen), text).toEqual({
        kind: "move",
        uci: "d1c1",
      });
    expect(
      readTypedAnswer(
        "0-0",
        "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1"
      )
    ).toEqual({ kind: "move", uci: "e1g1" });
    for (const text of [
      "no idea",
      "No idea.",
      "I don't know",
      "I don\u2019t know",
      "i dont know",
      "IDK",
      "dunno",
      "not sure",
      "no clue!",
    ])
      expect(readTypedAnswer(text, fen), text).toEqual({ kind: "no-idea" });
    for (const text of ["skip", "Skip it.", "SKIP!"])
      expect(readTypedAnswer(text, fen), text).toEqual({ kind: "skip" });
  });

  it("leaves anything else to the coach", () => {
    for (const text of [
      "why Qxc1?",
      "Qxc1 because it hangs",
      "qxc1",
      "Qxh8",
      "Nxa8",
      "",
      "skip this one",
      "I have no idea why",
    ])
      expect(readTypedAnswer(text, fen), text).toBeNull();
  });
});

describe("the asked-games store", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is keyed like the side, and remembers a game", () => {
    const key = askedKey({ White: "A", Black: "B", Date: "2026.10.09" }, 20);
    expect(key).toBe("A|B|2026.10.09|20");
    expect(askedKey({}, 20)).toBeNull();
    expect(wasAsked(key)).toBe(false);
    markAsked(key);
    expect(wasAsked(key)).toBe(true);
    expect(wasAsked("A|B|2026.10.09|21")).toBe(false);
    markAsked(null);
    expect(wasAsked(null)).toBe(false);
  });

  it("survives a corrupt or absent store", () => {
    store["cm-analysis-diagnosed"] = "{not json";
    expect(wasAsked("k")).toBe(false);
    markAsked("k");
    expect(wasAsked("k")).toBe(true);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(wasAsked("k")).toBe(false);
    expect(() => markAsked("k")).not.toThrow();
  });

  it("caps the store at 100 games, dropping the oldest", () => {
    for (let i = 0; i < 105; i++) markAsked(`game-${i}`);
    const keys = JSON.parse(store["cm-analysis-diagnosed"]);
    expect(keys).toHaveLength(100);
    expect(wasAsked("game-0")).toBe(false);
    expect(wasAsked("game-4")).toBe(false);
    expect(wasAsked("game-5")).toBe(true);
    expect(wasAsked("game-104")).toBe(true);
  });
});

describe("the plan's answer is an ordinary follow-up about the move", () => {
  const sans = WHITE.sans;
  it("anchors on the moment through the chat route's resolver, and is no order", () => {
    for (const [m, index] of [
      [WHITE_MOMENT, 14],
      [BLACK_MOMENT, 13],
    ] as const) {
      const text = `${planPrefill(m)}to win the rook on a8.`;
      const color = m.color;
      expect(resolveQuestionAnchor(text, sans, color)).toMatchObject({
        index,
        matched: "numbered",
      });
      expect(
        resolveQuestionAnchor(text, sans, color, undefined, {
          defaultSide: color,
          sideConfirmed: true,
        })
      ).toMatchObject({ index, matched: "numbered" });
      expect(parsePageTurn(text)).toBeNull();
      expect(parsePageTurn(planPrefill(m))).toBeNull();
    }
  });
});

/** A contract with no insights: nothing is licensed by a review. */
const EMPTY_CONTRACT: CompactContract = {
  contractId: "c-empty",
  contractVersion: "1.0",
  playerColor: "b",
  resultText: "White resigned",
  finalMaterial: "level",
  accuracy: null,
  insights: [],
  forbiddenClaimClasses: [],
};

/** Every engine line the review holds at the moment's ply, as SAN from the board after it. */
function linesAt(
  m: DiagnoseMoment,
  positions: readonly PositionEval[]
): LicensedLine[] {
  return positions[m.ply].lines.map((l) => {
    const g = new Chess(m.fenAfter);
    const sans: string[] = [];
    for (const uci of l.pv.slice(0, 8)) {
      try {
        sans.push(
          g.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci[4],
          }).san
        );
      } catch {
        break;
      }
    }
    return { startFen: m.fenAfter, startPly: m.ply, sans };
  });
}

describe("the follow-up referee drops nothing of a graded reply", () => {
  const CAUSES: DiagnoseCause[] = [
    "check",
    "hanging",
    "fork",
    "calculation",
    "guess",
  ];
  const cases: [string, DiagnoseMoment, GameStoryInput][] = [
    ["7... Qxc1", BLACK_MOMENT, BLACK],
    ["6. Na3", ASKED_MOMENT, WHITE],
  ];
  it.each(cases)("at %s, every grade with every lesson", (_l, m, input) => {
    const truth = threatAt(m, input.positions!)!;
    const lines = linesAt(m, input.positions!);
    const engine = truth.engineReplies[0];
    const results: DiagnoseResult[] = [
      gradeAnswer(m.fenAfter, m.ply, truth, { kind: "move", uci: truth.uci })!,
      gradeAnswer(m.fenAfter, m.ply, truth, { kind: "no-idea" })!,
      result(truth, { grade: "partial", partialBy: "target" }),
      result(truth, { grade: "partial", partialBy: "piece" }),
      result(truth, { grade: "partial", partialBy: "weakness" }),
      result(truth, { grade: "miss" }),
    ];
    if (engine) {
      const threat = gradeAnswer(m.fenAfter, m.ply, truth, {
        kind: "move",
        uci: engine,
      })!;
      if (threat.partialBy === "threat") results.push(threat);
    }
    expect(results.length).toBeGreaterThanOrEqual(6);
    for (const r of results)
      for (const cause of CAUSES) {
        const reply = gradedReplyText(m, { ...r, cause });
        const res = refereeFollowUp({
          reply,
          compact: EMPTY_CONTRACT,
          activeFen: m.fenAfter,
          moveHistory: input.sans,
          activePly: m.ply,
          extraLines: lines,
        });
        expect(res.dropped, reply).toEqual([]);
      }
  });

  it("the threat partial at 7... Qxc1 is checked too", () => {
    expect(BLACK_TRUTH.engineReplies[0]).toBe("b5c7");
  });
});
