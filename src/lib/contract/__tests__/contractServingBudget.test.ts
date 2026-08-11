/**
 * PR-CI-5 — the FLAGSHIP GENERATION budget.
 *
 * The ladder deadline bounds the referee, not the model. The CI-5 gate run
 * measured game_review generation at ~53s for 4 cards and 76-83s for the
 * 7-card fixture — past `maxDuration: 60s`, where Vercel kills the function
 * mid-stream: no `done` event, no metadata, a client left hanging. The ladder
 * deadline cannot prevent that, because the time is spent before the ladder
 * is ever reached.
 *
 * CONTRACT_GENERATION_BUDGET_MS aborts the MODEL instead of the request, so
 * the review degrades into a short honest one that still closes properly.
 * These tests pin that: the signal is passed, the abort is not treated as an
 * error, already-refereed cards still ship, the omission is stated, and the
 * truncated artifact is never cached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTRACT_GENERATION_BUDGET_MS,
  GENERATION_BUDGET_NOTE,
  serveContractAnalysis,
} from "@/lib/contract/contractServing";
import type { ContractServingArgs } from "@/lib/contract/contractServing";
import { renderInsightHeader } from "@/lib/contract/insightGrammar";
import { clearCache } from "@/lib/responseCache";
import type { LLMStreamEvent } from "@/lib/llmProvider";
import { makeContract, makeInsight } from "./insightFactory";

vi.mock("@/lib/logging", () => ({
  logger: { child: () => ({ info: () => {}, warn: () => {}, error: () => {} }) },
}));

const cardA = makeInsight({ factIdPrefix: "M1", moveNumber: 11, topMistakeRank: 1 });
const cardB = makeInsight({
  factIdPrefix: "M2",
  moveNumber: 14,
  color: "b",
  topMistakeRank: 2,
});
const contract = makeContract([cardA, cardB]);

function baseArgs(
  over: Partial<ContractServingArgs> & Pick<ContractServingArgs, "callLLMStreamImpl">,
): ContractServingArgs {
  return {
    contract,
    category: "game_review",
    emitText: () => {},
    messageText: "analyze my game",
    priorMessages: [],
    promptInput: { personalityId: "friendly", userRating: 1500 },
    correlationId: "budget-test",
    uid: "u1",
    trackingConsent: false,
    requestStartMs: Date.now(),
    cacheInputs: {
      currentFen: contract.game.finalFen,
      skillLevel: "intermediate",
      userMessage: "analyze my game",
      personaSignature: "sig",
      moveHistory: ["e4", "e5"],
    },
    ...over,
  };
}

beforeEach(() => {
  clearCache();
});
afterEach(() => {
  vi.useRealTimers();
  clearCache();
});

describe("generation budget", () => {
  it("is 45s — inside the 55s ladder budget, which is inside maxDuration 60s", () => {
    expect(CONTRACT_GENERATION_BUDGET_MS).toBe(45_000);
    expect(CONTRACT_GENERATION_BUDGET_MS).toBeLessThan(55_000);
  });

  it("passes an abort signal to the flagship stream", async () => {
    let sawSignal = false;
    async function* stream(opts: { signal?: AbortSignal }): AsyncGenerator<LLMStreamEvent> {
      sawSignal = opts.signal instanceof AbortSignal;
      yield { type: "text", delta: "All good.\n\n" };
    }
    await serveContractAnalysis(
      baseArgs({ callLLMStreamImpl: stream as ContractServingArgs["callLLMStreamImpl"] }),
    );
    expect(sawSignal).toBe(true);
  });

  it("an over-budget review ships its completed cards and closes cleanly", async () => {
    const emitted: string[] = [];
    // The model emits card A, then stalls forever on card B.
    async function* stream(opts: { signal?: AbortSignal }): AsyncGenerator<LLMStreamEvent> {
      yield { type: "text", delta: "Right, let's walk your game.\n\n" };
      yield {
        type: "text",
        delta: `${renderInsightHeader(cardA)}\nYou went for Bd3, and the instinct was sound [F:M1].\n[/INSIGHT]\n\n`,
      };
      await new Promise((_r, reject) => {
        opts.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }

    vi.useFakeTimers();
    const pending = serveContractAnalysis(
      baseArgs({
        emitText: (t) => emitted.push(t),
        callLLMStreamImpl: stream as ContractServingArgs["callLLMStreamImpl"],
      }),
    );
    await vi.advanceTimersByTimeAsync(CONTRACT_GENERATION_BUDGET_MS + 100);
    const result = await pending;

    // NOT an error — the abort is a deliberate budget cut.
    expect(result.contractMetadata.generationTruncated).toBe(true);
    // The card that DID complete was refereed and shipped.
    expect(result.contractMetadata.refereeOutcomes.map((o) => o.factIdPrefix)).toEqual(["M1"]);
    expect(result.analysisContent).toContain(renderInsightHeader(cardA));
    expect(result.analysisContent).toContain("Right, let's walk your game.");
    // The omission is stated rather than left as a silent short review.
    expect(result.analysisContent).toContain(GENERATION_BUDGET_NOTE.trim());
    expect(emitted.join("")).toContain(GENERATION_BUDGET_NOTE.trim());
    // Citations still stripped on the truncated path.
    expect(result.analysisContent).not.toContain("[F:");
  });

  it("a truncated review is never cached", async () => {
    async function* truncating(opts: { signal?: AbortSignal }): AsyncGenerator<LLMStreamEvent> {
      yield {
        type: "text",
        delta: `${renderInsightHeader(cardA)}\nYou went for Bd3, and the instinct was sound [F:M1].\n[/INSIGHT]\n\n`,
      };
      await new Promise((_r, reject) => {
        opts.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }
    vi.useFakeTimers();
    const pending = serveContractAnalysis(
      baseArgs({ callLLMStreamImpl: truncating as ContractServingArgs["callLLMStreamImpl"] }),
    );
    await vi.advanceTimersByTimeAsync(CONTRACT_GENERATION_BUDGET_MS + 100);
    const result = await pending;
    vi.useRealTimers();

    expect(result.cacheable).toBe(false);
    // A second identical request must NOT be served the short review.
    let secondRan = false;
    async function* complete(): AsyncGenerator<LLMStreamEvent> {
      secondRan = true;
      yield {
        type: "text",
        delta: `${renderInsightHeader(cardA)}\nYou went for Bd3, and the instinct was sound [F:M1].\n[/INSIGHT]\n`,
      };
    }
    const second = await serveContractAnalysis(
      baseArgs({ callLLMStreamImpl: complete as ContractServingArgs["callLLMStreamImpl"] }),
    );
    expect(secondRan).toBe(true);
    expect(second.cached).toBe(false);
  });

  it("a REAL provider error still propagates (the budget path must not swallow it)", async () => {
    async function* boom(): AsyncGenerator<LLMStreamEvent> {
      yield { type: "text", delta: "starting" };
      throw new Error("anthropic 500");
    }
    await expect(
      serveContractAnalysis(
        baseArgs({ callLLMStreamImpl: boom as ContractServingArgs["callLLMStreamImpl"] }),
      ),
    ).rejects.toThrow("anthropic 500");
  });

  it("a review that finishes inside the budget is untouched and cacheable", async () => {
    async function* fast(): AsyncGenerator<LLMStreamEvent> {
      yield { type: "text", delta: "Right, let's walk your game.\n\n" };
      yield {
        type: "text",
        delta: `${renderInsightHeader(cardA)}\nYou went for Bd3, and the instinct was sound [F:M1].\n[/INSIGHT]\n\n`,
      };
      yield {
        type: "text",
        delta: `${renderInsightHeader(cardB)}\nA steady follow-up that kept things calm [F:M2].\n[/INSIGHT]\n`,
      };
    }
    const result = await serveContractAnalysis(
      baseArgs({ callLLMStreamImpl: fast as ContractServingArgs["callLLMStreamImpl"] }),
    );
    expect(result.contractMetadata.generationTruncated).toBe(false);
    expect(result.analysisContent).not.toContain(GENERATION_BUDGET_NOTE.trim());
    expect(result.contractMetadata.refereeOutcomes).toHaveLength(2);
    expect(result.cacheable).toBe(true);
  });
});
