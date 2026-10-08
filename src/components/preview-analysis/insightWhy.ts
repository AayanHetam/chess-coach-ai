/**
 * Cut a key-moment card's [WHY] body into what teaches at a glance and what
 * waits behind a pill.
 *
 * The body the verbalizer writes has four labelled lines (Idea, Problem,
 * Solution, Outcome) and, usually, a closing takeaway paragraph. Shown whole
 * it is a wall; hidden whole it teaches nothing. What a coach says first is
 * the intent and the reason it failed — "you wanted X, but Y" — and what
 * they say last is the transferable lesson. The solution is the line, and
 * the card draws that. So:
 *
 *   lead   = Idea + Problem, shown above the proof line
 *   lesson = the closing unlabelled paragraph, shown under it
 *   rest   = Solution, Outcome and anything else, behind "Full explanation"
 *
 * A body written as flowing paragraphs (the gold examples) cuts the same
 * way: first paragraph, last paragraph, the middle. Line tokens are stripped
 * here; the card renders the lines itself.
 */

const LABEL_RE = /^(Idea|Problem|Solution|Outcome|Continuation)\s*:\s*(.+)$/i;
const TOKEN_INLINE_RE =
  /\[(?:CONTINUATION|MAIA_CONTINUATION|PLAYED):\d+:[wb]\]/gi;
/** "The takeaway: …", "Here's the pattern to bank: …" — the card shows a Lesson eyebrow instead. */
const LESSON_PREFIX_RE =
  /^(?:the\s+)?(?:takeaway|lesson|key lesson|pattern to (?:bank|remember|carry(?: forward)?)|here'?s the (?:pattern|lesson)(?: to (?:bank|remember|carry(?: forward)?))?|file this one away)\s*:\s*/i;
const BULLET_RE = /^[-•]\s+/;

export interface InsightWhyParts {
  /** Intent and the reason, shown by default (may carry Idea:/Problem: labels). */
  lead: string;
  /** The transferable lesson, shown by default; null when the body has none. */
  lesson: string | null;
  /** Everything else, behind the pill; "" when there is nothing more. */
  rest: string;
}

interface Line {
  text: string;
  label: string | null;
  bullet: boolean;
}

function stripLessonPrefix(text: string): string {
  const out = text.replace(LESSON_PREFIX_RE, "").trim();
  return out.length > 0 ? out : text;
}

export function splitInsightWhy(
  why: string | null | undefined
): InsightWhyParts {
  const lines: Line[] = (why ?? "")
    .split(/\r?\n/)
    .map((raw) => raw.replace(TOKEN_INLINE_RE, "").trim())
    .filter((text) => text.length > 0)
    .map((text) => {
      const m = LABEL_RE.exec(text);
      return {
        text,
        label: m ? m[1].toLowerCase() : null,
        bullet: BULLET_RE.test(text),
      };
    });

  if (lines.length === 0) return { lead: "", lesson: null, rest: "" };

  const hasLabels = lines.some((l) => l.label !== null);

  if (!hasLabels) {
    // Flowing paragraphs: first, last, the middle.
    const last = lines[lines.length - 1];
    if (lines.length === 1) return { lead: last.text, lesson: null, rest: "" };
    const lessonOk = !last.bullet;
    const lead = lines[0].text;
    const lesson = lessonOk ? stripLessonPrefix(last.text) : null;
    const middle = lines.slice(1, lessonOk ? -1 : undefined);
    return { lead, lesson, rest: middle.map((l) => l.text).join("\n") };
  }

  const lastLabelIdx = lines.reduce((acc, l, i) => (l.label ? i : acc), -1);
  // The lesson: the last unlabelled, non-bullet line after the last label.
  let lessonIdx = -1;
  for (let i = lines.length - 1; i > lastLabelIdx; i--) {
    if (lines[i].label === null && !lines[i].bullet) {
      lessonIdx = i;
      break;
    }
  }
  const lead: string[] = [];
  const rest: string[] = [];
  lines.forEach((l, i) => {
    if (i === lessonIdx) return;
    if (l.label === "idea" || l.label === "problem") lead.push(l.text);
    else rest.push(l.text);
  });
  return {
    lead: lead.join("\n"),
    lesson: lessonIdx >= 0 ? stripLessonPrefix(lines[lessonIdx].text) : null,
    rest: rest.join("\n"),
  };
}
