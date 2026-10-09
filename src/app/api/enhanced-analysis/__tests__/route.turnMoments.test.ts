/**
 * Turn-1 moments through the real route (pathway 4.1, COACH_TURN1_MOMENTS).
 *
 * The contract branch driven end to end: fixture 07's contract built for
 * real (chessdb offline), game_review armed, the deterministic referee, and
 * a model that writes one card, M2 (8. Nc7+). With the flag on every frame
 * but the moments is byte for byte the flag-off frame, each moment comes
 * just before the text frame whose card hashes to its key, and a repeated
 * request sends the cached moments before the cached text. With the
 * validators off the route never enforces, so the flag changes nothing.
 * The mock surface is route.test.ts's, with the real responseCache.
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
import { LIFTED_STAGES } from "@/lib/contract/turnMoments";
import { cardKey } from "@/lib/coach/turnMoment";
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

/** The model's review: a prefix and M2's card, with no eval and no tactical word in it. */
const MODEL_REVIEW = [
  "Let's look at the moment the game turned.",
  "",
  "[INSIGHT:8:w:blunder:+2.84:-2.11:Nc7+:Qxc1]",
  "You went for the check, but a bigger prize was waiting on c1.",
  "[WHY]",
  "Idea: You wanted to chase the king with 8. Nc7+ and win the rook on a8.",
  "Problem: Black's queen on c1 had no defender, and 8. Qxc1 takes it.",
  "Solution: 8. Qxc1 comes first, and the line goes on with Rb8 9. Qf4.",
  "The takeaway: take the free queen before you start a combination.",
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

function requestBody() {
  return {
    moveHistory: fixture.moveHistory,
    gameEval: fixture.gameEval,
    playerColor: fixture.playerColor,
    username: fixture.username,
    userRating: fixture.userRating,
    gameHeaders: fixture.gameHeaders,
    stream: true,
  };
}

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/enhanced-analysis", {
    method: "POST",
    body: JSON.stringify(requestBody()),
    headers: { "Content-Type": "application/json" },
  });
}

type Frame = { type: string; [k: string]: unknown };

/** The raw SSE frames, each as its exact `data:` line, and parsed. */
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

async function serve(opts: { validators: boolean; moments: boolean }) {
  vi.stubEnv(
    "MASTERMIND_VALIDATORS_ENABLED",
    opts.validators ? "true" : "false"
  );
  vi.stubEnv("COACH_TURN1_MOMENTS", opts.moments ? "1" : "0");
  __resetMastermindEnvCacheForTests();
  const res = await POST(makeRequest());
  expect(res.headers.get("Content-Type")).toContain("text/event-stream");
  return readFrames(res);
}

/** Each request builds fixture 07's contract (about 3 s alone), so a test of three is given room. */
const ROUTE_TIMEOUT_MS = 90_000;

const momentFrames = <F extends { json: Frame }>(frames: F[]): F[] =>
  frames.filter((f) => f.json.type === "moment");

beforeAll(() => {
  __setFetchForTesting(async () => {
    throw new Error("network disabled in route turn-moment tests");
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
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false } as Response));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  clearCache();
  __resetContractEnvCacheForTests();
  __resetMastermindEnvCacheForTests();
});

describe("route: turn-1 moments, validators on", () => {
  it(
    "drives the contract branch, and the model's card passes at a stage the lift takes",
    async () => {
      const frames = await serve({ validators: true, moments: true });
      const done = frames.find((f) => f.json.type === "done")!
        .json as unknown as {
        metadata: {
          contract: {
            refereeOutcomes: Array<{ factIdPrefix: string; stage: string }>;
            cached: boolean;
          };
          pipeline: { contractMode: boolean };
        };
      };
      expect(done.metadata.pipeline.contractMode).toBe(true);
      expect(done.metadata.contract.cached).toBe(false);
      const outcomes = done.metadata.contract.refereeOutcomes;
      expect(outcomes.map((o) => o.factIdPrefix)).toEqual(["M2"]);
      expect(
        LIFTED_STAGES.has(
          outcomes[0].stage as Parameters<typeof LIFTED_STAGES.has>[0]
        )
      ).toBe(true);
    },
    ROUTE_TIMEOUT_MS
  );

  it(
    "flag off: no moment frame",
    async () => {
      const frames = await serve({ validators: true, moments: false });
      expect(momentFrames(frames)).toEqual([]);
      expect(frames.some((f) => f.json.type === "text")).toBe(true);
    },
    ROUTE_TIMEOUT_MS
  );

  it(
    "flag on: every frame but the moments is the flag-off frame, and each moment precedes its card",
    async () => {
      const off = await serve({ validators: true, moments: false });
      clearCache();
      const on = await serve({ validators: true, moments: true });

      const onWithout = on.filter((f) => f.json.type !== "moment");
      expect(normalised(onWithout)).toEqual(normalised(off));

      const moments = momentFrames(on);
      expect(moments).toHaveLength(1);
      const i = on.indexOf(moments[0]);
      const next = on[i + 1].json as unknown as { type: string; delta: string };
      expect(next.type).toBe("text");
      const moment = moments[0].json.moment as {
        card: { factIdPrefix: string; key: string };
        idea: string;
        happens: string;
        move: { san: string };
        proofLine: { sans: string[] } | null;
        fen: string;
        ply: number;
      };
      expect(cardKey(next.delta)).toBe(moment.card.key);
      expect(
        next.delta.startsWith("[INSIGHT:8:w:blunder:+2.84:-2.11:Nc7+:Qxc1]")
      ).toBe(true);
      expect(moment.card.factIdPrefix).toBe("M2");
      expect(moment.idea).toBe(
        "You wanted to chase the king with 8. Nc7+ and win the rook on a8."
      );
      expect(moment.happens).toBe(
        "Black's queen on c1 had no defender, and 8. Qxc1 takes it."
      );
      expect(moment.move.san).toBe("Nc7+");
      expect(moment.ply).toBe(14);
      expect(moment.fen).toBe(
        "r1b1kbnr/pp1ppppp/2n5/1N6/4P3/5N2/P1P2PPP/2qQKB1R w Kkq - 0 8"
      );
      expect(moment.proofLine?.sans).toEqual(["Qxc1", "Rb8", "Qf4", "f6"]);
    },
    ROUTE_TIMEOUT_MS
  );

  it(
    "a repeated request sends the cached moments before the cached text with the flag on, and none with it off",
    async () => {
      const first = await serve({ validators: true, moments: true });
      const sent = momentFrames(first).map((f) => f.raw);
      expect(sent).toHaveLength(1);

      const hit = await serve({ validators: true, moments: true });
      const doneHit = hit.find((f) => f.json.type === "done")!
        .json as unknown as {
        metadata: { contract: { cached: boolean }; analysis: string };
      };
      expect(doneHit.metadata.contract.cached).toBe(true);
      const types = hit.map((f) => f.json.type);
      const firstMoment = types.indexOf("moment");
      const firstText = types.indexOf("text");
      expect(firstMoment).toBeGreaterThanOrEqual(0);
      expect(firstMoment).toBeLessThan(firstText);
      expect(momentFrames(hit).map((f) => f.raw)).toEqual(sent);
      // The cached text is one frame, and the moment's card is inside it.
      const texts = hit.filter((f) => f.json.type === "text");
      expect(texts).toHaveLength(1);
      const cachedText = (texts[0].json as unknown as { delta: string }).delta;
      expect(cachedText).toBe(doneHit.metadata.analysis);
      const cards =
        cachedText.match(/\[INSIGHT:[^\]]+\][\s\S]*?\[\/INSIGHT\]/g) ?? [];
      const key = (
        momentFrames(hit)[0].json.moment as { card: { key: string } }
      ).card.key;
      expect(cards.map(cardKey)).toContain(key);

      const offHit = await serve({ validators: true, moments: false });
      const doneOff = offHit.find((f) => f.json.type === "done")!
        .json as unknown as {
        metadata: { contract: { cached: boolean } };
      };
      expect(doneOff.metadata.contract.cached).toBe(true);
      expect(momentFrames(offHit)).toEqual([]);
      expect(normalised(offHit)).toEqual(
        normalised(hit.filter((f) => f.json.type !== "moment"))
      );
    },
    ROUTE_TIMEOUT_MS
  );
});

describe("route: turn-1 moments, validators off", () => {
  it(
    "never enforces, so the flag sends no moment and changes no byte",
    async () => {
      const off = await serve({ validators: false, moments: false });
      clearCache();
      const on = await serve({ validators: false, moments: true });
      expect(momentFrames(on)).toEqual([]);
      expect(normalised(on)).toEqual(normalised(off));
      expect(on.some((f) => f.json.type === "text")).toBe(true);
      const done = on.find((f) => f.json.type === "done")?.json as unknown as
        | { metadata?: { pipeline?: unknown; contract?: unknown } }
        | undefined;
      expect(done?.metadata?.contract).toBeUndefined();
    },
    ROUTE_TIMEOUT_MS
  );
});
