/**
 * The lean move table through the real route (pathway 4.8b,
 * COACH_TURN1_LEAN_TABLE).
 *
 * The contract is built for real from a real fixture whose move table has
 * better moves with engine lines on plies with no insight, with chessdb
 * mocked healthy and Lc0 and Maia gated off. The model writes a prefix and
 * one card per planned insight.
 *
 * With the flag on, the contract branch's user turn differs from the
 * flag-off one only inside its `moveTable`, where exactly the rows with no
 * insight lose their better move's line and keep the move. The system
 * prompt, the frames served and what the follow-up context stores are the
 * flag-off ones, since the referee and the compact contract read the object.
 * On every branch that sends the legacy prompt (validators off, streamed or
 * not, and the unarmed game_review fallback with validators on) the flag
 * changes no byte.
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
vi.mock("@/lib/grounding/chessdb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grounding/chessdb")>()),
  queryChessdb: mockQueryChessdb,
}));
vi.mock("@/lib/grounding/lc0", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grounding/lc0")>()),
  shouldCallLc0: () => false,
}));
vi.mock("@/lib/grounding/maia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grounding/maia")>()),
  shouldCallMaia: () => false,
}));
vi.mock("@/lib/grounding/voterSnapshot", () => ({
  buildAsyncSnapshotForMove: mockBuildAsyncSnapshotForMove,
}));
vi.mock("@/lib/mastermind/validators/streamingStage9", () => ({
  runStreamingStage9Validators: mockRunStreamingStage9,
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
import type { CoachContract } from "@/lib/contract/types";
import { selectCardInsights } from "@/lib/prompts/verbalizerPrompt";
import { POST } from "../route";

interface Fixture {
  moveHistory: string[];
  gameEval: unknown;
  playerColor: string;
  username?: string;
  userRating?: number;
  gameHeaders?: Record<string, string>;
}

/** Two insights, and two better moves with lines on plies with neither. */
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "../../../../lib/contract/__tests__/fixtures-real/01_mate_for_white_midgame.json"
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
let builtContract: CoachContract;

/**
 * What the Mastermind data sources resolve to. Null except on the unarmed
 * branch's test, where data sources route a game_review to the realtime
 * stream.
 */
let dataSourcesForRun: unknown = null;

function realtimeDataSources() {
  return {
    featureDelta: {},
    pieceRoleDiff: [],
    scout: {
      scout: {},
      collisions: undefined,
      opponentUsername: "Opponent",
      primaryTimeClass: undefined,
    },
    userHistory: {
      games: [
        {
          pgn: "1. e4 e5",
          white: { name: "Player" },
          black: { name: "Opponent" },
        },
      ],
      userName: "Player",
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

async function readFrames(res: Response) {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((p) => p.startsWith("data: "))
    .map((raw) => ({ raw, json: JSON.parse(raw.slice(6)) as Frame }));
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

/** Timing fields in the non-streamed JSON, set to zero for comparison. */
function normaliseJson(json: Record<string, unknown>): unknown {
  return JSON.parse(
    JSON.stringify(json, (key, value) =>
      key === "prepMs" || key === "elapsedMs" ? 0 : value
    )
  );
}

interface ModelInput {
  system?: unknown;
  systemSuffix?: unknown;
  messages?: Array<{ role: string; content: string }>;
  maxTokens?: unknown;
  temperature?: unknown;
}

/** What the model was asked, with the abort signal left out. */
function modelInput(call: unknown[] | undefined): ModelInput {
  const opts = (call?.[0] ?? {}) as Record<string, unknown>;
  return JSON.parse(
    JSON.stringify({
      system: opts.system,
      systemSuffix: opts.systemSuffix,
      messages: opts.messages,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    })
  ) as ModelInput;
}

/** What the follow-up context was given. */
function storedContext() {
  const arg = mockStoreAnalysisContext.mock.calls[0]?.[0] as
    | { gameContext: string; compactContract?: unknown }
    | undefined;
  return {
    gameContext: arg?.gameContext,
    compactContract: JSON.stringify(arg?.compactContract ?? null),
  };
}

function setFlags(opts: { validators: boolean; lean: boolean }) {
  vi.stubEnv(
    "MASTERMIND_VALIDATORS_ENABLED",
    opts.validators ? "true" : "false"
  );
  vi.stubEnv("COACH_TURN1_LEAN_TABLE", opts.lean ? "1" : "0");
  __resetMastermindEnvCacheForTests();
  __resetContractEnvCacheForTests();
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
  mockQueryChessdb.mockImplementation(async (fen: string) => chessdbOk(fen));
  mockBuildAsyncSnapshotForMove.mockResolvedValue(undefined);
  mockRunStreamingStage9.mockReturnValue({ issues: [], telemetry: [] });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false } as Response));
}

function resetBetweenRuns() {
  vi.clearAllMocks();
  clearCache();
  __resetCircuitBreakers();
  __clearChessdbCache();
  applyDefaults();
}

async function serveStreamed(opts: { validators: boolean; lean: boolean }) {
  resetBetweenRuns();
  setFlags(opts);
  const res = await POST(makeRequest(true));
  expect(res.headers.get("Content-Type")).toContain("text/event-stream");
  const frames = await readFrames(res);
  return {
    frames,
    input: modelInput(mockCallLLMStream.mock.calls[0]),
    stored: storedContext(),
  };
}

async function serveJson(lean: boolean) {
  resetBetweenRuns();
  setFlags({ validators: false, lean });
  const res = await POST(makeRequest(false));
  const json = (await res.json()) as Record<string, unknown>;
  return {
    json: normaliseJson(json),
    input: modelInput(mockCallLLM.mock.calls[0]),
    stored: storedContext(),
  };
}

/** The opening of the contract's heading line, its JSON on the next line. */
const CONTRACT_HEAD = "## VERIFIED FACT CONTRACT (JSON";

/** The user turn cut around its contract JSON. */
function splitUserTurn(input: ModelInput) {
  const messages = input.messages ?? [];
  expect(messages).toHaveLength(1);
  const turn = messages[0].content;
  const start = turn.indexOf(CONTRACT_HEAD);
  expect(start).toBeGreaterThanOrEqual(0);
  const jsonStart = turn.indexOf("\n", start) + 1;
  expect(jsonStart).toBeGreaterThan(start);
  const jsonEnd = turn.indexOf("\n\n## ", jsonStart);
  expect(jsonEnd).toBeGreaterThan(jsonStart);
  return {
    before: turn.slice(0, jsonStart),
    json: JSON.parse(turn.slice(jsonStart, jsonEnd)) as Record<string, unknown>,
    after: turn.slice(jsonEnd),
  };
}

interface WireRow {
  ply: number;
  bestWas: { san: string; line: unknown } | null;
}

/** Each request builds fixture 01's contract, a fraction of a second, but a test makes several under load. */
const ROUTE_TIMEOUT_MS = 90_000;

beforeAll(async () => {
  mockQueryChessdb.mockImplementation(async (fen: string) => chessdbOk(fen));
  builtContract = await buildCoachContract({
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
  const carded = new Set(builtContract.insights.map((i) => i.ply));
  // The fixture is here for these rows: the rule has something to cut.
  expect(
    builtContract.moveTable.filter((r) => !carded.has(r.ply) && r.bestWas?.line)
      .length
  ).toBeGreaterThan(0);
  const cards = selectCardInsights(builtContract);
  expect(cards.length).toBeGreaterThan(0);
  modelReview = [
    "Let's look at the moments the game turned on.",
    "",
    ...cards.map((insight) =>
      renderInsightBlock(
        insight,
        [
          "[WHY]",
          `Idea: You chose ${insight.playedSan} here [F:${insight.factIdPrefix}].`,
          `Problem: ${insight.bestSan ?? insight.playedSan} was the engine's choice [F:${insight.factIdPrefix}].`,
          "[/WHY]",
        ].join("\n")
      )
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

describe("route: lean move table, validators on, contract branch armed", () => {
  it(
    "the user turn differs only inside moveTable, and only where the rule cuts",
    async () => {
      const off = await serveStreamed({ validators: true, lean: false });
      const on = await serveStreamed({ validators: true, lean: true });

      const done = off.frames.find((f) => f.json.type === "done")!
        .json as unknown as {
        metadata: { pipeline: { contractMode: boolean } };
      };
      expect(done.metadata.pipeline.contractMode).toBe(true);

      // The system prompt and every call option but the user turn are equal.
      expect({ ...on.input, messages: null }).toEqual({
        ...off.input,
        messages: null,
      });

      const turnOff = splitUserTurn(off.input);
      const turnOn = splitUserTurn(on.input);
      // The user request and the card plan are the flag-off ones.
      expect(turnOn.before).toBe(turnOff.before);
      expect(turnOn.after).toBe(turnOff.after);
      expect(turnOn.after).toContain("## CARD PLAN");
      // Outside moveTable the contract JSON is the flag-off one.
      const { moveTable: rowsOff, ...restOff } = turnOff.json;
      const { moveTable: rowsOn, ...restOn } = turnOn.json;
      expect(JSON.stringify(restOn)).toBe(JSON.stringify(restOff));

      // Inside it, exactly the rows with no insight lose their line.
      const carded = new Set(builtContract.insights.map((i) => i.ply));
      const expected = (rowsOff as WireRow[]).map((row) =>
        !carded.has(row.ply) && row.bestWas?.line
          ? { ...row, bestWas: { ...row.bestWas, line: null } }
          : row
      );
      expect(rowsOn).toEqual(expected);
      expect(rowsOn).not.toEqual(rowsOff);
      for (const row of rowsOn as WireRow[]) {
        if (carded.has(row.ply)) continue;
        if (row.bestWas) expect(row.bestWas.line).toBeNull();
      }

      // The referee and the follow-up read the object: nothing served moves.
      expect(normalised(on.frames)).toEqual(normalised(off.frames));
      expect(on.stored).toEqual(off.stored);
      expect(off.stored.compactContract).not.toBe("null");
    },
    ROUTE_TIMEOUT_MS
  );
});

describe("route: lean move table, the legacy prompt", () => {
  it(
    "validators off, streamed: no byte of the prompt or the frames changes",
    async () => {
      const off = await serveStreamed({ validators: false, lean: false });
      const on = await serveStreamed({ validators: false, lean: true });
      expect(JSON.stringify(off.input)).toContain("Best was:");
      expect(on.input).toEqual(off.input);
      expect(normalised(on.frames)).toEqual(normalised(off.frames));
      expect(on.stored).toEqual(off.stored);
    },
    ROUTE_TIMEOUT_MS
  );

  it(
    "validators off, not streamed: no byte of the prompt or the JSON changes",
    async () => {
      const off = await serveJson(false);
      const on = await serveJson(true);
      expect(JSON.stringify(off.input)).toContain("Best was:");
      expect(on.input).toEqual(off.input);
      expect(on.json).toEqual(off.json);
      expect(on.stored).toEqual(off.stored);
    },
    ROUTE_TIMEOUT_MS
  );

  it(
    "validators on, the unarmed game_review fallback: no byte changes",
    async () => {
      dataSourcesForRun = realtimeDataSources();
      vi.stubEnv("CONTRACT_CATEGORIES", "");
      const off = await serveStreamed({ validators: true, lean: false });
      vi.stubEnv("CONTRACT_CATEGORIES", "");
      const on = await serveStreamed({ validators: true, lean: true });
      const phases = off.frames
        .filter((f) => f.json.type === "validating")
        .map((f) => f.json.phase);
      expect(phases).toContain("realtime-stream");
      expect(JSON.stringify(off.input)).toContain("Best was:");
      expect(on.input).toEqual(off.input);
      expect(normalised(on.frames)).toEqual(normalised(off.frames));
      expect(on.stored).toEqual(off.stored);
    },
    ROUTE_TIMEOUT_MS
  );
});
