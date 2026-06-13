/**
 * Stage 9 v2 — async-grounding wiring call-semantics tests.
 *
 * Sibling of streamingGroundingValidation.test.ts (same mock surface).
 * Covers the buildAsyncSnapshotForMove swap across the route's Stage 9
 * sites (PR_STAGE9_ASYNC_GROUNDING_PLAN.md), which the streamingStage9
 * test header tracked as the v2 follow-up:
 *
 * 1. flag-off streaming — snapshot kicked off pre-stream from
 *    moveHistory/gameEval, consumed post-stream (branch "stream-flagoff").
 * 2. flag-on pipeline streaming — snapshot awaited pre-pipeline, passed
 *    into runValidationPipeline, REUSED (same object) by the post-pipeline
 *    log-only re-check (branch "stream-flagon-pipeline").
 * 3. flag-on game_review fallback streaming — snapshot kicked off
 *    pre-stream, consumed post-stream (branch "stream-flagon-fallback").
 * 4. non-streaming flag-on — snapshot awaited pre-pipeline, reused by the
 *    post-pipeline re-check (branch "non-streaming-flagon").
 *
 * Also asserts the two data-correctness contracts of the swap:
 * - the BEFORE-move eval (gameEval.positions[len-1]) feeds the snapshot,
 *   not the after-move eval (positions[len]) — mixing them would make
 *   lc0AgreesWithSf compare two different positions;
 * - the Q5 rating fallback: gameHeaders Elo for the player color is used
 *   when neither body userRating nor profile rating is present.
 *
 * Helper-internal behavior (gating, fail-open, telemetry) is covered by
 * src/lib/grounding/__tests__/buildAsyncSnapshotForMove.test.ts.
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
// Mock surface — mirrors streamingGroundingValidation.test.ts, plus
// voterSnapshot (buildAsyncSnapshotForMove) + streamingStage9 so we can
// assert call args and snapshot reuse without real network/voter work.
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
  mockBuildAsyncSnapshotForMove,
  mockRunStreamingStage9,
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
  mockBuildAsyncSnapshotForMove: vi.fn(),
  mockRunStreamingStage9: vi.fn(),
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
vi.mock("@/lib/tactics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tactics")>();
  return { ...actual, detectMotifs: mockDetectMotifs };
});
vi.mock("@/lib/mastermind/validators/motifGrounding", () => ({
  validateMotifGrounding: mockValidateMotifGrounding,
}));
// Stage 9 v2 mocks — the subjects of this suite.
vi.mock("@/lib/grounding/voterSnapshot", () => ({
  buildAsyncSnapshotForMove: mockBuildAsyncSnapshotForMove,
}));
vi.mock("@/lib/mastermind/validators/streamingStage9", () => ({
  runStreamingStage9Validators: mockRunStreamingStage9,
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
// Fixtures + helpers (subset of streamingGroundingValidation.test.ts)
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

// positions[i] = eval after i half-moves. positions[3] is therefore the
// position BEFORE the last move (Nc6) and positions[4] the position after
// it. The before/after cp values are deliberately distinct so the tests
// can detect an indexing regression.
const BEFORE_CP = 111;
const AFTER_CP = 222;
const BEFORE_LINES = [
  { cp: BEFORE_CP, pv: ["b8c6", "d2d4"] },
  { cp: BEFORE_CP - 20, pv: ["g8f6"] },
];
const GAME_EVAL = {
  positions: [
    { lines: [{ cp: 10, pv: ["e2e4"] }] },
    { lines: [{ cp: 20, pv: ["e7e5"] }] },
    { lines: [{ cp: 30, pv: ["g1f3"] }] },
    { lines: BEFORE_LINES },
    { lines: [{ cp: AFTER_CP, pv: ["d2d4"] }] },
  ],
};

const CANNED_SNAPSHOT = {
  confidence: {
    user_visibility: "NONE",
    positional_plan: "NONE",
    mate_in_n: "NONE",
    material_win: "NONE",
  },
  maiaProb: 0.42,
  userRating: 1500,
  sfCp: BEFORE_CP,
  sfMate: null,
  lc0Cp: null,
  syzygyDtm: null,
} as const;

function baseRequestBody(overrides: Record<string, unknown> = {}) {
  return {
    userMessage: "tell me about this position",
    moveHistory: MOVE_HISTORY,
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1",
    playerColor: "w",
    username: "TestUser",
    userRating: 1500,
    gameEval: GAME_EVAL,
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

  mockDetectMotifs.mockReturnValue([]);
  mockValidateMotifGrounding.mockReturnValue({
    passed: true,
    issues: [],
    telemetry: [],
  });

  mockBuildAsyncSnapshotForMove.mockResolvedValue(CANNED_SNAPSHOT);

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
// The four Stage 9 wiring sites
// ─────────────────────────────────────────────────────────────────────

describe("enhanced-analysis route: Stage 9 async-grounding wiring", () => {
  it("flag-off streaming: snapshot built from before-move eval, validators get it (branch stream-flagoff)", async () => {
    disableFlag();
    const res = await POST(makeRequest({ ...baseRequestBody(), stream: true }));
    await drainSSE(res);

    expect(mockBuildAsyncSnapshotForMove).toHaveBeenCalledTimes(1);
    expect(mockBuildAsyncSnapshotForMove).toHaveBeenCalledWith(
      expect.objectContaining({
        moveSan: LAST_MOVE_SAN,
        stockfishEvalCp: BEFORE_CP, // positions[3], NOT the after-move 222
        stockfishLines: BEFORE_LINES,
        userRating: 1500,
        branch: "stream-flagoff",
        correlationId: "test-request-id",
      }),
    );
    // M1 pin: the snapshot fetch is kicked off BEFORE the stream starts, so its
    // grounding fetches overlap the LLM stream (Q3 "A-lite") — NOT awaited
    // lazily at the post-stream consumption point, which would add its full
    // latency to time-to-done. A regression flips this invocation order.
    expect(mockBuildAsyncSnapshotForMove.mock.invocationCallOrder[0]).toBeLessThan(
      mockCallLLMStream.mock.invocationCallOrder[0],
    );
    expect(mockRunStreamingStage9).toHaveBeenCalledTimes(1);
    expect(mockRunStreamingStage9).toHaveBeenCalledWith(
      expect.objectContaining({
        llmResponse: HAPPY_RESPONSE,
        voterSnapshot: CANNED_SNAPSHOT,
        moveSan: LAST_MOVE_SAN,
        branch: "stream-flagoff",
      }),
    );
  });

  it("flag-on pipeline streaming: ONE snapshot feeds runValidationPipeline AND the post-pipeline re-check (reuse, no rebuild)", async () => {
    enableFlag();
    const res = await POST(makeRequest({ ...baseRequestBody(), stream: true }));
    await drainSSE(res);

    // Built exactly once — the post-pipeline re-check must reuse it.
    expect(mockBuildAsyncSnapshotForMove).toHaveBeenCalledTimes(1);
    expect(mockBuildAsyncSnapshotForMove).toHaveBeenCalledWith(
      expect.objectContaining({
        moveSan: LAST_MOVE_SAN,
        stockfishEvalCp: BEFORE_CP,
        stockfishLines: BEFORE_LINES,
        branch: "stream-flagon-pipeline",
      }),
    );

    // The pipeline received the snapshot (enforcement path)...
    expect(mockRunValidationPipeline).toHaveBeenCalledTimes(1);
    expect(
      mockRunValidationPipeline.mock.calls[0][0].voterSnapshot,
    ).toBe(CANNED_SNAPSHOT);

    // ...and the post-pipeline log-only re-check got the SAME object.
    expect(mockRunStreamingStage9).toHaveBeenCalledTimes(1);
    expect(
      mockRunStreamingStage9.mock.calls[0][0].voterSnapshot,
    ).toBe(CANNED_SNAPSHOT);
    expect(mockRunStreamingStage9.mock.calls[0][0].branch).toBe(
      "stream-flagon-pipeline",
    );
  });

  it("flag-on game_review fallback streaming: snapshot kicked off pre-stream, consumed post-stream (branch stream-flagon-fallback)", async () => {
    enableFlag();
    mockClassifyQuestion.mockResolvedValue({
      category: "game_review",
      confidence: 0.9,
      rationale: "game review query",
    });

    const res = await POST(makeRequest({ ...baseRequestBody(), stream: true }));
    await drainSSE(res);

    expect(mockBuildAsyncSnapshotForMove).toHaveBeenCalledTimes(1);
    expect(mockBuildAsyncSnapshotForMove).toHaveBeenCalledWith(
      expect.objectContaining({
        moveSan: LAST_MOVE_SAN,
        stockfishEvalCp: BEFORE_CP,
        branch: "stream-flagon-fallback",
      }),
    );
    // M1 pin (game_review fallback): snapshot kicked off pre-stream, overlapping
    // the LLM stream — invocation must precede the stream call.
    expect(mockBuildAsyncSnapshotForMove.mock.invocationCallOrder[0]).toBeLessThan(
      mockCallLLMStream.mock.invocationCallOrder[0],
    );
    expect(mockRunStreamingStage9).toHaveBeenCalledTimes(1);
    expect(mockRunStreamingStage9).toHaveBeenCalledWith(
      expect.objectContaining({
        voterSnapshot: CANNED_SNAPSHOT,
        branch: "stream-flagon-fallback",
      }),
    );
    expect(mockRunValidationPipeline).not.toHaveBeenCalled();
  });

  it("non-streaming flag-on: ONE snapshot feeds the pipeline and the post-pipeline re-check (branch non-streaming-flagon)", async () => {
    enableFlag();
    await POST(makeRequest(baseRequestBody())); // no stream flag → JSON path

    expect(mockBuildAsyncSnapshotForMove).toHaveBeenCalledTimes(1);
    expect(mockBuildAsyncSnapshotForMove).toHaveBeenCalledWith(
      expect.objectContaining({
        moveSan: LAST_MOVE_SAN,
        stockfishEvalCp: BEFORE_CP,
        stockfishLines: BEFORE_LINES,
        branch: "non-streaming-flagon",
      }),
    );
    expect(
      mockRunValidationPipeline.mock.calls[0][0].voterSnapshot,
    ).toBe(CANNED_SNAPSHOT);
    expect(mockRunStreamingStage9).toHaveBeenCalledTimes(1);
    expect(
      mockRunStreamingStage9.mock.calls[0][0].voterSnapshot,
    ).toBe(CANNED_SNAPSHOT);
    expect(mockRunStreamingStage9.mock.calls[0][0].branch).toBe(
      "non-streaming-flagon",
    );
  });

  it("NON_MOVE_FOCUS category: no snapshot is built and Stage 9 validators never run", async () => {
    enableFlag();
    mockClassifyQuestion.mockResolvedValue({
      category: "improvement_strategy",
      confidence: 0.9,
      rationale: "no move anchor",
    });

    const res = await POST(makeRequest({ ...baseRequestBody(), stream: true }));
    await drainSSE(res);

    expect(mockBuildAsyncSnapshotForMove).not.toHaveBeenCalled();
    expect(mockRunStreamingStage9).not.toHaveBeenCalled();
  });

  it("Q5 rating fallback: gameHeaders Elo for the player color reaches the snapshot when body + profile ratings are absent", async () => {
    disableFlag();
    const body = baseRequestBody({ stream: true, gameHeaders: { whiteElo: "1850", blackElo: "1700" } });
    delete (body as Record<string, unknown>).userRating;

    const res = await POST(makeRequest(body));
    await drainSSE(res);

    expect(mockBuildAsyncSnapshotForMove).toHaveBeenCalledWith(
      expect.objectContaining({ userRating: 1850 }), // playerColor "w" → whiteElo
    );
  });

  it("Q5 rating fallback: junk header Elo is ignored (userRating null)", async () => {
    disableFlag();
    const body = baseRequestBody({ stream: true, gameHeaders: { whiteElo: "?" } });
    delete (body as Record<string, unknown>).userRating;

    const res = await POST(makeRequest(body));
    await drainSSE(res);

    expect(mockBuildAsyncSnapshotForMove).toHaveBeenCalledWith(
      expect.objectContaining({ userRating: null }),
    );
  });

  it("grounding failure is fail-open: snapshot promise rejection does not break the stream and validators are skipped", async () => {
    disableFlag();
    mockBuildAsyncSnapshotForMove.mockRejectedValue(new Error("grounding down"));

    const res = await POST(makeRequest({ ...baseRequestBody(), stream: true }));
    await drainSSE(res); // would hang/error if the rejection escaped

    expect(res.status).toBe(200);
    expect(mockRunStreamingStage9).not.toHaveBeenCalled();
  });
});
