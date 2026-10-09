/**
 * What a turn-1 card left out, said once (pathway 4.9, decision 21).
 *
 * When the failure ladder (ladder.ts) serves a card at its sentence_drop
 * rung, the sentences it cut leave a gap the reader cannot see. Behind
 * COACH_LADDER_NOTE the card carries one line the app writes instead,
 * naming the kind of claim it could not check and nothing else: no move,
 * no square, no number. The kind comes from the referee finding that cut
 * the sentence, never from the sentence's words.
 *
 * Only sentences the reader would have seen count. /analysis never renders
 * a card's [THREATS], [ROLES] or [CONCEPT] body, so a sentence cut from one
 * leaves no gap and gets no line.
 *
 * The line goes after the card's opening prose, before its first section,
 * so the client's cut (insightWhy.ts) reads it as part of the lede and
 * never as the Lesson.
 */
import type { ServingFinding } from "./armingConfig";

/** `COACH_LADDER_NOTE=1|on|true` (server, read per call, off until its flip). */
export function isLadderNoteEnabled(): boolean {
  const v = (process.env.COACH_LADDER_NOTE ?? "").trim().toLowerCase();
  return v === "1" || v === "on" || v === "true";
}

/** Keys a noted review in the response cache. Bump it with any copy change. */
export const LADDER_NOTE_VERSION = "ln1";

/**
 * A line that is nothing but one grammar token ("[WHY]", "[/THREATS]",
 * "[CONCEPT:fork:Fork]", "[CONTINUATION:12:w]"). Moved here from ladder.ts,
 * which imports it, so the two modules share it without a cycle.
 */
export const GRAMMAR_LINE_RE = /^\s*\[\/?[A-Z_]+(?::[^\]]*)?\]\s*$/;

export type CardSection =
  | "WHY"
  | "THREATS"
  | "ROLES"
  | "CONCEPT"
  | "ENGINE_LINE";

const CARD_SECTIONS: ReadonlySet<string> = new Set<CardSection>([
  "WHY",
  "THREATS",
  "ROLES",
  "CONCEPT",
  "ENGINE_LINE",
]);

/** Sections /analysis never renders. */
export const SILENT_SECTIONS: ReadonlySet<CardSection> = new Set<CardSection>([
  "THREATS",
  "ROLES",
  "CONCEPT",
  "ENGINE_LINE",
]);

export type LadderNoteKind =
  | "tactic"
  | "evaluation"
  | "move"
  | "pieces"
  | "point";

/** The order a sentence's kind is taken in when it held several findings. */
export const LADDER_NOTE_KIND_PRIORITY: readonly LadderNoteKind[] = [
  "tactic",
  "evaluation",
  "move",
  "pieces",
  "point",
];

export interface DroppedSentence {
  text: string;
  section: CardSection | null;
}

export interface LadderNote {
  /** The line the card carries, exactly as served. */
  text: string;
  /** One kind per dropped sentence a reader would have seen, in body order. */
  kinds: LadderNoteKind[];
  version: typeof LADDER_NOTE_VERSION;
}

const SECTION_TOKEN_RE = /^\s*\[(\/?)([A-Z_]+)(?::[^\]]*)?\]\s*$/;

/** The section in force after a grammar-token line (an open token sets it, its close clears it). */
export function sectionAfter(
  line: string,
  current: CardSection | null
): CardSection | null {
  const m = SECTION_TOKEN_RE.exec(line);
  if (!m || !CARD_SECTIONS.has(m[2])) return current;
  const tag = m[2] as CardSection;
  if (m[1] === "/") return tag === current ? null : current;
  return tag;
}

/** The kind of claim a finding stands for. */
export function ladderNoteKind(
  f: Pick<ServingFinding, "check" | "category">
): LadderNoteKind {
  switch (f.check) {
    case "tactical_keyword":
      return "tactic";
    case "eval_display":
      return f.category === "eval_unbacked" ||
        f.category === "mate_distance_wrong"
        ? "evaluation"
        : "point";
    case "stage9_mate_in_n":
      return "evaluation";
    case "san_whitelist":
      if (
        f.category === "san_unknown" ||
        f.category === "hypothetical_line_off_contract"
      ) {
        return "move";
      }
      return f.category === "square_unknown" ? "pieces" : "point";
    case "mobility_claims":
    case "relational_claim":
      return "pieces";
    default:
      return "point";
  }
}

// The words a note may use. Every form is pinned clean against the referee
// in ladderNote.test.ts. A change here bumps LADDER_NOTE_VERSION.
const LADDER_NOTE_PHRASES: Record<
  LadderNoteKind,
  { one: string; some: string }
> = {
  tactic: { one: "a tactic", some: "some tactics" },
  evaluation: { one: "an evaluation", some: "some evaluations" },
  move: { one: "a move", some: "some moves" },
  pieces: {
    one: "a point about the pieces",
    some: "some points about the pieces",
  },
  point: { one: "a point", some: "a few points" },
};

/** What a note says when its sentences were of too many kinds to name. */
export const LADDER_NOTE_MIXED_PHRASE = "a few points";

const noteLine = (phrase: string) => `I left out ${phrase} I couldn't check.`;

const byPriority = (a: LadderNoteKind, b: LadderNoteKind) =>
  LADDER_NOTE_KIND_PRIORITY.indexOf(a) - LADDER_NOTE_KIND_PRIORITY.indexOf(b);

/**
 * The line for a card's dropped sentences, one kind each. One kind is named
 * once or as "some", two sentences of two kinds are both named, and anything
 * else is the mixed phrase. Null when there is nothing to say.
 */
export function renderLadderNote(
  kinds: readonly LadderNoteKind[]
): string | null {
  if (kinds.length === 0) return null;
  const distinct = Array.from(new Set(kinds)).sort(byPriority);
  if (distinct.length === 1) {
    const phrases = LADDER_NOTE_PHRASES[distinct[0]];
    return noteLine(kinds.length === 1 ? phrases.one : phrases.some);
  }
  if (kinds.length === 2 && distinct.length === 2) {
    const [a, b] = distinct;
    return noteLine(
      `${LADDER_NOTE_PHRASES[a].one} and ${LADDER_NOTE_PHRASES[b].one}`
    );
  }
  return noteLine(LADDER_NOTE_MIXED_PHRASE);
}

/**
 * The note for a sentence_drop card, or null when no sentence a reader
 * would have seen was dropped. Each sentence's kind is the first, in
 * priority order, among the armed findings whose span it held.
 */
export function ladderNoteFor(
  dropped: readonly DroppedSentence[],
  errors: readonly ServingFinding[]
): LadderNote | null {
  const kinds: LadderNoteKind[] = [];
  for (const d of dropped) {
    if (d.section !== null && SILENT_SECTIONS.has(d.section)) continue;
    const held = errors
      .filter((f) => f.span && d.text.includes(f.span))
      .map(ladderNoteKind);
    if (held.length === 0) continue;
    kinds.push(held.sort(byPriority)[0]);
  }
  const text = renderLadderNote(kinds);
  return text ? { text, kinds, version: LADDER_NOTE_VERSION } : null;
}

const FIRST_SECTION_RE =
  /^\s*\[(WHY|THREATS|ROLES|CONCEPT|ENGINE_LINE)(?::[^\]]*)?\]/;

/**
 * The card body with the note on a line of its own: after the last prose
 * line before the first section, or directly before that section when no
 * prose comes first. A body with no section takes it after its first prose
 * line, or at the end.
 */
export function insertLadderNote(body: string, text: string): string {
  const lines = body.split("\n");
  const isProse = (line: string) =>
    line.trim().length > 0 && !GRAMMAR_LINE_RE.test(line);
  const first = lines.findIndex((line) => FIRST_SECTION_RE.test(line));
  let at: number;
  if (first >= 0) {
    let lastProse = -1;
    for (let i = 0; i < first; i++) if (isProse(lines[i])) lastProse = i;
    at = lastProse >= 0 ? lastProse + 1 : first;
  } else {
    const firstProse = lines.findIndex(isProse);
    at = firstProse >= 0 ? firstProse + 1 : lines.length;
  }
  return [...lines.slice(0, at), text, ...lines.slice(at)].join("\n");
}
