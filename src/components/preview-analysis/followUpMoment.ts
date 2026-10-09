/**
 * A follow-up answered in fields, drawn from its fields (pathway 3.3).
 *
 * Under COACH_FOLLOWUP_PROMPT=fielded the chat route serves a follow-up
 * about one move as a moment (lib/coach/moment.ts) and sends it beside the
 * answer's text, which is the moment's projection to today's grammar. With
 * this page's flag on, the transcript draws the moment itself: the idea and
 * what happens as two lines, the proof through the line renderer the
 * tokens use, the lesson and the question as notes, and where the page has
 * no line to draw for the proof, the app's one clause in its place rather
 * than nothing.
 *
 * The message's content stays the text, so the history the model is sent,
 * the saved transcript, a share link and the social excerpt are what they
 * were. A moment whose projection is not the served text is not this
 * answer's and is never drawn.
 *
 * Pure and client-safe.
 */
import {
  lessonText,
  momentOpening,
  momentToText,
  questionText,
  sameProjection,
  type MomentLesson,
  type MomentProse,
  type MomentProseField,
  type ProofRef,
} from "@/lib/coach/moment";

/**
 * Off until its flip: its own one-line PR changes this default, and the
 * env overrides it either way, which is how the Playwright legs run it on.
 */
export const FOLLOWUP_MOMENTS_DEFAULT = false;

/**
 * Read once at module level by the analysis page. `NEXT_PUBLIC_` values are
 * inlined at build time, and only for this literal spelling of the name.
 */
export function isFollowUpMomentsEnabledPublic(): boolean {
  const v = (process.env.NEXT_PUBLIC_COACH_FOLLOWUP_MOMENTS ?? "")
    .trim()
    .toLowerCase();
  if (v === "1" || v === "on" || v === "true") return true;
  if (v === "0" || v === "off" || v === "false") return false;
  return FOLLOWUP_MOMENTS_DEFAULT;
}

const FIELDS: readonly MomentProseField[] = [
  "idea",
  "happens",
  "proof",
  "lesson",
  "question",
];

const optString = (v: unknown): string | null | undefined =>
  v === null || v === undefined ? null : typeof v === "string" ? v : undefined;

function readProof(v: unknown): ProofRef | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  if (o.kind !== "engine" && o.kind !== "played") return undefined;
  if (
    typeof o.moveNumber !== "number" ||
    !Number.isInteger(o.moveNumber) ||
    o.moveNumber < 1 ||
    o.moveNumber > 999
  )
    return undefined;
  if (o.color !== "w" && o.color !== "b") return undefined;
  return { kind: o.kind, moveNumber: o.moveNumber, color: o.color };
}

function readLesson(v: unknown): MomentLesson | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.pattern !== "string" || typeof o.check !== "string")
    return undefined;
  return { pattern: o.pattern, check: o.check };
}

/**
 * The moment the route sent beside `text`, or null: any field of the wrong
 * shape, or a projection that is not the text the page will show, and the
 * answer is drawn from its text as before.
 */
export function readServedMoment(
  raw: unknown,
  text: string
): MomentProse | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const idea = optString(o.idea);
  const happens = optString(o.happens);
  const question = optString(o.question);
  const more = optString(o.more);
  const proof = readProof(o.proof);
  const lesson = readLesson(o.lesson);
  if (
    idea === undefined ||
    happens === undefined ||
    question === undefined ||
    more === undefined ||
    proof === undefined ||
    lesson === undefined
  )
    return null;
  if (!Array.isArray(o.omitted)) return null;
  const omitted: MomentProseField[] = [];
  for (const f of o.omitted) {
    if (!FIELDS.includes(f as MomentProseField)) return null;
    if (!omitted.includes(f as MomentProseField))
      omitted.push(f as MomentProseField);
  }
  const prose: MomentProse = {
    idea,
    happens,
    proof,
    lesson,
    question,
    more,
    omitted,
  };
  if (!momentIsText(prose, text)) return null;
  return prose;
}

/** The moment is the answer the message shows. */
export function momentIsText(prose: MomentProse, text: string): boolean {
  const projected = momentToText(prose);
  return projected.trim().length > 0 && sameProjection(projected, text);
}

/** One line of the moment's opening, as the transcript draws it. */
export interface MomentLine {
  field: "idea" | "happens" | "proof";
  text: string;
  /** The app's clause for a field the checks removed. */
  absent: boolean;
}

/** What the transcript draws for a moment, in order. */
export interface MomentView {
  lines: MomentLine[];
  /** The line to draw; null when the answer cites none. */
  proof: ProofRef | null;
  /** Beyond the two lines; the follow-up never fills it today. */
  more: string | null;
  /** The pattern's name, in bold, then the check. */
  lesson: string | null;
  question: string | null;
}

const capitalise = (s: string) =>
  s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;

export function momentView(prose: MomentProse): MomentView {
  let lesson: string | null = null;
  if (
    prose.lesson &&
    (prose.lesson.pattern.trim() || prose.lesson.check.trim())
  ) {
    const words = lessonText(prose.lesson);
    const pattern = prose.lesson.pattern.trim().replace(/[.!?]+$/, "");
    // The pattern's name leads the note, so it reads as the thing to keep.
    // A pattern with emphasis of its own is not wrapped in more of it.
    lesson =
      pattern &&
      !pattern.includes("*") &&
      prose.lesson.check.trim() &&
      words.startsWith(`${pattern}. `)
        ? `**${capitalise(pattern)}.** ${words.slice(pattern.length + 2)}`
        : capitalise(words);
  }
  return {
    lines: momentOpening(prose),
    proof: prose.proof,
    more: prose.more && prose.more.trim() ? prose.more.trim() : null,
    lesson,
    question:
      prose.question && prose.question.trim()
        ? questionText(prose.question)
        : null,
  };
}
