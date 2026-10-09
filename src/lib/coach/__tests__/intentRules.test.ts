/**
 * The live router's rules (pathway PR 3.4): an order only through
 * parsePageTurn, an exact rule for every question the page writes, then
 * the 1.4 rules with their action and preference rules off, and a concept
 * reading set aside beside a word about the board. Fixture 07 (White's
 * 8. Nc7+ against 8. Qxc1) unless a case says otherwise.
 */
import { describe, expect, it } from "vitest";
import { MOVES } from "./fieldedFixture";
import { resolveQuestionAnchor } from "../questionAnchor";
import {
  BOARD_CUE_RE,
  intentFromModel,
  resolveLiveIntent,
  UI_RULES,
} from "../intentRules";
import { PAGE_TURN_KINDS } from "../pageActions";

/** route.pageActions.test.ts's 81-ply game, where move 20 exists. */
const LONG =
  "c4 e6 Nf3 d5 d4 Nf6 Nc3 Be7 Bg5 O-O e3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5 Rc1 Be6 Qa4 c5 Qa3 Rc8 Bb5 a6 dxc5 bxc5 O-O Ra7 Be2 Nd7 Nd4 Qf8 Nxe6 fxe6 e4 d4 f4 Qe7 e5 Rb8 Bc4 Kh8 Qh3 Nf8 b3 a5 f5 exf5 Rxf5 Nh7 Rcf1 Qd8 Qg3 Re7 h4 Rbb7 e6 Rbc7 Qe5 Qe8 a4 Qd8 R1f2 Qe8 R2f3 Qd8 Bd3 Qe8 Qe4 Nf6 Rxf6 gxf6 Rxf6 Kg8 Bc4 Kh8 Qf4".split(
    " "
  );

function live(
  question: string,
  opts: {
    moves?: readonly string[];
    viewedPly?: number;
    anchor?: "resolve" | "none";
  } = {}
) {
  const moves = opts.moves ?? MOVES;
  const anchor =
    opts.anchor === "none"
      ? null
      : resolveQuestionAnchor(question, moves, "w", opts.viewedPly);
  return resolveLiveIntent(question, { anchor, moves, playerColor: "w" });
}

describe("an order is read only through parsePageTurn", () => {
  it.each([
    ["why was move 20 bad?", LONG, "verdict:anchor"],
    ["go to move 20 and tell me why it was bad", LONG, "verdict:anchor_only"],
    ["why was move 8 bad?", MOVES, "verdict:anchor"],
    ["go to move 8 and tell me why it was bad", MOVES, "verdict:anchor_only"],
    ["Go to move 8, why was it bad?", MOVES, "verdict:anchor"],
    ["show me move 3: Nf3 again, why was it fine?", MOVES, "verdict:anchor"],
    [
      "flip the board and tell me why move 8 was bad",
      MOVES,
      "verdict:anchor_only",
    ],
  ])("%s is a verdict by rule, anchored", (q, moves, rule) => {
    const r = live(q, { moves });
    expect(r).toMatchObject({ intent: "verdict", rule, source: "rule" });
    expect(r.page).toBeUndefined();
  });

  it.each([
    "next move?",
    "last move",
    "last move was a mistake, right?",
    "would you play it?",
    "play it",
    "show me the line",
    "keep it short",
    "be more detailed",
  ])("%s is left to the router, never an order or a preference", (q) => {
    const r = live(q, { viewedPly: 20 });
    expect(r.intent).not.toBe("action");
    expect(r.intent).not.toBe("preference");
    expect(r).toMatchObject({
      intent: "unknown",
      rule: "none",
      source: "none",
    });
  });

  it("an order the page did not serve is page:<kind>, by rule", () => {
    expect(live("go to move 8")).toEqual({
      intent: "action",
      rule: "page:go_to_move",
      source: "rule",
      page: "go_to_move",
    });
    expect(live("flip the board")).toMatchObject({
      intent: "action",
      rule: "page:flip_board",
      page: "flip_board",
    });
    expect(live("play the line again")).toMatchObject({
      rule: "page:replay_line",
    });
    expect(live("can you go back one move?")).toMatchObject({
      rule: "page:step",
    });
    expect(live("back")).toMatchObject({ rule: "page:back" });
  });

  it("a side is a preference by the page's reading, never a perspective", () => {
    expect(live("coach me as Black")).toEqual({
      intent: "preference",
      rule: "page:side",
      source: "rule",
      page: "side",
    });
    expect(live("black")).toMatchObject({ rule: "page:side" });
    expect(live("back to my side")).toMatchObject({
      intent: "preference",
      rule: "page:my_side",
    });
  });

  it("every page:<kind> it can produce is a kind the page knows", () => {
    for (const q of [
      "flip the board",
      "go to move 8",
      "go to the start",
      "go to the end",
      "next move",
      "back",
      "back to the game",
      "play the line again",
      "I was Black",
      "back to my side",
    ]) {
      const r = live(q);
      expect(r.source).toBe("rule");
      expect(PAGE_TURN_KINDS).toContain(r.page);
      expect(r.rule).toBe(`page:${r.page}`);
    }
  });

  it("a slash command is still an action by rule", () => {
    expect(live("/puzzle-generation fork")).toMatchObject({
      intent: "action",
      rule: "action:slash",
      source: "rule",
    });
  });

  it("an empty question is unknown with no rule", () => {
    expect(live("")).toEqual({
      intent: "unknown",
      rule: "none",
      source: "none",
    });
    expect(live("   ")).toMatchObject({ source: "none" });
  });
});

describe("a concept beside a word about the board is set aside", () => {
  it.each([
    "what is a good move?",
    "what does this move mean?",
    "What is the best attack here?",
    "what does the pin mean here?",
    "what's a pin in this position?",
  ])("%s goes to the router with the veto", (q) => {
    expect(live(q, { viewedPly: 20 })).toEqual({
      intent: "unknown",
      rule: "none",
      source: "none",
      veto: "concept_on_board",
    });
  });

  it("a concept word beside an anchored move is a verdict", () => {
    expect(live("why was 8. Nc7+ a fork that failed?")).toMatchObject({
      intent: "verdict",
      rule: "verdict:anchor",
      source: "rule",
    });
  });

  it("'Why is the knight an outpost here?' is left to the router", () => {
    const r = live("Why is the knight an outpost here?", { viewedPly: 20 });
    expect(r).toMatchObject({ intent: "unknown", source: "none" });
    expect(r.veto).toBeUndefined();
  });

  it.each([
    "What is a minority attack?",
    "what does zugzwang mean",
    "What is a fork?",
  ])("%s keeps its concept reading", (q) => {
    expect(live(q, { viewedPly: 20 })).toEqual({
      intent: "concept",
      rule: "concept",
      source: "rule",
    });
  });
});

describe("a reading that changes the turn's shape is taken only where it is certain", () => {
  it.each([
    "How should I defend this?",
    "How do I defend the position?",
    "Can I defend against the fork?",
    "Can I continue attacking on the kingside?",
    "I want to play more actively, any tips?",
    "Could I play Bxf7?",
    "Can I play Bb5 here?",
    "What should I practice for this kind of endgame?",
  ])("%s is no mode entry: the router reads it", (q) => {
    const r = live(q, { anchor: "none" });
    expect(r).toMatchObject({
      intent: "unknown",
      rule: "none",
      source: "none",
    });
  });

  it("anchored, a move asked about in a mode's words is the what-if it is", () => {
    expect(live("Could I play 8. Qxc1 instead?")).toMatchObject({
      intent: "what_if",
      source: "rule",
    });
  });

  it.each([
    ["Let me try from here", "try_it"],
    ["Test me", "quiz"],
    ["Let me defend from before the blunder", "defend_it"],
    ["give me a puzzle", "quiz"],
  ])("%s is still the mode, by rule", (q, intent) => {
    expect(live(q, { anchor: "none" })).toMatchObject({
      intent,
      source: "rule",
    });
  });

  it.each([
    "what's the pin?",
    "what's the fork?",
    "What does the rook attack?",
    "What does the knight attack?",
    "what's the pawn structure?",
    "What's the right pawn break?",
    "What is the fork on c7?",
    "What's the sacrifice?",
  ])("%s is about the board: no definition by rule", (q) => {
    const r = live(q, { anchor: "none" });
    expect(r.intent).not.toBe("concept");
    expect(r.source).toBe("none");
  });

  it.each([
    "What is a minority attack?",
    "what does zugzwang mean",
    "What is a fork?",
  ])("%s is still a definition", (q) => {
    expect(live(q, { anchor: "none" })).toMatchObject({
      intent: "concept",
      source: "rule",
    });
  });

  it("a plan asked about the game played is not the position's plan", () => {
    expect(live("What was the plan behind 8. Nc7+?")).toMatchObject({
      intent: "verdict",
      rule: "verdict:anchor",
    });
    for (const q of [
      "What was the plan in this game?",
      "What was my plan in the middlegame?",
    ])
      expect(live(q, { anchor: "none" }).source, q).toBe("none");
    expect(
      live("What's my plan in this position?", { anchor: "none" })
    ).toMatchObject({ intent: "plan", source: "rule" });
  });
});

describe("every question the page writes is read by an exact rule", () => {
  const cases: Array<[string, string, string]> = [
    ["Analyze my game", "ui:analyze_game", "verdict"],
    ["Analyse my game.", "ui:analyze_game", "verdict"],
    ["Why was 8. Nc7+ a blunder?", "ui:why_was", "verdict"],
    ["Why was 7... Qxc1 a mistake?", "ui:why_was", "verdict"],
    ["Why was 3... cxd4 a inaccuracy?", "ui:why_was", "verdict"],
    ["Why was Nc7+ a blunder?", "ui:why_was", "verdict"],
    ["What did I miss with 8. Nc7+?", "ui:missed", "verdict"],
    ["What did my opponent miss with 9... Qxd1+?", "ui:missed", "verdict"],
    ["Why was 5. Nf3 so strong?", "ui:why_strong", "verdict"],
    ["Why was 8.Nc7+ brilliant?", "ui:why_strong", "verdict"],
    ["What was the idea behind 1. e4?", "ui:idea_behind", "verdict"],
    ["Which inaccuracies hurt me the most?", "ui:inaccuracies", "verdict"],
    [
      "What’s the most important moment in this game?",
      "ui:key_moment",
      "verdict",
    ],
    ["Show me one improvement to study", "ui:improvement", "progress"],
    ["What is each of my pieces doing right now?", "ui:pieces_now", "plan"],
    ["Tell me about the Sicilian Defense", "ui:opening", "opening"],
    [
      "Tell me about the Sicilian Defense: Open, Najdorf Variation",
      "ui:opening",
      "opening",
    ],
    [
      "Tell me about d6 from this position — 68K master games went this way (White won 50%, drew 25%, Black won 25%). What is the idea, and what does Black need to know before playing it?",
      "ui:masters",
      "what_if",
    ],
    [
      "Tell me about Nf3 from this position — the engine gives +0.30, top choice, and no master games reach here. What is the idea?",
      "ui:masters",
      "what_if",
    ],
    ["Tell me about O-O from this position.", "ui:masters", "what_if"],
  ];

  it.each(cases)("%s is %s, with its anchor and without", (q, rule, intent) => {
    for (const anchor of ["resolve", "none"] as const) {
      expect(live(q, { anchor, viewedPly: 20 })).toEqual({
        intent,
        rule,
        source: "rule",
      });
    }
  });

  it("the takeover and the other pills are read by the 1.4 rules", () => {
    expect(
      live(
        "Walk me through 8.Nc7+. What's the idea behind White's move, what were the alternatives, and what does it change about the position?"
      )
    ).toMatchObject({ intent: "walkthrough", source: "rule" });
    expect(live("Walk me through the blunder at 7...Qxc1")).toMatchObject({
      intent: "walkthrough",
    });
    expect(live("What's my biggest weakness here?")).toMatchObject({
      intent: "progress",
      rule: "progress",
    });
    expect(live("What was the key endgame idea?")).toMatchObject({
      intent: "endgame",
      rule: "endgame",
    });
  });

  it("the opening rule leaves out what is not an opening's name", () => {
    expect(live("tell me about the minority attack").rule).not.toBe(
      "ui:opening"
    );
    expect(live("Tell me about the Sicilian after 2. Nf3 d6").rule).not.toBe(
      "ui:opening"
    );
    expect(live("Tell me about the Sicilian Defense, 6.Bg5").rule).not.toBe(
      "ui:opening"
    );
    expect(live("Tell me about the game").rule).not.toBe("ui:opening");
  });

  it("a rule matches the whole question, never a prefix of a longer one", () => {
    expect(
      live("Why was 8. Nc7+ a blunder? And what about Kd8?").rule
    ).not.toBe("ui:why_was");
    expect(live("Analyze my game and then flip the board").rule).not.toBe(
      "ui:analyze_game"
    );
  });

  it("every rule is named ui: and reads to one of the intents", () => {
    const rules = UI_RULES.map((r) => r.rule);
    expect(new Set(rules).size).toBe(rules.length);
    for (const r of UI_RULES) expect(r.rule.startsWith("ui:")).toBe(true);
  });
});

describe("the router's reading, as the table may use it", () => {
  it("a model never chooses an order or a setting", () => {
    expect(intentFromModel("action", "next move?")).toEqual({
      intent: "unknown",
      overridden: "action",
    });
    expect(intentFromModel("preference", "keep it short")).toEqual({
      intent: "unknown",
      overridden: "preference",
    });
  });

  it("a concept beside a board word is set aside, the safe direction included", () => {
    expect(
      intentFromModel("concept", "what's a pin in this position?")
    ).toEqual({ intent: "unknown", overridden: "concept_on_board" });
    expect(intentFromModel("concept", "why are doubled pawns bad?")).toEqual({
      intent: "unknown",
      overridden: "concept_on_board",
    });
    expect(intentFromModel("concept", "What is an outpost?")).toEqual({
      intent: "concept",
    });
  });

  it("a mode is never the model's reading of a question about a move or the board", () => {
    expect(
      intentFromModel("defend_it", "How should I defend this?").intent
    ).toBe("unknown");
    expect(intentFromModel("try_it", "Can I play Bb5 here?").intent).toBe(
      "unknown"
    );
    expect(intentFromModel("quiz", "Can you test me on forks?").intent).toBe(
      "quiz"
    );
  });

  it("the model's concept beside a piece of this board or a square is set aside", () => {
    expect(
      intentFromModel("concept", "What does the rook attack?").intent
    ).toBe("unknown");
    expect(intentFromModel("concept", "is the pin on e7 real").intent).toBe(
      "unknown"
    );
    expect(
      intentFromModel("concept", "What is the Philidor defence about?").intent
    ).toBe("concept");
  });

  it("the model's plan for the game played is a verdict on it", () => {
    expect(
      intentFromModel("plan", "What was the plan in this game?").intent
    ).toBe("verdict");
    expect(intentFromModel("plan", "Is my king safe?").intent).toBe("plan");
  });

  it("every other intent passes through", () => {
    expect(intentFromModel("plan", "is my king safe?")).toEqual({
      intent: "plan",
    });
    expect(intentFromModel("verdict", "what went wrong?")).toEqual({
      intent: "verdict",
    });
    expect(intentFromModel("unknown", "hmm")).toEqual({ intent: "unknown" });
  });

  it("the board cue reads whole words", () => {
    expect(BOARD_CUE_RE.test("what is a pin here")).toBe(true);
    expect(BOARD_CUE_RE.test("what is a fork?")).toBe(false);
    expect(BOARD_CUE_RE.test("what is somewhere")).toBe(false);
  });
});
