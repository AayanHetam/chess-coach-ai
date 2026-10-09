/**
 * One fielded follow-up turn, on fixture 07 with the real referee and a
 * scripted model: the checks, the field-scoped regeneration, the omission
 * with its one clause, and what is never done (a hedge, a third call, a
 * line or a number the facts do not give).
 */
import { describe, it, expect } from "vitest";
import type { CallLLMOptions, LLMResult } from "@/lib/llmProvider";
import {
  ABSENCE_CLAUSE,
  MOMENT_OUTPUT_SCHEMA,
  momentToText,
  proseFromEnvelope,
  type MomentEnvelope,
} from "../moment";
import { planFieldedTurn, type FieldedMomentFacts } from "../fieldedFacts";
import {
  fieldedAsRegenerateResult,
  normalizeEnvelope,
  runFieldedTurn,
} from "../fieldedTurn";
import {
  MOVES,
  anchor8,
  compact,
  gameEval,
  refereeFor,
} from "./fieldedFixture";

const plan = planFieldedTurn({
  anchor: anchor8,
  otherSide: null,
  compact,
  question: "Why was 8. Nc7+ a mistake?",
  playedMoves: MOVES,
  gameEval,
  playerColor: "w",
  whatIf: null,
});
if (!plan.eligible) throw new Error("fixture turn must be fielded");
const fx: FieldedMomentFacts = plan.facts;
const referee = refereeFor();

const clean: MomentEnvelope = {
  idea: "You went for the check because a knight that hits the king and the rook looks like it wins material.",
  happens:
    "The queen on c1 was already hanging, and after the king steps aside the knight is the piece that is lost.",
  proof: { kind: "engine", moveNumber: 8, color: "w" },
  lesson: {
    pattern: "Take what is hanging first",
    check:
      "Before any check or fork, list every capture your opponent has in reply.",
  },
  question: "Which of your pieces is loose after the king steps to d8?",
};

const request: CallLLMOptions = {
  tier: "fast",
  system: "FIELDED",
  systemSuffix: "SUFFIX",
  messages: [{ role: "user", content: "Why was 8. Nc7+ a mistake?\n\n[...]" }],
  temperature: 0.7,
  maxTokens: 600,
  cacheSystem: true,
  outputSchema: MOMENT_OUTPUT_SCHEMA,
};
const v1Request: CallLLMOptions = {
  ...request,
  system: "V1",
  outputSchema: undefined,
};

type Step = string | Error | ((o: CallLLMOptions) => Promise<string>);

/** A model that answers each call with the next step, recording what it was sent. */
function model(steps: Step[]) {
  const sent: CallLLMOptions[] = [];
  const callLLM = async (o: CallLLMOptions): Promise<LLMResult> => {
    sent.push(o);
    const step = steps[sent.length - 1];
    if (step === undefined) throw new Error("no more steps");
    if (step instanceof Error) throw step;
    const content = typeof step === "function" ? await step(o) : step;
    return {
      content,
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      inputTokens: 1000,
      outputTokens: 120,
      elapsedMs: 900,
    };
  };
  return { sent, callLLM };
}

const json = (e: Partial<MomentEnvelope>) => JSON.stringify({ ...clean, ...e });

const run = (
  steps: Step[],
  extra: Partial<Parameters<typeof runFieldedTurn>[0]> = {}
) => {
  const m = model(steps);
  return {
    m,
    out: runFieldedTurn({
      request,
      v1Request,
      fx,
      referee,
      callLLM: m.callLLM,
      ...extra,
    }),
  };
};

/** The served text with the model's own strings, the tokens and the labels taken out. */
function appText(text: string, envs: MomentEnvelope[]): string {
  let t = text;
  for (const e of envs)
    for (const s of [
      e.idea,
      e.happens,
      e.question ?? "",
      e.lesson?.pattern ?? "",
      e.lesson?.check ?? "",
    ])
      if (s) t = t.split(s.replace(/[.!?]+$/, "")).join("");
  return t
    .replace(/\[(?:CONTINUATION|PLAYED):\d+:[wb]\]/g, "")
    .replace(/Lesson:|Your turn:/g, "")
    .replace(/[.?!\s]+/g, " ")
    .trim();
}

describe("a clean envelope", () => {
  it("is one call with the moment schema, served as its projection, and passes the second net", async () => {
    const { m, out } = run([json({})]);
    const r = await out;
    expect(m.sent).toHaveLength(1);
    expect(m.sent[0].outputSchema).toBe(MOMENT_OUTPUT_SCHEMA);
    expect(r.served).toBe("fielded");
    expect(r.retryCount).toBe(0);
    expect(r.text).toBe(momentToText(proseFromEnvelope(clean)));
    expect(r.text).toContain("\n\n[CONTINUATION:8:w]\n\n");
    expect(referee(r.text).dropped).toEqual([]);
    expect(r.counter.parse).toBe("clean");
  });
});

describe("the field-scoped regeneration", () => {
  it("a proof the facts do not hold is redone with the lines that are held, in the same schema", async () => {
    const { m, out } = run([
      json({ proof: { kind: "engine", moveNumber: 12, color: "w" } }),
      json({}),
    ]);
    const r = await out;
    expect(m.sent).toHaveLength(2);
    expect(m.sent[1].outputSchema).toBe(MOMENT_OUTPUT_SCHEMA);
    const retry = m.sent[1].messages[m.sent[1].messages.length - 1];
    expect(retry.role).toBe("user");
    expect(retry.content).toContain('"proof"');
    expect(retry.content).toContain(
      '{"kind":"engine","moveNumber":8,"color":"w"}'
    );
    expect(r.text).toContain("[CONTINUATION:8:w]");
    expect(r.retryCount).toBe(1);
    expect(r.counter.regenerated).toEqual(["proof"]);
  });

  it("a second failure omits the field with its one clause, and there is never a third call", async () => {
    const bad = {
      proof: { kind: "engine" as const, moveNumber: 12, color: "w" as const },
    };
    const { m, out } = run([json(bad), json(bad), json({})]);
    const r = await out;
    expect(m.sent).toHaveLength(2);
    expect(r.text.split(ABSENCE_CLAUSE.proof)).toHaveLength(2);
    expect(r.text).not.toMatch(/\[(?:CONTINUATION|PLAYED):/);
    expect(r.prose?.omitted).toEqual(["proof"]);
    expect(r.counter.clauses).toBe(1);
  });

  it("a move the referee drops sends the opening line back, quoting the sentence and the moves it may name", async () => {
    const borrowed = {
      happens: "After 8... Kxc7 the knight is simply lost for nothing.",
    };
    const { m, out } = run([json(borrowed), json({})]);
    const r = await out;
    expect(m.sent).toHaveLength(2);
    const retry = m.sent[1].messages[m.sent[1].messages.length - 1].content;
    expect(retry).toContain('"idea" and "happens"');
    expect(retry).toContain("Kxc7");
    expect(retry).toContain("8. Nc7+");
    expect(retry).toContain("8. Qxc1");
    expect(r.text).not.toContain("Kxc7");
    expect(referee(r.text).dropped).toEqual([]);
  });

  it("keeps the better of two for each field: an idea that passed first stays when its redo fails", async () => {
    const { out } = run([
      json({ happens: "" }),
      json({ idea: "", happens: clean.happens }),
    ]);
    const r = await out;
    expect(r.prose?.idea).toBe(clean.idea);
    expect(r.prose?.happens).toBe(clean.happens);
    expect(r.prose?.omitted).toEqual([]);
  });

  it("an empty happens twice is its clause", async () => {
    const { out } = run([json({ happens: "" }), json({ happens: "" })]);
    const r = await out;
    expect(r.text).toContain(ABSENCE_CLAUSE.happens);
    expect(r.prose?.idea).toBe(clean.idea);
  });

  it("a lesson that names a move twice is simply not taught", async () => {
    const lesson = {
      pattern: "Loose pieces",
      check: "Before e4, count the attackers.",
    };
    const { out } = run([json({ lesson }), json({ lesson })]);
    const r = await out;
    expect(r.text).not.toContain("Lesson:");
    expect(r.counter.clauses).toBe(0);
    expect(r.prose?.omitted).toEqual(["lesson"]);
  });

  it("a failure that only counts (over the budget) is served as it is, in one call", async () => {
    const long = {
      happens:
        "The queen on c1 was already hanging, and after the king steps aside the knight is the piece that is lost, because nothing defends it once the king has stepped away and the queen recaptures with check.",
    };
    const { m, out } = run([json(long)]);
    const r = await out;
    expect(m.sent).toHaveLength(1);
    expect(r.prose?.happens).toBe(long.happens);
    expect(Object.keys(r.counter.first).some((k) => k.endsWith(".count"))).toBe(
      true
    );
  });
});

describe("when the regeneration does not come back", () => {
  it("a failed second call serves the first minus its failed fields", async () => {
    const bad = {
      proof: { kind: "engine" as const, moveNumber: 12, color: "w" as const },
    };
    const { out } = run([json(bad), new Error("provider down")]);
    const r = await out;
    expect(r.served).toBe("fielded");
    expect(r.counter.regenAborted).toBe(true);
    expect(r.text).toContain(ABSENCE_CLAUSE.proof);
    expect(r.prose?.idea).toBe(clean.idea);
  });

  it("the turn's own abort during the second call rejects the turn", async () => {
    const ctl = new AbortController();
    const bad = {
      proof: { kind: "engine" as const, moveNumber: 12, color: "w" as const },
    };
    const { out } = run(
      [
        json(bad),
        async () => {
          ctl.abort();
          throw new Error("aborted");
        },
      ],
      { signal: ctl.signal }
    );
    await expect(out).rejects.toThrow();
  });

  it("a second call slower than the budget is given up", async () => {
    const bad = {
      proof: { kind: "engine" as const, moveNumber: 12, color: "w" as const },
    };
    const { out } = run(
      [
        json(bad),
        (o) =>
          new Promise((resolve, reject) => {
            const t = setTimeout(() => resolve(json({})), 2000);
            o.signal?.addEventListener("abort", () => {
              clearTimeout(t);
              reject(new Error("aborted"));
            });
          }),
      ],
      { regenBudgetMs: 50 }
    );
    const r = await out;
    expect(r.counter.regenAborted).toBe(true);
    expect(r.text).toContain(ABSENCE_CLAUSE.proof);
  });
});

describe("reading a reply", () => {
  it("a reply that is no object at all is answered by the v1 request, served as v1", async () => {
    const { m, out } = run(['{"idea": "unterminated', "A v1 answer."]);
    const r = await out;
    expect(m.sent).toHaveLength(2);
    expect(m.sent[1].system).toBe("V1");
    expect(m.sent[1].outputSchema).toBeUndefined();
    expect(r.served).toBe("v1_fallback");
    expect(r.text).toBe("A v1 answer.");
    expect(r.counter.parse).toBe("failed");
  });

  it("a prose reply is lifted into the fields", async () => {
    const { out } = run([
      `${clean.idea} ${clean.happens}\n\n[CONTINUATION:8:w]\n\nLesson: Take what is hanging first. Before any check or fork, list every capture your opponent has in reply.`,
    ]);
    const r = await out;
    expect(r.counter.parse).toBe("prose");
    expect(r.text).toContain("[CONTINUATION:8:w]");
  });

  it("an OpenAI-style reply in a code fence with trailing commas is repaired", async () => {
    const { out } = run(["```json\n" + json({}).replace(/}$/, ",}") + "\n```"]);
    const r = await out;
    expect(r.counter.parse).toBe("repaired");
    expect(r.served).toBe("fielded");
  });

  it("normalizes the labels, tokens and line breaks the model was told not to write", () => {
    const { envelope, repairs } = normalizeEnvelope({
      ...clean,
      proof: null,
      idea: "Idea: you went for the check.",
      happens: "The queen was hanging.\n[CONTINUATION:8:w]",
      question: "Your turn: which piece is loose?",
    });
    expect(envelope.idea).toBe("you went for the check.");
    expect(envelope.happens).toBe("The queen was hanging.");
    expect(envelope.question).toBe("which piece is loose?");
    expect(envelope.proof).toEqual({
      kind: "engine",
      moveNumber: 8,
      color: "w",
    });
    expect(repairs).toEqual(
      expect.arrayContaining([
        "label_stripped",
        "token_lifted",
        "token_stripped",
      ])
    );
  });
});

describe("what is never done", () => {
  const failing: Record<string, Partial<MomentEnvelope>> = {
    idea: { idea: "" },
    happens: { happens: "" },
    proof: { proof: { kind: "played", moveNumber: 30, color: "b" } },
    lesson: { lesson: { pattern: "e4 openings", check: "Play e4." } },
  };
  const subsets = [
    ["idea"],
    ["happens"],
    ["proof"],
    ["lesson"],
    ["idea", "proof"],
    ["happens", "lesson"],
    ["idea", "happens", "proof", "lesson"],
  ];
  it.each(subsets)(
    "never hedges: an omission is a clause or nothing (%s)",
    async (...fields) => {
      const env = fields.reduce<Partial<MomentEnvelope>>(
        (acc, f) => ({ ...acc, ...failing[f] }),
        {}
      );
      const { out } = run([json(env), json(env)]);
      const r = await out;
      expect(r.text).not.toMatch(/may be inaccurate/i);
      const rest = appText(r.text, [clean]);
      const clauses = [
        ABSENCE_CLAUSE.idea,
        ABSENCE_CLAUSE.happens,
        ABSENCE_CLAUSE.proof,
      ].map((c) => c.replace(/[.?!\s]+/g, " ").trim());
      let left = rest;
      for (const c of clauses) left = left.split(c).join("");
      expect(left.trim()).toBe("");
      // The second net has nothing left to drop.
      expect(referee(r.text).dropped).toEqual([]);
    }
  );

  it("the counter carries no move, no board and no prose", async () => {
    const { out } = run([
      json({
        happens: "After 8... Kxc7 the knight is simply lost for nothing.",
      }),
      json({}),
    ]);
    const r = await out;
    const s = JSON.stringify(r.counter);
    expect(s).not.toMatch(/\b[KQRBN][a-h]?[1-8]?x?[a-h][1-8]/);
    expect(s).not.toMatch(/\/[1-8pnbrqkPNBRQK]+\//);
    expect(s).not.toContain("queen");
    expect(s).not.toContain("knight");
  });

  it("a prose validator's error span goes to the referee, and its failure is no failure", async () => {
    const spanned = await run([json({})], {
      checkProse: async () => ({
        issues: [
          {
            check_name: "user_history_citation_mismatch" as never,
            severity: "error",
            llm_span: "the queen on c1",
            expected: null,
            actual: null,
            detail: "x",
          },
        ],
        passed: false,
        telemetry: [],
        costUsd: 0.001,
      }),
    }).out;
    expect(spanned.flaggedSpans).toEqual(["the queen on c1"]);
    const broken = await run([json({})], {
      checkProse: async () => {
        throw new Error("parser down");
      },
    }).out;
    expect(broken.flaggedSpans).toBeUndefined();
    expect(broken.counter.proseValidator).toBe("failed");
  });
});

describe("as a pipeline result", () => {
  it("passes after a retry or at once, never as the template, and says the parsers were skipped", async () => {
    const r = await run([json({})]).out;
    const res = fieldedAsRegenerateResult(r, {
      correlationId: "c",
      fen: fx.fenAfter,
      moveSan: fx.label,
      playerPerspective: "white",
    });
    expect(res.finalOutcome).toBe("passed_initial");
    expect(res.finalResponse).toBe(r.text);
    expect(
      res.telemetry
        .filter((t) => t.fire_reason === "skip_fielded_turn")
        .map((t) => t.check_name)
    ).toEqual(["eval_claim", "feature_citation"]);
    expect(res.totalCostUsd).toBeGreaterThan(0);
  });
});
