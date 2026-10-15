/**
 * The verified report on the served path (COACH_CLAIM_VERIFIER): the verdict,
 * story and decisive moments stream before the model's cards, credit and the
 * habit after; the model is handed the same facts as REPORT FACTS. Game B's
 * real contract, built offline; the model is a scripted stream.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.hoisted(() => {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
});

import { buildCoachContract } from "@/lib/contract/builder";
import {
  serveContractAnalysis,
  type ContractServingArgs,
} from "@/lib/contract/contractServing";
import { renderInsightHeader } from "@/lib/contract/insightGrammar";
import type { CoachContract } from "@/lib/contract/types";
import {
  __resetFetchForTesting,
  __setFetchForTesting,
} from "@/lib/grounding/chessdb";
import type {
  CallLLMOptions,
  LLMResult,
  LLMStreamEvent,
} from "@/lib/llmProvider";
import { selectCardInsights } from "@/lib/prompts/verbalizerPrompt";
import { clearCache } from "@/lib/responseCache";
import {
  positionsToRecheck,
  selectFlaggedMoments,
  type GameEvalRecheck,
} from "@/lib/coach/deepRecheck";
import {
  loadGame,
  positionEvals,
} from "@/lib/coach/__tests__/coachAccuracyFixtures";

let contract: CoachContract;

beforeAll(async () => {
  __setFetchForTesting(async () => {
    throw new Error("network disabled");
  });
  const moments = selectFlaggedMoments(positionEvals("gameB", 16), {
    playerColor: "w",
  });
  const deep = positionEvals("gameB", 20);
  const positions: GameEvalRecheck["positions"] = {};
  for (const idx of positionsToRecheck(moments))
    positions[String(idx)] = { lines: deep[idx].lines };
  contract = await buildCoachContract({
    moveHistory: loadGame("gameB").sans,
    gameEval: {
      positions: positionEvals("gameB", 16),
      settings: { engine: "stockfish_17_lite", depth: 16, multiPv: 3 },
      recheck: {
        engine: "stockfish_17_1",
        depth: 20,
        positions,
        skipped: [],
        moments: moments.map((m) => m.move),
        budgetMs: 15_000,
        elapsedMs: 9_000,
      },
    } as never,
    playerColor: "w",
  });
}, 120_000);

afterAll(() => {
  __resetFetchForTesting();
});
afterEach(() => {
  vi.unstubAllEnvs();
  clearCache();
});

function scriptedModel(seen: CallLLMOptions[]) {
  return async function* (
    opts: CallLLMOptions
  ): AsyncGenerator<LLMStreamEvent, void, void> {
    seen.push(opts);
    for (const card of selectCardInsights(contract)) {
      yield {
        type: "text",
        delta: `${renderInsightHeader(card)}\nYou went for it, and that instinct is worth keeping.\nNext time, count the checks first.\n[/INSIGHT]\n`,
      };
    }
    yield {
      type: "done",
      result: {
        content: "",
        provider: "anthropic",
        model: "test",
        inputTokens: 1,
        outputTokens: 1,
        elapsedMs: 1,
      } as LLMResult,
    };
  };
}

function args(emitted: string[], seen: CallLLMOptions[]): ContractServingArgs {
  return {
    contract,
    category: "game_review",
    emitText: (t) => emitted.push(t),
    messageText: "Analyze my game.",
    priorMessages: [],
    promptInput: { personalityId: "friendly", userRating: 1828 },
    correlationId: "report-test",
    uid: "u1",
    requestStartMs: Date.now(),
    cacheInputs: {
      currentFen: contract.game.finalFen,
      skillLevel: "advanced",
      userMessage: "Analyze my game.",
      personaSignature: "sig",
      moveHistory: contract.game.moveHistory,
    },
    callLLMStreamImpl: scriptedModel(seen),
    ladderDeps: {
      correctImpl: async () => {
        throw new Error("no model rungs in this test");
      },
      callLLMImpl: async () => {
        throw new Error("no model rungs in this test");
      },
    },
  };
}

describe("the served review with the verified report", () => {
  it("frames the cards: verdict and story before, credit and the habit after", async () => {
    const emitted: string[] = [];
    const seen: CallLLMOptions[] = [];
    const result = await serveContractAnalysis(args(emitted, seen));
    const text = emitted.join("");
    expect(
      text.startsWith("**Verdict:** You won with White by checkmate on move 22")
    ).toBe(true);
    const firstCard = text.indexOf("[INSIGHT:");
    expect(firstCard).toBeGreaterThan(
      text.indexOf("**The moments that decided it**")
    );
    expect(text.indexOf("**Credit:**")).toBeGreaterThan(
      text.lastIndexOf("[/INSIGHT]")
    );
    expect(text).toContain(
      "**One habit to work on:** When the enemy king is exposed"
    );
    expect(result.analysisContent).toBe(text);
    expect(
      result.contractMetadata.claimVerifier?.report?.sentences.length
    ).toBeGreaterThan(5);
  }, 60_000);

  it("hands the model the report as REPORT FACTS, outside the contract JSON", async () => {
    const seen: CallLLMOptions[] = [];
    await serveContractAnalysis(args([], seen));
    const userTurn = String(seen[0].messages.at(-1)?.content);
    expect(userTurn).toContain("REPORT FACTS (verified by the app");
    expect(userTurn).toContain("Do NOT write your own intro line");
    const contractJson = userTurn.slice(
      userTurn.indexOf("## VERIFIED FACT CONTRACT"),
      userTurn.indexOf("## CARD PLAN")
    );
    expect(contractJson).not.toContain('"verdict"');
  }, 60_000);

  it("with the flag off, no report is shown", async () => {
    vi.stubEnv("COACH_CLAIM_VERIFIER", "0");
    const emitted: string[] = [];
    await serveContractAnalysis(args(emitted, []));
    expect(emitted.join("")).not.toContain("**Verdict:**");
  }, 60_000);
});
