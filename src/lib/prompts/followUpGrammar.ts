/**
 * The follow-up's three grammars (pathway PR 3.4, behind `COACH_INTENT_ROUTER`).
 *
 * The intent table (lib/coach/intentTable.ts) picks one per turn. One move
 * is the v1 turn byte for byte: no clause, and the reminder is
 * followUpTurnReminder itself. Every anchored turn is one move, and so is
 * every row whose facts have not landed, whose one-clause unknown the
 * stable prompt already states. No board is an unanchored concept turn: a
 * definition as teaching, an example from this game only where the facts
 * confirm one. An acknowledgement is a greeting, whose shape the stable
 * prompt already gives, or a mode the app cannot start yet, which says so
 * in one clause and names what works now.
 *
 * A clause goes in the uncached half of the system prompt, after USER
 * CONTEXT and the subject clause and before the game's facts. A reminder
 * goes under the question, in the model's copy of the turn only. The stable
 * prompts are never touched.
 */
import type { AckCapability, FollowUpGrammar } from "@/lib/coach/intentTable";
import {
  followUpTurnReminder,
  subjectReminder,
  type FollowUpBudget,
  type FollowUpSubject,
} from "./followUpPrompt";

export { FOLLOWUP_GRAMMAR_VERSION } from "@/lib/coach/intentTable";

/** The board on screen re-headed for a turn about an idea. */
export const NO_BOARD_FACTS_HEADER =
  "## BOARD ON SCREEN (for reference: this turn asks about an idea, not this position. Use these exact facts and never reconstruct the board from the move list.)";

export interface GrammarSpec {
  grammar: FollowUpGrammar;
  capability?: AckCapability;
}

const NO_BOARD_CLAUSE = `THIS TURN IS ABOUT AN IDEA, NOT A MOVE
The player asked what a chess idea is, not about a move of this game, so for this answer the four parts of THE SHAPE give way to this. Say what the idea is in two or three plain sentences, as teaching ("as a rule", "usually"), with no square, no move and no evaluation in the definition itself. Then, only if the facts below confirm the idea at a numbered move of this game, one sentence that names that move with its number. Otherwise give no example from this game. No token line and no evaluation. A paragraph that starts with "Lesson:" only if the idea gives the player a check to run in the next game. The BUDGET holds.`;

/** What the player asked for, by mode. */
const ASK: Record<AckCapability, string> = {
  try_it: "to play on from this position against the engine",
  defend_it: "to defend the position from before the mistake",
  quiz: "to be tested on this game",
};

/** The one thing that works now, by mode. */
const NOW: Record<AckCapability, string> = {
  try_it:
    "moving the pieces on the board to try an idea, then asking about any move",
  defend_it:
    "stepping back to the move before the mistake, trying a defence on the board, then asking about it",
  quiz: "typing /puzzle-generation in the composer, which finds practice puzzles with the pattern of the position on the board, or /puzzle-generation with a pattern's name, such as /puzzle-generation fork",
};

function modeClause(c: AckCapability): string {
  return `THIS TURN ASKS FOR SOMETHING THE APP CANNOT START YET
The player asked ${ASK[c]}. The app cannot start that from here yet, so for this answer THE SHAPE gives way to an acknowledgement: one or two short sentences in character. Say in one clause that you cannot start it from here yet, then name the one thing that works now: ${NOW[c]}. No move in notation, no token line, no evaluation, no Lesson and no question back.`;
}

/** The paragraph a grammar adds to the uncached system suffix. Empty for one move and a greeting. */
export function followUpGrammarClause(spec: GrammarSpec): string {
  if (spec.grammar === "no_board") return NO_BOARD_CLAUSE;
  if (spec.grammar === "acknowledgement" && spec.capability)
    return modeClause(spec.capability);
  return "";
}

/** The line under the question. For one move it is followUpTurnReminder itself. */
export function followUpGrammarReminder(
  spec: GrammarSpec,
  question: string,
  subject: FollowUpSubject | null,
  budget: Readonly<FollowUpBudget>
): string {
  if (spec.grammar === "one_move")
    return followUpTurnReminder(question, subject, budget);
  const about = subject ? ` ${subjectReminder(subject)}` : "";
  if (spec.grammar === "no_board")
    return `[At most ${budget.words} words. The idea in two or three plain sentences, as teaching, then one sentence on this game's example only if the facts confirm one, then a Lesson only if there is a check to teach. No token line and no evaluation.${about}]`;
  if (spec.capability)
    return `[At most ${budget.openingWords} words, one or two sentences. No move in notation, no token line, no evaluation, no Lesson.${about}]`;
  return `[One friendly sentence, then one concrete thing worth looking at next, at most ${budget.openingWords} words. No token line, no Lesson, no question back.${about}]`;
}
