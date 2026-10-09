/**
 * prepareMastermindContext with a category the chat route's intent table
 * decided (pathway PR 3.4): the classifier is not called, and the move
 * context reads the routed category as it would the classifier's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClassify, mockFetch } = vi.hoisted(() => ({
  mockClassify: vi.fn(),
  mockFetch: vi.fn(),
}));
vi.mock("@/lib/mastermind/categorization/categoryClassifier", async (orig) => ({
  ...(await orig<
    typeof import("@/lib/mastermind/categorization/categoryClassifier")
  >()),
  classifyQuestion: mockClassify,
}));
vi.mock("@/lib/mastermind/wireValidators", () => ({
  fetchDataSources: mockFetch,
}));

import { prepareMastermindContext } from "@/lib/mastermind/routeHelpers";
import { fenAt, MOVES } from "@/lib/coach/__tests__/fieldedFixture";

const GAME_EVAL = {
  positions: MOVES.map((_, i) => ({ lines: [{ cp: 10 * i, pv: [] }] })).concat([
    { lines: [{ cp: 999, pv: [] }] },
  ]),
};

const base = {
  userMessage: "Why was 8. Nc7+ a mistake?",
  moveHistory: MOVES,
  fen: fenAt(MOVES.length),
  gameEval: GAME_EVAL,
  viewedPly: 15,
  playerPerspective: "white" as const,
  correlationId: "c1",
  uid: "u1",
  userName: "player",
};

beforeEach(() => {
  mockClassify.mockReset();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ scout: null, userHistory: null });
  mockClassify.mockResolvedValue({
    category: "position_analysis",
    confidence: 0.9,
    rationale: "x",
    costUsd: 0.0007,
  });
});

describe("a routed category", () => {
  it("is used as given, with no classifier call and no classifier cost", async () => {
    const prep = await prepareMastermindContext({
      ...base,
      routedCategory: {
        category: "game_review",
        confidence: 1,
        rationale: "rule:ui:why_was",
      },
    });
    expect(mockClassify).not.toHaveBeenCalled();
    expect(prep.category).toBe("game_review");
    expect(prep.classifierConfidence).toBe(1);
    expect(prep.classifierCostUsd).toBe(0);
    expect(prep.categorySource).toBe("routed");
  });

  it("game_review anchors the move context at the viewed ply", async () => {
    const prep = await prepareMastermindContext({
      ...base,
      routedCategory: {
        category: "game_review",
        confidence: 1,
        rationale: "rule:verdict:anchor",
      },
    });
    expect(prep.moveCtx.moveSan).toBe("Nc7+");
    expect(prep.moveCtx.fenBefore).toBe(fenAt(14));
    expect(prep.moveCtx.fenAfter).toBe(fenAt(15));
    expect(prep.moveCtx.stockfishEval).toEqual({ cp: 150, mate: undefined });
    expect(mockFetch.mock.calls[0][0]).toMatchObject({
      fenBefore: fenAt(14),
      fenAfter: fenAt(15),
    });
  });

  it("improvement_strategy degrades the move context, as the classifier's would", async () => {
    const prep = await prepareMastermindContext({
      ...base,
      userMessage: "Show me one improvement to study",
      routedCategory: {
        category: "improvement_strategy",
        confidence: 1,
        rationale: "rule:ui:improvement",
      },
    });
    expect(prep.moveCtx.fenBefore).toBe(prep.moveCtx.fenAfter);
    expect(prep.moveCtx.stockfishEval).toEqual({});
    expect(prep.moveCtx.moveSan).toBeUndefined();
  });

  it("a router failure is routed too, so the classifier still never runs", async () => {
    const prep = await prepareMastermindContext({
      ...base,
      userMessage: "hmm",
      routedCategory: {
        category: "meta_motivational",
        confidence: 0,
        rationale: "default:model_timeout",
      },
    });
    expect(mockClassify).not.toHaveBeenCalled();
    expect(prep).toMatchObject({
      category: "meta_motivational",
      classifierConfidence: 0,
      categorySource: "routed",
    });
  });

  it("wins over the turn-1 forced category", async () => {
    const prep = await prepareMastermindContext({
      ...base,
      userMessage: "",
      routedCategory: {
        category: "concept_explanation",
        confidence: 1,
        rationale: "rule:concept",
      },
    });
    expect(prep.category).toBe("concept_explanation");
  });
});

describe("without one", () => {
  it("the classifier is called once and no categorySource key is set", async () => {
    const prep = await prepareMastermindContext(base);
    expect(mockClassify).toHaveBeenCalledTimes(1);
    expect(mockClassify).toHaveBeenCalledWith({ question: base.userMessage });
    expect(prep.category).toBe("position_analysis");
    expect(prep.classifierCostUsd).toBe(0.0007);
    expect(prep).not.toHaveProperty("categorySource");
  });

  it("the turn-1 game review is still forced without a call", async () => {
    const prep = await prepareMastermindContext({ ...base, userMessage: "" });
    expect(mockClassify).not.toHaveBeenCalled();
    expect(prep.category).toBe("game_review");
    expect(prep).not.toHaveProperty("categorySource");
  });
});
