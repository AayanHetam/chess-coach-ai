/**
 * The moment: the unit the coach's answers are made of.
 *
 * A moment is an object the app assembles. The board, the verdict, the
 * evaluations, the proof line and the actions are computed from engine
 * data; the model fills only the prose slots, by a schema the app
 * dictates: one line for the idea, one for what happens, an optional
 * lesson (the pattern's name and the check to run next time) and an
 * optional question the player can answer on the board. The proof is a
 * reference to a line the app already holds, never moves the model wrote.
 *
 * This module is pure: the type, the JSON schema under the provider's
 * structured-output rules, the projection to today's prose grammar and
 * the parsers back from it. The fielded follow-up (fieldedTurn.ts, under
 * COACH_FOLLOWUP_PROMPT=fielded) serves from it. The route the
 * pathway chose (MASTERMIND_CONTEXT/IDEAL_PRODUCT_PATHWAY.md, "moment")
 * is to keep every downstream consumer byte-identical by projecting a
 * fielded answer to the prose it reads today, so the projection here is
 * the contract the follow-up route will depend on. The turn-1 stream
 * lifts each refereed card in src/lib/contract/turnMoments.ts, built on
 * the page's own cut (parseInsights, then splitInsightWhy).
 * `momentFromCardBody` below is not that cut: it remains the reader of
 * the moment replay script.
 *
 * Two shapes, on purpose:
 *   MomentEnvelope  what the model returns; every field present, idea and
 *                   happens required strings, the rest null when absent.
 *   MomentProse     what the app serves; a field the checks removed is
 *                   null and listed in `omitted`, and the projection says
 *                   so in one clause rather than hedging (the founder's
 *                   turn-1 rule, carried over: drop, never hedge).
 */
import { splitProseSentences } from "@/lib/contract/sentences";

export type Side = "w" | "b";

/**
 * A line the app holds, named the way the follow-up tokens name it: the
 * engine's best line instead of a move ([CONTINUATION:n:c]) or what the
 * game did from there ([PLAYED:n:c]).
 */
export interface ProofRef {
  kind: "engine" | "played";
  moveNumber: number;
  color: Side;
}

export interface MomentLesson {
  /** The pattern's name: "the in-between move", "the loose piece". */
  pattern: string;
  /** The one check to run before a move like it, a habit with a trigger. */
  check: string;
}

/** What the model fills. Everything else on a moment is computed. */
export interface MomentEnvelope {
  idea: string;
  happens: string;
  proof: ProofRef | null;
  lesson: MomentLesson | null;
  question: string | null;
}

export type MomentProseField =
  | "idea"
  | "happens"
  | "proof"
  | "lesson"
  | "question";

/** The served prose: a removed field is null and named in `omitted`. */
export interface MomentProse {
  idea: string | null;
  happens: string | null;
  proof: ProofRef | null;
  lesson: MomentLesson | null;
  question: string | null;
  /** Anything beyond the two lines (a card's Solution and Outcome), behind a tap. */
  more: string | null;
  omitted: MomentProseField[];
}

/** The proof as the app resolves it: the line, where it starts, its eval. */
export interface MomentProof extends ProofRef {
  startFen: string;
  /** Half-moves played before the line's first move. */
  startPly: number;
  sans: string[];
  /** "+2.84" / "M+3" from the engine data the app holds; null for the game's own line. */
  evalDisplay: string | null;
}

/** A board annotation, tagged with whose idea it is. Computed by the app. */
export type MomentAnnotation =
  | {
      kind: "arrow";
      from: string;
      to: string;
      by: "player" | "opponent" | "engine";
    }
  | { kind: "square"; square: string; by: "player" | "opponent" | "engine" };

/** What the player can do with the moment. Computed by the app. */
export type MomentAction =
  | { kind: "play_proof" }
  | { kind: "show_in_game"; ply: number }
  | { kind: "practice"; theme: string }
  | { kind: "answer_on_board" };

export interface MomentMove {
  san: string;
  moveNumber: number;
  color: Side;
  verdict: string | null;
  evalBefore: string | null;
  evalAfter: string | null;
}

/** A moment: the board state, the computed facts, and the prose. */
export interface Moment extends MomentProse {
  /** Half-moves played in the game before `fen`; null for an exploration position or an answer about no position. */
  ply: number | null;
  fen: string;
  /** The move the moment is about, when it is about one. */
  move: MomentMove | null;
  annotations: MomentAnnotation[];
  /** The resolved proof; null when the prose names none or the checks removed it. */
  proofLine: MomentProof | null;
  actions: MomentAction[];
}

// ── The schema ──────────────────────────────────────────────────────────────
// Written to the structured-output rules callLLM documents: every object
// carries `additionalProperties: false` and a full `required` list, nullable
// fields go through anyOf, and there are no string or numeric constraints
// (the API rejects them). The two-line budget is therefore a post-check
// (momentChecks.ts), not a schema rule.

const nullable = (
  schema: Record<string, unknown>
): Record<string, unknown> => ({
  anyOf: [schema, { type: "null" }],
});

export const PROOF_REF_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["engine", "played"] },
    moveNumber: { type: "integer" },
    color: { type: "string", enum: ["w", "b"] },
  },
  required: ["kind", "moveNumber", "color"],
  additionalProperties: false,
};

export const MOMENT_LESSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    pattern: { type: "string" },
    check: { type: "string" },
  },
  required: ["pattern", "check"],
  additionalProperties: false,
};

export const MOMENT_ENVELOPE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    idea: { type: "string" },
    happens: { type: "string" },
    proof: nullable(PROOF_REF_SCHEMA),
    lesson: nullable(MOMENT_LESSON_SCHEMA),
    question: nullable({ type: "string" }),
  },
  required: ["idea", "happens", "proof", "lesson", "question"],
  additionalProperties: false,
};

/** The `outputSchema` argument for callLLM. */
export const MOMENT_OUTPUT_SCHEMA = {
  name: "coach_moment",
  schema: MOMENT_ENVELOPE_SCHEMA,
} as const;

// ── Budgets ─────────────────────────────────────────────────────────────────
// The same numbers the follow-up prompt states (followUpPrompt.ts); a test
// pins them equal so the two cannot drift. Sentences, not characters: the
// shape is the count.
export interface MomentBudget {
  /** idea + happens together, words of the model's own prose. */
  openingWords: number;
  ideaSentences: number;
  happensSentences: number;
  /** pattern + check together. */
  lessonWords: number;
  questionSentences: number;
}

export const MOMENT_BUDGET: Readonly<MomentBudget> = {
  openingWords: 45,
  ideaSentences: 1,
  happensSentences: 2,
  lessonWords: 35,
  questionSentences: 1,
};

// ── The absence clauses ─────────────────────────────────────────────────────
// The ONLY text the app adds when a field is removed. One clause, a plain
// statement that the coach is not saying something, never a hedge over
// the thing it cannot back. A lesson or a question that fails is simply
// not asked or taught: both are optional, and a clause about their
// absence would be noise.
export const ABSENCE_CLAUSE: Readonly<
  Record<"idea" | "happens" | "proof", string>
> = {
  idea: "I can't say what the move was for from the lines I have.",
  happens: "What follows from it I can't confirm from the lines I have.",
  proof: "I don't have a line I can stand behind here.",
};

/** Word count the way the prompt budgets count: tokens and notation excluded. */
export function countProseWords(text: string): number {
  return text
    .replace(LINE_TOKEN_INLINE_RE, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 0 &&
        !/^\d+\.(?:\.\.)?$/.test(w) &&
        !/^[+-]?\d+(?:\.\d+)?$/.test(w)
    )
    .filter(
      (w) =>
        !/^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?[.,;:!?]*$/.test(
          w
        )
    ).length;
}

/** Sentences of a line of prose (newlines count as boundaries). */
export function countSentences(text: string): number {
  return splitProseSentences(text).filter((s) => s.trim().length > 0).length;
}

// ── Projection to today's grammar ───────────────────────────────────────────

export const LINE_TOKEN_LINE_RE =
  /^\s*\[(CONTINUATION|PLAYED|MAIA_CONTINUATION):(\d+):([wb])\]\s*$/i;
export const LINE_TOKEN_INLINE_RE =
  /\[(?:CONTINUATION|PLAYED|MAIA_CONTINUATION):\d+:[wb]\]/gi;

export function renderProofToken(ref: ProofRef): string {
  return `[${ref.kind === "played" ? "PLAYED" : "CONTINUATION"}:${ref.moveNumber}:${ref.color}]`;
}

export function parseProofToken(line: string): ProofRef | null {
  const m = LINE_TOKEN_LINE_RE.exec(line);
  if (!m) return null;
  const tag = m[1].toUpperCase();
  if (tag === "MAIA_CONTINUATION") return null;
  return {
    kind: tag === "PLAYED" ? "played" : "engine",
    moveNumber: parseInt(m[2], 10),
    color: m[3].toLowerCase() as Side,
  };
}

const endsWithStop = (s: string) => /[.!?]$/.test(s);
const sentenceCase = (s: string) => s.trim();
const withStop = (s: string) =>
  endsWithStop(s.trim()) ? s.trim() : `${s.trim()}.`;
const withoutStop = (s: string) => s.trim().replace(/[.!?]+$/, "");

/** A lesson's words after its label: "<pattern>. <check>". */
export function lessonText(lesson: MomentLesson): string {
  const pattern = withoutStop(lesson.pattern);
  const check = withStop(lesson.check);
  if (!pattern) return check;
  if (!lesson.check.trim()) return withStop(pattern);
  return `${pattern}. ${check}`;
}

export function renderLesson(lesson: MomentLesson): string {
  return `Lesson: ${lessonText(lesson)}`;
}

/** A question's words after its label, ending in one question mark. */
export function questionText(question: string): string {
  return withStop(question).replace(/\.$/, "?").replace(/\?\?$/, "?");
}

/**
 * The opening of a served moment as lines: the idea, what happens, and in
 * the place of a removed one its absence clause (a removed proof's clause
 * last). Joined with a space they are the projection's first paragraph.
 */
export function momentOpening(
  prose: MomentProse
): { field: "idea" | "happens" | "proof"; text: string; absent: boolean }[] {
  const omitted = new Set<MomentProseField>(prose.omitted);
  const out: {
    field: "idea" | "happens" | "proof";
    text: string;
    absent: boolean;
  }[] = [];
  if (prose.idea && prose.idea.trim())
    out.push({
      field: "idea",
      text: withStop(sentenceCase(prose.idea)),
      absent: false,
    });
  else if (omitted.has("idea"))
    out.push({ field: "idea", text: ABSENCE_CLAUSE.idea, absent: true });
  if (prose.happens && prose.happens.trim())
    out.push({
      field: "happens",
      text: withStop(sentenceCase(prose.happens)),
      absent: false,
    });
  else if (omitted.has("happens"))
    out.push({ field: "happens", text: ABSENCE_CLAUSE.happens, absent: true });
  if (!prose.proof && omitted.has("proof"))
    out.push({ field: "proof", text: ABSENCE_CLAUSE.proof, absent: true });
  return out;
}

/**
 * The served text is this moment's projection: equal once runs of
 * whitespace are one space, which is all the referee's rebuild of a reply
 * it kept whole can change.
 */
export function sameProjection(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}

/**
 * The prose the follow-up path serves today, from a fielded moment:
 *
 *   <idea> <happens>
 *
 *   [CONTINUATION:8:w]
 *
 *   Lesson: <pattern>. <check>
 *
 *   Your turn: <question>
 *
 * A removed idea, happens or proof becomes its absence clause in the
 * place the field would have stood. A removed lesson or question leaves
 * nothing. The result is never empty: with every field gone it is the
 * clauses alone, which is still a true sentence about what the coach
 * does not know.
 */
export function momentToText(prose: MomentProse): string {
  const opening = momentOpening(prose).map((l) => l.text);

  const paragraphs: string[] = [];
  if (opening.length > 0) paragraphs.push(opening.join(" "));
  if (prose.proof) paragraphs.push(renderProofToken(prose.proof));
  if (prose.more && prose.more.trim()) paragraphs.push(prose.more.trim());
  if (
    prose.lesson &&
    (prose.lesson.pattern.trim() || prose.lesson.check.trim())
  )
    paragraphs.push(renderLesson(prose.lesson));
  if (prose.question && prose.question.trim())
    paragraphs.push(`Your turn: ${questionText(prose.question)}`);
  return paragraphs.join("\n\n");
}

export function proseFromEnvelope(envelope: MomentEnvelope): MomentProse {
  return {
    idea: envelope.idea,
    happens: envelope.happens,
    proof: envelope.proof,
    lesson: envelope.lesson,
    question: envelope.question,
    more: null,
    omitted: [],
  };
}

// ── The lenient parser (the OpenAI fallback, and any unconstrained reply) ──

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function asSide(v: unknown): Side | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (t === "w" || t === "white") return "w";
  if (t === "b" || t === "black") return "b";
  return null;
}

/** "Lesson:", and the prefixes the client's card cut already recognises ("The pattern to remember:", "Key lesson:"), bold or not. */
const LESSON_LINE_RE =
  /^\s*(?:\*\*)?(?:lesson|the lesson(?: here)?|key lesson|the key lesson|(?:the\s+)?takeaway|(?:the\s+)?pattern to (?:bank|remember|carry(?: forward)?)|here'?s the (?:pattern|lesson)(?: to (?:bank|remember|carry(?: forward)?))?|file this one away)(?:\*\*)?\s*:/i;

/** "[CONTINUATION:8:w]", "CONTINUATION:8:w", "engine 8 w", or the object form. */
export function coerceProofRef(v: unknown): ProofRef | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const m =
      /(CONTINUATION|PLAYED|ENGINE|GAME)\s*[:\s]\s*(\d+)\s*[:\s]\s*(w|b|white|black)/i.exec(
        v
      );
    if (!m) return null;
    const tag = m[1].toUpperCase();
    return {
      kind: tag === "PLAYED" || tag === "GAME" ? "played" : "engine",
      moveNumber: parseInt(m[2], 10),
      color: asSide(m[3])!,
    };
  }
  if (typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const kindRaw = typeof o.kind === "string" ? o.kind.trim().toLowerCase() : "";
  const kind: ProofRef["kind"] | null =
    kindRaw === "engine" || kindRaw === "continuation" || kindRaw === "best"
      ? "engine"
      : kindRaw === "played" || kindRaw === "game"
        ? "played"
        : null;
  const moveNumber =
    typeof o.moveNumber === "number"
      ? o.moveNumber
      : typeof o.moveNumber === "string"
        ? parseInt(o.moveNumber, 10)
        : NaN;
  const color = asSide(o.color);
  if (!kind || !Number.isInteger(moveNumber) || moveNumber < 1 || !color)
    return null;
  return { kind, moveNumber, color };
}

/** The object form, or "Lesson: <pattern>. <check>" / "<pattern>. <check>" as one string. */
export function coerceLesson(v: unknown): MomentLesson | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return parseLessonText(v);
  if (typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const pattern = asString(o.pattern) ?? asString(o.name) ?? "";
  const check = asString(o.check) ?? asString(o.habit) ?? "";
  if (!pattern && !check) return null;
  return { pattern, check };
}

/** "Lesson: The in-between move. Before any check, list every capture in reply." */
export function parseLessonText(text: string): MomentLesson | null {
  const body = text.replace(LESSON_LINE_RE, "").trim();
  if (!body) return null;
  const sentences = splitProseSentences(body).filter(
    (s) => s.trim().length > 0
  );
  if (sentences.length <= 1) {
    // One sentence: a colon separates a name from its check ("Loose pieces: count attackers first").
    const colon = /^([^:]{2,60}):\s+(.+)$/.exec(body);
    if (colon) return { pattern: colon[1].trim(), check: colon[2].trim() };
    return { pattern: "", check: body };
  }
  return {
    pattern: withoutStop(sentences[0]),
    check: sentences.slice(1).join(" ").trim(),
  };
}

export interface ParsedEnvelope {
  envelope: MomentEnvelope;
  /** What the parser had to repair or drop; empty for a clean document. */
  repairs: string[];
}

/**
 * Read a model reply as a moment envelope. Tolerates code fences, prose
 * around the object, string forms of the proof and the lesson, and
 * missing optional fields. Returns null only when no JSON object with at
 * least one of the prose fields can be found; a missing idea or happens
 * comes back as "" so the checks can say so.
 */
export function parseMomentEnvelope(raw: string): ParsedEnvelope | null {
  const repairs: string[] = [];
  let text = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) {
    text = fence[1].trim();
    repairs.push("code_fence");
  }
  const open = text.indexOf("{");
  const close = text.lastIndexOf("}");
  if (open < 0 || close <= open) return null;
  if (open > 0 || close < text.length - 1) repairs.push("prose_around_object");
  let doc: unknown;
  try {
    doc = JSON.parse(text.slice(open, close + 1));
  } catch {
    // One more try without trailing commas, the common lenient-JSON slip.
    try {
      doc = JSON.parse(
        text.slice(open, close + 1).replace(/,\s*([}\]])/g, "$1")
      );
      repairs.push("trailing_commas");
    } catch {
      return null;
    }
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const o = doc as Record<string, unknown>;
  const known = ["idea", "happens", "proof", "lesson", "question"];
  if (!known.some((k) => k in o)) return null;
  for (const k of Object.keys(o))
    if (!known.includes(k)) repairs.push(`dropped:${k}`);

  const idea = asString(o.idea) ?? "";
  const happens = asString(o.happens) ?? asString(o.whatHappens) ?? "";
  if (!idea) repairs.push("missing:idea");
  if (!happens) repairs.push("missing:happens");
  const proof = coerceProofRef(o.proof);
  if (o.proof !== null && o.proof !== undefined && !proof)
    repairs.push("unreadable:proof");
  const lesson = coerceLesson(o.lesson);
  if (o.lesson !== null && o.lesson !== undefined && !lesson)
    repairs.push("unreadable:lesson");
  const question = asString(o.question);
  return { envelope: { idea, happens, proof, lesson, question }, repairs };
}

// ── Parsers from today's prose ──────────────────────────────────────────────

const YOUR_TURN_LINE_RE = /^\s*(?:\*\*)?your turn(?:\*\*)?\s*:\s*/i;
const stripEmphasis = (s: string) => s.replace(/\*\*|__/g, "").trim();

/**
 * A follow-up answer in today's grammar, lifted into prose fields: the
 * first sentence is the idea, the rest of the opening is what happens,
 * the first token on a line of its own is the proof, the "Lesson:"
 * paragraph is the lesson and "Your turn:" the question. Paragraphs the
 * grammar does not name are read as more of what happens: a long answer
 * is then over the budget, which is what the checks are there to say.
 */
export function momentFromFollowUpText(text: string): MomentProse {
  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  let proof: ProofRef | null = null;
  let lesson: MomentLesson | null = null;
  let question: string | null = null;
  const opening: string[] = [];
  for (const paragraph of paragraphs) {
    const lines = paragraph.split(/\r?\n/);
    const kept: string[] = [];
    for (const line of lines) {
      const token = parseProofToken(line);
      if (token) {
        if (!proof) proof = token;
        continue;
      }
      if (LESSON_LINE_RE.test(line)) {
        if (!lesson) lesson = parseLessonText(stripEmphasis(line));
        continue;
      }
      if (YOUR_TURN_LINE_RE.test(line)) {
        if (!question)
          question = stripEmphasis(line.replace(YOUR_TURN_LINE_RE, ""));
        continue;
      }
      const clean = line
        .replace(LINE_TOKEN_INLINE_RE, "")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
      if (clean) kept.push(clean);
    }
    if (kept.length > 0) opening.push(kept.join(" "));
  }
  const sentences = opening
    .flatMap((p) => splitProseSentences(p))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const idea = sentences.length > 0 ? sentences[0] : null;
  const happens = sentences.length > 1 ? sentences.slice(1).join(" ") : null;
  return { idea, happens, proof, lesson, question, more: null, omitted: [] };
}

const CARD_LABEL_RE =
  /^(Idea|Problem|Solution|Outcome|Continuation)\s*:\s*(.*)$/i;
const CARD_LESSON_PREFIX_RE =
  /^(?:the\s+)?(?:takeaway|lesson|key lesson|pattern to (?:bank|remember|carry(?: forward)?)|here'?s the (?:pattern|lesson)(?: to (?:bank|remember|carry(?: forward)?))?|file this one away)\s*:\s*/i;

/**
 * A key-moment card's [WHY] body, lifted the way the client cuts it
 * (insightWhy.ts): Idea is the idea, the Problem lines are what happens,
 * Solution and Outcome go behind the tap, the first line token is the
 * proof and the closing unlabelled paragraph is the lesson. A body written
 * as flowing paragraphs cuts the same way: first sentence, the rest of the
 * first paragraph, the middle, the last paragraph.
 */
export function momentFromCardBody(body: string): MomentProse {
  const lines = body
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter((l) => l.length > 0);
  let proof: ProofRef | null = null;
  const labelled: Array<{ label: string | null; text: string }> = [];
  for (const line of lines) {
    const token = parseProofToken(line);
    if (token) {
      if (!proof) proof = token;
      continue;
    }
    const clean = stripEmphasis(
      line
        .replace(LINE_TOKEN_INLINE_RE, "")
        .replace(/[ \t]{2,}/g, " ")
        .trim()
    );
    if (!clean) continue;
    const m = CARD_LABEL_RE.exec(clean);
    labelled.push(
      m
        ? { label: m[1].toLowerCase(), text: m[2].trim() }
        : { label: null, text: clean }
    );
  }
  if (labelled.length === 0)
    return {
      idea: null,
      happens: null,
      proof,
      lesson: null,
      question: null,
      more: null,
      omitted: [],
    };

  const hasLabels = labelled.some((l) => l.label !== null);
  let idea: string | null = null;
  let happens: string | null = null;
  let more: string | null = null;
  let lesson: MomentLesson | null = null;

  if (hasLabels) {
    const lastLabel = labelled.reduce((acc, l, i) => (l.label ? i : acc), -1);
    const trailing = labelled
      .slice(lastLabel + 1)
      .filter((l) => !/^[-•]\s/.test(l.text));
    const ideaParts = labelled
      .filter((l) => l.label === "idea")
      .map((l) => l.text);
    const problemParts = labelled
      .filter((l) => l.label === "problem")
      .map((l) => l.text);
    const moreParts = labelled
      .filter(
        (l) =>
          l.label === "solution" ||
          l.label === "outcome" ||
          l.label === "continuation"
      )
      .map(
        (l) => `${l.label![0].toUpperCase()}${l.label!.slice(1)}: ${l.text}`
      );
    const leadUnlabelled = labelled
      .slice(0, lastLabel + 1)
      .filter((l) => l.label === null)
      .map((l) => l.text);
    idea =
      ideaParts.length > 0
        ? ideaParts.join(" ")
        : leadUnlabelled.length > 0
          ? leadUnlabelled[0]
          : null;
    happens = problemParts.length > 0 ? problemParts.join(" ") : null;
    more = moreParts.length > 0 ? moreParts.join("\n") : null;
    if (trailing.length > 0)
      lesson = parseLessonText(
        trailing[trailing.length - 1].text.replace(CARD_LESSON_PREFIX_RE, "")
      );
  } else {
    const texts = labelled.map((l) => l.text);
    const first = splitProseSentences(texts[0])
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    idea = first[0] ?? null;
    const restOfFirst = first.slice(1).join(" ");
    const middle = texts.slice(1, texts.length > 1 ? -1 : undefined);
    happens =
      [restOfFirst, ...middle].filter((s) => s.length > 0).join(" ") || null;
    if (texts.length > 1) {
      const last = texts[texts.length - 1];
      if (!/^[-•]\s/.test(last))
        lesson = parseLessonText(last.replace(CARD_LESSON_PREFIX_RE, ""));
      else happens = [happens ?? "", last].join(" ").trim();
    }
  }
  return { idea, happens, proof, lesson, question: null, more, omitted: [] };
}
