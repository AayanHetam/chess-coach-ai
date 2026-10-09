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
 * Pathway 3.1: `COACH_FOLLOWUP_PROMPT=fielded`, driven end to end on both
 * validator wings with the real referee and the real moment checks, the
 * providers stubbed. Fixture 07: the player is White, 8. Nc7+ the
 * review's finding, 8. Qxc1 the engine's best.
 *
 * A turn about one move gets the fielded system prompt, reminder and
 * schema on the v1 request, is checked and projected to today's grammar;
 * every other turn, and every turn in another mode, is the v1 request.
 */

const {
  mockLog,
  mockSession,
  mockCallLLM,
  mockGetAnalysisContext,
  mockClassifyQuestion,
  mockFetchDataSources,
  mockReferee,
} = vi.hoisted(() => ({
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockSession: vi.fn(),
  mockCallLLM: vi.fn(),
  mockGetAnalysisContext: vi.fn(),
  mockClassifyQuestion: vi.fn(),
  mockFetchDataSources: vi.fn(),
  // The referee, real unless a test says otherwise (`real` is the module's).
  mockReferee: vi.fn(),
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
vi.mock("@/lib/contract/followUpReferee", async (orig) => {
  const real = await orig<typeof import("@/lib/contract/followUpReferee")>();
  return {
    ...real,
    refereeFollowUp: (input: Parameters<typeof real.refereeFollowUp>[0]) =>
      mockReferee(input, real.refereeFollowUp),
  };
});
vi.mock("@/lib/mastermind/wireValidators", async (orig) => ({
  ...(await orig<object>()),
  fetchDataSources: mockFetchDataSources,
}));

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
const logged = (event: string) =>
  mockLog.info.mock.calls.filter((c) => c[0] === event).map((c) => c[1]);

beforeEach(() => {
  vi.clearAllMocks();
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
  mockReferee.mockImplementation((input, real) => real(input));
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetMastermindEnvCacheForTests();
});

describe.each([
  ["validators on", "true"],
  ["validators off", "false"],
])("COACH_FOLLOWUP_PROMPT=fielded, %s", (_, validators) => {
  beforeEach(() => {
    vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", validators);
    __resetMastermindEnvCacheForTests();
  });
  const fielded = () => vi.stubEnv("COACH_FOLLOWUP_PROMPT", "fielded");

  it("differs from the v1 request on the same turn only in the system prompt, the reminder and the schema", async () => {
    const v1 = provider();
    const v1Json = await (await ask(Q)).json();
    fielded();
    const f = provider();
    const fJson = await (await ask(Q)).json();

    const a = v1.coachCalls[0];
    const b = f.coachCalls[0];
    expect(b.systemSuffix).toBe(a.systemSuffix);
    expect(b.messages.slice(0, -1)).toEqual(a.messages.slice(0, -1));
    expect(b.messages.at(-1).content.startsWith(`${Q}\n\n[`)).toBe(true);
    expect(b.messages.at(-1).content).not.toBe(a.messages.at(-1).content);
    expect(b.system).not.toBe(a.system);
    expect(a.outputSchema).toBeUndefined();
    expect(b.outputSchema?.name).toBe("coach_moment");
    expect(b.temperature).toBe(a.temperature);
    expect(b.maxTokens).toBe(a.maxTokens);

    // The one key a fielded answer adds: its fields (pathway 3.3).
    expect(
      Object.keys(fJson.gameAnalysis)
        .filter((k) => k !== "moment")
        .sort()
    ).toEqual(Object.keys(v1Json.gameAnalysis).sort());
    expect(fJson.gameAnalysis.moment).toBeDefined();
    expect(v1Json.gameAnalysis.moment).toBeUndefined();
    if (v1Json.gameAnalysis.pipeline)
      expect(Object.keys(fJson.gameAnalysis.pipeline).sort()).toEqual(
        Object.keys(v1Json.gameAnalysis.pipeline).sort()
      );
    expect(fJson.gameAnalysis.followUpPrompt).toBe("fielded-1");
    expect(v1Json.gameAnalysis.followUpPrompt).toBe("1.3");
  });

  it("serves a clean envelope as its projection, with nothing for the second net to drop", async () => {
    fielded();
    provider();
    const json = await (await ask(Q)).json();
    expect(json.gameAnalysis.analysis).toBe(
      momentToText(proseFromEnvelope(clean))
    );
    expect(json.gameAnalysis.analysis).toContain("\n\n[CONTINUATION:8:w]\n\n");
    expect(json.gameAnalysis.analysis).not.toMatch(/may be inaccurate/i);
    expect(logged("followup_referee_dropped")).toEqual([]);
    expect(json.gameAnalysis.anchor).toMatchObject({ ply: 15, san: "Nc7+" });
    // Its fields ride beside the text, and the text is their projection.
    expect(json.gameAnalysis.moment).toEqual(proseFromEnvelope(clean));
    expect(momentToText(json.gameAnalysis.moment)).toBe(
      json.gameAnalysis.analysis
    );
  });

  it("a field that fails twice is sent omitted, with its clause in the text the fields project to", async () => {
    fielded();
    // A proof no line holds, twice.
    provider([
      JSON.stringify({
        ...clean,
        proof: { kind: "engine", moveNumber: 30, color: "w" },
      }),
    ]);
    const json = await (await ask(Q)).json();
    expect(json.gameAnalysis.moment.omitted).toEqual(["proof"]);
    expect(json.gameAnalysis.moment.proof).toBeNull();
    expect(json.gameAnalysis.analysis).toContain(
      "I don't have a line I can stand behind here."
    );
    expect(momentToText(json.gameAnalysis.moment)).toBe(
      json.gameAnalysis.analysis
    );
  });

  it("a timed-out turn is the template, and a template never carries fields", async () => {
    if (validators !== "true") return;
    fielded();
    vi.stubEnv("PIPELINE_TIMEOUT_MS", "50");
    provider();
    const slow = mockCallLLM.getMockImplementation()!;
    mockCallLLM.mockImplementation(
      async (o: Record<string, unknown>) =>
        new Promise((r) => setTimeout(() => r(slow(o)), 300))
    );
    const json = await (await ask(Q)).json();
    expect(json.gameAnalysis.pipeline.timedOut).toBe(true);
    expect(json.gameAnalysis.moment).toBeUndefined();
  });

  it("a sentence the second net drops leaves the text with no fields beside it", async () => {
    fielded();
    provider();
    // The pre-pass passes no flagged spans; the second net always does.
    mockReferee.mockImplementation((input, real) => {
      const out = real(input);
      if (!("flaggedSpans" in input)) return out;
      const sentence = "The queen on c1 was already hanging";
      return {
        ...out,
        text: out.text.replace(
          /The queen on c1 was already hanging[^.]*\.\s*/,
          ""
        ),
        dropped: [{ sentence, reason: "test" }],
      };
    });
    const json = await (await ask(Q)).json();
    expect(json.gameAnalysis.analysis).not.toContain("already hanging");
    expect(json.gameAnalysis.moment).toBeUndefined();
  });

  it("regenerates a field once, and reports it as a retry, never as the template", async () => {
    fielded();
    const { coachCalls } = provider([
      JSON.stringify({
        ...clean,
        proof: { kind: "engine", moveNumber: 12, color: "w" },
      }),
      JSON.stringify(clean),
    ]);
    const json = await (await ask(Q)).json();
    expect(coachCalls).toHaveLength(2);
    expect(coachCalls[1].outputSchema?.name).toBe("coach_moment");
    expect(json.gameAnalysis.timing.retryCount).toBe(1);
    expect(json.gameAnalysis.analysis).toContain("[CONTINUATION:8:w]");
    if (json.gameAnalysis.pipeline) {
      expect(json.gameAnalysis.pipeline.finalOutcome).toBe(
        "passed_after_retry"
      );
      expect(json.gameAnalysis.pipeline.servedDraft).toBe(false);
    }
  });

  it("calls neither the eval nor the feature parser, and logs a content-free counter", async () => {
    fielded();
    const { parserSystems } = provider();
    await ask(Q);
    await new Promise((r) => setTimeout(r, 10));
    expect(parserSystems).not.toContain(EVAL_CLAIM_PARSER_SYSTEM);
    expect(parserSystems).not.toContain(FEATURE_CITATION_PARSER_SYSTEM);
    const [line] = logged("followup_fielded");
    expect(line).toMatchObject({
      eligible: true,
      served: "fielded",
      parse: "clean",
      turnKind: "reviewed",
    });
    const s = JSON.stringify(line);
    expect(s).not.toMatch(/\b[KQRBN][a-h]?[1-8]?x?[a-h][1-8]/);
    expect(s).not.toContain("queen");
    if (validators === "true")
      expect(logged("followup_fielded_relational")).toHaveLength(1);
  });

  it("a reply that is no object is answered by the v1 request, checked and reported as v1", async () => {
    fielded();
    const { coachCalls, parserSystems } = provider(['{"idea": "unterminated']);
    const res = await ask(Q);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gameAnalysis.analysis).toContain("8. Qxc1");
    expect(json.gameAnalysis.moment).toBeUndefined();
    // The prompt that wrote it, and no retry of the fielded call.
    expect(json.gameAnalysis.followUpPrompt).toBe("1.3");
    expect(json.gameAnalysis.timing.retryCount).toBe(0);
    expect(coachCalls).toHaveLength(2);
    expect(coachCalls[1].outputSchema).toBeUndefined();
    if (validators === "true") {
      // The v1 pipeline checked it, as any v1 turn: its parsers ran.
      expect(
        parserSystems.some(
          (p) =>
            p === EVAL_CLAIM_PARSER_SYSTEM ||
            p === FEATURE_CITATION_PARSER_SYSTEM
        )
      ).toBe(true);
      expect(json.gameAnalysis.pipeline.finalOutcome).toBe("passed_initial");
    }
    expect(logged("followup_fielded")[0]).toMatchObject({
      served: "v1_fallback",
      parse: "failed",
    });
  });

  it("a turn about no one move is the v1 turn, byte for byte, and says why", async () => {
    const q = "What should I study next?";
    const v1 = provider();
    const v1Json = await (await ask(q)).json();
    fielded();
    const f = provider();
    const fJson = await (await ask(q)).json();
    expect(f.coachCalls.every((c) => !c.outputSchema)).toBe(true);
    expect(f.coachCalls[0].system).toBe(v1.coachCalls[0].system);
    expect(f.coachCalls[0].messages).toEqual(v1.coachCalls[0].messages);
    expect(fJson.gameAnalysis.analysis).toBe(v1Json.gameAnalysis.analysis);
    expect(fJson.gameAnalysis.moment).toBeUndefined();
    expect(fJson.gameAnalysis.followUpPrompt).toBe("1.3");
    expect(logged("followup_fielded")).toEqual([
      expect.objectContaining({ eligible: false, reason: "no_anchor" }),
    ]);
  });

  it("a walkthrough is the v1 turn too", async () => {
    fielded();
    const { coachCalls } = provider();
    await ask("Walk me through 8. Nc7+ step by step");
    expect(coachCalls.every((c) => !c.outputSchema)).toBe(true);
    expect(logged("followup_fielded")[0]).toMatchObject({
      eligible: false,
      reason: "walkthrough",
    });
  });

  it("with the mode unset, nothing is fielded and nothing is logged", async () => {
    const { coachCalls } = provider();
    await ask(Q);
    expect(coachCalls.every((c) => !c.outputSchema)).toBe(true);
    expect(logged("followup_fielded")).toEqual([]);
  });
});
