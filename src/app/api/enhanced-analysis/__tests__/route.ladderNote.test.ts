/**
 * The ladder's note through the real route (pathway 4.9, COACH_LADDER_NOTE).
 *
 * The contract branch driven end to end: fixture 07's contract built for
 * real (chessdb offline), the deterministic referee, the shipping arming
 * table, and a model that writes one card under a garbled header, so it is
 * anchored by order to the plan's first card, 6. Na3, played with Black's
 * queen on b2 free to take. Its lede holds one fabricated evaluation, which
 * the ladder drops. With the flag off the
 * served text is pinned to a hash generated before the change
 * (golden/ladder-note-route.json, written by GOLDEN_WRITE=<path> at ff30930
 * and 72261a8, which agree). With it on, the card carries one line between
 * its lede and [WHY], the streamed text is the stored text (the chat
 * route's de-dupe of the review needs that), and the noted review is cached
 * under its own key. The validators-off wing and the pipeline path never
 * reach the ladder, so the flag changes no byte there. The mock surface is
 * route.test.ts's, with the real responseCache.
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
import { createHash } from "node:crypto";
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

import {
  __resetContractEnvCacheForTests,
  __resetMastermindEnvCacheForTests,
} from "@/env";
import { clearCache } from "@/lib/responseCache";
import {
  __clearChessdbCache,
  __resetFetchForTesting,
  __setFetchForTesting,
} from "@/lib/grounding/chessdb";
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
      "../../../../lib/contract/__tests__/fixtures-real/07_knight_fork.json"
    ),
    "utf8"
  )
) as Fixture;

const GOLDEN = path.join(__dirname, "golden", "ladder-note-route.json");
const WRITING = !!process.env.GOLDEN_WRITE;

const NOTE = "I left out an evaluation I couldn't check.";

/**
 * The model's review: a prefix and one card under a header the route cannot
 * read, so the stream anchors it by order. The lede's second sentence is a
 * fabricated evaluation (6. Na3 took White from +7.16 to -2.78).
 */
const MODEL_REVIEW = [
  "Let's walk through it.",
  "",
  "[INSIGHT:garbled]",
  "You moved the knight, but Black's queen on b2 could simply be taken. The eval crashed to -37.25 here.",
  "[WHY]",
  "Idea: You wanted to bring the knight into play with 6. Na3.",
  "Problem: The bishop on c1 could take the queen on b2, and 6. Bxb2 wins it outright.",
  "Before you make a plan, check whether a piece of theirs can be taken.",
  "[/WHY]",
  "[/INSIGHT]",
].join("\n");

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

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/enhanced-analysis", {
    method: "POST",
    body: JSON.stringify({
      moveHistory: fixture.moveHistory,
      gameEval: fixture.gameEval,
      playerColor: fixture.playerColor,
      username: fixture.username,
      userRating: fixture.userRating,
      gameHeaders: fixture.gameHeaders,
      stream: true,
    }),
    headers: { "Content-Type": "application/json" },
  });
}

type Frame = { type: string; [k: string]: unknown };

async function readFrames(
  res: Response
): Promise<Array<{ raw: string; json: Frame }>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const out: Array<{ raw: string; json: Frame }> = [];
  // eslint-disable-next-line no-constant-condition -- read until the stream reports done.
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      if (!p.startsWith("data: ")) continue;
      out.push({ raw: p, json: JSON.parse(p.slice(6)) as Frame });
    }
  }
  return out;
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

const joinedText = (frames: Array<{ json: Frame }>) =>
  frames
    .filter((f) => f.json.type === "text")
    .map((f) => (f.json as unknown as { delta: string }).delta)
    .join("");

interface DoneFrame {
  metadata: {
    analysis: string;
    pipeline?: { contractMode?: boolean };
    contract?: {
      cached: boolean;
      refereeOutcomes: Array<{ factIdPrefix: string; stage: string }>;
    };
  };
}
const doneOf = (frames: Array<{ json: Frame }>) =>
  frames.find((f) => f.json.type === "done")!.json as unknown as DoneFrame;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function serve(opts: { validators: boolean; note: boolean }) {
  vi.stubEnv(
    "MASTERMIND_VALIDATORS_ENABLED",
    opts.validators ? "true" : "false"
  );
  vi.stubEnv("COACH_LADDER_NOTE", opts.note ? "1" : undefined);
  __resetMastermindEnvCacheForTests();
  mockStoreAnalysisContext.mockClear();
  mockCallLLMStream.mockClear();
  const res = await POST(makeRequest());
  expect(res.headers.get("Content-Type")).toContain("text/event-stream");
  const frames = await readFrames(res);
  const stored = mockStoreAnalysisContext.mock.calls.at(-1)?.[0] as
    | { initialAnalysis?: string }
    | undefined;
  return {
    frames,
    initialAnalysis: stored?.initialAnalysis,
    streamCalls: mockCallLLMStream.mock.calls.length,
  };
}

/** Each request builds fixture 07's contract (about 3 s alone), so a test of several is given room. */
const ROUTE_TIMEOUT_MS = 90_000;

beforeAll(() => {
  __setFetchForTesting(async () => {
    throw new Error("network disabled in route ladder-note tests");
  });
});
afterAll(() => __resetFetchForTesting());

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  __clearChessdbCache();
  vi.stubEnv("CONTRACT_CATEGORIES", "game_review");
  vi.stubEnv("CONTRACT_UIDS", "");
  vi.stubEnv("CONTRACT_REFEREE_MODE", "deterministic");
  vi.stubEnv("COACH_TURN1_MOMENTS", undefined);
  __resetContractEnvCacheForTests();
  __resetMastermindEnvCacheForTests();

  mockSession.mockResolvedValue({ session: { uid: "test-uid" } });
  mockGetUserById.mockResolvedValue(null);
  mockGenerateContextId.mockReturnValue("test-context-id");
  mockValidateAIResponse.mockReturnValue({
    isValid: true,
    score: 1.0,
    issues: [],
    correctedResponse: MODEL_REVIEW,
  });
  mockCallLLM.mockResolvedValue({
    content: MODEL_REVIEW,
    inputTokens: 100,
    outputTokens: 50,
  });
  mockCallLLMStream.mockImplementation(() => modelStream(MODEL_REVIEW));
  mockClassifyQuestion.mockResolvedValue({
    category: "game_review",
    confidence: 0.9,
    rationale: "test",
  });
  mockFetchDataSources.mockResolvedValue(null);
  mockRunValidationPipeline.mockResolvedValue({
    finalResponse: MODEL_REVIEW,
    retryCount: 0,
    finalOutcome: "passed_initial",
    cumulativeIssues: [],
    totalCostUsd: 0,
    telemetry: [],
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false } as Response));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  clearCache();
  __resetContractEnvCacheForTests();
  __resetMastermindEnvCacheForTests();
});

describe("route: the ladder's note, flag off", () => {
  it(
    "every wing serves the text it served before the change",
    async () => {
      const legacy = await serve({ validators: false, note: false });
      clearCache();
      vi.stubEnv("CONTRACT_CATEGORIES", "");
      __resetContractEnvCacheForTests();
      const pipeline = await serve({ validators: true, note: false });
      clearCache();
      vi.stubEnv("CONTRACT_CATEGORIES", "game_review");
      __resetContractEnvCacheForTests();
      const armed = await serve({ validators: true, note: false });

      const armedDone = doneOf(armed.frames);
      expect(armedDone.metadata.pipeline?.contractMode).toBe(true);
      expect(armedDone.metadata.contract?.refereeOutcomes).toEqual([
        {
          factIdPrefix: "M1",
          stage: "sentence_drop",
          errorsInitial: 1,
          warnsInitial: expect.any(Number),
        },
      ]);
      const armedText = joinedText(armed.frames);
      expect(armedText).toContain("[INSIGHT:6:w:blunder:+7.16:-2.78:Na3:Bxb2]");
      expect(armedText).not.toContain("-37.25");
      expect(armedText).not.toContain("couldn't check");
      expect(armedDone.metadata.analysis).toBe(armedText);
      expect(armed.initialAnalysis).toBe(armedText);
      expect(doneOf(legacy.frames).metadata.contract).toBeUndefined();
      expect(doneOf(pipeline.frames).metadata.contract).toBeUndefined();

      const hashes = {
        armedText: sha(armedText),
        pipelineText: sha(joinedText(pipeline.frames)),
        legacyText: sha(joinedText(legacy.frames)),
      };
      if (WRITING) {
        fs.writeFileSync(
          process.env.GOLDEN_WRITE!,
          JSON.stringify(hashes, null, 2) + "\n"
        );
        return;
      }
      expect(hashes).toEqual(JSON.parse(fs.readFileSync(GOLDEN, "utf8")));
    },
    ROUTE_TIMEOUT_MS
  );

  it(
    "validators off: the env changes no byte and the evaluation is served as written",
    async () => {
      const off = await serve({ validators: false, note: false });
      clearCache();
      const on = await serve({ validators: false, note: true });
      expect(normalised(on.frames)).toEqual(normalised(off.frames));
      expect(joinedText(on.frames)).toContain(
        "The eval crashed to -37.25 here."
      );
      expect(joinedText(on.frames)).not.toContain("couldn't check");
    },
    ROUTE_TIMEOUT_MS
  );

  it(
    "validators on with no category armed: the pipeline path, the env changes no byte",
    async () => {
      vi.stubEnv("CONTRACT_CATEGORIES", "");
      __resetContractEnvCacheForTests();
      const off = await serve({ validators: true, note: false });
      clearCache();
      const on = await serve({ validators: true, note: true });
      expect(normalised(on.frames)).toEqual(normalised(off.frames));
      expect(joinedText(on.frames)).not.toContain("couldn't check");
    },
    ROUTE_TIMEOUT_MS
  );
});

describe.skipIf(WRITING)("route: the ladder's note, flag on", () => {
  it(
    "the card carries one line between its lede and [WHY], and the streamed text is the stored text",
    async () => {
      const off = await serve({ validators: true, note: false });
      clearCache();
      const on = await serve({ validators: true, note: true });
      const text = joinedText(on.frames);
      const lines = text.split("\n");
      expect(lines.filter((l) => l.includes("couldn't check"))).toEqual([NOTE]);
      const at = lines.indexOf(NOTE);
      expect(lines[at - 1]).toBe(
        "You moved the knight, but Black's queen on b2 could simply be taken."
      );
      expect(lines[at + 1]).toBe("[WHY]");
      expect(lines[at - 2]).toBe("[INSIGHT:6:w:blunder:+7.16:-2.78:Na3:Bxb2]");
      expect(doneOf(on.frames).metadata.analysis).toBe(text);
      expect(on.initialAnalysis).toBe(text);
      expect(lines.filter((l) => l !== NOTE).join("\n")).toBe(
        joinedText(off.frames)
      );
      const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
      expect(sha(joinedText(off.frames))).toBe(golden.armedText);
    },
    ROUTE_TIMEOUT_MS
  );

  it(
    "a noted review is served from its own cache entry, and the flag-off review never is",
    async () => {
      const first = await serve({ validators: true, note: true });
      expect(first.streamCalls).toBe(1);
      expect(doneOf(first.frames).metadata.contract?.cached).toBe(false);

      const hit = await serve({ validators: true, note: true });
      expect(hit.streamCalls).toBe(0);
      expect(doneOf(hit.frames).metadata.contract?.cached).toBe(true);
      expect(joinedText(hit.frames)).toBe(joinedText(first.frames));
      expect(hit.initialAnalysis).toBe(joinedText(first.frames));

      const offAfter = await serve({ validators: true, note: false });
      expect(offAfter.streamCalls).toBe(1);
      expect(doneOf(offAfter.frames).metadata.contract?.cached).toBe(false);
      expect(joinedText(offAfter.frames)).not.toContain("couldn't check");
      const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
      expect(sha(joinedText(offAfter.frames))).toBe(golden.armedText);
    },
    ROUTE_TIMEOUT_MS
  );
});
