/**
 * The diagnosing question (pathway 4.6): when, what it says, how a typed
 * answer is read, and what the coach says back.
 *
 * Once per game per browser, after the sweep has landed and the player's
 * side is known, the coach goes back to the player's costliest move
 * (lib/diagnose/decisiveMoment.ts) and asks what the opponent was
 * threatening there. The answer is a move, played on the board or typed,
 * or "no idea", and it is graded against the review's own search
 * (lib/diagnose/gradeAnswer.ts). Where the opponent's best reply was no
 * threat at all, the question asks for the plan instead, and that answer
 * goes to the coach as an ordinary follow-up, never graded.
 *
 * Every word here is the app's: the question, the echo and the graded
 * reply (one sentence naming the reply, the reply's line as a line token
 * the page draws from its own engine data, and one of five library
 * lessons). None of it is ever sent to the model.
 *
 * Pure and client-safe, apart from the asked-games store (localStorage,
 * every access guarded).
 */
import type { MastiMood } from "@/components/masti/manifest";
import type {
  DiagnoseMoment,
  ThreatTruth,
} from "@/lib/diagnose/decisiveMoment";
import {
  parseAnswerMove,
  type DiagnoseResult,
} from "@/lib/diagnose/gradeAnswer";
import { lessonText } from "@/lib/diagnose/lessons";
import { gameSideKey } from "./playerSide";

/** "threat": name the opponent's move. "plan": the reply was quiet, so say the plan. */
export type DiagnoseVariant = "threat" | "plan";

/**
 * Where the answer is being given: the links under the question ("open"),
 * a one-puzzle drill on the board ("board"), the composer for one move
 * ("type") or for the plan ("plan-type"), or answered ("closed").
 */
export type DiagnoseMode = "open" | "board" | "type" | "plan-type" | "closed";

export interface DiagnoseAsk {
  id: number;
  moment: DiagnoseMoment;
  truth: ThreatTruth | null;
  variant: DiagnoseVariant;
  mode: DiagnoseMode;
}

export interface DiagnoseDueInput {
  enabled: boolean;
  /** The game's story is built for this game (a standard start, not a puzzle). */
  storyReady: boolean;
  sweepLanded: boolean;
  sideKnown: boolean;
  /** A coach reply is on its way. */
  streaming: boolean;
  drilling: boolean;
  askedThisLoad: boolean;
  /** This browser asked about this game before. */
  askedBefore: boolean;
}

/** The question is asked now. */
export function diagnoseDue(i: DiagnoseDueInput): boolean {
  return (
    i.enabled &&
    i.storyReady &&
    i.sweepLanded &&
    i.sideKnown &&
    !i.streaming &&
    !i.drilling &&
    !i.askedThisLoad &&
    !i.askedBefore
  );
}

/**
 * The threat when the reply was concrete. The plan otherwise, and only for a
 * reader whose answer can reach the coach (signed in, the coach not paused):
 * a plan is never graded, so there is nothing else to do with it.
 */
export function diagnoseVariant(
  truth: ThreatTruth | null,
  canSend: boolean
): DiagnoseVariant | null {
  if (truth) return "threat";
  return canSend ? "plan" : null;
}

const sideName = (s: "w" | "b") => (s === "w" ? "White" : "Black");
const opponentOf = (m: DiagnoseMoment) => sideName(m.color === "w" ? "b" : "w");

function leadLine(m: DiagnoseMoment): string {
  if (m.source === "decisive")
    return `Let's go back to ${m.label}, the move the game turned on.`;
  if (m.source === "swing")
    return `Let's go back to ${m.label}, the move that cost you the most.`;
  return `Let's look at ${m.label}.`;
}

/** The question as the coach's message: the lead line, then "Your turn:". */
export function diagnoseAskText(
  m: DiagnoseMoment,
  variant: DiagnoseVariant
): string {
  const opp = opponentOf(m);
  const question =
    variant === "threat"
      ? `Your turn: After ${m.label}, what was ${opp} threatening? Show me ${opp}'s move.`
      : `Your turn: What was your plan with ${m.label}?`;
  return `${leadLine(m)}\n\n${question}`;
}

/** What "Tell Masti" puts in the composer for the plan. */
export function planPrefill(m: DiagnoseMoment): string {
  return `My plan with ${m.label} was `;
}

/** The composer's placeholder while it is the answer box. */
export function typePlaceholder(m: DiagnoseMoment): string {
  return `Type the move you think ${opponentOf(m)} wanted`;
}

export type TypedAnswer =
  | { kind: "move"; uci: string }
  | { kind: "no-idea" }
  | { kind: "skip" };

// The apostrophe straight or curly: a phone types the curly one.
const NO_IDEA_RE =
  /^(?:no idea|i don['\u2019]?t know|idk|dunno|not sure|no clue)[.!]*$/i;
const SKIP_RE = /^skip(?: it)?[.!]*$/i;

/**
 * A message typed while the composer is the answer box, read whole: a move
 * legal at `fenAfter` (SAN or UCI, a move number allowed), "no idea" or
 * "skip". Anything else is null, and goes to the coach as before.
 */
export function readTypedAnswer(
  text: string,
  fenAfter: string
): TypedAnswer | null {
  const t = text.trim();
  if (!t) return null;
  if (NO_IDEA_RE.test(t)) return { kind: "no-idea" };
  if (SKIP_RE.test(t)) return { kind: "skip" };
  const uci = parseAnswerMove(fenAfter, t);
  return uci ? { kind: "move", uci } : null;
}

/** The player's half of the turn, for an answer given by a link or on the board. */
export function answerEcho(r: DiagnoseResult | "skip"): string {
  if (r === "skip") return "Skip";
  if (r.grade === "no-idea" || !r.answer) return "No idea";
  return r.answer.label;
}

function headline(m: DiagnoseMoment, r: DiagnoseResult): string {
  const truth = r.truth.label;
  if (r.grade === "exact")
    return `You saw it: ${truth} was the threat. The slip came after, when ${m.label} didn't stop it.`;
  if (r.grade === "no-idea")
    return `That's what this is for. The threat was ${truth}.`;
  if (r.grade === "partial") {
    if (r.partialBy === "threat" && r.answer)
      return `${r.answer.label} was a real threat too, but ${truth} was the one that hurt.`;
    if (r.partialBy === "target")
      return `Right square, wrong move. The threat was ${truth}.`;
    if (r.partialBy === "piece")
      return `Right piece, wrong move. The threat was ${truth}.`;
    return `You found a weak spot, but the threat was ${truth}.`;
  }
  return `Not that one. The threat was ${truth}.`;
}

/** The line token for the reply's line: the engine's line from the position after the move. */
function replyLineToken(m: DiagnoseMoment): string {
  return `[CONTINUATION:${Math.floor(m.ply / 2) + 1}:${m.ply % 2 === 0 ? "w" : "b"}]`;
}

/**
 * The coach's half of a graded answer: one sentence naming the reply, the
 * reply's line, and the cause's lesson.
 */
export function gradedReplyText(m: DiagnoseMoment, r: DiagnoseResult): string {
  return `${headline(m, r)}\n\n${replyLineToken(m)}\n\n${lessonText(r.cause)}`;
}

export function skipReplyText(m: DiagnoseMoment): string {
  return `Skipped. Ask me about ${m.label} any time.`;
}

/** Masti's face beside the reply. */
export function replyMood(r: DiagnoseResult | "skip"): MastiMood {
  if (r === "skip") return "wave";
  if (r.grade === "exact") return "excited";
  if (r.grade === "partial") return "idea";
  return "pointing";
}

/** The strip's words while the answer is on the board. */
export function diagnoseStripWords(
  m: DiagnoseMoment,
  answered: string | null
): { eyebrow: string; text: string } {
  return {
    eyebrow: "Your answer",
    text: answered ?? `${opponentOf(m)} to move after ${m.label}`,
  };
}

// ── The games this browser was asked about ─────────────────────────────────

const STORAGE_KEY = "cm-analysis-diagnosed";
const MAX_STORED_GAMES = 100;

/** The game's key, the one its side is stored under (playerSide.ts). */
export function askedKey(
  headers: Record<string, string | null | undefined>,
  plyCount: number
): string | null {
  return gameSideKey(headers, plyCount);
}

function readAsked(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((k): k is string => typeof k === "string")
      : [];
  } catch {
    return [];
  }
}

export function wasAsked(key: string | null): boolean {
  if (!key) return false;
  return readAsked().includes(key);
}

/** Remembered for good, the oldest dropped past the cap. */
export function markAsked(key: string | null): void {
  if (!key || typeof window === "undefined") return;
  try {
    const keys = readAsked().filter((k) => k !== key);
    keys.push(key);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(keys.slice(-MAX_STORED_GAMES))
    );
  } catch {
    /* storage full or unavailable: the page still asks once per load */
  }
}
