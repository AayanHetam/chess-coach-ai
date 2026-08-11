import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * llm_calls rows carry full conversation content, which the published privacy
 * policy promises is stored "only with your consent". The /api/track*
 * endpoints enforce consent at their boundary; this capture hook does not sit
 * behind them, so it must gate itself.
 *
 * Found 2026-08-11: the hook gated on TRACKING_ENABLED alone, so enabling
 * tracking captured conversations from users who had not consented (and from
 * users sending Global Privacy Control). These tests pin the fix.
 */

const insert = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/tracking/supabase", () => ({
  getTrackingSupabase: async () => ({ from: () => ({ insert }) }),
}));
vi.mock("@/lib/logging", () => ({
  logger: { child: () => ({ info: () => {}, warn: () => {}, error: () => {} }) },
}));

import { recordLLMCallFull, type LLMCaptureContext } from "@/lib/tracking/llmCapture";
import { __resetTrackingEnvCacheForTests } from "@/env";

function ctx(over: Partial<LLMCaptureContext> = {}): LLMCaptureContext {
  return { feature: "chat", consent: true, ...over };
}

function input(over: Partial<LLMCaptureContext> = {}) {
  return {
    ctx: ctx(over),
    opts: {
      tier: "fast" as const,
      system: "SYS",
      messages: [{ role: "user" as const, content: "what was my mistake?" }],
    },
    result: null,
    status: "ok" as const,
  };
}

beforeEach(() => {
  insert.mockClear();
  vi.stubEnv("TRACKING_ENABLED", "true");
  vi.stubEnv("TRACKING_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("TRACKING_SUPABASE_SERVICE_ROLE_KEY", "test-key");
  __resetTrackingEnvCacheForTests?.();
});
afterEach(() => {
  vi.unstubAllEnvs();
  __resetTrackingEnvCacheForTests?.();
});

describe("llm_calls capture is consent-gated", () => {
  it("writes when the request carried consent", async () => {
    await recordLLMCallFull(input({ consent: true }));
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("writes NOTHING when consent is absent — even with tracking enabled", async () => {
    await recordLLMCallFull(input({ consent: false }));
    expect(insert).not.toHaveBeenCalled();
  });

  it("never throws on the non-consenting path", async () => {
    await expect(recordLLMCallFull(input({ consent: false }))).resolves.toBeUndefined();
  });
});
