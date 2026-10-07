/**
 * The moment type: its schema under the structured-output rules, the
 * projection to today's prose grammar, the parsers back from it, and the
 * lenient parser for an unconstrained reply.
 */
import { describe, it, expect } from "vitest";
import {
  ABSENCE_CLAUSE,
  MOMENT_BUDGET,
  MOMENT_ENVELOPE_SCHEMA,
  MOMENT_OUTPUT_SCHEMA,
  coerceProofRef,
  countProseWords,
  momentFromCardBody,
  momentFromFollowUpText,
  momentToText,
  parseLessonText,
  parseMomentEnvelope,
  proseFromEnvelope,
  renderProofToken,
  type MomentEnvelope,
  type MomentProse,
} from "../moment";
import {
  FOLLOWUP_LESSON_WORD_BUDGET,
  FOLLOWUP_OPENING_WORD_BUDGET,
} from "@/lib/prompts/followUpPrompt";

const envelope: MomentEnvelope = {
  idea: "You went for the fork because a check that hits the rook looks like it wins material",
  happens:
    "The knight is loose once the king steps aside, and the queen on c1 was already yours for the taking.",
  proof: { kind: "engine", moveNumber: 8, color: "w" },
  lesson: {
    pattern: "Take what is hanging before you start a combination",
    check:
      "Before any check or fork, list every capture your opponent has in reply.",
  },
  question: "Which recapture keeps your rook safe after the check on d1",
};

describe("the schema", () => {
  /** Visit every schema node; a `properties` map is a map of names, not a schema. */
  function walk(
    node: unknown,
    path: string,
    visit: (obj: Record<string, unknown>, path: string) => void
  ): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((n, i) => walk(n, `${path}[${i}]`, visit));
      return;
    }
    const o = node as Record<string, unknown>;
    visit(o, path);
    for (const [k, v] of Object.entries(o)) {
      if (k === "properties" && v && typeof v === "object") {
        for (const [name, schema] of Object.entries(
          v as Record<string, unknown>
        ))
          walk(schema, `${path}.${k}.${name}`, visit);
      } else {
        walk(v, `${path}.${k}`, visit);
      }
    }
  }

  it("every object forbids extra properties and requires every property it lists", () => {
    walk(MOMENT_ENVELOPE_SCHEMA, "$", (o, path) => {
      if (o.type !== "object") return;
      expect(o.additionalProperties, path).toBe(false);
      const props = Object.keys(
        (o.properties as Record<string, unknown>) ?? {}
      ).sort();
      expect(((o.required as string[]) ?? []).slice().sort(), path).toEqual(
        props
      );
    });
  });

  it("carries no string or numeric constraints (the API rejects them)", () => {
    const forbidden = [
      "minLength",
      "maxLength",
      "pattern",
      "format",
      "minimum",
      "maximum",
      "minItems",
      "maxItems",
    ];
    walk(MOMENT_ENVELOPE_SCHEMA, "$", (o, path) => {
      for (const key of forbidden)
        expect(key in o, `${path}.${key}`).toBe(false);
    });
  });

  it("makes the optional fields nullable through anyOf and names the schema for the OpenAI shape", () => {
    const props = MOMENT_ENVELOPE_SCHEMA.properties as Record<
      string,
      Record<string, unknown>
    >;
    for (const field of ["proof", "lesson", "question"]) {
      const anyOf = props[field].anyOf as Array<Record<string, unknown>>;
      expect(
        anyOf.some((s) => s.type === "null"),
        field
      ).toBe(true);
    }
    expect(props.idea).toEqual({ type: "string" });
    expect(props.happens).toEqual({ type: "string" });
    expect(MOMENT_OUTPUT_SCHEMA.name).toBe("coach_moment");
    expect(MOMENT_OUTPUT_SCHEMA.schema).toBe(MOMENT_ENVELOPE_SCHEMA);
  });
});

describe("the budget is the prompt's budget", () => {
  it("counts the same words the follow-up prompt states", () => {
    expect(MOMENT_BUDGET.openingWords).toBe(FOLLOWUP_OPENING_WORD_BUDGET);
    expect(MOMENT_BUDGET.lessonWords).toBe(FOLLOWUP_LESSON_WORD_BUDGET);
  });

  it("excludes tokens, move numbers and notation from the word count", () => {
    expect(
      countProseWords("After 8. Qxc1 Rb8 you are a queen up [CONTINUATION:8:w]")
    ).toBe(6);
    expect(countProseWords("")).toBe(0);
  });
});

describe("momentToText: today's grammar from a fielded moment", () => {
  it("projects the four slots and the token line in order", () => {
    const text = momentToText(proseFromEnvelope(envelope));
    expect(text).toBe(
      [
        "You went for the fork because a check that hits the rook looks like it wins material. The knight is loose once the king steps aside, and the queen on c1 was already yours for the taking.",
        "[CONTINUATION:8:w]",
        "Lesson: Take what is hanging before you start a combination. Before any check or fork, list every capture your opponent has in reply.",
        "Your turn: Which recapture keeps your rook safe after the check on d1?",
      ].join("\n\n")
    );
  });

  it("renders the played token and leaves optional fields out when they are null", () => {
    const text = momentToText(
      proseFromEnvelope({
        ...envelope,
        proof: { kind: "played", moveNumber: 8, color: "b" },
        lesson: null,
        question: null,
      })
    );
    expect(text.split("\n\n")).toHaveLength(2);
    expect(text).toContain("\n\n[PLAYED:8:b]");
    expect(text).not.toContain("Lesson:");
    expect(text).not.toContain("Your turn:");
    expect(
      renderProofToken({ kind: "engine", moveNumber: 12, color: "b" })
    ).toBe("[CONTINUATION:12:b]");
  });

  it("keeps a question's own question mark and a lesson with only a check", () => {
    const text = momentToText(
      proseFromEnvelope({
        ...envelope,
        question: "Which piece is loose now?",
        lesson: { pattern: "", check: "Count attackers before you land there" },
      })
    );
    expect(text).toContain("Your turn: Which piece is loose now?");
    expect(text).toContain("Lesson: Count attackers before you land there.");
  });
});

describe("absence, never a hedge (the pinned fixture)", () => {
  const HEDGE_RE =
    /\b(?:might|may|probably|perhaps|likely|possibly|I think|it seems|I believe|could be)\b/i;

  it("a removed 'happens' becomes its one clause in place, and nothing else is added", () => {
    const prose: MomentProse = {
      ...proseFromEnvelope(envelope),
      happens: null,
      omitted: ["happens"],
    };
    const text = momentToText(prose);
    expect(text).toBe(
      [
        `You went for the fork because a check that hits the rook looks like it wins material. ${ABSENCE_CLAUSE.happens}`,
        "[CONTINUATION:8:w]",
        "Lesson: Take what is hanging before you start a combination. Before any check or fork, list every capture your opponent has in reply.",
        "Your turn: Which recapture keeps your rook safe after the check on d1?",
      ].join("\n\n")
    );
    expect(text).not.toMatch(HEDGE_RE);
  });

  it("a removed proof says so in a clause and draws no token; a removed lesson or question leaves nothing", () => {
    const prose: MomentProse = {
      ...proseFromEnvelope(envelope),
      proof: null,
      lesson: null,
      question: null,
      omitted: ["proof", "lesson", "question"],
    };
    const text = momentToText(prose);
    expect(text).toBe(
      `You went for the fork because a check that hits the rook looks like it wins material. The knight is loose once the king steps aside, and the queen on c1 was already yours for the taking. ${ABSENCE_CLAUSE.proof}`
    );
    expect(text).not.toMatch(/\[(?:CONTINUATION|PLAYED):/);
    expect(text).not.toMatch(HEDGE_RE);
  });

  it("with every field removed the text is the clauses alone, never empty", () => {
    const prose: MomentProse = {
      idea: null,
      happens: null,
      proof: null,
      lesson: null,
      question: null,
      more: null,
      omitted: ["idea", "happens", "proof", "lesson", "question"],
    };
    expect(momentToText(prose)).toBe(
      `${ABSENCE_CLAUSE.idea} ${ABSENCE_CLAUSE.happens} ${ABSENCE_CLAUSE.proof}`
    );
    for (const clause of Object.values(ABSENCE_CLAUSE))
      expect(clause).not.toMatch(HEDGE_RE);
  });

  it("a null field that was not omitted (the model gave none) is simply absent", () => {
    const text = momentToText({
      ...proseFromEnvelope(envelope),
      lesson: null,
      proof: null,
    });
    expect(text).not.toContain(ABSENCE_CLAUSE.proof);
    expect(text).not.toContain("Lesson:");
  });
});

describe("parsing today's follow-up prose back into fields", () => {
  it("round-trips a projected moment", () => {
    const text = momentToText(proseFromEnvelope(envelope));
    const back = momentFromFollowUpText(text);
    expect(back.idea).toBe(`${envelope.idea}.`);
    expect(back.happens).toBe(envelope.happens);
    expect(back.proof).toEqual(envelope.proof);
    expect(back.lesson).toEqual({
      pattern: "Take what is hanging before you start a combination",
      check:
        "Before any check or fork, list every capture your opponent has in reply.",
    });
    expect(back.question).toBe(
      "Which recapture keeps your rook safe after the check on d1?"
    );
    expect(back.omitted).toEqual([]);
  });

  it("reads a long answer as idea, the rest, the first token, the lesson and the question", () => {
    const text = [
      "Great question! You went for the fork. But the queen on c1 was hanging.",
      "After 8. Nc7+ Kd8 the knight has to move.",
      "[CONTINUATION:8:w]",
      "[PLAYED:8:w]",
      "**Lesson:** The in-between move. Before any check, list the opponent's captures.",
      "Your turn: which recapture keeps the rook?",
      "Does that make sense?",
    ].join("\n\n");
    const m = momentFromFollowUpText(text);
    expect(m.idea).toBe("Great question!");
    expect(m.happens).toBe(
      "You went for the fork. But the queen on c1 was hanging. After 8. Nc7+ Kd8 the knight has to move. Does that make sense?"
    );
    expect(m.proof).toEqual({ kind: "engine", moveNumber: 8, color: "w" });
    expect(m.lesson).toEqual({
      pattern: "The in-between move",
      check: "Before any check, list the opponent's captures.",
    });
    expect(m.question).toBe("which recapture keeps the rook?");
  });

  it("strips an inline token from a sentence instead of reading it as the proof", () => {
    const m = momentFromFollowUpText(
      "The line [CONTINUATION:8:w] shows it. Then it is over."
    );
    expect(m.proof).toBeNull();
    expect(m.idea).toBe("The line shows it.");
  });

  it("parses a lesson with a colon-separated name, or with no name at all", () => {
    expect(
      parseLessonText(
        "Lesson: Loose pieces: count attackers before you land there"
      )
    ).toEqual({
      pattern: "Loose pieces",
      check: "count attackers before you land there",
    });
    expect(parseLessonText("Look for the reply before you commit.")).toEqual({
      pattern: "",
      check: "Look for the reply before you commit.",
    });
    expect(parseLessonText("Lesson:   ")).toBeNull();
  });
});

describe("parsing a key-moment card body", () => {
  it("lifts a labelled body the way the client cuts it", () => {
    const body = [
      "Idea: You wanted pressure on White's position with the knight leap to g4.",
      "Problem: The position was already a forced mate with 8... Ba5+.",
      "Problem: Instead, 8... Ng4 lets White off the hook entirely.",
      "Solution: 8... Ba5+ was the move.",
      "Outcome: Black goes from a forced win to a merely large advantage.",
      "",
      "The hardest skill is recognising when you are already winning. The check was the win.",
      "[CONTINUATION:8:b]",
      "[MAIA_CONTINUATION:8:b]",
    ].join("\n");
    const m = momentFromCardBody(body);
    expect(m.idea).toBe(
      "You wanted pressure on White's position with the knight leap to g4."
    );
    expect(m.happens).toBe(
      "The position was already a forced mate with 8... Ba5+. Instead, 8... Ng4 lets White off the hook entirely."
    );
    expect(m.more).toBe(
      "Solution: 8... Ba5+ was the move.\nOutcome: Black goes from a forced win to a merely large advantage."
    );
    expect(m.lesson).toEqual({
      pattern: "The hardest skill is recognising when you are already winning",
      check: "The check was the win.",
    });
    expect(m.proof).toEqual({ kind: "engine", moveNumber: 8, color: "b" });
    expect(m.question).toBeNull();
  });

  it("cuts a flowing body as first sentence, the middle, the last paragraph", () => {
    const body = [
      "Your knight check looked strong. It attacks two pieces at once.",
      "But the queen on c1 was hanging all along.",
      "The pattern to remember: take what is already hanging first. Then look for tricks.",
    ].join("\n");
    const m = momentFromCardBody(body);
    expect(m.idea).toBe("Your knight check looked strong.");
    expect(m.happens).toBe(
      "It attacks two pieces at once. But the queen on c1 was hanging all along."
    );
    expect(m.lesson).toEqual({
      pattern: "take what is already hanging first",
      check: "Then look for tricks.",
    });
    expect(m.more).toBeNull();
  });

  it("returns an empty moment for an empty body", () => {
    const m = momentFromCardBody("\n\n");
    expect(m.idea).toBeNull();
    expect(m.happens).toBeNull();
    expect(m.proof).toBeNull();
  });
});

describe("the lenient envelope parser", () => {
  const clean = JSON.stringify(envelope);

  it("reads a clean document with no repairs", () => {
    const r = parseMomentEnvelope(clean);
    expect(r).not.toBeNull();
    expect(r!.envelope).toEqual(envelope);
    expect(r!.repairs).toEqual([]);
  });

  it("tolerates a code fence, prose around the object and trailing commas, and says so", () => {
    const wrapped = `Here is the moment:\n\`\`\`json\n${clean.replace(/}$/, ",}")}\n\`\`\`\nHope that helps.`;
    const r = parseMomentEnvelope(wrapped);
    expect(r).not.toBeNull();
    expect(r!.envelope).toEqual(envelope);
    expect(r!.repairs).toEqual(["code_fence", "trailing_commas"]);
  });

  it("accepts the string forms of the proof and the lesson, and drops unknown keys", () => {
    const r = parseMomentEnvelope(
      JSON.stringify({
        idea: "An idea",
        happens: "What happens",
        proof: "[PLAYED:12:b]",
        lesson: "Lesson: Loose pieces. Count attackers before you land there.",
        question: "",
        eval: "+2.5",
      })
    );
    expect(r).not.toBeNull();
    expect(r!.envelope).toEqual({
      idea: "An idea",
      happens: "What happens",
      proof: { kind: "played", moveNumber: 12, color: "b" },
      lesson: {
        pattern: "Loose pieces",
        check: "Count attackers before you land there.",
      },
      question: null,
    });
    expect(r!.repairs).toEqual(["dropped:eval"]);
  });

  it("reports a missing idea or happens as empty strings rather than failing", () => {
    const r = parseMomentEnvelope('{"happens": "Something", "proof": null}');
    expect(r).not.toBeNull();
    expect(r!.envelope.idea).toBe("");
    expect(r!.envelope.happens).toBe("Something");
    expect(r!.repairs).toContain("missing:idea");
  });

  it("returns null when there is no object or none of the fields", () => {
    expect(parseMomentEnvelope("just prose, no braces")).toBeNull();
    expect(parseMomentEnvelope("[1, 2, 3]")).toBeNull();
    expect(parseMomentEnvelope('{"unrelated": true}')).toBeNull();
    expect(parseMomentEnvelope("{not json at all}")).toBeNull();
  });

  it("coerces proof references in every shape it meets, and rejects the rest", () => {
    expect(
      coerceProofRef({ kind: "continuation", moveNumber: "8", color: "white" })
    ).toEqual({ kind: "engine", moveNumber: 8, color: "w" });
    expect(coerceProofRef({ kind: "game", moveNumber: 3, color: "b" })).toEqual(
      { kind: "played", moveNumber: 3, color: "b" }
    );
    expect(coerceProofRef("CONTINUATION:8:w")).toEqual({
      kind: "engine",
      moveNumber: 8,
      color: "w",
    });
    expect(
      coerceProofRef({ kind: "engine", moveNumber: 0, color: "w" })
    ).toBeNull();
    expect(
      coerceProofRef({ kind: "maia", moveNumber: 8, color: "w" })
    ).toBeNull();
    expect(coerceProofRef(42)).toBeNull();
    expect(coerceProofRef(null)).toBeNull();
  });
});
