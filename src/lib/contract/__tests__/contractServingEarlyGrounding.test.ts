/**
 * Contract serving with a referee contract (pathway 4.8a,
 * COACH_TURN1_EARLY_STREAM).
 *
 * `refereedContract` on the result is what the follow-up's compact contract
 * is built from: the prompt's own contract without the option, the referee's
 * once it landed with it. A promise of a deep-equal contract serves and
 * caches the very bytes the plain run does. A cache hit refereed nothing, so
 * it never waits on the promise, even one that never settles. Real
 * responseCache, cleared around every test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serveContractAnalysis } from "@/lib/contract/contractServing";
import type { ContractServingArgs } from "@/lib/contract/contractServing";
import { renderInsightHeader } from "@/lib/contract/insightGrammar";
import {
  clearCache,
  generateContractCacheKey,
  getCachedResponse,
} from "@/lib/responseCache";
import type { LLMStreamEvent } from "@/lib/llmProvider";
import type { CoachContract } from "@/lib/contract/types";
import { makeContract, makeInsight } from "./insightFactory";

vi.mock("@/lib/logging", () => ({
  logger: {
    child: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  },
}));

const card = makeInsight({ factIdPrefix: "M1", topMistakeRank: 1 });
const contract = makeContract([card]);

const BODY = [
  "[WHY]",
  "Idea: You went for Bd3, and the instinct was sound [F:M1].",
  "Problem: Ne6 was the move, and after Ne6 Qd7 Nxg7 White nets the advantage [F:M1.pv0].",
  "[/WHY]",
].join("\n");
const REVIEW = [
  "Right, let's walk your game.\n\n",
  `${renderInsightHeader(card)}\n${BODY}\n[/INSIGHT]`,
];

const CACHE_INPUTS = {
  currentFen: contract.game.finalFen,
  skillLevel: "intermediate",
  userMessage: "analyze my game",
  personaSignature: "sig",
  moveHistory: ["e4", "e5"],
};
const KEY = generateContractCacheKey(
  CACHE_INPUTS.currentFen,
  CACHE_INPUTS.skillLevel,
  CACHE_INPUTS.userMessage,
  CACHE_INPUTS.personaSignature,
  CACHE_INPUTS.moveHistory
);

async function* review(): AsyncGenerator<LLMStreamEvent> {
  for (const delta of REVIEW) yield { type: "text", delta };
}

function serve(over: Partial<ContractServingArgs> = {}) {
  const texts: string[] = [];
  const pending = serveContractAnalysis({
    contract,
    category: "game_review",
    emitText: (text) => texts.push(text),
    messageText: "analyze my game",
    priorMessages: [],
    promptInput: { personalityId: "friendly", userRating: 1500 },
    correlationId: "early-grounding-serving",
    uid: "u1",
    requestStartMs: Date.now(),
    cacheInputs: CACHE_INPUTS,
    callLLMStreamImpl: review as ContractServingArgs["callLLMStreamImpl"],
    ...over,
  });
  return { texts, pending };
}

beforeEach(() => clearCache());
afterEach(() => clearCache());

describe("refereedContract", () => {
  it("is the prompt's own contract without the option", async () => {
    const result = await serve().pending;
    expect(result.cached).toBe(false);
    expect(result.refereedContract).toBe(contract);
  });

  it("is the referee's contract once it landed", async () => {
    const late: CoachContract = makeContract([
      {
        ...card,
        chessdb: {
          status: "ok",
          value: { evalCp: 120, outcomeText: "unclear" },
          provenance: { source: "chessdb", confidence: "engine_verified" },
        },
      },
    ]);
    const result = await serve({ refereeContract: Promise.resolve(late) })
      .pending;
    expect(result.refereedContract).toBe(late);
  });

  it("falls back to the prompt's contract when the promise rejects", async () => {
    const result = await serve({
      refereeContract: Promise.reject(new Error("late build failed")),
    }).pending;
    expect(result.refereedContract).toBe(contract);
  });
});

describe("a deep-equal referee contract", () => {
  it("serves and caches the plain run's bytes", async () => {
    const plain = serve();
    const plainResult = await plain.pending;
    const plainCached = getCachedResponse(KEY);
    expect(plainResult.cacheable).toBe(true);
    expect(plainCached).not.toBeNull();
    clearCache();

    const copy = JSON.parse(JSON.stringify(contract)) as CoachContract;
    const early = serve({ refereeContract: Promise.resolve(copy) });
    const earlyResult = await early.pending;
    expect(early.texts).toEqual(plain.texts);
    expect(earlyResult.analysisContent).toBe(plainResult.analysisContent);
    expect(earlyResult.contractMetadata).toEqual(plainResult.contractMetadata);
    expect(getCachedResponse(KEY)).toBe(plainCached);
  });
});

describe("a cache hit", () => {
  it("never waits on the referee contract, even one that never settles", async () => {
    await serve().pending;
    expect(getCachedResponse(KEY)).not.toBeNull();

    const never = new Promise<CoachContract>(() => {});
    const hit = await Promise.race([
      serve({ refereeContract: never }).pending,
      new Promise<"waited">((r) => setTimeout(() => r("waited"), 500)),
    ]);
    expect(hit).not.toBe("waited");
    if (hit === "waited") return;
    expect(hit.cached).toBe(true);
    expect(hit.refereedContract).toBe(contract);
  });
});
