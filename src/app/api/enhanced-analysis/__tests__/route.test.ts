/**
 * Integration tests for /api/enhanced-analysis route handler (Stage B 1.C.B.4).
 *
 * Coverage matches PR_1C_STAGE_B_PLAN.md §10.3 + §10.3.1 design sketch.
 * Invokes the POST handler directly via import — no supertest, no Next.js
 * dev server. Mocks every external dependency listed in §10.3.1's mock
 * surface table; validatorTelemetry is NOT mocked (logger underneath is)
 * so per-event level routing is exercised end-to-end.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────
// Mock surface — hoisted; see PR_1C_STAGE_B_PLAN.md §10.3.1 for rationale
// ─────────────────────────────────────────────────────────────────────

const { mockLog, mockSession, mockCallLLM, mockCallLLMStream, mockGetCachedResponse, mockSetCachedResponse, mockGenerateContextId, mockStoreAnalysisContext, mockValidateAIResponse, mockGetUserById, mockGetAdminFirestore, mockClassifyQuestion, mockFetchDataSources, mockRunValidationPipeline } = vi.hoisted(() => ({
  mockLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockSession: vi.fn(),
  mockCallLLM: vi.fn(),
  mockCallLLMStream: vi.fn(),
  mockGetCachedResponse: vi.fn(),
  mockSetCachedResponse: vi.fn(),
  mockGenerateContextId: vi.fn(),
  mockStoreAnalysisContext: vi.fn(),
  mockValidateAIResponse: vi.fn(),
  mockGetUserById: vi.fn(),
  mockGetAdminFirestore: vi.fn(),
  mockClassifyQuestion: vi.fn(),
  mockFetchDataSources: vi.fn(),
  mockRunValidationPipeline: vi.fn(),
}));

vi.mock("@/lib/logging", () => ({
  logger: { child: vi.fn(() => mockLog) },
  withRequestContext: (_id: string, fn: () => unknown) => fn(),
  extractRequestId: () => "test-request-id",
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mockSession }));
vi.mock("@/lib/llmProvider", () => ({
  callLLM: mockCallLLM,
  callLLMStream: mockCallLLMStream,
  LLMError: class LLMError extends Error {},
}));
vi.mock("@/lib/responseCache", () => ({
  generateCacheKey: () => "test-cache-key",
  getCachedResponse: mockGetCachedResponse,
  setCachedResponse: mockSetCachedResponse,
}));
vi.mock("@/lib/analysisContextCache", () => ({
  generateContextId: mockGenerateContextId,
  storeAnalysisContext: mockStoreAnalysisContext,
}));
vi.mock("@/lib/aiResponseValidator", () => ({
  validateAIResponse: mockValidateAIResponse,
}));
vi.mock("@/lib/server/users", () => ({ getUserById: mockGetUserById }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminFirestore: mockGetAdminFirestore,
  AdminConfigError: class AdminConfigError extends Error {},
  __resetAdminCacheForTests: vi.fn(),
}));
vi.mock("@/lib/mastermind/categorization/categoryClassifier", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mastermind/categorization/categoryClassifier")>();
  return { ...actual, classifyQuestion: mockClassifyQuestion };
});
vi.mock("@/lib/mastermind/wireValidators", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mastermind/wireValidators")>();
  return { ...actual, fetchDataSources: mockFetchDataSources };
});
vi.mock("@/lib/mastermind/validators", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mastermind/validators")>();
  return {
    ...actual,
    runValidationPipeline: mockRunValidationPipeline,
    countScoutOpportunities: vi.fn(() => []),
    countUserHistoryOpportunities: vi.fn(() => []),
  };
});

// Skip heavy concept-retrieval pulls in tests — these aren't part of Stage B's surface
vi.mock("@/lib/concept/conceptRetrieval", () => ({ getReinforcements: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/concept/conceptDetector", () => ({ detectConcepts: vi.fn(() => []) }));
vi.mock("@/lib/concept/conceptTaxonomy", () => ({ getConcept: vi.fn(() => undefined) }));

import {
  __resetMastermindEnvCacheForTests,
} from "@/env";
import { POST } from "../route";

// ─────────────────────────────────────────────────────────────────────
// Fixtures + helpers
// ─────────────────────────────────────────────────────────────────────

const HAPPY_RESPONSE = "Your last move was strong because it limited White's queenside expansion.";

function happyPipelineResult(overrides: Partial<import("@/lib/mastermind/validators").RegenerateResult> = {}): import("@/lib/mastermind/validators").RegenerateResult {
  return {
    finalResponse: HAPPY_RESPONSE,
    retryCount: 0,
    finalOutcome: "passed_initial",
    cumulativeIssues: [],
    totalCostUsd: 0.012,
    telemetry: [
      {
        check_name: "scout_citation",
        fire_reason: "passed",
        llm_span: "",
        expected: null,
        actual: null,
        retry_count: 0,
        final_outcome: null,
        context: { correlation_id: "test-request-id" },
        timestamp_ms: 1700000000000,
      },
    ],
    ...overrides,
  };
}

function happyDataSources(): import("@/lib/mastermind/wireValidators").FetchedDataSources {
  return {
    featureDelta: {} as any,
    pieceRoleDiff: [],
    scout: {
      scout: {} as any,
      collisions: undefined,
      opponentUsername: "TestOpp",
      primaryTimeClass: undefined,
    },
    userHistory: {
      games: [{ pgn: "1. e4 e5", white: { name: "TestUser" }, black: { name: "TestOpp" } }] as any,
      userName: "TestUser",
      nowMs: 1700000000000,
    },
  };
}

function baseRequestBody(overrides: Record<string, unknown> = {}) {
  return {
    userMessage: "tell me about my opponent",
    moveHistory: ["e4", "e5", "Nf3", "Nc6"],
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1",
    playerColor: "w",
    username: "TestUser",
    userRating: 1500,
    opponentUsername: "TestOpp",
    opponentPlatform: "chess.com",
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown> = baseRequestBody()): NextRequest {
  return new NextRequest("http://localhost:3000/api/enhanced-analysis", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

async function readSSE(res: Response): Promise<Array<{ type: string; [k: string]: unknown }>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const events: Array<{ type: string; [k: string]: unknown }> = [];
  // eslint-disable-next-line no-constant-condition -- SSE read-until-done loop; exits via the `break` when reader.read() reports done.
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      const line = p.trim();
      if (!line.startsWith("data: ")) continue;
      events.push(JSON.parse(line.slice(6)));
    }
  }
  return events;
}

async function* iterFromText(text: string): AsyncGenerator<{ type: "text" | "done"; delta?: string; result?: unknown }> {
  // Emit text in 2 deltas + final done event mimicking callLLMStream.
  yield { type: "text", delta: text.slice(0, Math.floor(text.length / 2)) };
  yield { type: "text", delta: text.slice(Math.floor(text.length / 2)) };
  yield { type: "done", result: { content: text, inputTokens: 100, outputTokens: 50 } } as any;
}

beforeEach(() => {
  Object.values(mockLog).forEach((fn) => fn.mockClear());
  vi.clearAllMocks();
  __resetMastermindEnvCacheForTests();

  // Sensible defaults — most tests inherit happy path then override.
  mockSession.mockResolvedValue({ session: { uid: "test-uid" } });
  mockGetUserById.mockResolvedValue(null);
  mockGetCachedResponse.mockReturnValue(null);
  mockGenerateContextId.mockReturnValue("test-context-id");
  mockValidateAIResponse.mockReturnValue({
    isValid: true,
    score: 1.0,
    issues: [],
    correctedResponse: HAPPY_RESPONSE,
  });
  mockCallLLM.mockResolvedValue({ content: HAPPY_RESPONSE, inputTokens: 100, outputTokens: 50 });
  mockCallLLMStream.mockImplementation(() => iterFromText(HAPPY_RESPONSE));
  mockClassifyQuestion.mockResolvedValue({ category: "opponent_prep", confidence: 0.9, rationale: "test" });
  mockFetchDataSources.mockResolvedValue(happyDataSources());
  mockRunValidationPipeline.mockResolvedValue(happyPipelineResult());

  // global.fetch for puzzle recs — return ok:false so the helper returns []
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false } as Response));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  __resetMastermindEnvCacheForTests();
});

function enableFlag() {
  vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "true");
  __resetMastermindEnvCacheForTests();
}

function disableFlag() {
  vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", "false");
  __resetMastermindEnvCacheForTests();
}

// ─────────────────────────────────────────────────────────────────────
// Flag-off invariants (byte-identical to today)
// ─────────────────────────────────────────────────────────────────────

describe("enhanced-analysis route: flag-off invariants", () => {
  it("flag off, non-stream → uses callLLM, no pipeline call, no telemetry forwarding", async () => {
    disableFlag();
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gameAnalysis.analysis).toBe(HAPPY_RESPONSE);
    expect(json.gameAnalysis.pipeline).toBeUndefined();
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    expect(mockRunValidationPipeline).not.toHaveBeenCalled();
    expect(mockFetchDataSources).not.toHaveBeenCalled();
    expect(mockClassifyQuestion).not.toHaveBeenCalled();
  });

  it("flag off, stream → live-streams callLLMStream deltas; no validating event; no pipeline metadata", async () => {
    disableFlag();
    const res = await POST(makeRequest({ ...baseRequestBody(), stream: true }));
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const events = await readSSE(res);
    expect(events.some((e) => e.type === "validating")).toBe(false);
    expect(events.some((e) => e.type === "text")).toBe(true);
    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
    expect((done as { metadata: { pipeline?: unknown } }).metadata.pipeline).toBeUndefined();
    expect(mockCallLLMStream).toHaveBeenCalledTimes(1);
    expect(mockRunValidationPipeline).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Flag-on happy paths
// ─────────────────────────────────────────────────────────────────────

describe("enhanced-analysis route: flag-on happy paths", () => {
  it("flag on, non-stream happy → pipeline replaces callLLM; pipeline metadata in response", async () => {
    enableFlag();
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(mockRunValidationPipeline).toHaveBeenCalledTimes(1);
    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(json.gameAnalysis.pipeline).toMatchObject({
      finalOutcome: "passed_initial",
      retryCount: 0,
      category: "opponent_prep",
    });
  });

  it("flag on, stream happy → validating phase=initial, synthetic-streamed text, done has pipeline metadata", async () => {
    enableFlag();
    const res = await POST(makeRequest({ ...baseRequestBody(), stream: true }));
    const events = await readSSE(res);
    const validating = events.find((e) => e.type === "validating" && e.phase === "initial");
    expect(validating).toBeDefined();
    expect(events.some((e) => e.type === "text")).toBe(true);
    const done = events.find((e) => e.type === "done");
    expect((done as { metadata: { pipeline?: { finalOutcome: string } } }).metadata.pipeline?.finalOutcome).toBe("passed_initial");
    expect(mockCallLLMStream).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pipeline retry + fallback paths
// ─────────────────────────────────────────────────────────────────────

describe("enhanced-analysis route: pipeline retry + fallback", () => {
  it("flag on, stream retry → validating phase=retry-1 emitted; done.pipeline.finalOutcome=passed_after_retry", async () => {
    enableFlag();
    mockRunValidationPipeline.mockResolvedValue(happyPipelineResult({
      retryCount: 1,
      finalOutcome: "passed_after_retry",
    }));
    const res = await POST(makeRequest({ ...baseRequestBody(), stream: true }));
    const events = await readSSE(res);
    expect(events.some((e) => e.type === "validating" && e.phase === "retry-1")).toBe(true);
    const done = events.find((e) => e.type === "done");
    expect((done as { metadata: { pipeline: { finalOutcome: string; retryCount: number } } }).metadata.pipeline.finalOutcome).toBe("passed_after_retry");
  });

  it("flag on, stream fallback → validating phase=fallback emitted; logger.error fires from telemetry", async () => {
    enableFlag();
    mockRunValidationPipeline.mockResolvedValue(happyPipelineResult({
      retryCount: 2,
      finalOutcome: "fallback_used",
      telemetry: [
        {
          check_name: "scout_citation_unsupported",
          fire_reason: "fallback_used",
          llm_span: "",
          expected: null,
          actual: null,
          retry_count: 2,
          final_outcome: "fallback_used",
          context: { correlation_id: "test-request-id" },
          timestamp_ms: 1700000000000,
        },
      ],
    }));
    const res = await POST(makeRequest({ ...baseRequestBody(), stream: true }));
    const events = await readSSE(res);
    expect(events.some((e) => e.type === "validating" && e.phase === "fallback")).toBe(true);
    // forwardTelemetry routes fallback_used to logger.error per §6.3
    expect(mockLog.error).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// §3.2 failure-matrix paths
// ─────────────────────────────────────────────────────────────────────

describe("enhanced-analysis route: §3.2 failure matrix", () => {
  it("flag on, FD throws → fall back to flag-off path for this turn (non-stream)", async () => {
    enableFlag();
    mockFetchDataSources.mockRejectedValue(new Error("Invalid FEN"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    // Fell back to callLLM
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    expect(mockRunValidationPipeline).not.toHaveBeenCalled();
    expect(json.gameAnalysis.analysis).toBe(HAPPY_RESPONSE);
    expect(json.gameAnalysis.pipeline).toBeUndefined();
  });

  it("flag on, FD throws (stream) → fallback-to-flagoff validating event + live-stream + done has fallbackReason", async () => {
    enableFlag();
    mockFetchDataSources.mockRejectedValue(new Error("Invalid FEN"));
    const res = await POST(makeRequest({ ...baseRequestBody(), stream: true }));
    const events = await readSSE(res);
    expect(events.some((e) => e.type === "validating" && e.phase === "fallback-to-flagoff")).toBe(true);
    const done = events.find((e) => e.type === "done");
    expect((done as { metadata: { pipeline: { fallbackReason: string } } }).metadata.pipeline.fallbackReason).toBe("fd_failed");
    expect(mockCallLLMStream).toHaveBeenCalledTimes(1);
  });

  it("flag on, scout source returned undefined → pipeline still runs; perSource.scout null in citation summary", async () => {
    enableFlag();
    const ds = happyDataSources();
    ds.scout = undefined;
    mockFetchDataSources.mockResolvedValue(ds);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockRunValidationPipeline).toHaveBeenCalledTimes(1);
    const pipelineCallArgs = mockRunValidationPipeline.mock.calls[0][0];
    expect(pipelineCallArgs.dataSources?.scout).toBeUndefined();
    expect(pipelineCallArgs.dataSources?.userHistory).toBeDefined();
  });

  it("flag on, userHistory source returned undefined → pipeline still runs; perSource.user_history null", async () => {
    enableFlag();
    const ds = happyDataSources();
    ds.userHistory = undefined;
    mockFetchDataSources.mockResolvedValue(ds);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const pipelineCallArgs = mockRunValidationPipeline.mock.calls[0][0];
    expect(pipelineCallArgs.dataSources?.userHistory).toBeUndefined();
    expect(pipelineCallArgs.dataSources?.scout).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Footnote-append + cache + auth + schema paths
// ─────────────────────────────────────────────────────────────────────

describe("enhanced-analysis route: cross-feature interactions", () => {
  it("flag on, position_analysis category, footnote-append fails post-pipeline → analysisContent uses correctedResponse", async () => {
    enableFlag();
    // 2026-05-26 fix-game-review-false-positives: the chess.js
    // "may be inaccurate" disclaimer is now category-conditional.
    // It applies ONLY for position-anchored categories
    // (position_analysis). For non-anchored categories (game_review,
    // opponent_prep, etc.) the disclaimer is suppressed because the
    // validator's single-FEN check produces systematic false positives
    // on multi-position prose. This test exercises the path where
    // disclaimer SHOULD apply — explicitly setting position_analysis.
    mockClassifyQuestion.mockResolvedValue({
      category: "position_analysis",
      confidence: 0.9,
      rationale: "test",
    });
    mockValidateAIResponse.mockReturnValue({
      isValid: false,
      score: 0.5,
      issues: [{ severity: "warn", type: "test", detail: "test detail" }],
      correctedResponse: "CORRECTED " + HAPPY_RESPONSE,
    });
    const res = await POST(makeRequest());
    const json = await res.json();
    expect(json.gameAnalysis.analysis).toContain("CORRECTED");
    expect(json.gameAnalysis.validationIssues).toBeGreaterThan(0);
  });

  it("flag on, non-position-anchored category, footnote-append SUPPRESSED → analysisContent uses rawAnalysis", async () => {
    // Companion to the above: prove that for non-anchored categories
    // (default opponent_prep) the chess.js disclaimer does NOT apply.
    // analysisContent should be the raw LLM prose unmodified, even
    // when validator reports issues.
    enableFlag();
    // Default mock returns "opponent_prep" — non-anchored.
    mockValidateAIResponse.mockReturnValue({
      isValid: false,
      score: 0.5,
      issues: [{ severity: "warn", type: "test", detail: "test detail" }],
      correctedResponse: "CORRECTED " + HAPPY_RESPONSE,
    });
    const res = await POST(makeRequest());
    const json = await res.json();
    expect(json.gameAnalysis.analysis).not.toContain("CORRECTED");
    expect(json.gameAnalysis.analysis).toBe(HAPPY_RESPONSE);
    // Validator still ran — issues count is still surfaced for observability.
    expect(json.gameAnalysis.validationIssues).toBeGreaterThan(0);
  });

  it("flag on, cache hit → cached response returned unchanged; no pipeline, no fetchDataSources, no classifier", async () => {
    enableFlag();
    mockGetCachedResponse.mockReturnValue("CACHED RESPONSE");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gameAnalysis.analysis).toBe("CACHED RESPONSE");
    expect(mockRunValidationPipeline).not.toHaveBeenCalled();
    expect(mockFetchDataSources).not.toHaveBeenCalled();
    expect(mockClassifyQuestion).not.toHaveBeenCalled();
  });

  it("flag on, request lacks auth → 401 from requireSession; no pipeline", async () => {
    enableFlag();
    mockSession.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockRunValidationPipeline).not.toHaveBeenCalled();
    expect(mockFetchDataSources).not.toHaveBeenCalled();
  });

  it("flag on, request schema rejects bad opponentUsername regex → 400 from validateRequest", async () => {
    enableFlag();
    const res = await POST(makeRequest({ ...baseRequestBody(), opponentUsername: "bad chars!" }));
    expect(res.status).toBe(400);
    expect(mockRunValidationPipeline).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Category-aware move-context (1.C.B.5 follow-up #2) — 15th case
// ─────────────────────────────────────────────────────────────────────

describe("enhanced-analysis route: category-aware move context (1.C.B.5)", () => {
  it("opponent_prep with moveHistory → pipeline gets degraded featureDelta (fenBefore === fenAfter)", async () => {
    enableFlag();
    // Capture the fetchDataSources args so we can assert fenBefore===fenAfter for non-move-focus.
    let capturedFetchOpts: { fenBefore?: string; fenAfter?: string } | null = null;
    mockFetchDataSources.mockImplementation(async (opts: unknown) => {
      capturedFetchOpts = opts as { fenBefore: string; fenAfter: string };
      return happyDataSources();
    });
    mockClassifyQuestion.mockResolvedValue({
      category: "opponent_prep",
      confidence: 0.9,
      rationale: "opp prep query",
    });

    const res = await POST(
      makeRequest({
        ...baseRequestBody(),
        userMessage: "tell me about my opponent's tendencies",
        moveHistory: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"],
      }),
    );

    expect(res.status).toBe(200);
    expect(capturedFetchOpts).not.toBeNull();
    expect(capturedFetchOpts!.fenBefore).toBe(capturedFetchOpts!.fenAfter);
  });

  it("game_review with moveHistory → pipeline gets last-move-anchored featureDelta (fenBefore !== fenAfter)", async () => {
    enableFlag();
    let capturedFetchOpts: { fenBefore?: string; fenAfter?: string } | null = null;
    mockFetchDataSources.mockImplementation(async (opts: unknown) => {
      capturedFetchOpts = opts as { fenBefore: string; fenAfter: string };
      return happyDataSources();
    });
    mockClassifyQuestion.mockResolvedValue({
      category: "game_review",
      confidence: 0.9,
      rationale: "game review query",
    });

    const res = await POST(
      makeRequest({
        ...baseRequestBody(),
        userMessage: "what was my biggest mistake in this game?",
        moveHistory: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"],
      }),
    );

    expect(res.status).toBe(200);
    expect(capturedFetchOpts).not.toBeNull();
    expect(capturedFetchOpts!.fenBefore).not.toBe(capturedFetchOpts!.fenAfter);
  });
});
