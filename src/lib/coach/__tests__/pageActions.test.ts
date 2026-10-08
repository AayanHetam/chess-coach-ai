import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PAGE_ACTIONS_DEFAULT,
  PAGE_TURN_KINDS,
  isPageActionsEnabledPublic,
  pageTurnKind,
  parsePageTurn,
  readPageActions,
  readPagePreference,
  readPageTurnKinds,
  readServedPageTurn,
  type PageAction,
  type PageTurn,
} from "../pageActions";

const action = (a: PageAction): PageTurn => ({ type: "action", action: a });

describe("parsePageTurn: whole-message orders", () => {
  const cases: [string, PageTurn][] = [
    ["flip the board", action({ kind: "flip_board" })],
    ["Flip the board.", action({ kind: "flip_board" })],
    ["flip", action({ kind: "flip_board" })],
    ["Flip it!", action({ kind: "flip_board" })],
    ["rotate the board", action({ kind: "flip_board" })],
    ["turn the board around", action({ kind: "flip_board" })],
    ["flip the board to black", action({ kind: "flip_board", to: "black" })],
    ["flip to white", action({ kind: "flip_board", to: "white" })],
    ["can you flip the board?", action({ kind: "flip_board" })],
    ["Masti, flip the board please", action({ kind: "flip_board" })],
    ["hey masti flip the board, thanks!", action({ kind: "flip_board" })],
    ["please flip the board", action({ kind: "flip_board" })],
    ["go to move 20", action({ kind: "go_to_move", moveNumber: 20 })],
    ["Go To Move 8.", action({ kind: "go_to_move", moveNumber: 8 })],
    ["jump to move 8", action({ kind: "go_to_move", moveNumber: 8 })],
    // The strip's own Back label, kept as such: the page reads it as that
    // Back when the strip shows one.
    [
      "take me back to move 7",
      action({ kind: "go_to_move", moveNumber: 7, via: "back" }),
    ],
    [
      "back to move 7",
      action({ kind: "go_to_move", moveNumber: 7, via: "back" }),
    ],
    ["show me move 3", action({ kind: "go_to_move", moveNumber: 3 })],
    ["goto move 8", action({ kind: "go_to_move", moveNumber: 8 })],
    ["could you go to move 8?", action({ kind: "go_to_move", moveNumber: 8 })],
    [
      "go to black's move 20",
      action({ kind: "go_to_move", moveNumber: 20, color: "b" }),
    ],
    // The apostrophe iOS types by default.
    [
      "go to black’s move 20",
      action({ kind: "go_to_move", moveNumber: 20, color: "b" }),
    ],
    [
      "go to move 20 for white",
      action({ kind: "go_to_move", moveNumber: 20, color: "w" }),
    ],
    [
      "go to move 20 as black",
      action({ kind: "go_to_move", moveNumber: 20, color: "b" }),
    ],
    // A side as people type it: no apostrophe, or after the number.
    [
      "go to blacks move 20",
      action({ kind: "go_to_move", moveNumber: 20, color: "b" }),
    ],
    [
      "go to black move 20",
      action({ kind: "go_to_move", moveNumber: 20, color: "b" }),
    ],
    [
      "go to move 20 black",
      action({ kind: "go_to_move", moveNumber: 20, color: "b" }),
    ],
    // The coach's name after the order.
    ["flip the board, masti", action({ kind: "flip_board" })],
    ["play it again, Masti!", action({ kind: "replay_line" })],
    ["flip the board, coach", action({ kind: "flip_board" })],
    // A move number the game may not have is still an order: the page says so.
    ["go to move 0", action({ kind: "go_to_move", moveNumber: 0 })],
    ["go to move 999", action({ kind: "go_to_move", moveNumber: 999 })],
    ["go to the start", action({ kind: "go_to_start" })],
    ["go back to the beginning", action({ kind: "go_to_start", via: "back" })],
    ["back to the start", action({ kind: "go_to_start", via: "back" })],
    ["back to start", action({ kind: "go_to_start", via: "back" })],
    ["jump to the beginning", action({ kind: "go_to_start" })],
    ["reset", action({ kind: "go_to_start" })],
    ["reset the board", action({ kind: "go_to_start" })],
    ["go to the end", action({ kind: "go_to_end" })],
    ["skip to the end of the game", action({ kind: "go_to_end" })],
    ["jump to the final position", action({ kind: "go_to_end" })],
    ["go to the last move", action({ kind: "go_to_end" })],
    ["next move", action({ kind: "step", delta: 1 })],
    ["forward", action({ kind: "step", delta: 1 })],
    ["step forward", action({ kind: "step", delta: 1 })],
    ["one move forward", action({ kind: "step", delta: 1 })],
    ["previous move", action({ kind: "step", delta: -1 })],
    ["go back one move", action({ kind: "step", delta: -1 })],
    ["back a move", action({ kind: "step", delta: -1 })],
    ["step back", action({ kind: "step", delta: -1 })],
    ["back", action({ kind: "back" })],
    ["Go back.", action({ kind: "back" })],
    ["take me back", action({ kind: "back" })],
    ["let’s go back", action({ kind: "back" })],
    ["back to the game", action({ kind: "back_to_game" })],
    ["leave the line", action({ kind: "back_to_game" })],
    ["exit the drill", action({ kind: "back_to_game" })],
    ["stop exploring", action({ kind: "back_to_game" })],
    ["play it again", action({ kind: "replay_line" })],
    ["play the line", action({ kind: "replay_line" })],
    ["replay the line again", action({ kind: "replay_line" })],
    ["replay", action({ kind: "replay_line" })],
    ["show me the line again", action({ kind: "replay_line" })],
    [
      "coach me as Black",
      {
        type: "preference",
        preference: { kind: "side", color: "b", bare: false, declared: false },
      },
    ],
    [
      "Always coach me as black.",
      {
        type: "preference",
        preference: { kind: "side", color: "b", bare: false, declared: false },
      },
    ],
    [
      "I was white",
      {
        type: "preference",
        preference: { kind: "side", color: "w", bare: false, declared: true },
      },
    ],
    [
      "I played the black pieces",
      {
        type: "preference",
        preference: { kind: "side", color: "b", bare: false, declared: true },
      },
    ],
    [
      "i'm playing as black",
      {
        type: "preference",
        preference: { kind: "side", color: "b", bare: false, declared: true },
      },
    ],
    [
      "Black",
      {
        type: "preference",
        preference: { kind: "side", color: "b", bare: true, declared: true },
      },
    ],
    [
      "back to my side",
      { type: "preference", preference: { kind: "my_side" } },
    ],
  ];
  it.each(cases)("%j", (text, turn) => {
    expect(parsePageTurn(text)).toEqual(turn);
  });

  it("the kind of each turn is one the page lists", () => {
    for (const [, turn] of cases)
      expect(PAGE_TURN_KINDS).toContain(pageTurnKind(turn));
  });
});

describe("parsePageTurn: a question is never an order", () => {
  const questions = [
    // The pathway's regression fixture, and its relatives.
    "why was move 20 bad?",
    "why was move 20 bad",
    "Why was 8. Nc7+ a mistake?",
    "what happened on move 20?",
    // A question mark without a polite request.
    "next move?",
    "flip the board?",
    "go to move 8?",
    "back?",
    // "Would you" and "will you" are how a player asks the coach's opinion.
    "would you play it?",
    "Would you play it",
    "will you play it?",
    "would you flip the board?",
    // A compound: the imperative and a question. The coach answers it (and
    // the anchor still moves the board when it names a move).
    "go to move 8 and tell me why it was bad",
    "go to move 8, why was it bad?",
    "show me move 8 and why it was bad",
    "flip the board and explain the plan",
    "flip the board, why is black better?",
    "go to the start and explain the opening",
    "back to the game, what was the plan?",
    "reset the board to move 5",
    "go back to move 7 and show me Qxc1",
    "go to move 8, what about Qxc1 instead?",
    // A clause that starts like an order.
    "last move was a blunder?",
    "previous move was a blunder right?",
    "next move, what should I play?",
    "play it safe here?",
    "play it out from here",
    "replay the game from move 10",
    "show me the line after Nf3",
    "show me the line where I win a piece",
    "replay with Nd6+ instead",
    // Words that are orders as often as they are questions or replies.
    "next",
    "previous",
    "start",
    "start over",
    "can you start over?",
    "restart",
    "end",
    "again",
    "undo",
    "move 20",
    "Move 8",
    "last move",
    "first move",
    "go to the first move",
    "play it",
    "stop",
    "flip sides",
    "switch sides",
    // Depth is never a setting: these ask the coach to say more, or less.
    "be more detailed",
    "could you be more detailed?",
    "keep it short",
    "longer answers",
    // Black's move in notation is not the player's own move.
    "go to move 8...",
    "go to move 8…",
    // Two sides named.
    "go to white's move 8 for black",
    "go to move 20 black and white",
    // A side in a question, or an order with a question after it.
    "why was blacks move 20 bad?",
    "go to blacks move 20 and tell me why",
    // "coach" with no comma is not a name.
    "flip the board coach",
    // A side named in a question.
    "I was white, why did I lose?",
    "I was white?",
    "why do I always lose when I look at it as white?",
    // Nothing at all.
    "",
    "   ",
    "please",
    "thanks",
    "ok",
  ];
  it.each(questions)("%j", (text) => {
    expect(parsePageTurn(text)).toBeNull();
  });

  it("a very long message is never an order", () => {
    expect(parsePageTurn(`flip the board ${" ".repeat(300)}`)).toBeNull();
    expect(parsePageTurn("flip the board " + "please ".repeat(40))).toBeNull();
  });

  it("nothing the app sends on the player's behalf is an order", () => {
    const sent = [
      // generateSuggestions.ts: the pin, the fallbacks and the templates.
      "Analyze my game",
      "Analyze my game.",
      "What's the most important moment in this game?",
      "Show me one improvement to study",
      "What's my biggest weakness here?",
      "Why was Nc7+ a blunder?",
      "Walk me through the blunder at 8.Nc7+",
      "Why was 12...Nf6 brilliant?",
      "Tell me about the Sicilian Defense",
      // MoveAnalysisCard's "Ask Masti".
      "Why was 8. Nc7+ a blunder?",
      "What did I miss with 8. Nc7+?",
      "What did my opponent miss with 8... Kd8?",
      "Why was 8. Nc7+ so strong?",
      "What was the idea behind 8. Nc7+?",
      // The Moves view's and the Masters view's asks.
      "Walk me through 8.Nc7+. What's the idea behind it, and what was the engine's best move here?",
      "Tell me about Qxc1 from this position.",
      // The questions the e2e suites type.
      "analyse this game",
      "and then?",
      "tell me more",
      "what about 8. Qxc1 instead?",
      "what about 8. Qxf7+ instead?",
      "what can you tell me?",
      "what happened in this game?",
      "what is the idea here?",
      "what should I play here?",
      "what should I study from this?",
    ];
    for (const text of sent) expect(parsePageTurn(text), text).toBeNull();
  });

  it("no question in the saved follow-up corpus is an order", () => {
    const repo = path.resolve(__dirname, "../../../..");
    const questions: string[] = [];
    const probe = path.join(
      repo,
      "scripts/eval/results/followup-story-probe.json"
    );
    if (fs.existsSync(probe))
      for (const row of JSON.parse(fs.readFileSync(probe, "utf8")).results)
        questions.push(row.question);
    const runs = path.join(repo, "scripts/synthetic-tester/runs");
    if (fs.existsSync(runs))
      for (const file of fs.readdirSync(runs).filter((f) => f.endsWith(".csv")))
        questions.push(
          ...studentQuestions(fs.readFileSync(path.join(runs, file), "utf8"))
        );
    expect(questions.length).toBeGreaterThan(20);
    for (const q of questions) expect(parsePageTurn(q), q).toBeNull();
  });
});

/** The `student_question` column of a synthetic-tester run (RFC 4180 quoting). */
function studentQuestions(csv: string): string[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  const at = rows[0]?.indexOf("student_question") ?? -1;
  if (at < 0) return [];
  return rows
    .slice(1)
    .map((r) => (r[at] ?? "").trim())
    .filter(Boolean);
}

describe("the wire", () => {
  it("reads actions field by field, drops what it cannot check, keeps at most four", () => {
    expect(
      readPageActions([
        { kind: "flip_board" },
        { kind: "flip_board", to: "black" },
        { kind: "flip_board", to: "purple" },
        { kind: "go_to_move", moveNumber: 20, color: "b" },
        { kind: "go_to_move", moveNumber: 2.5 },
        { kind: "step", delta: 2 },
        { kind: "self_destruct" },
      ])
    ).toEqual([
      { kind: "flip_board" },
      { kind: "flip_board", to: "black" },
      { kind: "go_to_move", moveNumber: 20, color: "b" },
    ]);
    expect(readPageActions("flip_board")).toEqual([]);
    expect(readPageActions(null)).toEqual([]);
    expect(readPageActions(Array(9).fill({ kind: "go_to_start" })).length).toBe(
      4
    );
    // Extra fields never ride along.
    expect(readPageActions([{ kind: "back", ply: 40, note: "x" }])).toEqual([
      { kind: "back" },
    ]);
  });

  it("reads a preference only in its own shape", () => {
    expect(readPagePreference({ kind: "my_side" })).toEqual({
      kind: "my_side",
    });
    expect(
      readPagePreference({ kind: "side", color: "w", bare: false })
    ).toEqual({ kind: "side", color: "w", bare: false, declared: true });
    expect(
      readPagePreference({
        kind: "side",
        color: "b",
        bare: false,
        declared: false,
      })
    ).toEqual({ kind: "side", color: "b", bare: false, declared: false });
    expect(
      readPagePreference({ kind: "side", color: "b", bare: false, declared: 1 })
    ).toBeNull();
    expect(readPagePreference({ kind: "side", color: "w" })).toBeNull();
    expect(readPagePreference({ kind: "length", length: "short" })).toBeNull();
  });

  it("a served turn is exactly one action, or a preference; anything else is null", () => {
    expect(
      readServedPageTurn({ served: "page", actions: [{ kind: "flip_board" }] })
    ).toEqual(action({ kind: "flip_board" }));
    expect(readServedPageTurn({ preference: { kind: "my_side" } })).toEqual({
      type: "preference",
      preference: { kind: "my_side" },
    });
    expect(
      readServedPageTurn({
        actions: [{ kind: "flip_board" }, { kind: "go_to_start" }],
      })
    ).toBeNull();
    // A kind this page does not know (a newer server's): null, so the page
    // says it could not do it.
    expect(readServedPageTurn({ actions: [{ kind: "spin" }] })).toBeNull();
    expect(readServedPageTurn(undefined)).toBeNull();
  });

  it("reads a request's kinds as a short list of known names", () => {
    expect(readPageTurnKinds([...PAGE_TURN_KINDS])).toEqual([
      ...PAGE_TURN_KINDS,
    ]);
    expect(
      readPageTurnKinds(["flip_board", "flip_board", "spin", 3, null])
    ).toEqual(["flip_board"]);
    expect(readPageTurnKinds(true)).toEqual([]);
    expect(readPageTurnKinds("flip_board")).toEqual([]);
    expect(readPageTurnKinds(Array(33).fill("flip_board"))).toEqual([]);
  });
});

describe("the switch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off by default until its own flip", () => {
    expect(PAGE_ACTIONS_DEFAULT).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_COACH_PAGE_ACTIONS", "");
    expect(isPageActionsEnabledPublic()).toBe(false);
  });

  it("the env overrides the default either way", () => {
    for (const on of ["1", "on", "true", " TRUE "]) {
      vi.stubEnv("NEXT_PUBLIC_COACH_PAGE_ACTIONS", on);
      expect(isPageActionsEnabledPublic()).toBe(true);
    }
    for (const off of ["0", "off", "false", "nope"]) {
      vi.stubEnv("NEXT_PUBLIC_COACH_PAGE_ACTIONS", off);
      expect(isPageActionsEnabledPublic()).toBe(false);
    }
  });
});

describe("parsePageTurn: the coach's name", () => {
  it("is a lead-in with a comma after it, and the verb of 'coach me as' without one", () => {
    expect(parsePageTurn("coach, flip the board")).toEqual(
      action({ kind: "flip_board" })
    );
    expect(parsePageTurn("hey coach, go back")).toEqual(
      action({ kind: "back" })
    );
    expect(parsePageTurn("coach me as white")).toEqual({
      type: "preference",
      preference: { kind: "side", color: "w", bare: false, declared: false },
    });
  });
});
