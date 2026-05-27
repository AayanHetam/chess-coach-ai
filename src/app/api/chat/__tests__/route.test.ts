/**
 * Integration tests for /api/chat route handler (Stage B 1.C.B.5).
 * Coverage per PR_1C_STAGE_B_PLAN.md §10.4. Chat path is structurally
 * simpler than enhanced-analysis — no streaming, no buffer-then-restream,
 * fast-path always uses cached analysisContext.
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

const {
  mockLog,
  mockSession,
  mockCallLLM,
  mockGetAnalysisContext,
  mockBuildCondensedContext,
  mockValidateAIResponse,
  mockClassifyQuestion,
  mockFetchDataSources,
  mockRunValidationPipeline,
} = vi.hoisted(() => ({
  mockLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockSession: vi.fn(),
  mockCallLLM: vi.fn(),
  mockGetAnalysisContext: vi.fn(),
  mockBuildCondensedContext: vi.fn(),
  mockValidateAIResponse: vi.fn(),
  mockClassifyQuestion: vi.fn(),
  mockFetchDataSources: vi.fn(),
  mockRunValidationPipeline: vi.fn(),
}));

vi.mock("@/lib/logging", () => ({
  logger: { child: vi.fn(() => mockLog) },
  withRequestContext: (_id: string, fn: () => unknown) => fn(),
  extractRequestId: () => "chat-test-request-id",
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mockSession }));
vi.mock("@/lib/llmProvider", () => ({
  callLLM: mockCallLLM,
  LLMError: class LLMError extends Error {},
}));
vi.mock("@/lib/analysisContextCache", () => ({
  getAnalysisContext: mockGetAnalysisContext,
  buildCondensedContext: mockBuildCondensedContext,
}));
vi.mock("@/lib/aiResponseValidator", () => ({ validateAIResponse: mockValidateAIResponse }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminFirestore: vi.fn(),
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

import { __resetMastermindEnvCacheForTests } from "@/env";
import { POST } from "../route";

// ─────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────

const CHAT_RESPONSE = "Looking at move 6, the trade simplified into an endgame favorable for Black.";

function happyContext() {
  return {
    contextId: "ctx-abc",
    gameContext: "## full game context",
    compactGameContext: "## compact",
    playedMoves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"],
    systemPrompt: "You are a chess coach.",
    fewShotExamples: "",
    fen: "r1bqkbnr/1ppp1ppp/p1n5/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1",
    skillLevel: "intermediate" as const,
    playerColor: "w",
    moveCount: 3,
    createdAt: Date.now(),
    initialAnalysis: "Solid opening choice.",
  };
}

function happyPipelineResult(overrides: Partial<import("@/lib/mastermind/validators").RegenerateResult> = {}): import("@/lib/mastermind/validators").RegenerateResult {
  return {
    finalResponse: CHAT_RESPONSE,
    retryCount: 0,
    finalOutcome: "passed_initial",
    cumulativeIssues: [],
    totalCostUsd: 0.003,
    telemetry: [],
    ...overrides,
  };
}

function happyDataSources(): import("@/lib/mastermind/wireValidators").FetchedDataSources {
  return {
    featureDelta: {} as any,
    pieceRoleDiff: [],
    scout: undefined,  // §3.4: chat skips scout
    userHistory: {
      games: [{ pgn: "1. e4 e5", white: { name: "TestUser" }, black: { name: "Opp" } }] as any,
      userName: "test-uid",
      nowMs: Date.now(),
    },
  };
}

function fastPathBody(overrides: Record<string, unknown> = {}) {
  return {
    contextId: "ctx-abc",
    userMessage: "what was my biggest mistake?",
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  Object.values(mockLog).forEach((fn) => fn.mockClear());
  vi.clearAllMocks();
  __resetMastermindEnvCacheForTests();

  mockSession.mockResolvedValue({ session: { uid: "test-uid" } });
  mockGetAnalysisContext.mockReturnValue(happyContext());
  mockBuildCondensedContext.mockReturnValue("## condensed");
  mockValidateAIResponse.mockReturnValue({
    isValid: true,
    score: 1.0,
    issues: [],
    correctedResponse: CHAT_RESPONSE,
  });
  mockCallLLM.mockResolvedValue({ content: CHAT_RESPONSE, inputTokens: 50, outputTokens: 20 });
  mockClassifyQuestion.mockResolvedValue({
    category: "improvement_strategy",
    confidence: 0.85,
    rationale: "test",
  });
  mockFetchDataSources.mockResolvedValue(happyDataSources());
  mockRunValidationPipeline.mockResolvedValue(happyPipelineResult());
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
// Flag-off invariants
// ─────────────────────────────────────────────────────────────────────

describe("chat route: flag-off invariants", () => {
  it("flag off, fast path → callLLM only; no pipeline; no fetchDataSources", async () => {
    disableFlag();
    const res = await POST(makeRequest(fastPathBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gameAnalysis.analysis).toBe(CHAT_RESPONSE);
    expect(json.gameAnalysis.fastPath).toBe(true);
    expect(json.gameAnalysis.pipeline).toBeUndefined();
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    expect(mockRunValidationPipeline).not.toHaveBeenCalled();
    expect(mockFetchDataSources).not.toHaveBeenCalled();
  });

  it("flag off, no contextId → fallback passthrough returns OpenAI-compatible shape", async () => {
    disableFlag();
    const res = await POST(
      makeRequest({
        messages: [
          { role: "user", content: "hi" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.choices?.[0]?.message?.content).toBe(CHAT_RESPONSE);
    expect(mockRunValidationPipeline).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Flag-on fast path
// ─────────────────────────────────────────────────────────────────────

describe("chat route: flag-on fast path", () => {
  it("flag on + contextId → pipeline runs; response has pipeline metadata", async () => {
    enableFlag();
    const res = await POST(makeRequest(fastPathBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(mockRunValidationPipeline).toHaveBeenCalledTimes(1);
    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(json.gameAnalysis.pipeline).toMatchObject({
      finalOutcome: "passed_initial",
      category: "improvement_strategy",
    });
  });

  it("flag on + contextId → fetchDataSources called with opponentUsername=undefined per §3.4", async () => {
    enableFlag();
    let capturedOpts: { opponentUsername?: string } | null = null;
    mockFetchDataSources.mockImplementation(async (opts: unknown) => {
      capturedOpts = opts as { opponentUsername?: string };
      return happyDataSources();
    });
    await POST(makeRequest(fastPathBody()));
    expect(capturedOpts).not.toBeNull();
    expect(capturedOpts!.opponentUsername).toBeUndefined();
  });

  it("flag on + improvement_strategy category → degraded featureDelta (fenBefore === fenAfter)", async () => {
    enableFlag();
    let capturedOpts: { fenBefore?: string; fenAfter?: string } | null = null;
    mockFetchDataSources.mockImplementation(async (opts: unknown) => {
      capturedOpts = opts as { fenBefore: string; fenAfter: string };
      return happyDataSources();
    });
    await POST(makeRequest(fastPathBody()));
    expect(capturedOpts).not.toBeNull();
    expect(capturedOpts!.fenBefore).toBe(capturedOpts!.fenAfter);
  });

  it("flag on, pipeline retry → response.pipeline.retryCount=1, finalOutcome=passed_after_retry", async () => {
    enableFlag();
    mockRunValidationPipeline.mockResolvedValue(happyPipelineResult({
      retryCount: 1,
      finalOutcome: "passed_after_retry",
    }));
    const res = await POST(makeRequest(fastPathBody()));
    const json = await res.json();
    expect(json.gameAnalysis.pipeline.retryCount).toBe(1);
    expect(json.gameAnalysis.pipeline.finalOutcome).toBe("passed_after_retry");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Flag-on edge cases
// ─────────────────────────────────────────────────────────────────────

describe("chat route: flag-on edge cases", () => {
  it("flag on, no contextId → fallback path unchanged; no pipeline (§3.4 / Q3)", async () => {
    enableFlag();
    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "hi" }],
      }),
    );
    expect(res.status).toBe(200);
    expect(mockRunValidationPipeline).not.toHaveBeenCalled();
    expect(mockFetchDataSources).not.toHaveBeenCalled();
  });

  it("flag on, FD throws → fall back to callLLM (§3.2)", async () => {
    enableFlag();
    mockFetchDataSources.mockRejectedValue(new Error("Invalid FEN"));
    const res = await POST(makeRequest(fastPathBody()));
    expect(res.status).toBe(200);
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    expect(mockRunValidationPipeline).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.gameAnalysis.pipeline).toBeUndefined();
  });

  it("flag on, context expired (getAnalysisContext returns null) → 404; no pipeline", async () => {
    enableFlag();
    mockGetAnalysisContext.mockReturnValue(null);
    const res = await POST(makeRequest(fastPathBody()));
    expect(res.status).toBe(404);
    expect(mockRunValidationPipeline).not.toHaveBeenCalled();
  });

  it("flag on, request lacks auth → 401 from requireSession; no pipeline", async () => {
    enableFlag();
    mockSession.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    });
    const res = await POST(makeRequest(fastPathBody()));
    expect(res.status).toBe(401);
    expect(mockRunValidationPipeline).not.toHaveBeenCalled();
  });

  it("flag on, pipeline times out → graceful response with pipeline.timedOut=true", async () => {
    enableFlag();
    // Mock pipeline to never resolve; rely on withPipelineTimeout's
    // default (55s per 2026-05-26 update from 45s). We use fake timers
    // to skip the wait.
    vi.useFakeTimers();
    mockRunValidationPipeline.mockImplementation(() => new Promise(() => {}));
    const resPromise = POST(makeRequest(fastPathBody()));
    await vi.advanceTimersByTimeAsync(55_000);
    const res = await resPromise;
    vi.useRealTimers();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gameAnalysis.pipeline.timedOut).toBe(true);
    expect(json.gameAnalysis.pipeline.finalOutcome).toBe("fallback_used");
  });
});

// ─────────────────────────────────────────────────────────────────────
// γ-route: gameEval threading through AnalysisContext
// ─────────────────────────────────────────────────────────────────────

describe("chat route: gameEval threading (γ-route, 2026-05-23)", () => {
  // happyContext's playedMoves has 6 entries (e4 e5 Nf3 Nc6 Bb5 a6). Per
  // production's getEvaluateGameParams (src/lib/chess.ts:11-12), gameEval
  // .positions.length === moveHistory.length + 1: positions[0] = starting
  // state, positions[6] = state after the last move (3...a6 — Ruy Lopez
  // Morphy Defense, eval ~+45 cp for white).
  function gameEvalForHappyContext() {
    return {
      positions: [
        { lines: [{ pv: [], cp: 0, depth: 14, multiPv: 1 }] },   // start
        { lines: [{ pv: [], cp: 30, depth: 14, multiPv: 1 }] },  // 1.e4
        { lines: [{ pv: [], cp: 25, depth: 14, multiPv: 1 }] },  // 1...e5
        { lines: [{ pv: [], cp: 35, depth: 14, multiPv: 1 }] },  // 2.Nf3
        { lines: [{ pv: [], cp: 30, depth: 14, multiPv: 1 }] },  // 2...Nc6
        { lines: [{ pv: [], cp: 40, depth: 14, multiPv: 1 }] },  // 3.Bb5
        { lines: [{ pv: [], cp: 45, depth: 14, multiPv: 1 }] },  // 3...a6
      ],
    };
  }

  it("gameEval present in context → runValidationPipeline receives real stockfishEval (cp 45 for the post-a6 position)", async () => {
    enableFlag();
    // deriveMastermindMoveContext degrades to stockfishEval={} for
    // NON_MOVE_FOCUS_CATEGORIES (opponent_prep / improvement_strategy /
    // meta_motivational), so the gameEval lookup only runs for move-
    // focused categories. game_review exercises the moveHistory-anchored
    // path that reads gameEval.positions[lastIdx].
    mockClassifyQuestion.mockResolvedValue({
      category: "game_review",
      confidence: 0.85,
      rationale: "test",
    });
    mockGetAnalysisContext.mockReturnValue({
      ...happyContext(),
      gameEval: gameEvalForHappyContext(),
    });

    let capturedStockfishEval: { cp?: number; mate?: number } | null = null;
    mockRunValidationPipeline.mockImplementation(async (opts: unknown) => {
      capturedStockfishEval = (opts as { stockfishEval: { cp?: number; mate?: number } }).stockfishEval;
      return happyPipelineResult();
    });

    const res = await POST(makeRequest(fastPathBody()));
    expect(res.status).toBe(200);
    expect(capturedStockfishEval).not.toBeNull();
    expect(capturedStockfishEval!.cp).toBe(45);
    expect(capturedStockfishEval!.mate).toBeUndefined();
  });

  it("gameEval present + pipeline reports passing eval_claim → telemetry contains eval_claim with passed/numeric/qualitative fire_reason, NOT no_stockfish_eval", async () => {
    enableFlag();
    vi.stubEnv("VERCEL_ENV", "preview"); // expose telemetry in response
    mockClassifyQuestion.mockResolvedValue({
      category: "game_review",
      confidence: 0.85,
      rationale: "test",
    });
    mockGetAnalysisContext.mockReturnValue({
      ...happyContext(),
      gameEval: gameEvalForHappyContext(),
    });
    mockRunValidationPipeline.mockResolvedValue(
      happyPipelineResult({
        telemetry: [
          {
            check_name: "eval_claim",
            fire_reason: "passed",
            llm_span: "slight edge for white",
            expected: { band: "slightly_better", cp: 45 },
            actual: { band: "slightly_better", cp: 45 },
            retry_count: 0,
            final_outcome: null,
            context: { fen: "test-fen", correlation_id: "test" },
            timestamp_ms: Date.now(),
          },
        ],
      }),
    );

    const res = await POST(makeRequest(fastPathBody()));
    const json = await res.json();
    const telemetry = json.gameAnalysis.pipeline.telemetry;
    expect(telemetry).toBeDefined();
    expect(telemetry).toHaveLength(1);
    // Negative: skip path must NOT have fired (regression guard against
    // a future refactor silently dropping gameEval threading).
    expect(telemetry.some((e: { fire_reason: string }) => e.fire_reason === "no_stockfish_eval")).toBe(false);
    // Positive: eval_claim fired with a real-comparison fire_reason.
    const evalClaimEvents = telemetry.filter((e: { check_name: string }) => e.check_name === "eval_claim");
    expect(evalClaimEvents.length).toBeGreaterThan(0);
    expect(["passed", "numeric_diff_exceeds_threshold", "qualitative_band_flip"]).toContain(
      evalClaimEvents[0].fire_reason,
    );
  });

  it("legacy cache entry (gameEval omitted) → stockfishEval undefined → (β) skip path remains the safety net", async () => {
    enableFlag();
    // Force game_review category so we exercise the moveHistory-anchored
    // branch (where gameEval would normally be read). With gameEval
    // missing, stockfishEval comes through undefined and (β)'s skip path
    // catches it downstream.
    mockClassifyQuestion.mockResolvedValue({
      category: "game_review",
      confidence: 0.85,
      rationale: "test",
    });
    // happyContext() returns the legacy shape (no gameEval field) — same
    // shape as cache entries created before this commit ships.
    let capturedStockfishEval: { cp?: number; mate?: number } | null = null;
    mockRunValidationPipeline.mockImplementation(async (opts: unknown) => {
      capturedStockfishEval = (opts as { stockfishEval: { cp?: number; mate?: number } }).stockfishEval;
      return happyPipelineResult();
    });

    await POST(makeRequest(fastPathBody()));
    expect(capturedStockfishEval).not.toBeNull();
    expect(capturedStockfishEval!.cp).toBeUndefined();
    expect(capturedStockfishEval!.mate).toBeUndefined();
  });
});
