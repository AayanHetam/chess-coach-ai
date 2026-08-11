import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/env", () => ({ getTrackingEnv: vi.fn() }));
vi.mock("../supabase", () => ({ getTrackingSupabase: vi.fn() }));

import { getTrackingEnv } from "@/env";
import { getTrackingSupabase } from "../supabase";
import { recordLLMCallFull } from "../llmCapture";
import type { CallLLMOptions, LLMResult } from "@/lib/llmProvider";

const mockEnv = vi.mocked(getTrackingEnv);
const mockGetClient = vi.mocked(getTrackingSupabase);

function fakeClient(insertResult: { error: { message: string } | null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as never, from, insert };
}

const opts: CallLLMOptions = {
  tier: "flagship",
  system: "SYSTEM",
  systemSuffix: "SUFFIX",
  messages: [{ role: "user", content: "explain this" }],
};

const okResult: LLMResult = {
  content: "the answer",
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  inputTokens: 100,
  outputTokens: 50,
  cacheCreationTokens: 0,
  cacheReadTokens: 80,
  elapsedMs: 1234,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.mockReturnValue({ enabled: true } as never);
});

describe("recordLLMCallFull: kill switch", () => {
  it("no-ops when TRACKING_ENABLED is off", async () => {
    mockEnv.mockReturnValue({ enabled: false } as never);
    await recordLLMCallFull({
      ctx: { feature: "chat", consent: true },
      opts,
      result: okResult,
      status: "ok",
    });
    expect(mockGetClient).not.toHaveBeenCalled();
  });
});

describe("recordLLMCallFull: ok row", () => {
  it("writes the full prompt+response with combined system prompt", async () => {
    const fk = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(fk.client);

    await recordLLMCallFull({
      ctx: {
        feature: "enhanced-analysis",
        consent: true,
        uid: "u1",
        requestId: "req1",
        promptVersion: "3.3",
        fen: "8/8/8/8/8/8/8/8 w - - 0 1",
        props: { branch: "stream-flag-off" },
      },
      opts,
      result: okResult,
      status: "ok",
    });

    expect(fk.from).toHaveBeenCalledWith("llm_calls");
    const row = fk.insert.mock.calls[0][0];
    // NB: `consent` is a capture GATE, not a stored column — it must not
    // appear on the row.
    expect(row).not.toHaveProperty("consent");
    expect(row).toMatchObject({
      feature: "enhanced-analysis",
      uid: "u1",
      request_id: "req1",
      tier: "flagship",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      prompt_version: "3.3",
      system_prompt: "SYSTEM\n\nSUFFIX", // suffix appended
      response_text: "the answer",
      input_tokens: 100,
      cache_read_tokens: 80,
      status: "ok",
      props: { branch: "stream-flag-off" },
    });
    expect(row.messages).toEqual([{ role: "user", content: "explain this" }]);
  });

  it("system_prompt is just the system when no suffix", async () => {
    const fk = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(fk.client);
    await recordLLMCallFull({
      ctx: { feature: "chat", consent: true },
      opts: { tier: "fast", system: "ONLY", messages: [] },
      result: okResult,
      status: "ok",
    });
    expect(fk.insert.mock.calls[0][0].system_prompt).toBe("ONLY");
  });
});

describe("recordLLMCallFull: error row", () => {
  it("records status=error with no result (provider/model 'none')", async () => {
    const fk = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(fk.client);

    await recordLLMCallFull({
      ctx: { feature: "chat", consent: true },
      opts,
      result: null,
      status: "error",
      errorMessage: "both providers failed",
    });

    const row = fk.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      status: "error",
      provider: "none",
      model: "none",
      response_text: null,
      error: "both providers failed",
    });
  });
});

describe("recordLLMCallFull: never breaks the AI call", () => {
  it("swallows an insert error", async () => {
    const fk = fakeClient({ error: { message: "db boom" } });
    mockGetClient.mockResolvedValue(fk.client);
    await expect(
      recordLLMCallFull({ ctx: { feature: "chat", consent: true }, opts, result: okResult, status: "ok" }),
    ).resolves.toBeUndefined();
  });

  it("swallows a thrown client", async () => {
    mockGetClient.mockRejectedValue(new Error("supabase down"));
    await expect(
      recordLLMCallFull({ ctx: { feature: "chat", consent: true }, opts, result: okResult, status: "ok" }),
    ).resolves.toBeUndefined();
  });
});
