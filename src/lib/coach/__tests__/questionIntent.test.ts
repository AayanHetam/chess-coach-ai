/**
 * The shadow intent router: rules where a rule can be sure, `unknown`
 * everywhere else. Fixture 07 for the anchored cases (White's 8. Nc7+
 * against 8. Qxc1).
 */
import { describe, expect, it } from "vitest";
import { resolveQuestionAnchor } from "../questionAnchor";
import {
  QUESTION_INTENTS,
  resolveQuestionIntent,
  type IntentContext,
} from "../questionIntent";

const MOVES =
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Qb6 Nf3 Qxb2 Na3 Qxa1 Nb5 Qxc1 Nc7+ Kd8 Nxa8 Qxd1+ Kxd1 e5".split(
    " "
  );

function route(
  question: string,
  playerColor: "w" | "b" = "w",
  moves: readonly string[] = MOVES
) {
  const ctx: IntentContext = {
    anchor: resolveQuestionAnchor(question, moves, playerColor),
    moves,
    playerColor,
  };
  return resolveQuestionIntent(question, ctx);
}

describe("actions run first and need the verb at the start", () => {
  it("reads a slash command", () => {
    expect(route("/puzzle-generation")).toEqual({
      intent: "action",
      rule: "action:slash",
      action: { kind: "slash", command: "puzzle-generation" },
    });
  });

  it("flips the board", () => {
    expect(route("Flip the board")).toMatchObject({
      intent: "action",
      action: { kind: "flip_board" },
    });
    expect(route("can you flip the board please")).toMatchObject({
      intent: "action",
      action: { kind: "flip_board" },
    });
  });

  it("goes to a move by the player's own move number", () => {
    expect(route("Go to move 8")).toEqual({
      intent: "action",
      rule: "action:go_to_move",
      action: { kind: "go_to_ply", ply: 15 },
    });
    expect(route("go to move 8", "b")).toEqual({
      intent: "action",
      rule: "action:go_to_move",
      action: { kind: "go_to_ply", ply: 16 },
    });
    expect(route("show me move 3")).toMatchObject({
      action: { kind: "go_to_ply", ply: 5 },
    });
  });

  it("'why was move 8 bad' is not an action", () => {
    const r = route("why was move 8 bad?");
    expect(r.intent).toBe("verdict");
    expect(r.action).toBeUndefined();
  });

  it("a move number the game never reached is not an action the app can do", () => {
    expect(route("go to move 40").intent).not.toBe("action");
  });

  it("start, end, steps, replay and back to the game", () => {
    expect(route("go to the start")).toMatchObject({
      action: { kind: "go_to_start" },
    });
    expect(route("jump to the end")).toMatchObject({
      action: { kind: "go_to_end" },
    });
    expect(route("next move")).toMatchObject({
      action: { kind: "step", delta: 1 },
    });
    expect(route("go back one move")).toMatchObject({
      action: { kind: "step", delta: -1 },
    });
    expect(route("play the line again")).toMatchObject({
      action: { kind: "replay_line" },
    });
    expect(route("Play it")).toMatchObject({ action: { kind: "replay_line" } });
    expect(route("back to the game")).toMatchObject({
      action: { kind: "back_to_game" },
    });
  });

  it("'show me move 3: Nxd4' is the coach's card phrasing, a question about that move", () => {
    expect(
      route("show me move 3: Nf3 again, why was it fine?").intent
    ).not.toBe("action");
  });
});

describe("greetings and preferences", () => {
  it("a bare thanks or hello is a greeting; one with a question is not", () => {
    expect(route("thanks!")).toEqual({ intent: "greeting", rule: "greeting" });
    expect(route("Hi Masti")).toEqual({ intent: "greeting", rule: "greeting" });
    expect(route("thanks, what about move 8?").intent).not.toBe("greeting");
  });

  it("a standing side or length instruction is a preference", () => {
    expect(route("Always coach me as Black")).toEqual({
      intent: "preference",
      rule: "preference:side",
      side: "b",
    });
    expect(route("from now on, analyse my games as white")).toMatchObject({
      intent: "preference",
      side: "w",
    });
    expect(route("back to my side please")).toEqual({
      intent: "preference",
      rule: "preference:back",
      side: "player",
    });
    expect(route("keep it short")).toEqual({
      intent: "preference",
      rule: "preference:length",
      length: "short",
    });
    expect(route("I'd like longer answers")).toMatchObject({
      intent: "preference",
      length: "long",
    });
  });
});

describe("the other side's view", () => {
  it("names the side", () => {
    expect(route("Look at it from Black's side")).toEqual({
      intent: "perspective",
      rule: "perspective:side",
      side: "b",
    });
    expect(
      route("what does this look like from white's perspective?")
    ).toMatchObject({ intent: "perspective", side: "w" });
  });

  it("the opponent's view", () => {
    expect(route("What was my opponent thinking here?")).toEqual({
      intent: "perspective",
      rule: "perspective:opponent",
      side: "opponent",
    });
    expect(route("switch sides")).toMatchObject({
      intent: "perspective",
      side: "opponent",
    });
  });
});

describe("mode entries and the walkthrough", () => {
  it("try it, defend it, quiz", () => {
    expect(route("Let me try from here")).toEqual({
      intent: "try_it",
      rule: "try_it",
    });
    expect(route("can I play it out against you?")).toMatchObject({
      intent: "try_it",
    });
    expect(route("Let me defend from before the blunder")).toEqual({
      intent: "defend_it",
      rule: "defend_it",
    });
    expect(route("Test me")).toEqual({ intent: "quiz", rule: "quiz" });
    expect(route("give me practice on forks")).toMatchObject({
      intent: "quiz",
    });
    expect(route("I keep missing these")).toMatchObject({ intent: "quiz" });
  });

  it("walkthrough reuses the prompt's own test", () => {
    expect(route("Walk me through the endgame")).toEqual({
      intent: "walkthrough",
      rule: "walkthrough",
    });
    expect(route("explain the whole line step by step")).toMatchObject({
      intent: "walkthrough",
    });
  });
});

describe("moves: compare, what-if, verdict", () => {
  it("two moves set against each other compare", () => {
    expect(route("Nf3 or Nc3 here?")).toEqual({
      intent: "compare",
      rule: "compare:or",
      moves: ["Nf3", "Nc3"],
    });
    expect(route("8. Qxc1 vs 8. Nc7+, which is better?")).toMatchObject({
      intent: "compare",
      moves: ["Qxc1", "Nc7+"],
    });
    expect(route("Nf3 or Nf3")).not.toMatchObject({ intent: "compare" });
  });

  it("an alternative the anchor read is a what-if", () => {
    expect(route("why not 8. Qxc1?")).toEqual({
      intent: "what_if",
      rule: "what_if:asked_san",
      moves: ["Qxc1"],
    });
    expect(route("What about 8. Qxc1 instead?")).toMatchObject({
      intent: "what_if",
      moves: ["Qxc1"],
    });
  });

  it("a what-if phrase with a move the anchor did not place is still a what-if", () => {
    expect(route("what if I had played Bc4 at some point?")).toMatchObject({
      intent: "what_if",
      rule: "what_if:phrase",
      moves: ["Bc4"],
    });
    expect(route("should I have played e5 instead?")).toMatchObject({
      intent: "what_if",
      moves: ["e5"],
    });
  });

  it("a question about the move played is a verdict", () => {
    expect(route("Why was 8. Nc7+ a mistake?")).toEqual({
      intent: "verdict",
      rule: "verdict:anchor",
    });
    expect(route("how bad was Nc7+?")).toMatchObject({ intent: "verdict" });
    expect(route("tell me about 8. Nc7+")).toEqual({
      intent: "verdict",
      rule: "verdict:anchor_only",
    });
  });

  it("a what-if phrase without any move named is not a what-if", () => {
    expect(route("what if the position were different?").intent).toBe(
      "unknown"
    );
  });
});

describe("no-board asks", () => {
  it("opening, endgame, plan, concept, progress, master game", () => {
    expect(route("What opening was this?")).toEqual({
      intent: "opening",
      rule: "opening",
    });
    expect(route("where did I leave theory?")).toMatchObject({
      intent: "opening",
    });
    expect(route("How do I win this rook endgame?")).toEqual({
      intent: "endgame",
      rule: "endgame",
    });
    expect(route("What's my plan in this position?")).toEqual({
      intent: "plan",
      rule: "plan",
    });
    expect(route("What is a minority attack?")).toEqual({
      intent: "concept",
      rule: "concept",
    });
    expect(route("what does zugzwang mean")).toMatchObject({
      intent: "concept",
    });
    expect(route("Am I improving? What should I work on?")).toEqual({
      intent: "progress",
      rule: "progress",
    });
    expect(route("Show me how a master handled this structure")).toEqual({
      intent: "master_game",
      rule: "master_game",
    });
  });

  it("a concept word beside an anchored move is a verdict, not a concept", () => {
    expect(route("why was 8. Nc7+ a fork that failed?")).toMatchObject({
      intent: "verdict",
    });
  });
});

describe("the rest is unknown, for the classifier", () => {
  it("open questions with no rule-readable shape", () => {
    expect(route("what was my biggest mistake?")).toEqual({
      intent: "unknown",
      rule: "none",
    });
    expect(route("was black ever winning?")).toEqual({
      intent: "unknown",
      rule: "none",
    });
    expect(route("")).toEqual({ intent: "unknown", rule: "none" });
  });

  it("the vocabulary is the ideal's sixteen intents plus greeting and unknown", () => {
    expect(QUESTION_INTENTS).toHaveLength(18);
    expect(QUESTION_INTENTS).toContain("unknown");
  });
});
