/**
 * Contract serving with turn-1 moments (pathway 4.1, COACH_TURN1_MOMENTS).
 *
 * The response cache keeps a review's moments beside its text under the
 * same key, and a hit sends them before the text. Without the emitter
 * nothing is stored, an entry written that way serves text only, and a
 * truncated review caches nothing while the cards it completed still sent
 * their moments. Real responseCache, cleared around every test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTRACT_GENERATION_BUDGET_MS,
  serveContractAnalysis,
} from "@/lib/contract/contractServing";
import type { ContractServingArgs } from "@/lib/contract/contractServing";
import { renderInsightHeader } from "@/lib/contract/insightGrammar";
import { LIFTED_STAGES } from "@/lib/contract/turnMoments";
import {
  clearCache,
  generateContractCacheKey,
  getCachedMoments,
  getCachedResponse,
} from "@/lib/responseCache";
import { cardKey } from "@/lib/coach/turnMoment";
import type { TurnMoment } from "@/lib/coach/turnMoment";
import type { LLMStreamEvent } from "@/lib/llmProvider";
import { makeContract, makeInsight } from "./insightFactory";

vi.mock("@/lib/logging", () => ({
  logger: {
    child: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  },
}));

const cardA = makeInsight({
  factIdPrefix: "M1",
  moveNumber: 11,
  topMistakeRank: 1,
});
const cardB = makeInsight({
  factIdPrefix: "M2",
  moveNumber: 14,
  color: "b",
  topMistakeRank: 2,
});
const contract = makeContract([cardA, cardB]);

const BODY_A = [
  "[WHY]",
  "Idea: You went for Bd3, and the instinct was sound [F:M1].",
  "Problem: Ne6 was the move, and after Ne6 Qd7 Nxg7 White nets the advantage [F:M1.pv0].",
  "[/WHY]",
].join("\n");
const BODY_B = [
  "[WHY]",
  "Idea: Steady move [F:M2].",
  "Problem: It kept the bishop in play [F:M2].",
  "[/WHY]",
].join("\n");
const REVIEW = [
  "Right, let's walk your game.\n\n",
  `${renderInsightHeader(cardA)}\n${BODY_A}\n[/INSIGHT]\n\n`,
  `${renderInsightHeader(cardB)}\n${BODY_B}\n[/INSIGHT]`,
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

type Frame =
  | { kind: "text"; text: string }
  | { kind: "moment"; moment: TurnMoment };

function serve(withMoments: boolean, over: Partial<ContractServingArgs> = {}) {
  const frames: Frame[] = [];
  const pending = serveContractAnalysis({
    contract,
    category: "game_review",
    emitText: (text) => frames.push({ kind: "text", text }),
    ...(withMoments
      ? {
          emitMoment: (moment: TurnMoment) =>
            frames.push({ kind: "moment", moment }),
        }
      : {}),
    messageText: "analyze my game",
    priorMessages: [],
    promptInput: { personalityId: "friendly", userRating: 1500 },
    correlationId: "moments-serving",
    uid: "u1",
    requestStartMs: Date.now(),
    cacheInputs: CACHE_INPUTS,
    callLLMStreamImpl: review as ContractServingArgs["callLLMStreamImpl"],
    ...over,
  });
  return { frames, pending };
}

const moments = (frames: Frame[]) =>
  frames.flatMap((f) => (f.kind === "moment" ? [f.moment] : []));
const texts = (frames: Frame[]) =>
  frames.flatMap((f) => (f.kind === "text" ? [f.text] : []));

beforeEach(() => clearCache());
afterEach(() => {
  vi.useRealTimers();
  clearCache();
});

describe("contract serving with moments", () => {
  it("passes both cards at a stage the lift takes, and caches the review", async () => {
    const { pending } = serve(true);
    const result = await pending;
    expect(result.cacheable).toBe(true);
    for (const o of result.contractMetadata.refereeOutcomes) {
      expect(LIFTED_STAGES.has(o.stage)).toBe(true);
    }
  });

  it("without the emitter stores no moments", async () => {
    const { pending, frames } = serve(false);
    await pending;
    expect(moments(frames)).toEqual([]);
    expect(getCachedResponse(KEY)).not.toBeNull();
    expect(getCachedMoments(KEY)).toBeNull();
  });

  it("with it stores the moments, and a hit sends them before the text", async () => {
    const first = serve(true);
    const r1 = await first.pending;
    const sent = moments(first.frames);
    expect(sent.map((m) => m.card.factIdPrefix)).toEqual(["M1", "M2"]);
    expect(getCachedMoments(KEY)).toEqual(sent);

    const second = serve(true);
    const r2 = await second.pending;
    expect(r2.cached).toBe(true);
    expect(second.frames.map((f) => f.kind)).toEqual([
      "moment",
      "moment",
      "text",
    ]);
    expect(moments(second.frames)).toEqual(sent);
    expect(texts(second.frames)).toEqual([r1.analysisContent]);
    // Each moment's key is a card inside the cached text.
    for (const m of sent) {
      const cards =
        r1.analysisContent.match(/\[INSIGHT:[^\]]+\][\s\S]*?\[\/INSIGHT\]/g) ??
        [];
      expect(cards.map(cardKey)).toContain(m.card.key);
    }
  });

  it("a hit without the emitter sends the text alone", async () => {
    await serve(true).pending;
    const second = serve(false);
    const r2 = await second.pending;
    expect(r2.cached).toBe(true);
    expect(second.frames.map((f) => f.kind)).toEqual(["text"]);
  });

  it("an entry written with the flag off serves text only with it on", async () => {
    const first = serve(false);
    const r1 = await first.pending;
    const second = serve(true);
    const r2 = await second.pending;
    expect(r2.cached).toBe(true);
    expect(second.frames).toEqual([{ kind: "text", text: r1.analysisContent }]);
  });

  it("a moment send that throws costs the moment, never the card's text", async () => {
    const off = await serve(false).pending;
    clearCache();
    const frames: Frame[] = [];
    let sends = 0;
    const result = await serve(true, {
      emitText: (text) => frames.push({ kind: "text", text }),
      emitMoment: () => {
        sends += 1;
        throw new Error("controller closed");
      },
    }).pending;
    expect(sends).toBe(2);
    expect(result.analysisContent).toBe(off.analysisContent);
    expect(texts(frames).join("")).toBe(off.analysisContent);
    expect(result.cacheable).toBe(true);
    expect(getCachedResponse(KEY)).toBe(off.analysisContent);
  });

  it("a truncated review caches nothing and sends moments for its completed cards only", async () => {
    async function* stalls(opts: {
      signal?: AbortSignal;
    }): AsyncGenerator<LLMStreamEvent> {
      yield { type: "text", delta: REVIEW[0] };
      yield { type: "text", delta: REVIEW[1] };
      await new Promise((_r, reject) => {
        opts.signal?.addEventListener("abort", () =>
          reject(new Error("aborted"))
        );
      });
    }
    vi.useFakeTimers();
    const { pending, frames } = serve(true, {
      callLLMStreamImpl: stalls as ContractServingArgs["callLLMStreamImpl"],
    });
    await vi.advanceTimersByTimeAsync(CONTRACT_GENERATION_BUDGET_MS + 100);
    const result = await pending;
    expect(result.contractMetadata.generationTruncated).toBe(true);
    expect(result.cacheable).toBe(false);
    expect(moments(frames).map((m) => m.card.factIdPrefix)).toEqual(["M1"]);
    expect(getCachedResponse(KEY)).toBeNull();
    expect(getCachedMoments(KEY)).toBeNull();
  });
});
