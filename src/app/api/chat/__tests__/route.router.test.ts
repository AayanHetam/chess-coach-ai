import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { NextRequest } from "next/server";
import {
  confirmedSideOf,
  getCoachChatSystemPromptParts,
} from "@/lib/prompts/coachChatPrompt";
import { buildCompactGameContext } from "@/lib/coach/compactGameContext";
import {
  EVAL_CLAIM_PARSER_SYSTEM,
  FEATURE_CITATION_PARSER_SYSTEM,
} from "@/lib/mastermind/validators/parserPrompts";
import { CATEGORY_CLASSIFIER_SYSTEM } from "@/lib/mastermind/categorization/categoryPrompts";
import { FOLLOWUP_REFEREE_FALLBACK } from "@/lib/contract/followUpReferee";
import {
  FOLLOWUP_BUDGET,
  followUpSubjectClause,
  subjectReminder,
} from "@/lib/prompts/followUpPrompt";
import {
  NO_BOARD_FACTS_HEADER,
  followUpGrammarClause,
  followUpGrammarReminder,
} from "@/lib/prompts/followUpGrammar";
import { PAGE_TURN_KINDS } from "@/lib/coach/pageActions";
import type { MomentEnvelope } from "@/lib/coach/moment";
import {
  MOVES,
  compact,
  fenAt,
  gameEval,
} from "@/lib/coach/__tests__/fieldedFixture";

/**
 * Pathway 3.4: `COACH_INTENT_ROUTER=1`, the router decides the turn, on
 * both validator wings. Calls are told apart by what they send: the
 * router by its `coach_intent` schema, the classifier by its system prompt
 * (left unmocked, so it is counted here as a provider call), a parser by
 * its schema or system, and anything else is the coach. Off, nothing
 * changes and no routing is read.
 */

const {
  mockLog,
  mockSession,
  mockCallLLM,
  mockGetAnalysisContext,
  mockFetchDataSources,
  pipelineStub,
  prepOpts,
} = vi.hoisted(() => ({
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockSession: vi.fn(),
  mockCallLLM: vi.fn(),
  mockGetAnalysisContext: vi.fn(),
  mockFetchDataSources: vi.fn(),
  pipelineStub: { fn: null as null | ((opts: unknown) => Promise<unknown>) },
  prepOpts: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/logging", () => ({
  logger: { child: vi.fn(() => mockLog) },
  withRequestContext: (_: string, fn: () => unknown) => fn(),
  extractRequestId: () => "router",
  logErrorToSentry: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mockSession }));
vi.mock("@/lib/llmProvider", () => ({
  callLLM: mockCallLLM,
  callLLMStream: vi.fn(),
  LLMError: class LLMError extends Error {},
  PUBLIC_LLM_ERROR: { message: "x", code: "x" },
  toSafeLLMError: (e: unknown) => e,
}));
vi.mock("@/lib/analysisContextCache", () => ({
  getAnalysisContext: mockGetAnalysisContext,
  buildCondensedContext: vi.fn(() => ""),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminFirestore: vi.fn(),
  AdminConfigError: class extends Error {},
  __resetAdminCacheForTests: vi.fn(),
}));
vi.mock("@/lib/mastermind/wireValidators", async (orig) => ({
  ...(await orig<object>()),
  fetchDataSources: mockFetchDataSources,
}));
vi.mock("@/lib/mastermind/validators", async (orig) => {
  const real = await orig<typeof import("@/lib/mastermind/validators")>();
  return {
    ...real,
    runValidationPipeline: (
      opts: Parameters<typeof real.runValidationPipeline>[0]
    ) =>
      pipelineStub.fn
        ? pipelineStub.fn(opts)
        : real.runValidationPipeline(opts),
  };
});
vi.mock("@/lib/mastermind/routeHelpers", async (orig) => {
  const real = await orig<typeof import("@/lib/mastermind/routeHelpers")>();
  return {
    ...real,
    prepareMastermindContext: (
      opts: Parameters<typeof real.prepareMastermindContext>[0]
    ) => {
      prepOpts.push(opts as unknown as Record<string, unknown>);
      return real.prepareMastermindContext(opts);
    },
  };
});

import { __resetMastermindEnvCacheForTests } from "@/env";
import { POST } from "@/app/api/chat/route";

interface Row {
  id: number;
  q: string;
  origin: string;
  fp?: string;
  moveIndex: number;
  expect: {
    rule: string | null;
    intent: string;
    grammar: string;
    category: string;
  };
}
const ROWS = (
  JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/coach/__tests__/fixtures/intent-60.json"
      ),
      "utf8"
    )
  ) as { rows: Row[] }
).rows;

const llm = (content: string) => ({
  content,
  inputTokens: 1,
  outputTokens: 1,
  model: "claude-haiku-4-5-20251001",
  provider: "anthropic",
  elapsedMs: 5,
});

const DRAFT =
  "8. Nc7+ forks the king and rook, but 8. Qxc1 wins the queen outright.\n\nLesson: Take what is hanging first. List every capture your opponent has in reply.";
const CLASSIFIED =
  '{"category":"position_analysis","confidence":0.9,"rationale":"t"}';
const ENVELOPE: MomentEnvelope = {
  idea: "You went for the check because a knight that hits the king and the rook looks like it wins material.",
  happens:
    "The queen on c1 was already hanging, and after the king steps aside the knight is the piece that is lost.",
  proof: { kind: "engine", moveNumber: 8, color: "w" },
  lesson: {
    pattern: "Take what is hanging first",
    check:
      "Before any check or fork, list every capture your opponent has in reply.",
  },
  question: null,
};

type Kind = "router" | "classifier" | "parser" | "coach";
const kindOf = (opts: Record<string, any>): Kind => {
  if (opts.outputSchema?.name === "coach_intent") return "router";
  if (opts.system === CATEGORY_CLASSIFIER_SYSTEM) return "classifier";
  if (opts.outputSchema?.name === "coach_moment") return "coach";
  if (opts.outputSchema || /claims/i.test(String(opts.system ?? "")))
    return "parser";
  return "coach";
};

type Answer = string | ((opts: Record<string, any>) => Promise<unknown>);
const answers: {
  router: Answer;
  coach: string;
  evalParser: string | null;
} = { router: "", coach: DRAFT, evalParser: null };
let calls: { kind: Kind; opts: Record<string, any> }[] = [];

function provide() {
  mockCallLLM.mockImplementation(async (opts: Record<string, any>) => {
    const kind = kindOf(opts);
    calls.push({ kind, opts });
    if (kind === "router")
      return typeof answers.router === "function"
        ? answers.router(opts)
        : llm(answers.router);
    if (kind === "classifier") return llm(CLASSIFIED);
    if (kind === "parser") {
      if (opts.system === EVAL_CLAIM_PARSER_SYSTEM && answers.evalParser)
        return llm(answers.evalParser);
      return llm('{"claims":[]}');
    }
    if (opts.outputSchema?.name === "coach_moment")
      return llm(JSON.stringify(ENVELOPE));
    return llm(answers.coach);
  });
}

const EMPTY_DELTA = {
  fenBefore: "8/8/8/8/8/8/8/K6k w - - 0 1",
  fenAfter: "8/8/8/8/8/8/8/K6k w - - 0 1",
  resolutionFen: "8/8/8/8/8/8/8/K6k w - - 0 1",
  resolutionReason: "quiescent",
  materialDelta: { white: 0, black: 0 },
  pawnStructureDelta: {
    doubledPawnsChange: { white: 0, black: 0 },
    isolatedPawnsChange: { white: 0, black: 0 },
    passedPawnsGained: { white: [], black: [] },
    passedPawnsLost: { white: [], black: [] },
    openFilesGained: [],
    openFilesLost: [],
    semiOpenFilesGained: { white: [], black: [] },
    semiOpenFilesLost: { white: [], black: [] },
  },
  kingSafetyDelta: { white: 0, black: 0 },
  pieceActivityDelta: { gainedActive: [], lostActive: [], newlyTrapped: [] },
  hangingPiecesDelta: { newlyHanging: [], nowDefended: [] },
  threatsDelta: { newThreats: [], resolvedThreats: [], carriedOverThreats: [] },
  isEmptyDelta: true,
};

const tail = getCoachChatSystemPromptParts({
  personalityId: "friendly",
  userRating: 1200,
  username: "kapil",
  playerColorName: "white",
}).perUser;

/** Fixture 07's real engine sweep, every position scored. */
const REAL_EVAL = JSON.parse(
  fs.readFileSync(
    path.join(
      process.cwd(),
      "src/lib/contract/__tests__/fixtures-real/07_knight_fork.json"
    ),
    "utf8"
  )
).gameEval;

function context(withContract = true, ge: unknown = gameEval) {
  return {
    contextId: "c",
    gameContext: "",
    compactGameContext: buildCompactGameContext(MOVES, ge as never, "w"),
    playedMoves: MOVES,
    systemPrompt: "s",
    systemPromptStable: "stable",
    systemPromptSuffix: tail,
    fewShotExamples: "",
    fen: fenAt(MOVES.length),
    skillLevel: "intermediate",
    playerColor: "w",
    moveCount: 10,
    createdAt: Date.now(),
    initialAnalysis: "Review.",
    gameEval: ge,
    ...(withContract ? { compactContract: compact } : {}),
  };
}

async function turn(userMessage: string, extra: Record<string, unknown> = {}) {
  calls = [];
  prepOpts.length = 0;
  mockLog.info.mockClear();
  const res = await POST(
    new NextRequest("http://x/api/chat", {
      method: "POST",
      body: JSON.stringify({
        contextId: "c",
        userMessage,
        moveIndex: MOVES.length,
        ...extra,
      }),
      headers: { "Content-Type": "application/json" },
    })
  );
  const json = await res.json();
  const of = (k: Kind) => calls.filter((c) => c.kind === k).map((c) => c.opts);
  return {
    status: res.status,
    json,
    ga: json.gameAnalysis ?? {},
    router: of("router"),
    classifier: of("classifier"),
    parsers: of("parser"),
    coach: of("coach"),
    prep: prepOpts[0] as Record<string, any> | undefined,
    logged: (event: string) =>
      mockLog.info.mock.calls
        .filter((c) => c[0] === event)
        .map((c) => c[1] as Record<string, any>),
  };
}

/** What the coach is sent, as the golden pins it. */
const request = (c: Record<string, any>) => ({
  system: c.system,
  systemSuffix: c.systemSuffix,
  messages: c.messages,
});

const flagOn = () => vi.stubEnv("COACH_INTENT_ROUTER", "1");
const flagOff = () => vi.stubEnv("COACH_INTENT_ROUTER", "");
const routerSays = (intent: string, confidence = 0.9) =>
  JSON.stringify({ intent, confidence });

/** The flag-off request and the flag-on one, same turn, same run. */
async function both(q: string, extra: Record<string, unknown> = {}) {
  flagOff();
  const off = await turn(q, extra);
  flagOn();
  const on = await turn(q, extra);
  return { off, on };
}

const Q = "Why was 8. Nc7+ a mistake?";
const CONCEPT = "What is a minority attack?";
const withKinds = { pageActions: [...PAGE_TURN_KINDS] };

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  pipelineStub.fn = null;
  answers.router = routerSays("verdict");
  answers.coach = DRAFT;
  answers.evalParser = null;
  mockSession.mockResolvedValue({ session: { uid: "u" } });
  mockFetchDataSources.mockResolvedValue({
    featureDelta: EMPTY_DELTA,
    pieceRoleDiff: [],
    scout: undefined,
    userHistory: undefined,
  });
  mockGetAnalysisContext.mockImplementation(() => context());
  provide();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetMastermindEnvCacheForTests();
});

describe.each([
  ["validators on", "true"],
  ["validators off", "false"],
])("COACH_INTENT_ROUTER, %s", (_, validators) => {
  const on = validators === "true";
  beforeEach(() => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", validators);
    __resetMastermindEnvCacheForTests();
  });

  describe("off", () => {
    it("reads no routing: no echo, no log, no router call, the classifier as before", async () => {
      for (const q of [Q, "what went wrong?", CONCEPT]) {
        const t = await turn(q);
        expect(t.status).toBe(200);
        expect(t.ga.routing).toBeUndefined();
        expect(t.logged("followup_router")).toEqual([]);
        expect(t.router).toHaveLength(0);
        expect(t.classifier).toHaveLength(on ? 1 : 0);
        expect(t.prep?.routedCategory).toBeUndefined();
        if (on) expect(t.ga.pipeline.categorySource).toBeUndefined();
      }
    });
  });

  describe("the calls", () => {
    it("every question the page writes: no router call, no classifier", async () => {
      flagOn();
      for (const r of ROWS.filter((x) => x.origin.startsWith("ui:"))) {
        const t = await turn(r.q, { moveIndex: r.moveIndex });
        const tag = `#${r.id} ${r.q}`;
        expect(t.status, tag).toBe(200);
        expect(t.router, tag).toHaveLength(0);
        expect(t.classifier, tag).toHaveLength(0);
        expect(t.coach, tag).toHaveLength(1);
        expect(t.ga.routing, tag).toMatchObject({
          source: "rule",
          rule: r.expect.rule,
          intent: r.expect.intent,
          grammar: r.expect.grammar,
          category: r.expect.category,
        });
        if (on) {
          expect(t.ga.pipeline.category, tag).toBe(r.expect.category);
          expect(t.ga.pipeline.categorySource, tag).toBe("routed");
          expect(t.ga.pipeline.classifierCostUsd, tag).toBe(0);
        }
      }
    });

    it("every typed question a rule reads: no router call either", async () => {
      flagOn();
      for (const r of ROWS.filter(
        (x) => x.origin === "typed" && x.expect.rule !== null
      )) {
        const t = await turn(r.q, { moveIndex: r.moveIndex });
        const tag = `#${r.id} ${r.q}`;
        expect(t.router, tag).toHaveLength(0);
        expect(t.classifier, tag).toHaveLength(0);
        expect(t.coach, tag).toHaveLength(1);
        expect(t.ga.routing.rule, tag).toBe(r.expect.rule);
      }
    });

    it("every question no rule reads: exactly one router call, no classifier", async () => {
      flagOn();
      for (const r of ROWS.filter((x) => x.expect.rule === null)) {
        const t = await turn(r.q, { moveIndex: r.moveIndex });
        const tag = `#${r.id} ${r.q}`;
        expect(t.router, tag).toHaveLength(1);
        expect(t.classifier, tag).toHaveLength(0);
        expect(t.coach, tag).toHaveLength(1);
        expect(t.ga.routing.source, tag).toBe("model");
        // The question alone, in the router's user turn.
        expect(t.router[0].messages, tag).toEqual([
          { role: "user", content: `Question:\n\n${r.q}` },
        ]);
      }
    });
  });

  describe("one move is the v1 turn, byte for byte", () => {
    it.each([
      [Q, "rule"],
      ["What was my opponent thinking?", "rule"],
      ["What opening was this?", "rule"],
      ["Am I improving?", "rule"],
      ["what went wrong?", "default"],
    ])("%s", async (q, source) => {
      answers.router = "not json";
      const { off, on: t } = await both(q);
      expect(t.coach).toHaveLength(1);
      expect(request(t.coach[0])).toEqual(request(off.coach[0]));
      expect(t.ga.routing).toMatchObject({ source, grammar: "one_move" });
    });

    it("the stable prompt is the same for every grammar", async () => {
      for (const q of [Q, CONCEPT, "thanks!", "Test me", "what went wrong?"]) {
        const { off, on: t } = await both(q);
        expect(t.coach[0].system, q).toBe(off.coach[0].system);
      }
    });
  });

  describe("no board", () => {
    it("adds one paragraph after USER CONTEXT, re-heads the board and states its own reminder", async () => {
      const { off, on: t } = await both(CONCEPT);
      expect(t.router).toHaveLength(0);
      expect(t.ga.routing).toMatchObject({
        source: "rule",
        rule: "concept",
        grammar: "no_board",
        factPack: "reference",
        category: "concept_explanation",
      });
      const clause = followUpGrammarClause({ grammar: "no_board" });
      const a: string = off.coach[0].systemSuffix;
      const b: string = t.coach[0].systemSuffix;
      expect(a).toContain("## CURRENTLY VIEWED POSITION (");
      expect(b).not.toContain("## CURRENTLY VIEWED POSITION (");
      expect(b).toContain(NO_BOARD_FACTS_HEADER);
      // The clause sits between USER CONTEXT and the game's facts.
      expect(b.indexOf("USER CONTEXT")).toBeLessThan(b.indexOf(clause));
      expect(b.indexOf(clause)).toBeLessThan(b.indexOf("## THIS GAME"));
      const restored = b
        .replace(`\n\n${clause}`, "")
        .replace(
          NO_BOARD_FACTS_HEADER,
          a.match(/## CURRENTLY VIEWED POSITION \([^\n]*\)/)![0]
        );
      expect(restored).toBe(a);
      expect(t.coach[0].messages.at(-1).content).toBe(
        `${CONCEPT}\n\n[At most 100 words. The idea in two or three plain sentences, as teaching, then one sentence on this game's example only if the facts confirm one, then a Lesson only if there is a check to teach. No token line and no evaluation.]`
      );
      expect(t.coach[0].messages.slice(0, -1)).toEqual(
        off.coach[0].messages.slice(0, -1)
      );
      if (on) {
        expect(t.ga.pipeline.category).toBe("concept_explanation");
        const systems = t.parsers.map((p) => p.system);
        expect(systems).not.toContain(EVAL_CLAIM_PARSER_SYSTEM);
        expect(systems).not.toContain(FEATURE_CITATION_PARSER_SYSTEM);
      }
    });
  });

  describe("acknowledgements", () => {
    it("a greeting adds no clause and states the greeting's reminder", async () => {
      const { off, on: t } = await both("thanks!");
      expect(t.coach[0].systemSuffix).toBe(off.coach[0].systemSuffix);
      expect(t.coach[0].messages.at(-1).content).toBe(
        "thanks!\n\n[One friendly sentence, then one concrete thing worth looking at next, at most 45 words. No token line, no Lesson, no question back.]"
      );
      expect(t.ga.routing).toMatchObject({
        intent: "greeting",
        grammar: "acknowledgement",
        category: "meta_motivational",
      });
      if (on) expect(t.ga.pipeline.category).toBe("meta_motivational");
    });

    it.each([
      ["Let me try from here", "try_it"],
      ["Test me", "quiz"],
      ["Let me defend from before the blunder", "defend_it"],
    ] as const)("%s carries its clause and reminder", async (q, capability) => {
      flagOn();
      const t = await turn(q);
      const spec = { grammar: "acknowledgement", capability } as const;
      const clause = followUpGrammarClause(spec);
      expect(clause).not.toBe("");
      const suffix: string = t.coach[0].systemSuffix;
      expect(suffix).toContain(`\n\n${clause}\n\n## THIS GAME`);
      expect(t.coach[0].messages.at(-1).content).toBe(
        `${q}\n\n${followUpGrammarReminder(spec, q, null, FOLLOWUP_BUDGET)}`
      );
      expect(t.ga.routing).toMatchObject({
        intent: capability,
        grammar: "acknowledgement",
        category: "meta_motivational",
      });
    });
  });

  describe("beside the other flags", () => {
    it("lean: the no-board reminder says 60 words and an acknowledgement 30", async () => {
      flagOn();
      vi.stubEnv("COACH_FOLLOWUP_LEAN", "1");
      const a = await turn(CONCEPT);
      expect(a.coach[0].messages.at(-1).content).toContain(
        "[At most 60 words."
      );
      const b = await turn("Test me");
      expect(b.coach[0].messages.at(-1).content).toContain(
        "[At most 30 words, one or two sentences."
      );
      const c = await turn("thanks!");
      expect(c.coach[0].messages.at(-1).content).toContain("at most 30 words.");
    });

    it("COACH_PERSPECTIVE: the subject clause comes first and the reminder ends on the subject", async () => {
      flagOn();
      vi.stubEnv("COACH_PERSPECTIVE", "1");
      const t = await turn(CONCEPT, { perspective: "b" });
      const subject = {
        side: "b" as const,
        player: "w" as const,
        confirmed: confirmedSideOf(tail) === "w",
      };
      const suffix: string = t.coach[0].systemSuffix;
      const subjectAt = suffix.indexOf(followUpSubjectClause(subject));
      const grammarAt = suffix.indexOf(
        followUpGrammarClause({ grammar: "no_board" })
      );
      expect(subjectAt).toBeGreaterThan(-1);
      expect(subjectAt).toBeLessThan(grammarAt);
      expect(grammarAt).toBeLessThan(suffix.indexOf("## THIS GAME"));
      expect(t.coach[0].messages.at(-1).content).toMatch(
        new RegExp(
          `No token line and no evaluation\\. ${subjectReminder(subject).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]$`
        )
      );
    });

    it("fielded: an anchored turn is fielded exactly as with the flag off", async () => {
      vi.stubEnv("COACH_FOLLOWUP_PROMPT", "fielded");
      const { off, on: t } = await both(Q);
      expect(t.coach.length).toBeGreaterThan(0);
      expect(t.coach.map(request)).toEqual(off.coach.map(request));
      expect(t.coach[0].outputSchema?.name).toBe("coach_moment");
      expect(t.ga.analysis).toBe(off.ga.analysis);
      expect(t.ga.routing.grammar).toBe("one_move");
    });
  });

  describe("a router that fails is the default row", () => {
    const CASES: [string, Answer, string][] = [
      [
        "waits past its budget",
        (opts) =>
          new Promise((_, reject) =>
            opts.signal.addEventListener("abort", () =>
              reject(new Error("aborted"))
            )
          ),
        "default:model_timeout",
      ],
      ["answers garbage", "{intent: verdict", "default:model_invalid"],
      ["is unsure", routerSays("verdict", 0.3), "default:model_low_confidence"],
      // An order the router names is set aside: the unknown row.
      ["names an order", routerSays("action"), "model:model:action"],
    ];
    it.each(CASES)(
      "%s",
      async (_name, answer, rationale) => {
        answers.router = answer;
        const { off, on: t } = await both("what went wrong?");
        expect(t.status).toBe(200);
        expect(t.router).toHaveLength(1);
        expect(t.classifier).toHaveLength(0);
        expect(request(t.coach[0])).toEqual(request(off.coach[0]));
        expect(t.ga.routing).toMatchObject({
          intent: "unknown",
          grammar: "one_move",
          category: "meta_motivational",
        });
        expect(t.ga.actions).toBeUndefined();
        if (on) {
          expect(t.ga.pipeline.category).toBe("meta_motivational");
          expect(t.prep?.routedCategory).toMatchObject({
            category: "meta_motivational",
            rationale,
          });
        }
      },
      10_000
    );
  });

  describe("an order read from a question (FP-1)", () => {
    const ANCHORED = [
      "why was move 8 bad?",
      "go to move 8 and tell me why it was bad",
      "Go to move 8, why was it bad?",
      "show me move 3: Nf3 again, why was it fine?",
      "flip the board and tell me why move 8 was bad",
    ];
    const UNANCHORED = [
      "next move?",
      "last move",
      "last move was a mistake, right?",
      "would you play it?",
      "play it",
      "show me the line",
      "keep it short",
      "be more detailed",
    ];
    it("reaches the coach once, with no order, the anchor where the words put it", async () => {
      flagOn();
      for (const q of [...ANCHORED, ...UNANCHORED]) {
        const t = await turn(q, withKinds);
        expect(t.ga.served, q).toBeUndefined();
        expect(t.ga.actions, q).toBeUndefined();
        expect(t.ga.preference, q).toBeUndefined();
        expect(t.coach, q).toHaveLength(1);
        expect(t.router, q).toHaveLength(ANCHORED.includes(q) ? 0 : 1);
        expect(["action", "preference"], q).not.toContain(t.ga.routing.intent);
      }
      expect((await turn("why was move 8 bad?", withKinds)).ga.anchor).toEqual(
        expect.objectContaining({ ply: 15, moveNumber: 8, san: "Nc7+" })
      );
      expect(
        (await turn("show me move 3: Nf3 again, why was it fine?", withKinds))
          .ga.anchor
      ).toEqual(expect.objectContaining({ ply: 5, moveNumber: 3 }));
    });

    it("a router that says action is the unknown row: the v1 turn, no order", async () => {
      answers.router = routerSays("action");
      const { off, on: t } = await both("next move?", withKinds);
      expect(t.ga.routing).toMatchObject({
        source: "model",
        rule: "model:action",
        intent: "unknown",
      });
      expect(request(t.coach[0])).toEqual(request(off.coach[0]));
      expect(t.ga.actions).toBeUndefined();
    });

    it.each(["go to move 8", "flip the board", "play the line again"])(
      "%s is still the page's, with no call of any kind",
      async (q) => {
        flagOn();
        const t = await turn(q, withKinds);
        expect(t.ga.served).toBe("page");
        expect(calls).toHaveLength(0);
        expect(t.ga.routing).toBeUndefined();
      }
    );
  });

  describe("a concept read from a question about the board (FP-2)", () => {
    it.each([
      "what is a good move?",
      "what does this move mean?",
      "What is the best attack here?",
      "what does the pin mean here?",
      "what's a pin in this position?",
    ])("%s goes to the router and keeps the board", async (q) => {
      flagOn();
      answers.router = routerSays("plan");
      const t = await turn(q);
      expect(t.router).toHaveLength(1);
      expect(t.ga.routing).toMatchObject({
        veto: "concept_on_board",
        grammar: "one_move",
      });
    });

    it("a router that says concept beside a board word is the unknown row, the v1 suffix", async () => {
      answers.router = routerSays("concept");
      for (const q of [
        "what's a pin in this position?",
        "why are doubled pawns bad?",
      ]) {
        const { off, on: t } = await both(q);
        expect(t.ga.routing, q).toMatchObject({
          source: "model",
          intent: "unknown",
          grammar: "one_move",
          veto: "concept_on_board",
        });
        expect(request(t.coach[0]), q).toEqual(request(off.coach[0]));
      }
    });
  });

  describe("nothing the model writes reaches the board", () => {
    it("a draft of orders, a router that says action: no actions, no preference, nothing served by the page", async () => {
      flagOn();
      answers.router = routerSays("action");
      answers.coach = "Flip the board. Go to move 20.";
      const t = await turn("next move?", withKinds);
      expect(t.ga.actions).toBeUndefined();
      expect(t.ga.preference).toBeUndefined();
      expect(t.ga.served).toBeUndefined();
    });

    it("an expired context and the passthrough make no router call", async () => {
      flagOn();
      mockGetAnalysisContext.mockReturnValue(undefined);
      const expired = await turn("what went wrong?");
      expect(expired.status).toBe(404);
      expect(calls).toHaveLength(0);
      calls = [];
      const res = await POST(
        new NextRequest("http://x/api/chat", {
          method: "POST",
          body: JSON.stringify({
            messages: [{ role: "user", content: "what went wrong?" }],
          }),
          headers: { "Content-Type": "application/json" },
        })
      );
      expect(res.status).toBe(200);
      expect(calls.map((c) => c.kind)).toEqual(["coach"]);
    });
  });

  describe("the echoes", () => {
    it("the shadow reading is the same, and routing is there only with the flag", async () => {
      for (const q of [Q, "what went wrong?", CONCEPT, "next move?"]) {
        const { off, on: t } = await both(q);
        expect(t.ga.intent, q).toEqual(off.ga.intent);
        expect(off.ga.routing, q).toBeUndefined();
        expect(t.ga.routing, q).toMatchObject({
          version: "router-1",
          grammarVersion: "grammar-1",
        });
        const [log] = t.logged("followup_router");
        expect(log, q).toMatchObject({
          version: "router-1",
          shadowIntent: off.ga.intent.intent,
          shadowRule: off.ga.intent.rule,
        });
        expect(JSON.stringify(log)).not.toContain(q);
        expect(t.ga.timing).toHaveProperty("routerMs");
        expect(t.ga.timing).toHaveProperty("routerCostUsd");
        expect(off.ga.timing).not.toHaveProperty("routerMs");
      }
    });
  });
});

describe("COACH_INTENT_ROUTER, validators on: the validators' category", () => {
  // The real sweep, so the move context has an eval where the position
  // validators would check one.
  beforeEach(() => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "preview");
    __resetMastermindEnvCacheForTests();
    mockGetAnalysisContext.mockImplementation(() => context(true, REAL_EVAL));
  });

  const WRONG =
    "You were fine after 5. Nf3, but after 8. Nc7+ you are losing, and 8. Qxc1 wins the queen.";
  const WINNING = JSON.stringify({
    claims: [
      {
        stated_band: "winning",
        stated_cp: 400,
        supporting_spans: ["You were fine after 5. Nf3"],
        confidence: 0.95,
        claim_class: "evaluative",
        perspective: "white",
      },
    ],
  });

  it("the 2026-05-26 shape: a turn about a move of the game is game_review, and the position validators stand aside", async () => {
    answers.coach = WRONG;
    answers.evalParser = WINNING;
    flagOn();
    const t = await turn(Q);
    expect(t.ga.pipeline.category).toBe("game_review");
    const systems = t.parsers.map((p) => p.system);
    expect(systems).not.toContain(EVAL_CLAIM_PARSER_SYSTEM);
    expect(systems).not.toContain(FEATURE_CITATION_PARSER_SYSTEM);
    expect(
      (t.ga.pipeline.telemetry as { fire_reason?: string }[]).some(
        (e) => e.fire_reason === "skip_non_anchored_category"
      )
    ).toBe(true);
    expect(t.ga.pipeline.finalOutcome).toBe("passed_initial");
    expect(t.coach).toHaveLength(1);
    expect(t.ga.analysis).toContain("8. Qxc1 wins the queen");
    expect(t.ga.analysis).not.toMatch(/What changed:/);
    // The control: the classifier's position_analysis runs the eval parser.
    flagOff();
    const off = await turn(Q);
    expect(off.ga.pipeline.category).toBe("position_analysis");
    expect(off.parsers.map((p) => p.system)).toContain(
      EVAL_CLAIM_PARSER_SYSTEM
    );
  });

  it("plan is the one row that keeps the position validators", async () => {
    flagOn();
    answers.router = routerSays("plan");
    const t = await turn("what's the threat here?");
    expect(t.ga.routing).toMatchObject({ source: "model", intent: "plan" });
    expect(t.ga.pipeline.category).toBe("position_analysis");
    expect(t.parsers.map((p) => p.system)).toContain(EVAL_CLAIM_PARSER_SYSTEM);
  });

  describe("a rejected turn with no draft", () => {
    const TEMPLATE =
      "What changed: the knight left b5. What to look at: The position is balanced.";
    beforeEach(() => {
      mockGetAnalysisContext.mockImplementation(() =>
        context(false, REAL_EVAL)
      );
      pipelineStub.fn = async () => ({
        finalResponse: TEMPLATE,
        retryCount: 1,
        finalOutcome: "fallback_used",
        cumulativeIssues: [],
        totalCostUsd: 0,
        telemetry: [],
      });
    });

    it.each([CONCEPT, "thanks!", "Test me", "Am I improving?"])(
      "%s is served the referee's own line, never the position template",
      async (q) => {
        flagOn();
        const t = await turn(q);
        expect(t.ga.analysis).toBe(FOLLOWUP_REFEREE_FALLBACK);
        expect(t.ga.analysis).not.toMatch(
          /What changed:|What to look at:|balanced/
        );
        expect(t.ga.analysis).not.toMatch(/may be inaccurate/i);
        expect(t.ga.pipeline.servedFallback).toBe("referee_line");
        // Off, the template as before.
        flagOff();
        expect((await turn(q)).ga.analysis).toBe(TEMPLATE);
      }
    );

    it("a turn about one move with an eval keeps the template, as today", async () => {
      flagOn();
      const t = await turn(Q);
      expect(t.ga.analysis).toBe(TEMPLATE);
      expect(t.ga.pipeline.servedFallback).toBe("template");
    });

    it("a search that never ran (the engine's depth-0 sentinel) is no eval: the referee's line", async () => {
      const sentinel = {
        ...REAL_EVAL,
        positions: (REAL_EVAL.positions as unknown[]).map(() => ({
          lines: [{ pv: [], cp: 0, depth: 0, multiPv: 1 }],
        })),
      };
      mockGetAnalysisContext.mockImplementation(() => context(false, sentinel));
      flagOn();
      const t = await turn(Q);
      expect(t.ga.analysis).toBe(FOLLOWUP_REFEREE_FALLBACK);
      expect(t.ga.analysis).not.toMatch(/balanced/);
      expect(t.ga.pipeline.servedFallback).toBe("referee_line");
    });
  });

  it("a timeout serves the route's own line on every row", async () => {
    flagOn();
    vi.stubEnv("PIPELINE_TIMEOUT_MS", "50");
    pipelineStub.fn = () => new Promise(() => {});
    const t = await turn(CONCEPT);
    expect(t.ga.analysis).toMatch(/^Still thinking/);
    expect(t.ga.pipeline.timedOut).toBe(true);
    expect(t.ga.pipeline.servedFallback).toBeUndefined();
  });
});
