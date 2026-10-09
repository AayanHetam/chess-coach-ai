/**
 * The follow-up's three grammars (pathway PR 3.4). One move is the v1 turn
 * byte for byte, the other two are pinned whole.
 */
import { describe, expect, it } from "vitest";
import {
  FOLLOWUP_GRAMMAR_VERSION,
  followUpGrammarClause,
  followUpGrammarReminder,
  NO_BOARD_FACTS_HEADER,
  type GrammarSpec,
} from "../followUpGrammar";
import {
  FOLLOWUP_BUDGET,
  FOLLOWUP_LEAN_BUDGET,
  followUpTurnReminder,
  type FollowUpSubject,
} from "../followUpPrompt";
import { SAN_CORE } from "@/lib/coach/questionIntent";

const OTHER: FollowUpSubject = { side: "b", player: "w", confirmed: true };
const GUESS: FollowUpSubject = { side: "b", player: "w", confirmed: false };
const OWN: FollowUpSubject = { side: "w", player: "w", confirmed: true };

const NO_BOARD: GrammarSpec = { grammar: "no_board" };
const GREETING: GrammarSpec = { grammar: "acknowledgement" };
const MODES: GrammarSpec[] = (["try_it", "quiz", "defend_it"] as const).map(
  (capability) => ({ grammar: "acknowledgement", capability })
);

/** Every reminder a grammar gives, by budget and subject. */
function reminders(spec: GrammarSpec, question = "What is a fork?") {
  const out: Record<string, string> = {};
  for (const [b, budget] of [
    ["default", FOLLOWUP_BUDGET],
    ["lean", FOLLOWUP_LEAN_BUDGET],
  ] as const)
    for (const [s, subject] of [
      ["none", null],
      ["other", OTHER],
      ["guess", GUESS],
    ] as const)
      out[`${b}/${s}`] = followUpGrammarReminder(
        spec,
        question,
        subject,
        budget
      );
  return out;
}

describe("one move is the v1 turn", () => {
  it("adds no clause", () => {
    expect(followUpGrammarClause({ grammar: "one_move" })).toBe("");
  });

  it("its reminder is followUpTurnReminder itself", () => {
    for (const q of [
      "Why was 8. Nc7+ a mistake?",
      "Walk me through the blunder at 7...Qxc1",
      "what went wrong?",
    ])
      for (const budget of [FOLLOWUP_BUDGET, FOLLOWUP_LEAN_BUDGET])
        for (const subject of [null, OTHER, GUESS, OWN])
          expect(
            followUpGrammarReminder({ grammar: "one_move" }, q, subject, budget)
          ).toBe(followUpTurnReminder(q, subject, budget));
  });

  it("a capability on an anchored turn changes nothing", () => {
    expect(
      followUpGrammarClause({ grammar: "one_move", capability: "quiz" })
    ).toBe("");
  });
});

describe("the clauses", () => {
  it("are pinned whole", () => {
    expect(FOLLOWUP_GRAMMAR_VERSION).toBe("grammar-1");
    expect(followUpGrammarClause(GREETING)).toBe("");
    expect(followUpGrammarClause(NO_BOARD)).toMatchInlineSnapshot(`
      "THIS TURN IS ABOUT AN IDEA, NOT A MOVE
      The player asked what a chess idea is, not about a move of this game, so for this answer the four parts of THE SHAPE give way to this. Say what the idea is in two or three plain sentences, as teaching ("as a rule", "usually"), with no square, no move and no evaluation in the definition itself. Then, only if the facts below confirm the idea at a numbered move of this game, one sentence that names that move with its number. Otherwise give no example from this game. No token line and no evaluation. A paragraph that starts with "Lesson:" only if the idea gives the player a check to run in the next game. The BUDGET holds."
    `);
    expect(
      Object.fromEntries(
        MODES.map((m) => [m.capability, followUpGrammarClause(m)])
      )
    ).toMatchInlineSnapshot(`
      {
        "defend_it": "THIS TURN ASKS FOR SOMETHING THE APP CANNOT START YET
      The player asked to defend the position from before the mistake. The app cannot start that from here yet, so for this answer THE SHAPE gives way to an acknowledgement: one or two short sentences in character. Say in one clause that you cannot start it from here yet, then name the one thing that works now: stepping back to the move before the mistake, trying a defence on the board, then asking about it. No move in notation, no token line, no evaluation, no Lesson and no question back.",
        "quiz": "THIS TURN ASKS FOR SOMETHING THE APP CANNOT START YET
      The player asked to be tested on this game. The app cannot start that from here yet, so for this answer THE SHAPE gives way to an acknowledgement: one or two short sentences in character. Say in one clause that you cannot start it from here yet, then name the one thing that works now: typing /puzzle-generation with a pattern's name in the composer, such as /puzzle-generation fork, which finds practice puzzles with that pattern. No move in notation, no token line, no evaluation, no Lesson and no question back.",
        "try_it": "THIS TURN ASKS FOR SOMETHING THE APP CANNOT START YET
      The player asked to play on from this position against the engine. The app cannot start that from here yet, so for this answer THE SHAPE gives way to an acknowledgement: one or two short sentences in character. Say in one clause that you cannot start it from here yet, then name the one thing that works now: moving the pieces on the board to try an idea, then asking about any move. No move in notation, no token line, no evaluation, no Lesson and no question back.",
      }
    `);
  });

  it("hold no semicolon, no em dash and no move in notation", () => {
    const san = new RegExp(
      `(?<![A-Za-z0-9])(?:\\d{1,3}\\s*\\.{1,3}\\s*)?${SAN_CORE}(?![A-Za-z0-9])`
    );
    for (const spec of [NO_BOARD, ...MODES]) {
      const clause = followUpGrammarClause(spec);
      expect(clause.length).toBeGreaterThan(0);
      expect(clause).not.toMatch(/[;\u2014]/);
      expect(clause).not.toMatch(san);
    }
  });

  it("the board is re-headed as reference", () => {
    expect(NO_BOARD_FACTS_HEADER).toBe(
      "## BOARD ON SCREEN (for reference: this turn asks about an idea, not this position. Use these exact facts and never reconstruct the board from the move list.)"
    );
  });
});

describe("the reminders", () => {
  it("no board", () => {
    expect(reminders(NO_BOARD)).toMatchInlineSnapshot(`
      {
        "default/guess": "[At most 100 words. The idea in two or three plain sentences, as teaching, then one sentence on this game's example only if the facts confirm one, then a Lesson only if there is a check to teach. No token line and no evaluation. This turn is about Black's moves. Name both sides by colour.]",
        "default/none": "[At most 100 words. The idea in two or three plain sentences, as teaching, then one sentence on this game's example only if the facts confirm one, then a Lesson only if there is a check to teach. No token line and no evaluation.]",
        "default/other": "[At most 100 words. The idea in two or three plain sentences, as teaching, then one sentence on this game's example only if the facts confirm one, then a Lesson only if there is a check to teach. No token line and no evaluation. This turn is about Black's moves. The player is still "you", and Black is "your opponent".]",
        "lean/guess": "[At most 60 words. The idea in two or three plain sentences, as teaching, then one sentence on this game's example only if the facts confirm one, then a Lesson only if there is a check to teach. No token line and no evaluation. This turn is about Black's moves. Name both sides by colour.]",
        "lean/none": "[At most 60 words. The idea in two or three plain sentences, as teaching, then one sentence on this game's example only if the facts confirm one, then a Lesson only if there is a check to teach. No token line and no evaluation.]",
        "lean/other": "[At most 60 words. The idea in two or three plain sentences, as teaching, then one sentence on this game's example only if the facts confirm one, then a Lesson only if there is a check to teach. No token line and no evaluation. This turn is about Black's moves. The player is still "you", and Black is "your opponent".]",
      }
    `);
  });

  it("a greeting", () => {
    expect(reminders(GREETING, "thanks!")).toMatchInlineSnapshot(`
      {
        "default/guess": "[One friendly sentence, then one concrete thing worth looking at next, at most 45 words. No token line, no Lesson, no question back. This turn is about Black's moves. Name both sides by colour.]",
        "default/none": "[One friendly sentence, then one concrete thing worth looking at next, at most 45 words. No token line, no Lesson, no question back.]",
        "default/other": "[One friendly sentence, then one concrete thing worth looking at next, at most 45 words. No token line, no Lesson, no question back. This turn is about Black's moves. The player is still "you", and Black is "your opponent".]",
        "lean/guess": "[One friendly sentence, then one concrete thing worth looking at next, at most 30 words. No token line, no Lesson, no question back. This turn is about Black's moves. Name both sides by colour.]",
        "lean/none": "[One friendly sentence, then one concrete thing worth looking at next, at most 30 words. No token line, no Lesson, no question back.]",
        "lean/other": "[One friendly sentence, then one concrete thing worth looking at next, at most 30 words. No token line, no Lesson, no question back. This turn is about Black's moves. The player is still "you", and Black is "your opponent".]",
      }
    `);
  });

  it("a mode entry, the same for all three", () => {
    const [first, ...rest] = MODES.map((m) => reminders(m, "Test me"));
    for (const r of rest) expect(r).toEqual(first);
    expect(first).toMatchInlineSnapshot(`
      {
        "default/guess": "[At most 45 words, one or two sentences. No move in notation, no token line, no evaluation, no Lesson. This turn is about Black's moves. Name both sides by colour.]",
        "default/none": "[At most 45 words, one or two sentences. No move in notation, no token line, no evaluation, no Lesson.]",
        "default/other": "[At most 45 words, one or two sentences. No move in notation, no token line, no evaluation, no Lesson. This turn is about Black's moves. The player is still "you", and Black is "your opponent".]",
        "lean/guess": "[At most 30 words, one or two sentences. No move in notation, no token line, no evaluation, no Lesson. This turn is about Black's moves. Name both sides by colour.]",
        "lean/none": "[At most 30 words, one or two sentences. No move in notation, no token line, no evaluation, no Lesson.]",
        "lean/other": "[At most 30 words, one or two sentences. No move in notation, no token line, no evaluation, no Lesson. This turn is about Black's moves. The player is still "you", and Black is "your opponent".]",
      }
    `);
  });

  it("a walkthrough word does not lengthen a grammar that is not one move", () => {
    expect(
      followUpGrammarReminder(
        NO_BOARD,
        "walk me through what a fork is",
        null,
        FOLLOWUP_BUDGET
      )
    ).toBe(
      followUpGrammarReminder(
        NO_BOARD,
        "What is a fork?",
        null,
        FOLLOWUP_BUDGET
      )
    );
  });

  it("hold no semicolon and no em dash", () => {
    for (const spec of [NO_BOARD, GREETING, ...MODES])
      for (const r of Object.values(reminders(spec)))
        expect(r).not.toMatch(/[;\u2014]/);
  });
});
