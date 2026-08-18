import { afterEach, describe, expect, it, vi } from "vitest";

const { mockGetTrackingSupabase } = vi.hoisted(() => ({
  mockGetTrackingSupabase: vi.fn(),
}));

vi.mock("../supabase", () => ({
  getTrackingSupabase: mockGetTrackingSupabase,
}));

import { captureLLMCall } from "../llmCapture";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("captureLLMCall: permanent content kill switch", () => {
  it("never accesses Supabase even when tracking is enabled", () => {
    vi.stubEnv("TRACKING_ENABLED", "true");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    captureLLMCall({
      ctx: {
        uid: "sensitive-uid",
        anonId: "sensitive-anon-id",
        fen: "sensitive-fen",
        gamePgn: "sensitive-pgn",
      },
      opts: {
        system: "sensitive-system-prompt",
        messages: [{ role: "user", content: "sensitive-chat-message" }],
      },
      result: { content: "sensitive-ai-response" },
      errorMessage: "sensitive-provider-error",
    });

    expect(mockGetTrackingSupabase).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns no captured value or metadata", () => {
    vi.stubEnv("TRACKING_ENABLED", "true");

    expect(captureLLMCall("sensitive-request-content")).toBeUndefined();
    expect(mockGetTrackingSupabase).not.toHaveBeenCalled();
  });
});
