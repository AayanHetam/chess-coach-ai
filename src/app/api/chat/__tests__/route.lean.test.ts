import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { getCoachChatSystemPromptParts } from "@/lib/prompts/coachChatPrompt";
import { buildCompactGameContext } from "@/lib/coach/compactGameContext";
import {
  EVAL_CLAIM_PARSER_SYSTEM,
  FEATURE_CITATION_PARSER_SYSTEM,
} from "@/lib/mastermind/validators/parserPrompts";
import {
  momentToText,
  proseFromEnvelope,
  type MomentEnvelope,
} from "@/lib/coach/moment";
import {
  MOVES,
  compact,
  fenAt,
  gameEval,
} from "@/lib/coach/__tests__/fieldedFixture";

/**
 * Pathway 3.2: `COACH_FOLLOWUP_LEAN=1`, the follow-up at the bar, on both
 * validator wings and in both follow-up modes. Sixty words in the prompt
 * and under the question, a 350-token cap, the review no longer replayed
 * when a contract carries its facts, and no validator retry. Off, every
 * request is what it was.
 */

const {
  mockLog,
  mockSession,
  mockCallLLM,
  mockGetAnalysisContext,
  mockClassifyQuestion,
  mockFetchDataSources,
  pipelineOpts,
} = vi.hoisted(() => ({
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockSession: vi.fn(),
  mockCallLLM: vi.fn(),
  mockGetAnalysisContext: vi.fn(),
  mockClassifyQuestion: vi.fn(),
  mockFetchDataSources: vi.fn(),
  pipelineOpts: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/logging", () => ({
  logger: { child: vi.fn(() => mockLog) },
  withRequestContext: (_: string, fn: () => unknown) => fn(),
  extractRequestId: () => "fielded",
  logErrorToSentry: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mockSession }));
vi.mock("@/lib/llmProvider", () => ({
  callLLM: mockCallLLM,
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
vi.mock("@/lib/mastermind/categorization/categoryClassifier", async (orig) => ({
  ...(await orig<object>()),
  classifyQuestion: mockClassifyQuestion,
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
    ) => {
      pipelineOpts.push(opts as unknown as Record<string, unknown>);
      return real.runValidationPipeline(opts);
    },
  };
});

import { __resetMastermindEnvCacheForTests } from "@/env";
import { POST } from "@/app/api/chat/route";

const llm = (content: string) => ({
  content,
  inputTokens: 1,
  outputTokens: 1,
  model: "claude-haiku-4-5-20251001",
  provider: "anthropic",
  elapsedMs: 5,
});

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
  question: null,
};
const V1_PROSE =
  "The fork was tempting, but 8. Qxc1 simply takes the queen.\n\n[CONTINUATION:8:w]\n\nLesson: Take what is hanging first. List every capture your opponent has in reply.";

/**
 * The model: a moment envelope for every `coach_moment` call (the next one
 * in `envelopes`, the last repeated), no claims for every parser, and the
 * v1 prose for everything else.
 */
function provider(envelopes: string[] = [JSON.stringify(clean)]) {
  const coachCalls: Array<Record<string, any>> = [];
  const parserSystems: string[] = [];
  let n = 0;
  mockCallLLM.mockImplementation(async (opts: Record<string, any>) => {
    if (opts.outputSchema?.name === "coach_moment") {
      coachCalls.push(opts);
      const e = envelopes[Math.min(n, envelopes.length - 1)];
      n += 1;
      return llm(e);
    }
    if (opts.outputSchema || /claims/i.test(String(opts.system ?? ""))) {
      parserSystems.push(String(opts.system ?? ""));
      return llm('{"claims":[]}');
    }
    coachCalls.push(opts);
    return llm(V1_PROSE);
  });
  return { coachCalls, parserSystems };
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

function context() {
  return {
    contextId: "c",
    gameContext: "",
    compactGameContext: buildCompactGameContext(MOVES, gameEval as never, "w"),
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
    gameEval,
    compactContract: compact,
  };
}

function ask(userMessage: string, extra: Record<string, unknown> = {}) {
  return POST(
    new NextRequest("http://x/api/chat", {
      method: "POST",
      body: JSON.stringify({ contextId: "c", userMessage, ...extra }),
      headers: { "Content-Type": "application/json" },
    })
  );
}

const Q = "Why was 8. Nc7+ a mistake?";

beforeEach(() => {
  vi.clearAllMocks();
  pipelineOpts.length = 0;
  mockSession.mockResolvedValue({ session: { uid: "u" } });
  mockClassifyQuestion.mockResolvedValue({
    category: "position_analysis",
    confidence: 0.9,
    rationale: "t",
  });
  mockFetchDataSources.mockResolvedValue({
    featureDelta: EMPTY_DELTA,
    pieceRoleDiff: [],
    scout: undefined,
    userHistory: undefined,
  });
  mockGetAnalysisContext.mockImplementation(() => context());
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetMastermindEnvCacheForTests();
});

describe.each([
  ["validators on", "true"],
  ["validators off", "false"],
])("COACH_FOLLOWUP_LEAN=1, %s", (_, validators) => {
  beforeEach(() => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", validators);
    __resetMastermindEnvCacheForTests();
  });

  it("states sixty words, caps at 350 tokens and does not replay the review", async () => {
    const off = provider();
    await ask(Q);
    vi.stubEnv("COACH_FOLLOWUP_LEAN", "1");
    const on = provider();
    await ask(Q);
    const a = off.coachCalls[0];
    const b = on.coachCalls[0];
    expect(a.messages[0]).toEqual({ role: "assistant", content: "Review." });
    expect(
      b.messages.some((m: { content: string }) => m.content === "Review.")
    ).toBe(false);
    expect(b.messages[0].role).toBe("user");
    expect(b.messages.at(-1).content).toContain("At most 60 words");
    expect(a.messages.at(-1).content).toContain("At most 100 words");
    expect(b.system).toContain("BUDGET: at most 60 words");
    expect(b.maxTokens).toBe(350);
    expect(a.maxTokens).toBe(600);
    expect(b.systemSuffix).toBe(a.systemSuffix);
    if (validators === "true") {
      expect(pipelineOpts.map((o) => o.maxRetries)).toEqual([1, 0]);
    }
  });

  it("keeps the review when there is no contract to carry its facts", async () => {
    vi.stubEnv("COACH_FOLLOWUP_LEAN", "1");
    mockGetAnalysisContext.mockImplementation(() => ({
      ...context(),
      compactContract: undefined,
    }));
    const { coachCalls } = provider();
    await ask(Q);
    expect(coachCalls[0].messages[0]).toEqual({
      role: "assistant",
      content: "Review.",
    });
  });

  it("the client's copy of the review stays out of the history, and the history starts on a question", async () => {
    vi.stubEnv("COACH_FOLLOWUP_LEAN", "1");
    const { coachCalls } = provider();
    await ask(Q, {
      conversationHistory: [
        { role: "assistant", content: "Review." },
        { role: "user", content: "What about move 3?" },
        { role: "assistant", content: "Move 3 developed a piece." },
      ],
    });
    const msgs = coachCalls[0].messages;
    expect(msgs.some((m: { content: string }) => m.content === "Review.")).toBe(
      false
    );
    expect(msgs[0]).toEqual({ role: "user", content: "What about move 3?" });
  });

  it("with the fielded mode, the fielded prompt and reminder state the lean opening and lesson", async () => {
    vi.stubEnv("COACH_FOLLOWUP_LEAN", "1");
    vi.stubEnv("COACH_FOLLOWUP_PROMPT", "fielded");
    const { coachCalls } = provider();
    await ask(Q);
    const call = coachCalls[0];
    expect(call.outputSchema?.name).toBe("coach_moment");
    expect(call.system).toContain("together are at most 30 words");
    expect(call.system).toContain("At most 25 words together");
    expect(call.messages.at(-1).content).toContain("together at most 30 words");
    expect(call.maxTokens).toBe(350);
    expect(
      call.messages.some((m: { content: string }) => m.content === "Review.")
    ).toBe(false);
  });

  it("off, nothing changes and nothing says lean", async () => {
    const { coachCalls } = provider();
    await ask(Q);
    expect(coachCalls[0].messages[0].content).toBe("Review.");
    expect(
      mockLog.info.mock.calls.filter(
        (c) => c[0] === "chat_fastpath_timing" && c[1].lean
      )
    ).toEqual([]);
  });
});
