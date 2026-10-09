/**
 * Turn 1 off the critical path, through the real route (pathway 4.8a,
 * COACH_TURN1_EARLY_STREAM).
 *
 * The contract is built for real from a hand fixture with one insight, with
 * chessdb mocked (healthy, or held until the test releases it), Lc0 and Maia
 * gated off and the prompt's grounding wait cut to 25 ms. The model writes a
 * prefix and one card.
 *
 * With every source answering in time the flag changes nothing on any
 * branch: the model's input, the frames, the done metadata (but for the prep
 * timing) and what the follow-up context stores are the flag-off ones, on
 * both validator wings, streamed or not. With chessdb held, the flag-off
 * request waits for it before it opens the stream, while with the flag on
 * the model is called during the hold, from a prompt that reads chessdb as
 * unavailable. On the armed contract branch the card waits for the late
 * result, the frames that follow are the flag-off ones in the same order,
 * and the follow-up context gets the contract with chessdb in it.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";

const {
  mockLog,
  mockSession,
  mockCallLLM,
  mockCallLLMStream,
  mockGenerateContextId,
  mockStoreAnalysisContext,
  mockValidateAIResponse,
  mockGetUserById,
  mockGetAdminFirestore,
  mockClassifyQuestion,
  mockFetchDataSources,
  mockRunValidationPipeline,
  mockQueryChessdb,
  mockShouldCallLc0,
  mockQueryLc0,
  mockBuildAsyncSnapshotForMove,
  mockRunStreamingStage9,
} = vi.hoisted(() => ({
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockSession: vi.fn(),
  mockCallLLM: vi.fn(),
  mockCallLLMStream: vi.fn(),
  mockGenerateContextId: vi.fn(),
  mockStoreAnalysisContext: vi.fn(),
  mockValidateAIResponse: vi.fn(),
  mockGetUserById: vi.fn(),
  mockGetAdminFirestore: vi.fn(),
  mockClassifyQuestion: vi.fn(),
  mockFetchDataSources: vi.fn(),
  mockRunValidationPipeline: vi.fn(),
  mockQueryChessdb: vi.fn(),
  mockShouldCallLc0: vi.fn(),
  mockQueryLc0: vi.fn(),
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
  }
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
vi.mock("@/lib/concept/conceptRetrieval", () => ({
  getReinforcements: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/concept/conceptDetector", () => ({
  detectConcepts: vi.fn(() => []),
}));
vi.mock("@/lib/concept/conceptTaxonomy", () => ({
  getConcept: vi.fn(() => undefined),
}));
// The review's own chessdb fetch is the subject. Maia stays gated off, and
// Lc0 is gated on only where a late reading must reach the follow-up context.
vi.mock("@/lib/grounding/chessdb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grounding/chessdb")>()),
  queryChessdb: mockQueryChessdb,
}));
vi.mock("@/lib/grounding/lc0", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grounding/lc0")>()),
  shouldCallLc0: mockShouldCallLc0,
  queryLc0: mockQueryLc0,
}));
vi.mock("@/lib/grounding/maia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grounding/maia")>()),
  shouldCallMaia: () => false,
}));
// The validator path's own grounding fetches are not the subject: stubbed so
// a held chessdb holds only the review's build.
vi.mock("@/lib/grounding/voterSnapshot", () => ({
  buildAsyncSnapshotForMove: mockBuildAsyncSnapshotForMove,
}));
vi.mock("@/lib/mastermind/validators/streamingStage9", () => ({
  runStreamingStage9Validators: mockRunStreamingStage9,
}));
vi.mock("@/lib/contract/turn1Speed", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/contract/turn1Speed")>()),
  TURN1_GROUNDING_WAIT_MS: 25,
}));

import {
  __resetContractEnvCacheForTests,
  __resetMastermindEnvCacheForTests,
} from "@/env";
import { clearCache } from "@/lib/responseCache";
import { buildCoachContract } from "@/lib/contract/builder";
import { renderInsightBlock } from "@/lib/contract/insightGrammar";
import { getFenAtHalfMove } from "@/lib/contract/chessFormat";
import { __resetCircuitBreakers } from "@/lib/grounding/circuitBreaker";
import { __clearChessdbCache } from "@/lib/grounding/chessdb";
import type { ChessdbResult } from "@/lib/grounding/chessdb";
import type { Lc0Result } from "@/lib/grounding/lc0";
import { POST } from "../route";

interface Fixture {
  moveHistory: string[];
  gameEval: unknown;
  playerColor: string;
  username?: string;
  userRating?: number;
  gameHeaders?: Record<string, string>;
}

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "../../../../lib/contract/__tests__/fixtures/08_quiet_positional.json"
    ),
    "utf8"
  )
) as Fixture;

const chessdbOk = (fen: string): ChessdbResult => ({
  fen,
  best_move: "e2e4",
  score_cp: 35,
  outcome: "unclear",
  source: "live",
});

let modelReview = "";

/**
 * What the Mastermind data sources resolve to. Null except on the unarmed
 * branch's tests, where data sources route a game_review to the realtime
 * stream (with none it is the same branch under its other phase name).
 */
let dataSourcesForRun: unknown = null;

function realtimeDataSources() {
  return {
    featureDelta: {},
    pieceRoleDiff: [],
    scout: {
      scout: {},
      collisions: undefined,
      opponentUsername: "SolidSue",
      primaryTimeClass: undefined,
    },
    userHistory: {
      games: [
        {
          pgn: "1. e4 e5",
          white: { name: "QuietCarl" },
          black: { name: "SolidSue" },
        },
      ],
      userName: "QuietCarl",
      nowMs: 1700000000000,
    },
  };
}

async function* modelStream(text: string) {
  for (let i = 0; i < text.length; i += 40) {
    yield { type: "text" as const, delta: text.slice(i, i + 40) };
  }
  yield {
    type: "done" as const,
    result: {
      content: text,
      inputTokens: 100,
      outputTokens: 50,
      model: "test-model",
    },
  };
}

const lc0Ok = (fen: string): Lc0Result => ({
  fen,
  eval_cp: 40,
  best_move: "e2e4",
  nodes: 800,
  model: "test",
  source: "live",
});

/**
 * Holds every chessdb fetch until `release`, and with `lc0` gates Lc0 on and
 * holds its fetches too.
 */
function sourcesHeld(opts: { lc0?: boolean } = {}) {
  const waiting: Array<() => void> = [];
  mockQueryChessdb.mockImplementation(
    (fen: string) =>
      new Promise<ChessdbResult>((resolve) =>
        waiting.push(() => resolve(chessdbOk(fen)))
      )
  );
  if (opts.lc0) {
    mockShouldCallLc0.mockReturnValue(true);
    mockQueryLc0.mockImplementation(
      (fen: string) =>
        new Promise<Lc0Result>((resolve) =>
          waiting.push(() => resolve(lc0Ok(fen)))
        )
    );
  }
  return {
    pending: () => waiting.length,
    release: () => {
      for (const r of waiting.splice(0)) r();
    },
  };
}

function makeRequest(stream: boolean): NextRequest {
  return new NextRequest("http://localhost:3000/api/enhanced-analysis", {
    method: "POST",
    body: JSON.stringify({
      moveHistory: fixture.moveHistory,
      gameEval: fixture.gameEval,
      playerColor: fixture.playerColor,
      username: fixture.username,
      userRating: fixture.userRating,
      gameHeaders: fixture.gameHeaders,
      stream,
    }),
    headers: { "Content-Type": "application/json" },
  });
}

type Frame = { type: string; [k: string]: unknown };

/** Reads SSE frames as they come, so a test can look at them part way. */
function frameReader(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = false;
  const frames: Array<{ raw: string; json: Frame }> = [];
  const readOnce = async () => {
    const { value, done: d } = await reader.read();
    if (d) {
      done = true;
      return;
    }
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      if (p.startsWith("data: ")) {
        frames.push({ raw: p, json: JSON.parse(p.slice(6)) as Frame });
      }
    }
  };
  return {
    frames,
    async all(): Promise<typeof frames> {
      while (!done) await readOnce();
      return frames;
    },
  };
}

/** The frames as compared across runs: only the prep timing is normalised. */
function normalised(frames: Array<{ raw: string; json: Frame }>): string[] {
  return frames.map(({ raw, json }) => {
    if (json.type !== "done") return raw;
    const copy = JSON.parse(JSON.stringify(json)) as {
      metadata?: { pipeline?: { prepMs?: number } };
    };
    if (copy.metadata?.pipeline && "prepMs" in copy.metadata.pipeline) {
      copy.metadata.pipeline.prepMs = 0;
    }
    return `data: ${JSON.stringify(copy)}`;
  });
}

const types = (frames: Array<{ json: Frame }>) =>
  frames.map((f) => f.json.type);

/** What the model was asked, with the abort signal left out. */
function modelInput(call: unknown[] | undefined) {
  const opts = (call?.[0] ?? {}) as Record<string, unknown>;
  return JSON.stringify({
    system: opts.system,
    systemSuffix: opts.systemSuffix,
    messages: opts.messages,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
  });
}

/** What the follow-up context was given, with its timestamp left out. */
function storedContext() {
  const arg = mockStoreAnalysisContext.mock.calls[0]?.[0] as
    | { gameContext: string; compactContract?: unknown }
    | undefined;
  return {
    gameContext: arg?.gameContext,
    compactContract: JSON.stringify(arg?.compactContract ?? null),
  };
}

function setFlags(opts: { validators: boolean; early: boolean }) {
  vi.stubEnv(
    "MASTERMIND_VALIDATORS_ENABLED",
    opts.validators ? "true" : "false"
  );
  vi.stubEnv("COACH_TURN1_EARLY_STREAM", opts.early ? "1" : "0");
  __resetMastermindEnvCacheForTests();
  __resetContractEnvCacheForTests();
}

function resetBetweenRuns() {
  vi.clearAllMocks();
  clearCache();
  __resetCircuitBreakers();
  __clearChessdbCache();
  applyDefaults();
}

/** A streamed request with every source answering at once. */
async function serveHealthy(opts: { validators: boolean; early: boolean }) {
  resetBetweenRuns();
  setFlags(opts);
  mockQueryChessdb.mockImplementation(async (fen: string) => chessdbOk(fen));
  const res = await POST(makeRequest(true));
  expect(res.headers.get("Content-Type")).toContain("text/event-stream");
  const frames = await frameReader(res).all();
  return {
    frames,
    input: modelInput(mockCallLLMStream.mock.calls[0]),
    stored: storedContext(),
  };
}

/** A streamed request whose fetches are held: flag off waits for them before the stream opens. */
async function serveHeldFlagOff(opts: { validators: boolean; lc0?: boolean }) {
  resetBetweenRuns();
  setFlags({ validators: opts.validators, early: false });
  const held = sourcesHeld({ lc0: opts.lc0 });
  let opened = false;
  const responding = POST(makeRequest(true)).then((r) => {
    opened = true;
    return r;
  });
  await new Promise((r) => setTimeout(r, 100));
  expect(held.pending()).toBe(opts.lc0 ? 2 : 1);
  expect(opened).toBe(false);
  expect(mockCallLLMStream).not.toHaveBeenCalled();
  held.release();
  const frames = await frameReader(await responding).all();
  return {
    frames,
    input: modelInput(mockCallLLMStream.mock.calls[0]),
    stored: storedContext(),
  };
}

const textSoFar = (frames: Array<{ json: Frame }>) =>
  frames
    .filter((f) => f.json.type === "text")
    .map((f) => (f.json as unknown as { delta: string }).delta)
    .join("");

/** The same with the flag on: the stream opens during the hold. */
async function serveHeldFlagOn(opts: {
  validators: boolean;
  lc0?: boolean;
  /** Before the release, wait until this text is out. */
  readUntil: string;
  /** Then give the stream this long to send anything it was not holding. */
  graceMs?: number;
  /** Frames expected before the release. */
  beforeRelease: (frames: Array<{ json: Frame }>) => void;
}) {
  resetBetweenRuns();
  setFlags({ validators: opts.validators, early: true });
  const held = sourcesHeld({ lc0: opts.lc0 });
  const res = await POST(makeRequest(true));
  const heldCount = opts.lc0 ? 2 : 1;
  expect(held.pending()).toBe(heldCount);
  const reader = frameReader(res);
  // Read in the background, so the frames show what went out and when.
  const finished = reader.all();
  await vi.waitFor(
    () => expect(textSoFar(reader.frames)).toContain(opts.readUntil),
    { timeout: 20_000, interval: 10 }
  );
  if (opts.graceMs) await new Promise((r) => setTimeout(r, opts.graceMs));
  expect(held.pending()).toBe(heldCount);
  expect(mockCallLLMStream).toHaveBeenCalledTimes(1);
  const input = modelInput(mockCallLLMStream.mock.calls[0]);
  opts.beforeRelease(reader.frames);
  held.release();
  const frames = await finished;
  return { frames, input, stored: storedContext() };
}

function applyDefaults() {
  // The legacy prompt's few-shot examples are drawn at random: pinned, so two
  // requests can be compared byte for byte.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  mockSession.mockResolvedValue({ session: { uid: "test-uid" } });
  mockGetUserById.mockResolvedValue(null);
  mockGenerateContextId.mockReturnValue("test-context-id");
  mockValidateAIResponse.mockReturnValue({
    isValid: true,
    score: 1.0,
    issues: [],
    correctedResponse: modelReview,
  });
  mockCallLLM.mockResolvedValue({
    content: modelReview,
    inputTokens: 100,
    outputTokens: 50,
  });
  mockCallLLMStream.mockImplementation(() => modelStream(modelReview));
  mockClassifyQuestion.mockResolvedValue({
    category: "game_review",
    confidence: 0.9,
    rationale: "test",
  });
  mockFetchDataSources.mockResolvedValue(dataSourcesForRun);
  mockShouldCallLc0.mockReturnValue(false);
  mockQueryLc0.mockResolvedValue(null);
  mockBuildAsyncSnapshotForMove.mockResolvedValue(undefined);
  mockRunStreamingStage9.mockReturnValue({ issues: [], telemetry: [] });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false } as Response));
}

/** Each request builds fixture 08's contract, a fraction of a second, but a test makes several under load. */
const ROUTE_TIMEOUT_MS = 90_000;

beforeAll(async () => {
  // The card the model writes: the fixture's one insight, header and all.
  mockQueryChessdb.mockImplementation(async (fen: string) => chessdbOk(fen));
  const contract = await buildCoachContract({
    moveHistory: fixture.moveHistory,
    gameEval: fixture.gameEval as Parameters<
      typeof buildCoachContract
    >[0]["gameEval"],
    playerColor: fixture.playerColor,
    username: fixture.username,
    userRating: fixture.userRating,
    gameHeaders: fixture.gameHeaders,
    uid: "test-uid",
    identity: {
      fen: getFenAtHalfMove(fixture.moveHistory, fixture.moveHistory.length),
      playerColor: fixture.playerColor,
    },
  });
  expect(contract.insights).toHaveLength(1);
  const insight = contract.insights[0];
  modelReview = [
    "Let's look at the moment the game turned.",
    "",
    renderInsightBlock(
      insight,
      [
        "[WHY]",
        `Idea: You chose ${insight.playedSan} here [F:${insight.factIdPrefix}].`,
        `Problem: ${insight.bestSan ?? insight.playedSan} was the engine's choice [F:${insight.factIdPrefix}].`,
        "[/WHY]",
      ].join("\n")
    ),
  ].join("\n");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  dataSourcesForRun = null;
  vi.stubEnv("CONTRACT_CATEGORIES", "game_review");
  vi.stubEnv("CONTRACT_UIDS", "");
  vi.stubEnv("CONTRACT_REFEREE_MODE", "deterministic");
  resetBetweenRuns();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  clearCache();
  __resetContractEnvCacheForTests();
  __resetMastermindEnvCacheForTests();
});

describe("route: turn 1 early stream, validators on, contract branch armed", () => {
  it(
    "with every source in time, the flag changes no byte of the review",
    async () => {
      const off = await serveHealthy({ validators: true, early: false });
      const on = await serveHealthy({ validators: true, early: true });

      const done = off.frames.find((f) => f.json.type === "done")!
        .json as unknown as {
        metadata: { pipeline: { contractMode: boolean } };
      };
      expect(done.metadata.pipeline.contractMode).toBe(true);
      expect(off.input).toContain("ChessDB");

      expect(on.input).toBe(off.input);
      expect(types(on.frames)).toEqual(types(off.frames));
      expect(normalised(on.frames)).toEqual(normalised(off.frames));
      expect(on.stored).toEqual(off.stored);
      expect(off.stored.compactContract).not.toBe("null");
    },
    ROUTE_TIMEOUT_MS
  );

  it(
    "with chessdb and Lc0 held, the flag opens the stream during the hold and the card waits for the late results",
    async () => {
      const off = await serveHeldFlagOff({ validators: true, lc0: true });
      const on = await serveHeldFlagOn({
        validators: true,
        lc0: true,
        readUntil: "the game turned.",
        // Time enough for the ladder to send the card were it not waiting.
        graceMs: 750,
        beforeRelease: (frames) => {
          // The prefix went out, the card did not: it waits for the result.
          const t = types(frames);
          expect(t[0]).toBe("validating");
          expect(t.slice(1).every((x) => x === "text")).toBe(true);
          expect(textSoFar(frames)).toContain(
            "Let's look at the moment the game turned."
          );
          expect(textSoFar(frames)).not.toContain("[INSIGHT:");
        },
      });

      // The prompt read chessdb as unavailable, the flag-off one as answered.
      expect(off.input).toContain("ChessDB cloud-eval");
      expect(on.input).not.toContain("ChessDB cloud-eval");

      // Once the result lands, the rest of the review is the flag-off one.
      expect(types(on.frames)).toEqual(types(off.frames));
      expect(normalised(on.frames)).toEqual(normalised(off.frames));
      // The follow-up context is grounded in the late results: with Lc0
      // answered, positional claims are no longer forbidden there.
      expect(on.stored.compactContract).toBe(off.stored.compactContract);
      expect(
        JSON.parse(off.stored.compactContract).forbiddenClaimClasses
      ).not.toContain("positional_plan");
    },
    ROUTE_TIMEOUT_MS
  );
});

describe("route: turn 1 early stream, validators on, contract branch unarmed", () => {
  it(
    "with every source in time, the game_review fallback is unchanged",
    async () => {
      dataSourcesForRun = realtimeDataSources();
      vi.stubEnv("CONTRACT_CATEGORIES", "");
      const off = await serveHealthy({ validators: true, early: false });
      vi.stubEnv("CONTRACT_CATEGORIES", "");
      const on = await serveHealthy({ validators: true, early: true });
      const phases = off.frames
        .filter((f) => f.json.type === "validating")
        .map((f) => f.json.phase);
      expect(phases).toContain("realtime-stream");
      expect(off.input).toContain("ChessDB cloud-eval");
      expect(on.input).toBe(off.input);
      expect(normalised(on.frames)).toEqual(normalised(off.frames));
      expect(on.stored).toEqual(off.stored);
    },
    ROUTE_TIMEOUT_MS
  );

  it(
    "with chessdb held, the stream starts during the hold from a prompt without the cloud eval",
    async () => {
      dataSourcesForRun = realtimeDataSources();
      vi.stubEnv("CONTRACT_CATEGORIES", "");
      const off = await serveHeldFlagOff({ validators: true });
      vi.stubEnv("CONTRACT_CATEGORIES", "");
      const on = await serveHeldFlagOn({
        validators: true,
        readUntil: "[/INSIGHT]",
        beforeRelease: (frames) => {
          expect(types(frames).slice(0, 2)).toEqual([
            "validating",
            "validating",
          ]);
          expect(textSoFar(frames)).toContain("[INSIGHT:");
        },
      });
      expect(off.input).toContain("ChessDB cloud-eval");
      expect(on.input).not.toContain("ChessDB cloud-eval");
      expect(types(on.frames)).toEqual(types(off.frames));
    },
    ROUTE_TIMEOUT_MS
  );
});

describe("route: turn 1 early stream, validators off", () => {
  it(
    "streamed, with every source in time, the prompt and the frames are unchanged",
    async () => {
      const off = await serveHealthy({ validators: false, early: false });
      const on = await serveHealthy({ validators: false, early: true });
      expect(off.input).toContain("ChessDB cloud-eval");
      expect(on.input).toBe(off.input);
      expect(normalised(on.frames)).toEqual(normalised(off.frames));
      expect(on.stored).toEqual(off.stored);
    },
    ROUTE_TIMEOUT_MS
  );

  it(
    "streamed, with chessdb held, the stream starts at the wait",
    async () => {
      const off = await serveHeldFlagOff({ validators: false });
      const on = await serveHeldFlagOn({
        validators: false,
        readUntil: "[/INSIGHT]",
        beforeRelease: (frames) => {
          expect(textSoFar(frames)).toContain("[INSIGHT:");
        },
      });
      expect(off.input).toContain("ChessDB cloud-eval");
      expect(on.input).not.toContain("ChessDB cloud-eval");
      expect(types(on.frames)).toEqual(types(off.frames));
    },
    ROUTE_TIMEOUT_MS
  );

  it(
    "not streamed, with every source in time, the prompt and the JSON are unchanged",
    async () => {
      const serveJson = async (early: boolean) => {
        resetBetweenRuns();
        setFlags({ validators: false, early });
        mockQueryChessdb.mockImplementation(async (fen: string) =>
          chessdbOk(fen)
        );
        const res = await POST(makeRequest(false));
        const json = (await res.json()) as Record<string, unknown>;
        return {
          json: normaliseJson(json),
          input: modelInput(mockCallLLM.mock.calls[0]),
          stored: storedContext(),
        };
      };
      const off = await serveJson(false);
      const on = await serveJson(true);
      expect(off.input).toContain("ChessDB cloud-eval");
      expect(on.input).toBe(off.input);
      expect(on.json).toEqual(off.json);
      expect(on.stored).toEqual(off.stored);
    },
    ROUTE_TIMEOUT_MS
  );

  it(
    "not streamed, with chessdb held, the model is asked during the hold",
    async () => {
      resetBetweenRuns();
      setFlags({ validators: false, early: true });
      const held = sourcesHeld();
      const responding = POST(makeRequest(false));
      await vi.waitFor(() => expect(mockCallLLM).toHaveBeenCalledTimes(1), {
        timeout: 20_000,
        interval: 20,
      });
      expect(held.pending()).toBe(1);
      expect(modelInput(mockCallLLM.mock.calls[0])).not.toContain(
        "ChessDB cloud-eval"
      );
      held.release();
      const res = await responding;
      expect(res.status).toBe(200);
    },
    ROUTE_TIMEOUT_MS
  );
});

/** Timing fields in the non-streamed JSON, set to zero for comparison. */
function normaliseJson(json: Record<string, unknown>): unknown {
  return JSON.parse(
    JSON.stringify(json, (key, value) =>
      key === "prepMs" || key === "elapsedMs" ? 0 : value
    )
  );
}
