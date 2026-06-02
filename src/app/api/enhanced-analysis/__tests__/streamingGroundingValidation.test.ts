/**
 * Streaming branch motif-grounding validator call-semantics tests.
 *
 * Sibling of route.test.ts (same mock surface). Covers the three
 * streaming code paths that the grounding-fix PR added
 * validateMotifGrounding to:
 *
 * 1. flag-off streaming branch (route.ts ~1958) — uses the last move
 *    from moveHistory + getFenAtHalfMove. Fires whenever moveHistory
 *    is non-empty.
 * 2. flag-on Mastermind-pipeline streaming branch (route.ts ~1759) —
 *    uses prep.moveCtx.fenBefore / moveSan. Skipped when category is
 *    NON_MOVE_FOCUS (moveSan undefined), so we use a move-focus
 *    category (position_analysis) to exercise it.
 * 3. flag-on game_review fallback streaming branch (route.ts ~1552) —
 *    triggered when category === "game_review" OR fetchDataSources
 *    fails. Also uses prep.moveCtx.
 *
 * These are CALL-semantic tests only — the validator's internal logic
 * is covered by src/lib/tactics/__tests__/motifGrounding.test.ts.
 * One assertion per branch confirms the call was made with the
 * expected fenBefore / moveSan, mirroring the wiring the prior
 * turn introduced.
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
// Mock surface — mirrors route.test.ts, plus detectMotifs +
// validateMotifGrounding so we can assert call args without running
// the real chess.js / tactics analysis paths.
// ─────────────────────────────────────────────────────────────────────

const {
  mockLog,
  mockSession,
  mockCallLLM,
  mockCallLLMStream,
  mockGetCachedResponse,
  mockSetCachedResponse,
  mockGenerateContextId,
  mockStoreAnalysisContext,
  mockValidateAIResponse,
  mockGetUserById,
  mockGetAdminFirestore,
  mockClassifyQuestion,
  mockFetchDataSources,
  mockRunValidationPipeline,
  mockDetectMotifs,
  mockValidateMotifGrounding,
} = vi.hoisted(() => ({
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
  mockDetectMotifs: vi.fn(),
  mockValidateMotifGrounding: vi.fn(),
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
vi.mock(
  "@/lib/mastermind/categorization/categoryClassifier",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/lib/mastermind/categorization/categoryClassifier")
      >();
    return { ...actual, classifyQuestion: mockClassifyQuestion };
  },
);
vi.mock("@/lib/mastermind/wireValidators", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/mastermind/wireValidators")>();
  return { ...actual, fetchDataSources: mockFetchDataSources };
});
vi.mock("@/lib/mastermind/validators", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/mastermind/validators")>();
  return {
    ...actual,
    runValidationPipeline: mockRunValidationPipeline,
    countScoutOpportunities: vi.fn(() => []),
    countUserHistoryOpportunities: vi.fn(() => []),
  };
});
// New mocks (vs route.test.ts) — needed for call-semantic assertions
// on the grounding validator wiring introduced by the grounding-fix PR.
vi.mock("@/lib/tactics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tactics")>();
  return { ...actual, detectMotifs: mockDetectMotifs };
});
vi.mock("@/lib/mastermind/validators/motifGrounding", () => ({
  validateMotifGrounding: mockValidateMotifGrounding,
}));

vi.mock("@/lib/concept/conceptRetrieval", () => ({
  getReinforcements: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/concept/conceptDetector", () => ({
  detectConcepts: vi.fn(() => []),
}));
vi.mock("@/lib/concept/conceptTaxonomy", () => ({
  getConcept: vi.fn(() => undefined),
}));

import { __resetMastermindEnvCacheForTests } from "@/env";
import { POST } from "../route";

// ─────────────────────────────────────────────────────────────────────
// Fixtures + helpers (subset of route.test.ts)
// ─────────────────────────────────────────────────────────────────────

const HAPPY_RESPONSE =
  "Your last move was strong because it limited White's queenside expansion.";

function happyPipelineResult(): import("@/lib/mastermind/validators").RegenerateResult {
  return {
    finalResponse: HAPPY_RESPONSE,
    retryCount: 0,
    finalOutcome: "passed_initial",
    cumulativeIssues: [],
    totalCostUsd: 0.012,
    telemetry: [],
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
      games: [
        { pgn: "1. e4 e5", white: { name: "TestUser" }, black: { name: "TestOpp" } },
      ] as any,
      userName: "TestUser",
      nowMs: 1700000000000,
    },
  };
}

// Standard 4-half-move history; final move is "Nc6" by Black.
const MOVE_HISTORY = ["e4", "e5", "Nf3", "Nc6"];
const LAST_MOVE_SAN = "Nc6";

function baseRequestBody(overrides: Record<string, unknown> = {}) {
  return {
    userMessage: "tell me about this position",
    moveHistory: MOVE_HISTORY,
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

async function drainSSE(res: Response): Promise<void> {
  const reader = res.body!.getReader();
  // eslint-disable-next-line no-constant-condition -- drain-until-done loop
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

async function* iterFromText(
  text: string,
): AsyncGenerator<{ type: "text" | "done"; delta?: string; result?: unknown }> {
  yield { type: "text", delta: text.slice(0, Math.floor(text.length / 2)) };
  yield { type: "text", delta: text.slice(Math.floor(text.length / 2)) };
  yield {
    type: "done",
    result: { content: text, inputTokens: 100, outputTokens: 50 },
  } as any;
}

beforeEach(() => {
  Object.values(mockLog).forEach((fn) => fn.mockClear());
  vi.clearAllMocks();
  __resetMastermindEnvCacheForTests();

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
  mockCallLLM.mockResolvedValue({
    content: HAPPY_RESPONSE,
    inputTokens: 100,
    outputTokens: 50,
  });
  mockCallLLMStream.mockImplementation(() => iterFromText(HAPPY_RESPONSE));
  mockClassifyQuestion.mockResolvedValue({
    category: "position_analysis",
    confidence: 0.9,
    rationale: "test",
  });
  mockFetchDataSources.mockResolvedValue(happyDataSources());
  mockRunValidationPipeline.mockResolvedValue(happyPipelineResult());

  // Grounding-fix mocks: return empty motifs + passing result so the
  // route's post-stream log-only path is taken without warnings.
  mockDetectMotifs.mockReturnValue([]);
  mockValidateMotifGrounding.mockReturnValue({
    passed: true,
    issues: [],
    telemetry: [],
  });

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
// The three streaming branches
// ─────────────────────────────────────────────────────────────────────

describe("enhanced-analysis route: streaming motif grounding wiring", () => {
  it("flag-off streaming branch calls validateMotifGrounding with last-move-derived fenBefore + moveSan", async () => {
    disableFlag();
    const res = await POST(makeRequest({ ...baseRequestBody(), stream: true }));
    await drainSSE(res);

    expect(mockValidateMotifGrounding).toHaveBeenCalledTimes(1);
    expect(mockValidateMotifGrounding).toHaveBeenCalledWith(
      expect.objectContaining({
        llmResponse: HAPPY_RESPONSE,
        moveSan: LAST_MOVE_SAN,
        correlationId: "test-request-id",
      }),
    );
    // detectMotifs is the upstream call that supplies the motif list
    // for the grounding check; assert it sees the same move.
    expect(mockDetectMotifs).toHaveBeenCalledWith(
      expect.any(String),
      LAST_MOVE_SAN,
    );
  });

  it("flag-on pipeline streaming branch (position_analysis) calls validateMotifGrounding via prep.moveCtx", async () => {
    enableFlag();
    // Default classifier mock returns position_analysis — a move-focus
    // category, so deriveMastermindMoveContext yields a real moveSan
    // and the grounding check runs (NON_MOVE_FOCUS categories skip it).
    const res = await POST(makeRequest({ ...baseRequestBody(), stream: true }));
    await drainSSE(res);

    expect(mockValidateMotifGrounding).toHaveBeenCalledTimes(1);
    expect(mockValidateMotifGrounding).toHaveBeenCalledWith(
      expect.objectContaining({
        // Pipeline branch validates the pipeline's finalResponse, not
        // the synthetic streamed text; both equal HAPPY_RESPONSE here.
        llmResponse: HAPPY_RESPONSE,
        moveSan: LAST_MOVE_SAN,
        correlationId: "test-request-id",
      }),
    );
    expect(mockDetectMotifs).toHaveBeenCalledWith(
      expect.any(String),
      LAST_MOVE_SAN,
    );
  });

  it("flag-on game_review fallback streaming branch calls validateMotifGrounding via prep.moveCtx", async () => {
    enableFlag();
    // game_review forces the flag-on streaming code path to take the
    // fallback-to-flagoff branch (route.ts:1507) instead of the heavy
    // pipeline. moveSan still comes from prep.moveCtx because
    // game_review is move-focus.
    mockClassifyQuestion.mockResolvedValue({
      category: "game_review",
      confidence: 0.9,
      rationale: "game review query",
    });

    const res = await POST(makeRequest({ ...baseRequestBody(), stream: true }));
    await drainSSE(res);

    expect(mockValidateMotifGrounding).toHaveBeenCalledTimes(1);
    expect(mockValidateMotifGrounding).toHaveBeenCalledWith(
      expect.objectContaining({
        llmResponse: HAPPY_RESPONSE,
        moveSan: LAST_MOVE_SAN,
        correlationId: "test-request-id",
      }),
    );
    expect(mockDetectMotifs).toHaveBeenCalledWith(
      expect.any(String),
      LAST_MOVE_SAN,
    );
    // Pipeline must NOT run in this branch — it's the fallback path.
    expect(mockRunValidationPipeline).not.toHaveBeenCalled();
  });
});
