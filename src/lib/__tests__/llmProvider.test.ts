/**
 * Tests for llmProvider's AbortSignal + abort-during-fallback behavior
 * (2026-05-25 fix-orphan-pipeline-cancellation, Commit 3).
 *
 * The contract under test:
 *   - When callLLM receives an aborted signal (either via opts.signal or
 *     via fetch throwing AbortError), it MUST NOT fall back to OpenAI.
 *     Falling back would re-spawn the orphan that withPipelineTimeout's
 *     cancellation was trying to stop.
 *   - The belt-and-suspenders check uses both err.name === "AbortError"
 *     AND opts.signal?.aborted. The two should coincide but timing
 *     windows can fool a single-condition check.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

const realFetch = global.fetch;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  global.fetch = realFetch;
  vi.unstubAllEnvs();
});

describe("callLLM: AbortError + signal.aborted → no OpenAI fallback", () => {
  it("Anthropic fetch throws AbortError → callLLM re-throws without trying OpenAI", async () => {
    // Stub env so both providers register as available, so the fallback
    // path would otherwise be reachable.
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-api-test-fake-fake-fake-fake-fake-fake-fakeAA");
    vi.stubEnv("OPENAI_API_KEY", "sk-proj-test-fake-fake-fake-fake-fake-fake-fake-fakeAA");

    const controller = new AbortController();
    controller.abort();

    let openaiAttempted = false;
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("anthropic.com")) {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      if (u.includes("openai.com")) {
        openaiAttempted = true;
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const { callLLM } = await import("@/lib/llmProvider");

    await expect(
      callLLM({
        tier: "fast",
        system: "test",
        messages: [{ role: "user", content: "hi" }],
        signal: controller.signal,
      }),
    ).rejects.toThrow();

    expect(openaiAttempted).toBe(false);
  });

  it("signal aborted but err is generic (timing-window case) → still no fallback (belt-and-suspenders)", async () => {
    // Simulate the timing window where fetch throws a non-AbortError-named
    // error but the signal HAS aborted. The belt-and-suspenders check on
    // opts.signal?.aborted catches this case.
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-api-test-fake-fake-fake-fake-fake-fake-fakeAA");
    vi.stubEnv("OPENAI_API_KEY", "sk-proj-test-fake-fake-fake-fake-fake-fake-fake-fakeAA");

    const controller = new AbortController();
    controller.abort();

    let openaiAttempted = false;
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("anthropic.com")) {
        // Non-AbortError-named generic Error. The signal.aborted check
        // catches this.
        throw new Error("network problem");
      }
      if (u.includes("openai.com")) {
        openaiAttempted = true;
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const { callLLM } = await import("@/lib/llmProvider");

    await expect(
      callLLM({
        tier: "fast",
        system: "test",
        messages: [{ role: "user", content: "hi" }],
        signal: controller.signal,
      }),
    ).rejects.toThrow();

    expect(openaiAttempted).toBe(false);
  });

  it("AbortError thrown but signal NOT aborted (other timing-window case) → still no fallback", async () => {
    // Inverse belt-and-suspenders: the error is named AbortError but the
    // signal hasn't propagated aborted state yet. The err.name check
    // catches this case.
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-api-test-fake-fake-fake-fake-fake-fake-fakeAA");
    vi.stubEnv("OPENAI_API_KEY", "sk-proj-test-fake-fake-fake-fake-fake-fake-fake-fakeAA");

    const controller = new AbortController();
    // Note: controller.abort() NOT called — signal.aborted will be false.

    let openaiAttempted = false;
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("anthropic.com")) {
        const err = new Error("aborted by abort signal");
        err.name = "AbortError";
        throw err;
      }
      if (u.includes("openai.com")) {
        openaiAttempted = true;
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const { callLLM } = await import("@/lib/llmProvider");

    await expect(
      callLLM({
        tier: "fast",
        system: "test",
        messages: [{ role: "user", content: "hi" }],
        signal: controller.signal,
      }),
    ).rejects.toThrow();

    expect(openaiAttempted).toBe(false);
  });

  it("Anthropic fails with REAL non-abort error (no signal) → falls back to OpenAI (preserves existing behavior)", async () => {
    // Regression guard: don't accidentally suppress legitimate fallbacks.
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-api-test-fake-fake-fake-fake-fake-fake-fakeAA");
    vi.stubEnv("OPENAI_API_KEY", "sk-proj-test-fake-fake-fake-fake-fake-fake-fake-fakeAA");

    let openaiAttempted = false;
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("anthropic.com")) {
        // Real failure, no abort signal involved.
        throw new Error("Anthropic 500");
      }
      if (u.includes("openai.com")) {
        openaiAttempted = true;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "openai fallback content" } }],
            usage: { prompt_tokens: 5, completion_tokens: 10 },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const { callLLM } = await import("@/lib/llmProvider");

    const result = await callLLM({
      tier: "fast",
      system: "test",
      messages: [{ role: "user", content: "hi" }],
      // no signal — should fall through to OpenAI normally
    });

    expect(openaiAttempted).toBe(true);
    expect(result.provider).toBe("openai");
    expect(result.content).toBe("openai fallback content");
  });
});
