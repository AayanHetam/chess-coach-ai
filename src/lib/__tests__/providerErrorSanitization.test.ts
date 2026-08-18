import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockLog, mockCaptureException } = vi.hoisted(() => ({
  mockLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockCaptureException: vi.fn(),
}));

vi.mock("@/lib/logging", () => ({
  logger: { child: () => mockLog },
}));

vi.mock("@sentry/nextjs", () => ({
  isInitialized: () => true,
  captureException: mockCaptureException,
  addBreadcrumb: vi.fn(),
}));

const realFetch = global.fetch;
const secretAnthropicBody = "provider-body-secret-anthropic";
const secretOpenAIBody = "provider-body-secret-openai";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://example.invalid/1");
  vi.stubEnv(
    "ANTHROPIC_API_KEY",
    "sk-ant-api-test-fake-fake-fake-fake-fake-fake-fakeAA"
  );
  vi.stubEnv(
    "OPENAI_API_KEY",
    "sk-proj-test-fake-fake-fake-fake-fake-fake-fake-fakeAA"
  );
});

afterEach(() => {
  global.fetch = realFetch;
  vi.unstubAllEnvs();
});

describe("provider error sanitization", () => {
  it("does not retain provider response bodies in errors, logs, or Sentry", async () => {
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      return new Response(
        url.includes("anthropic") ? secretAnthropicBody : secretOpenAIBody,
        { status: url.includes("anthropic") ? 429 : 503 }
      );
    }) as typeof fetch;

    const { callLLM, LLMError } = await import("@/lib/llmProvider");
    let caught: unknown;
    try {
      await callLLM({
        tier: "fast",
        system: "system",
        messages: [{ role: "user", content: "request" }],
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LLMError);
    expect(caught).toMatchObject({
      provider: "openai",
      status: 503,
      code: "provider_http_error",
    });

    const inspected = JSON.stringify({
      error: caught instanceof Error ? caught.message : caught,
      logs: Object.fromEntries(
        Object.entries(mockLog).map(([level, fn]) => [level, fn.mock.calls])
      ),
    });
    expect(inspected).not.toContain(secretAnthropicBody);
    expect(inspected).not.toContain(secretOpenAIBody);

    const { logErrorToSentry } = await import(
      "@/lib/logging/sentryIntegration"
    );
    const safeError = caught as InstanceType<typeof LLMError>;
    logErrorToSentry(safeError, {
      provider: safeError.provider,
      status: safeError.status,
      code: safeError.code,
    });

    expect(mockCaptureException).toHaveBeenCalledOnce();
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain(
      secretAnthropicBody
    );
    expect(JSON.stringify(mockCaptureException.mock.calls)).not.toContain(
      secretOpenAIBody
    );
  });

  it("returns only a fixed public message and code", async () => {
    const { PUBLIC_LLM_ERROR } = await import("@/lib/llmProvider");
    expect(PUBLIC_LLM_ERROR).toEqual({
      code: "AI_PROVIDER_UNAVAILABLE",
      message: "AI coaching is temporarily unavailable. Please try again.",
    });
    expect(JSON.stringify(PUBLIC_LLM_ERROR)).not.toContain(
      "provider-body-secret"
    );
  });
});
