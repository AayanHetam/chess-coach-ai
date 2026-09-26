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
import { toCompactContract } from "@/lib/contract/followUp";
import { makeContract, makeInsight, lineFact } from "@/lib/contract/__tests__/insightFactory";

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

  it("every follow-up declares its reduced grounding in the system suffix (T3 option A)", async () => {
    // The follow-up path fetches no fresh external evidence (chessdb / Maia /
    // tablebase) — by measured decision, not by accident. The prompt must SAY
    // so, or the model papers over the gap with invented book percentages and
    // tablebase verdicts. Assert the two load-bearing phrases, not the whole
    // wording (probes that grep exact copy go stale).
    disableFlag();
    await POST(makeRequest(fastPathBody()));
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    const args = mockCallLLM.mock.calls[0][0];
    expect(args.systemSuffix).toContain("EVIDENCE SCOPE FOR THIS TURN");
    expect(args.systemSuffix).toContain("Never invent book percentages");
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
    // A timeout has no draft to serve: the template it is.
    expect(json.gameAnalysis.pipeline.servedDraft).toBe(false);
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

// ─────────────────────────────────────────────────────────────────────
// The follow-up prompt and the question anchor
// ─────────────────────────────────────────────────────────────────────

describe("chat route: follow-up prompt", () => {
  it("sends the follow-up prompt (verdict / proof / lesson) by default, not the review prompt", async () => {
    disableFlag();
    mockGetAnalysisContext.mockReturnValue({
      ...happyContext(),
      systemPromptStable: "REVIEW_PROMPT_STABLE",
      systemPromptSuffix: "USER CONTEXT:\n- User rating: 1450",
      personalityId: "grandmaster",
    });
    await POST(makeRequest(fastPathBody()));
    const args = mockCallLLM.mock.calls[0][0];
    expect(args.system).toContain("1. THE IDEA, THEN WHAT HAPPENS");
    expect(args.system).toContain("GRANDMASTER ATTITUDE");
    expect(args.system).not.toContain("REVIEW_PROMPT_STABLE");
    expect(args.system).not.toContain("[INSIGHT:");
    // The stored per-user tail still rides in the uncached suffix.
    expect(args.systemSuffix).toContain("User rating: 1450");
    expect(args.maxTokens).toBeLessThan(1000);
  });

  it("COACH_FOLLOWUP_PROMPT=legacy puts the review prompt back, with its output cap", async () => {
    disableFlag();
    vi.stubEnv("COACH_FOLLOWUP_PROMPT", "legacy");
    mockGetAnalysisContext.mockReturnValue({
      ...happyContext(),
      systemPromptStable: "REVIEW_PROMPT_STABLE",
      systemPromptSuffix: "USER CONTEXT:\n- User rating: 1450",
    });
    await POST(makeRequest(fastPathBody()));
    const args = mockCallLLM.mock.calls[0][0];
    expect(args.system).toBe("REVIEW_PROMPT_STABLE");
    expect(args.maxTokens).toBe(3000);
    expect(mockBuildCondensedContext).toHaveBeenCalledTimes(1);
    // No budget reminder on the legacy path: the question travels alone.
    expect(args.messages[args.messages.length - 1].content).toBe("what was my biggest mistake?");
  });

  it("does not replay the whole transcript: the last four exchanges, starting on a user turn", async () => {
    disableFlag();
    const history = [];
    for (let i = 0; i < 7; i++) {
      history.push({ role: "user", content: `q${i}` });
      history.push({ role: "assistant", content: `a${i}` });
    }
    await POST(makeRequest(fastPathBody({ conversationHistory: history })));
    const args = mockCallLLM.mock.calls[0][0];
    const contents = args.messages.map((m: { content: string }) => m.content);
    // The review, then the last four exchanges, then the question.
    expect(contents[0]).toBe("Solid opening choice.");
    expect(contents).not.toContain("q2");
    expect(contents).toContain("q3");
    expect(contents[1]).toBe("q3");
    // The question as typed, with the budget under it (the model's copy only).
    expect(contents[contents.length - 1]).toMatch(/^what was my biggest mistake\?\n\n\[At most 100 words/);
  });
});

describe("chat route: question anchor", () => {
  const GAME = ["e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4", "Qb6", "Nf3", "Qxb2", "Na3", "Qxa1", "Nb5", "Qxc1", "Nc7+", "Kd8"];

  it("a question that names a move is grounded on that move, and the response says which", async () => {
    disableFlag();
    mockGetAnalysisContext.mockReturnValue({ ...happyContext(), playedMoves: GAME, moveCount: 8 });
    const res = await POST(
      makeRequest(fastPathBody({ userMessage: "Why was 8. Nc7+ a mistake?", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", moveIndex: 0 })),
    );
    const json = await res.json();
    expect(json.gameAnalysis.anchor).toEqual({ ply: 15, moveNumber: 8, color: "w", san: "Nc7+" });
    // The position returned is the board after the move, not the client's start position.
    expect(json.gameAnalysis.position).toMatch(/^r1b1kbnr\/ppNppppp/);
    const args = mockCallLLM.mock.calls[0][0];
    expect(args.systemSuffix).toContain("## MOVE UNDER DISCUSSION — 8. Nc7+ (White, the player's move)");
    expect(args.systemSuffix).toContain("Board BEFORE 8. Nc7+");
    expect(args.systemSuffix).toContain("Board AFTER 8. Nc7+");
    expect(args.systemSuffix).not.toContain("CURRENTLY VIEWED POSITION");
  });

  it("a general question keeps the viewed board and carries no anchor", async () => {
    disableFlag();
    mockGetAnalysisContext.mockReturnValue({ ...happyContext(), playedMoves: GAME, moveCount: 8 });
    const res = await POST(makeRequest(fastPathBody({ userMessage: "what should I study next?" })));
    const json = await res.json();
    expect(json.gameAnalysis.anchor).toBeUndefined();
    const args = mockCallLLM.mock.calls[0][0];
    expect(args.systemSuffix).toContain("CURRENTLY VIEWED POSITION");
  });

  it("with the pipeline on, the anchor moves the validators to the named move", async () => {
    enableFlag();
    mockGetAnalysisContext.mockReturnValue({ ...happyContext(), playedMoves: GAME, moveCount: 8 });
    let captured: { fenBefore?: string; fenAfter?: string } | null = null;
    mockFetchDataSources.mockImplementation(async (opts: unknown) => {
      captured = opts as { fenBefore: string; fenAfter: string };
      return happyDataSources();
    });
    mockClassifyQuestion.mockResolvedValue({ category: "position_analysis", confidence: 0.9, rationale: "t" });
    const res = await POST(makeRequest(fastPathBody({ userMessage: "why was 8. Nc7+ bad?", moveIndex: 0 })));
    const json = await res.json();
    expect(json.gameAnalysis.anchor.ply).toBe(15);
    expect(captured).not.toBeNull();
    // fenAfter is the board after 8. Nc7+ (knight on c7, Black to move).
    expect(captured!.fenAfter).toMatch(/^r1b1kbnr\/ppNppppp/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2026-09-26: the follow-up serves the model's draft over the pipeline's
// template, and an anchored question gets a focused contract block.
// ─────────────────────────────────────────────────────────────────────

describe("chat route: a rejected draft is served over the pipeline's template", () => {
  const compact = toCompactContract(makeContract([makeInsight({})]), ["M1"]);
  const TEMPLATE =
    "White is a touch worse here.\n\nWhat changed:\n- Black's king is less safe than before.";
  const DRAFT =
    "A sensible developing move. Black's king is in real trouble now.\n\nLesson: Develop first, then look for tactics.";
  function rejected() {
    return happyPipelineResult({
      finalResponse: TEMPLATE,
      finalOutcome: "fallback_used",
      retryCount: 1,
      lastDraft: DRAFT,
      cumulativeIssues: [
        {
          check_name: "relational_claim_contradicted",
          severity: "error",
          llm_span: "Black's king is in real trouble now",
          expected: {},
          actual: {},
          detail: "no attack on the king",
        },
      ],
    });
  }

  it("the validators reject the draft → the draft is served, minus the contradicted sentence", async () => {
    enableFlag();
    mockGetAnalysisContext.mockReturnValue({ ...happyContext(), compactContract: compact });
    mockRunValidationPipeline.mockResolvedValue(rejected());
    const res = await POST(makeRequest(fastPathBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gameAnalysis.pipeline.finalOutcome).toBe("fallback_used");
    expect(json.gameAnalysis.pipeline.servedDraft).toBe(true);
    expect(json.gameAnalysis.analysis).not.toContain("What changed");
    expect(json.gameAnalysis.analysis).toContain("A sensible developing move.");
    expect(json.gameAnalysis.analysis).not.toContain("real trouble");
    expect(json.gameAnalysis.analysis).toContain("Lesson: Develop first, then look for tactics.");
  });

  it("with no contract to referee against, the template stands", async () => {
    enableFlag();
    mockRunValidationPipeline.mockResolvedValue(rejected());
    const res = await POST(makeRequest(fastPathBody()));
    const json = await res.json();
    expect(json.gameAnalysis.pipeline.servedDraft).toBe(false);
    expect(json.gameAnalysis.analysis).toContain("What changed");
  });

  it("on the legacy prompt the template stands", async () => {
    enableFlag();
    vi.stubEnv("COACH_FOLLOWUP_PROMPT", "legacy");
    mockGetAnalysisContext.mockReturnValue({ ...happyContext(), compactContract: compact });
    mockRunValidationPipeline.mockResolvedValue(rejected());
    const res = await POST(makeRequest(fastPathBody()));
    const json = await res.json();
    expect(json.gameAnalysis.pipeline.servedDraft).toBe(false);
    expect(json.gameAnalysis.analysis).toContain("touch worse");
  });

  it("a draft that passed is served as itself, without the flagged spans of an earlier attempt", async () => {
    enableFlag();
    mockGetAnalysisContext.mockReturnValue({ ...happyContext(), compactContract: compact });
    mockRunValidationPipeline.mockResolvedValue(
      happyPipelineResult({
        finalResponse: "Black's king is in real trouble now. Develop first.",
        finalOutcome: "passed_after_retry",
        retryCount: 1,
        cumulativeIssues: rejected().cumulativeIssues,
      }),
    );
    const res = await POST(makeRequest(fastPathBody()));
    const json = await res.json();
    expect(json.gameAnalysis.pipeline.servedDraft).toBe(false);
    expect(json.gameAnalysis.analysis).toContain("real trouble");
  });
});

describe("chat route: the contract block is focused on the move asked about", () => {
  const GAME = ["e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4", "Qb6", "Nf3", "Qxb2", "Na3", "Qxa1", "Nb5", "Qxc1", "Nc7+", "Kd8"];
  const other = makeInsight({
    factIdPrefix: "M1",
    moveNumber: 12,
    color: "w",
    colorName: "White",
    playedSan: "Bd3",
    bestSan: "Ne6",
    lines: [lineFact("M1.pv0", ["Ne6", "Qd7", "Nxg7"], ["d4e6", "d8d7", "e6g7"], { cp: 320, display: "+3.20" })],
  });
  const compact = toCompactContract(makeContract([other]), ["M1"]);

  it("an anchored question keeps the other findings' verdicts and evals but not their lines", async () => {
    disableFlag();
    mockGetAnalysisContext.mockReturnValue({ ...happyContext(), playedMoves: GAME, moveCount: 8, compactContract: compact });
    await POST(makeRequest(fastPathBody({ userMessage: "Why was 8. Nc7+ a mistake?", moveIndex: 0 })));
    const args = mockCallLLM.mock.calls[0][0];
    expect(args.systemSuffix).toContain("move 12 White played Bd3");
    expect(args.systemSuffix).toContain("-2.12"); // its eval after the move
    expect(args.systemSuffix).not.toContain("12.Ne6");
    expect(args.systemSuffix).toContain("engine line: withheld this turn");
    expect(args.systemSuffix).toContain("The question is about move 8 (White)");
  });

  it("a general question gets the whole block", async () => {
    disableFlag();
    mockGetAnalysisContext.mockReturnValue({ ...happyContext(), playedMoves: GAME, moveCount: 8, compactContract: compact });
    await POST(makeRequest(fastPathBody({ userMessage: "what should I study next?" })));
    const args = mockCallLLM.mock.calls[0][0];
    expect(args.systemSuffix).toContain("12.Ne6");
    expect(args.systemSuffix).not.toContain("withheld");
  });
});
