/**
 * PR-CI-3: CallLLMOptions.outputSchema → provider wire format.
 *
 * Anthropic: output_config.format = {type: "json_schema", schema} — additive
 * to (never clobbering) the flagship-only effort pin. Fast tier without a
 * schema sends NO output_config at all (Haiku 400s on `effort`; the absence
 * is load-bearing). OpenAI fallback: response_format.json_schema {name,
 * schema}, no strict.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const realFetch = global.fetch;

function anthropicOk(text = "ok"): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
    { status: 200 },
  );
}

function openaiOk(text = "ok"): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { status: 200 },
  );
}

let requestBodies: Array<{ url: string; body: Record<string, unknown> }>;

beforeEach(() => {
  vi.resetModules();
  requestBodies = [];
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-api-test-fake-fake-fake-fake-fake-fake-fakeAA");
  vi.stubEnv("OPENAI_API_KEY", "sk-proj-test-fake-fake-fake-fake-fake-fake-fake-fakeAA");
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url.toString();
    requestBodies.push({ url: u, body: JSON.parse(String(init?.body)) });
    return u.includes("anthropic.com") ? anthropicOk() : openaiOk();
  }) as typeof fetch;
});

afterEach(() => {
  global.fetch = realFetch;
  vi.unstubAllEnvs();
});

const SCHEMA = {
  type: "object",
  properties: { claims: { type: "array", items: { type: "string" } } },
  required: ["claims"],
  additionalProperties: false,
};

describe("callLLM outputSchema — Anthropic wire format", () => {
  it("fast tier + outputSchema ⇒ output_config.format json_schema, NO effort key", async () => {
    const { callLLM } = await import("@/lib/llmProvider");
    await callLLM({
      tier: "fast",
      system: "s",
      messages: [{ role: "user", content: "u" }],
      outputSchema: { name: "test_claims", schema: SCHEMA },
    });
    const body = requestBodies[0].body as {
      output_config?: { effort?: string; format?: { type: string; schema: unknown } };
    };
    expect(body.output_config?.format).toEqual({ type: "json_schema", schema: SCHEMA });
    expect(body.output_config?.effort).toBeUndefined(); // Haiku 400s on effort
  });

  it("fast tier without outputSchema ⇒ no output_config at all (unchanged wire shape)", async () => {
    const { callLLM } = await import("@/lib/llmProvider");
    await callLLM({ tier: "fast", system: "s", messages: [{ role: "user", content: "u" }] });
    expect("output_config" in requestBodies[0].body).toBe(false);
  });

  it("flagship + outputSchema ⇒ effort pin AND format coexist in one output_config", async () => {
    const { callLLM } = await import("@/lib/llmProvider");
    await callLLM({
      tier: "flagship",
      system: "s",
      messages: [{ role: "user", content: "u" }],
      outputSchema: { name: "test_claims", schema: SCHEMA },
    });
    const body = requestBodies[0].body as {
      output_config?: { effort?: string; format?: { type: string } };
    };
    expect(body.output_config?.effort).toBe("medium");
    expect(body.output_config?.format?.type).toBe("json_schema");
  });

  it("flagship without outputSchema ⇒ the pre-existing effort-only shape (regression pin)", async () => {
    const { callLLM } = await import("@/lib/llmProvider");
    await callLLM({ tier: "flagship", system: "s", messages: [{ role: "user", content: "u" }] });
    expect(requestBodies[0].body.output_config).toEqual({ effort: "medium" });
  });
});

describe("callLLM outputSchema — OpenAI fallback wire format", () => {
  it("forceProvider openai ⇒ response_format.json_schema {name, schema}", async () => {
    const { callLLM } = await import("@/lib/llmProvider");
    await callLLM({
      tier: "fast",
      system: "s",
      messages: [{ role: "user", content: "u" }],
      forceProvider: "openai",
      outputSchema: { name: "test_claims", schema: SCHEMA },
    });
    expect(requestBodies[0].url).toContain("openai.com");
    expect(requestBodies[0].body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "test_claims", schema: SCHEMA },
    });
  });
});
