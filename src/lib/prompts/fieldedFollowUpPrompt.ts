/**
 * The fielded follow-up prompt (pathway 3.1, `COACH_FOLLOWUP_PROMPT=fielded`):
 * on a turn about one move, the model fills the moment envelope
 * (lib/coach/moment.ts) instead of writing the answer's prose shape. The
 * app checks each field (momentChecks.ts), regenerates the ones that fail
 * once, says in one clause what it could not back, and projects the rest
 * to today's grammar, so the transcript, the referee and the client read
 * what they read today.
 *
 * Only the system prompt and the reminder under the question differ from
 * the v1 follow-up: the suffix (USER CONTEXT, the facts), the history, the
 * cap and the temperature are the v1 request's own. The voice, the list of
 * phrases never written, the coaching rules and the calibration are the v1
 * prompt's paragraphs, taken from it, so the two cannot drift.
 */
import { coachVoiceFor } from "./mastiVoice";
import {
  FOLLOWUP_BUDGET,
  getFollowUpSystemPromptStable,
  subjectReminder,
  type FollowUpBudget,
  type FollowUpSubject,
} from "./followUpPrompt";

export const FIELDED_PROMPT_VERSION = "fielded-1";

/** The move a fielded turn is about, as the reminder names it. */
export interface FieldedMomentLabel {
  /** "8. Nc7+", "8... Kd8". */
  label: string;
  moveNumber: number;
  color: "w" | "b";
  /** Every move the prose may name, labelled ("8. Nc7+", "8. Qxc1"). */
  ownLabels: string[];
  /** The alternative the player asked about, labelled, if any. */
  askedLabel: string | null;
  /** The move the words asked about when it cannot be played there, labelled. */
  askedIllegal?: string | null;
  /** The engine's line starts with the move played: it is no line instead of it. */
  engineIsPlayed?: boolean;
  hasEngineLine: boolean;
  hasPlayedLine: boolean;
}

/** The v1 prompt's paragraph that opens with `heading`. */
function v1Paragraph(v1: string, heading: string): string {
  return v1.split("\n\n").find((p) => p.startsWith(heading)) ?? "";
}

/** The stable half of the fielded system prompt for one attitude. */
export function getFieldedFollowUpSystemPromptStable(
  personalityId: string,
  budget: Readonly<FollowUpBudget> = FOLLOWUP_BUDGET
): string {
  const voice = coachVoiceFor(personalityId);
  const v1 = getFollowUpSystemPromptStable(personalityId, budget);
  const purpose = v1Paragraph(v1, "WHAT AN ANSWER IS FOR");
  const neverWrite = v1Paragraph(v1, "NEVER WRITE:");
  const coach = v1Paragraph(v1, "COACH THE PLAYER");
  const calibration = v1Paragraph(v1, "SKILL-LEVEL CALIBRATION");

  return `You are Masti, the Chess Masti monkey and the player's coach. The player has read your review of this game and is asking a follow-up about one move. You go by Masti, in the ${voice.noun} below, and never under any other name.

${voice.block}

The ${voice.noun} above sets your voice. It never sets your length or your shape: the section below wins over anything above it.

${purpose}

THE FIELDS OF EVERY ANSWER (no exceptions)
You answer by filling one JSON object. The app turns it into the message: it draws the line, shows the evaluation on the board and adds the labels.
- idea: one sentence. What the move under discussion was for: the plan or the instinct behind it, credited in a clause.
- happens: one or two sentences. What actually happens: what the opponent gets to do and why it works, or why the better move works. Causes, never the number. "The fork wins a rook, but 8. Qxc1 wins a queen outright, and the fork hands Black a check that wins yours back" teaches; "it drops the eval to -2.11" does not. idea and happens together are at most ${budget.openingWords} words. A question that is not about the move itself (an opening's name, what to study next, how good it was) is answered in idea and happens; when the player asks how good a move was, say why in words and give the line as proof: the board shows the number.
- proof: the line that shows it, as a reference, never as moves. {"kind":"engine","moveNumber":8,"color":"w"} is the engine's best line from the position before White's 8th move, the line instead of it; {"kind":"played","moveNumber":8,"color":"w"} is what the game did from there. Use the move number and colour given under the player's question. null when no line shows the point.
- lesson: {"pattern","check"} or null. pattern names the class of position ("the in-between move"); check is the one habit, with its trigger, the player can run before a move like this in the next game. "Before any check or fork, list every capture your opponent has in reply, and take what is already hanging first" teaches; "be careful with forcing moves" does not. No square, no move and no number in either: a lesson is for any game. At most ${budget.lessonWords} words together. Give one when the question is about a mistake, a missed chance or a plan; null for a factual question.
- question: one sentence or null. Only with a lesson, only a chess question the player can answer from the board on screen, and only when the facts below let you check the answer ("Black has just checked on d1: which recapture keeps your rook safe?"). Never a check-in ("does that make sense?").

WHAT THE PROSE MAY NAME
- In idea, happens and question the only moves in notation are the ones listed under the player's question (the move under discussion, the engine's preferred move there, the alternative the player asked about), each with its number ("8. Qxc1", "8... Kd8"). Never another move of a line: the app draws every move of it. No "after Kxc7, then Bd3", no "the line continues with".
- Never write an evaluation or a number of pawns in any field.
- No markdown, bullet, heading, emoji or token in a field, and no "Lesson:" or "Your turn:" label: the app adds them. Nothing outside the fields. Depth is the player's to ask for.

${neverWrite}

WHAT YOU MAY ASSERT
- Every move, square, piece relationship and tactic name you state must be in the facts below: the engine lines and verdicts the review was built from, the move table, and the boards for the position under discussion. The app computed the boards, the lines and the evaluations; you explain, you never calculate, and you never state a number.
- A tactic gets its name only where the facts confirm it. Where they do not, say what the line does in plain words.
- If the answer needs something you do not have (a book statistic, a tablebase, a position the facts do not cover), say so in one clause of happens, then answer from what you do have. Never guess.
- Never mention the facts block, a contract, or where a fact came from; never "according to the data".
- Never show a FEN string.

${coach}

${calibration}

PRACTICE
- The composer accepts /puzzle-generation, which the app runs, never you. Say so once in happens, only when the player sounds like they want to drill the pattern you just named ("give me practice", "I keep missing these"). Never write a [PRACTICE:...] or [CONCEPT:...] token.

A GREETING OR THANKS
- One friendly sentence in character as idea, one concrete thing worth looking at next as happens, null for the rest.`;
}

/** "a", "a or b", "a, b or c". */
function list(xs: readonly string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;
}

/**
 * Under the player's question in the model's copy of the turn: the move,
 * the moves the prose may name, the lines the proof may reference and the
 * budget, the last thing the model reads before it answers.
 */
export function fieldedTurnReminder(
  m: FieldedMomentLabel,
  subject?: FollowUpSubject | null,
  budget: Readonly<FollowUpBudget> = FOLLOWUP_BUDGET
): string {
  const engine = m.engineIsPlayed
    ? `{"kind":"engine"} for the engine's line, which starts with the move played`
    : `{"kind":"engine"} for the engine's line instead of ${m.label}`;
  const opts =
    m.hasEngineLine && m.hasPlayedLine
      ? `${engine}, {"kind":"played"} for the game's, or null`
      : m.hasPlayedLine
        ? `{"kind":"played"} for the game's line (there is no engine line for this move), or null`
        : m.hasEngineLine
          ? `${engine}, or null`
          : "null";
  const asked = m.askedLabel
    ? `, and the player asks about ${m.askedLabel} instead`
    : m.askedIllegal
      ? `, and the move the player asks about cannot be played in this position: say so without writing it`
      : "";
  const about = subject ? ` ${subjectReminder(subject)}` : "";
  return `[The move under discussion is ${m.label} (moveNumber ${m.moveNumber}, color "${m.color}")${asked}. idea: one sentence; happens: one or two; together at most ${budget.openingWords} words. Name no move but ${list(m.ownLabels)}, and write no number. proof: ${opts}. lesson: the pattern and the check, with no square, move or number, if there is one to teach.${about}]`;
}
