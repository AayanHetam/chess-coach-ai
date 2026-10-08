/**
 * The chat route answers an order the page can carry out itself with no
 * model call (lib/coach/pageActions.ts), and only for a page that said it
 * can: everything else is the turn exactly as before, in both validator
 * wings. Nothing the model writes ever becomes an order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockLog,
  mockSession,
  mockCallLLM,
  mockGetAnalysisContext,
  mockValidateAIResponse,
  mockClassifyQuestion,
  mockFetchDataSources,
  mockRunValidationPipeline,
} = vi.hoisted(() => ({
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockSession: vi.fn(),
  mockCallLLM: vi.fn(),
  mockGetAnalysisContext: vi.fn(),
  mockValidateAIResponse: vi.fn(),
  mockClassifyQuestion: vi.fn(),
  mockFetchDataSources: vi.fn(),
  mockRunValidationPipeline: vi.fn(),
}));

vi.mock("@/lib/logging", () => ({
  logger: { child: vi.fn(() => mockLog) },
  withRequestContext: (_id: string, fn: () => unknown) => fn(),
  extractRequestId: () => "page-actions",
  logErrorToSentry: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mockSession }));
vi.mock("@/lib/llmProvider", () => ({
  callLLM: mockCallLLM,
  LLMError: class LLMError extends Error {},
}));
vi.mock("@/lib/analysisContextCache", () => ({
  getAnalysisContext: mockGetAnalysisContext,
  buildCondensedContext: vi.fn(() => "## condensed"),
}));
vi.mock("@/lib/aiResponseValidator", () => ({
  validateAIResponse: mockValidateAIResponse,
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminFirestore: vi.fn(),
  AdminConfigError: class AdminConfigError extends Error {},
  __resetAdminCacheForTests: vi.fn(),
}));
vi.mock(
  "@/lib/mastermind/categorization/categoryClassifier",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/mastermind/categorization/categoryClassifier")
    >()),
    classifyQuestion: mockClassifyQuestion,
  })
);
vi.mock("@/lib/mastermind/wireValidators", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mastermind/wireValidators")>()),
  fetchDataSources: mockFetchDataSources,
}));
vi.mock("@/lib/mastermind/validators", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mastermind/validators")>()),
  runValidationPipeline: mockRunValidationPipeline,
  countScoutOpportunities: vi.fn(() => []),
  countUserHistoryOpportunities: vi.fn(() => []),
}));

import { __resetMastermindEnvCacheForTests } from "@/env";
import { PAGE_TURN_KINDS } from "@/lib/coach/pageActions";
import { POST } from "../route";

/** Fischer v Spassky, 1972, game 6: 81 plies, so move 20 is real (20. e4 d4). */
const LONG =
  "c4 e6 Nf3 d5 d4 Nf6 Nc3 Be7 Bg5 O-O e3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5 Rc1 Be6 Qa4 c5 Qa3 Rc8 Bb5 a6 dxc5 bxc5 O-O Ra7 Be2 Nd7 Nd4 Qf8 Nxe6 fxe6 e4 d4 f4 Qe7 e5 Rb8 Bc4 Kh8 Qh3 Nf8 b3 a5 f5 exf5 Rxf5 Nh7 Rcf1 Qd8 Qg3 Re7 h4 Rbb7 e6 Rbc7 Qe5 Qe8 a4 Qd8 R1f2 Qe8 R2f3 Qd8 Bd3 Qe8 Qe4 Nf6 Rxf6 gxf6 Rxf6 Kg8 Bc4 Kh8 Qf4".split(
    " "
  );
const ANSWER = "The pawn break opened the f-file for White's rooks.";

const context = () => ({
  contextId: "ctx",
  gameContext: "## full",
  compactGameContext: "## compact",
  playedMoves: LONG,
  systemPrompt: "You are a chess coach.",
  fewShotExamples: "",
  fen: "6k1/8/8/8/8/8/8/6K1 w - - 0 1",
  skillLevel: "intermediate" as const,
  playerColor: "w",
  moveCount: 41,
  createdAt: Date.now(),
  initialAnalysis: "Review.",
});

const ask = (userMessage: string, extra: Record<string, unknown> = {}) =>
  POST(
    new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({ contextId: "ctx", userMessage, ...extra }),
      headers: { "Content-Type": "application/json" },
    })
  );
const withKinds = { pageActions: [...PAGE_TURN_KINDS] };

function wing(on: boolean) {
  vi.stubEnv("MASTERMIND_VALIDATORS_ENABLED", on ? "true" : "false");
  __resetMastermindEnvCacheForTests();
}

const modelCalls = () =>
  mockCallLLM.mock.calls.length + mockRunValidationPipeline.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  __resetMastermindEnvCacheForTests();
  mockSession.mockResolvedValue({ session: { uid: "u" } });
  mockGetAnalysisContext.mockReturnValue(context());
  mockValidateAIResponse.mockImplementation((text: string) => ({
    isValid: true,
    score: 1,
    issues: [],
    correctedResponse: text,
  }));
  mockCallLLM.mockResolvedValue({
    content: ANSWER,
    inputTokens: 10,
    outputTokens: 10,
  });
  mockClassifyQuestion.mockResolvedValue({
    category: "position_analysis",
    confidence: 0.9,
    rationale: "t",
  });
  mockFetchDataSources.mockResolvedValue({
    featureDelta: {},
    pieceRoleDiff: [],
    scout: undefined,
    userHistory: undefined,
  });
  mockRunValidationPipeline.mockResolvedValue({
    finalResponse: ANSWER,
    retryCount: 0,
    finalOutcome: "passed_initial",
    cumulativeIssues: [],
    totalCostUsd: 0,
    telemetry: [],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetMastermindEnvCacheForTests();
});

describe.each([
  ["validators on", true],
  ["validators off", false],
])("an order from a page that can carry it out (%s)", (_name, on) => {
  beforeEach(() => wing(on));

  it("is answered with no model call, no classifier, no data fetch and no context, carrying the order and no words", async () => {
    const res = await ask("Flip the board, please", withKinds);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gameAnalysis).toEqual({
      analysis: "",
      served: "page",
      actions: [{ kind: "flip_board" }],
      cached: false,
      fastPath: true,
      timing: expect.objectContaining({ llmMs: 0, prepMs: 0 }),
    });
    expect(modelCalls()).toBe(0);
    expect(mockClassifyQuestion).not.toHaveBeenCalled();
    expect(mockFetchDataSources).not.toHaveBeenCalled();
    expect(mockGetAnalysisContext).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith(
      "chat_fastpath_timing",
      expect.objectContaining({ branch: "page" })
    );
  });

  it("a move number is sent as written: the page finds the ply in its own game", async () => {
    const json = await (await ask("go to black's move 20", withKinds)).json();
    expect(json.gameAnalysis.actions).toEqual([
      { kind: "go_to_move", moveNumber: 20, color: "b" },
    ]);
    expect(json.gameAnalysis.anchor).toBeUndefined();
    expect(modelCalls()).toBe(0);
  });

  it("a side statement is a preference, served the same way", async () => {
    const json = await (await ask("coach me as Black", withKinds)).json();
    expect(json.gameAnalysis.served).toBe("page");
    expect(json.gameAnalysis.preference).toEqual({
      kind: "side",
      color: "b",
      bare: false,
    });
    expect(json.gameAnalysis.actions).toBeUndefined();
    expect(modelCalls()).toBe(0);
  });

  it("an evicted context still gets its order: the page is not sent back for a full review", async () => {
    mockGetAnalysisContext.mockReturnValue(undefined);
    const res = await ask("go to the start", withKinds);
    expect(res.status).toBe(200);
    expect((await res.json()).gameAnalysis.actions).toEqual([
      { kind: "go_to_start" },
    ]);
  });

  it("'why was move 20 bad?' still reaches the coach, anchored on move 20, with no order", async () => {
    const json = await (await ask("why was move 20 bad?", withKinds)).json();
    expect(modelCalls()).toBe(1);
    expect(json.gameAnalysis.served).toBeUndefined();
    expect(json.gameAnalysis.actions).toBeUndefined();
    expect(json.gameAnalysis.anchor).toMatchObject({
      ply: 39,
      moveNumber: 20,
      color: "w",
      san: "e4",
    });
  });

  it("an order with a question after it is a question: the coach answers, and the anchor moves the board", async () => {
    const json = await (
      await ask("go to move 20 and tell me why it was bad", withKinds)
    ).json();
    expect(modelCalls()).toBe(1);
    expect(json.gameAnalysis.served).toBeUndefined();
    expect(json.gameAnalysis.anchor).toMatchObject({ ply: 39 });
  });

  it("a colour on its own is left to the page, which knows whether it asked", async () => {
    const json = await (await ask("black", withKinds)).json();
    expect(modelCalls()).toBe(1);
    expect(json.gameAnalysis.served).toBeUndefined();
  });

  it("a kind the page did not list is not served", async () => {
    const json = await (
      await ask("go to move 20", { pageActions: ["flip_board"] })
    ).json();
    expect(modelCalls()).toBe(1);
    expect(json.gameAnalysis.served).toBeUndefined();
  });

  it("nothing the model writes becomes an order", async () => {
    mockCallLLM.mockResolvedValue({
      content: "Flip the board. Go to move 3. Play the line again.",
      inputTokens: 1,
      outputTokens: 1,
    });
    mockRunValidationPipeline.mockResolvedValue({
      finalResponse: "Flip the board. Go to move 3. Play the line again.",
      retryCount: 0,
      finalOutcome: "passed_initial",
      cumulativeIssues: [],
      totalCostUsd: 0,
      telemetry: [],
    });
    const json = await (await ask("what is the plan here?", withKinds)).json();
    expect(modelCalls()).toBe(1);
    expect(json.gameAnalysis.served).toBeUndefined();
    expect(json.gameAnalysis.actions).toBeUndefined();
    expect(json.gameAnalysis.preference).toBeUndefined();
  });
});

describe.each([
  ["validators on", true],
  ["validators off", false],
])("a page that did not say it can (%s): the turn as before", (_name, on) => {
  beforeEach(() => wing(on));

  for (const [label, extra] of [
    ["no field", {}],
    ["true", { pageActions: true }],
    ["a string", { pageActions: "flip_board" }],
    ["unknown names", { pageActions: ["spin", 3] }],
    ["an empty list", { pageActions: [] }],
  ] as const)
    it(`${label}: "flip the board" goes to the coach, never a 400`, async () => {
      const res = await ask("flip the board", extra);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(modelCalls()).toBe(1);
      expect(json.gameAnalysis.analysis).toBe(ANSWER);
      expect(json.gameAnalysis.served).toBeUndefined();
      expect(json.gameAnalysis.actions).toBeUndefined();
      // The shadow router's reading is unchanged.
      expect(json.gameAnalysis.intent).toMatchObject({
        intent: "action",
        rule: "action:flip",
      });
    });

  it("'go to move 20' is a question with an anchor, exactly as before", async () => {
    const json = await (await ask("go to move 20")).json();
    expect(modelCalls()).toBe(1);
    expect(json.gameAnalysis.anchor).toMatchObject({ ply: 39 });
    expect(json.gameAnalysis.intent).toMatchObject({
      intent: "action",
      action: { kind: "go_to_ply", ply: 39 },
    });
  });
});
