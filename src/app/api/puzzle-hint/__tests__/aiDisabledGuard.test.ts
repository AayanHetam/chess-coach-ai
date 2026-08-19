import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The kill switch has to bite at the ROUTE, not just in the UI.
 *
 * A hidden button is not a disabled feature: a stale client, a direct API
 * call, or a cached page all still reach the handler. And the refusal must
 * happen BEFORE any provider call, or a "disabled" product still spends money
 * on every request.
 */

const { mockCallLLM, mockSetCachedHint, mockGetCachedHint } = vi.hoisted(() => ({
  mockCallLLM: vi.fn(),
  mockSetCachedHint: vi.fn(),
  mockGetCachedHint: vi.fn(),
}));

vi.mock("@/lib/logging", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  logErrorToSentry: vi.fn(),
  extractRequestId: () => "req",
}));
vi.mock("@/lib/llmProvider", () => ({
  callLLM: mockCallLLM,
  LLMError: class LLMError extends Error {},
  PUBLIC_LLM_ERROR: { code: "AI_PROVIDER_UNAVAILABLE", message: "unavailable" },
  toSafeLLMError: (e: unknown) => ({ message: String(e) }),
}));
vi.mock("@/lib/puzzleHint/cache", () => ({
  getCachedHint: mockGetCachedHint,
  setCachedHint: mockSetCachedHint,
}));

import { POST } from "../route";

const ORIGINAL = { ...process.env };

function req() {
  return new NextRequest("http://localhost/api/puzzle-hint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      puzzle: {
        id: "p1",
        fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
        solution: ["f8c5"],
        themes: [],
      },
      stage: "hint",
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCachedHint.mockReturnValue(null);
  delete process.env.AI_COACH_DISABLED;
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("puzzle-hint — the AI kill switch", () => {
  it("refuses with 503 and the deliberate code when switched off", async () => {
    process.env.AI_COACH_DISABLED = "true";
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("AI_TEMPORARILY_DISABLED");
  });

  it("spends nothing — the provider is never called", async () => {
    // The whole point is the bill. A refusal that still calls the model is a
    // UI change, not a kill switch.
    process.env.AI_COACH_DISABLED = "true";
    await POST(req());
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("does not serve a cached answer either", async () => {
    // Serving from cache while "disabled" would make the feature look alive
    // for some puzzles and dead for others — the inconsistency reads as a bug.
    process.env.AI_COACH_DISABLED = "true";
    mockGetCachedHint.mockReturnValue({ stage: "hint", prose: "cached", mentions: [] });
    const res = await POST(req());
    expect(res.status).toBe(503);
  });

  it("CONTROL: with the flag unset the route works normally", async () => {
    // Without this, every assertion above would pass on a route that was
    // simply broken.
    mockCallLLM.mockResolvedValue({
      content: "Look at the bishop.",
      model: "m",
      provider: "anthropic",
      inputTokens: 1,
      outputTokens: 1,
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockCallLLM).toHaveBeenCalled();
  });
});
