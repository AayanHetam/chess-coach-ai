import { describe, it, expect } from "vitest";
import { regenerateUntilValid, buildRetryInstruction } from "../../validators/regenerate";
import { ValidatorResult, ValidatorIssue } from "../../validators/types";
import type { CallLLMOptions, LLMResult } from "@/lib/llmProvider";

function mockLlmReturning(responses: string[]): {
  fn: (opts: CallLLMOptions) => Promise<LLMResult>;
  calls: number;
} {
  let i = 0;
  const calls = { count: 0 };
  return {
    fn: async () => {
      const content = responses[Math.min(i, responses.length - 1)];
      i++;
      calls.count = i;
      return {
        content,
        provider: "anthropic",
        model: "claude-sonnet-4-test",
        inputTokens: 100,
        outputTokens: 50,
      } as LLMResult;
    },
    get calls() {
      return calls.count;
    },
  };
}

function passingValidator(): (response: string) => Promise<ValidatorResult> {
  return async () => ({ issues: [], passed: true, telemetry: [], costUsd: 0.001 });
}

function failingValidator(issues: ValidatorIssue[]): (response: string) => Promise<ValidatorResult> {
  return async () => ({ issues, passed: false, telemetry: [], costUsd: 0.001 });
}

function alternatingValidator(passOnRetry: number): (response: string) => Promise<ValidatorResult> {
  let attempt = 0;
  return async () => {
    const passes = attempt >= passOnRetry;
    attempt++;
    return passes
      ? { issues: [], passed: true, telemetry: [], costUsd: 0.001 }
      : {
          issues: [
            {
              check_name: "eval_mismatch_qualitative",
              severity: "error",
              llm_span: "Black is winning",
              expected: { band: "equal" },
              actual: { band: "winning" },
              detail: "Wrong band.",
            } as ValidatorIssue,
          ],
          passed: false,
          telemetry: [],
          costUsd: 0.001,
        };
  };
}

const initialRequest: CallLLMOptions = {
  tier: "flagship",
  system: "test system",
  messages: [{ role: "user", content: "test user" }],
};

describe("buildRetryInstruction", () => {
  it("orders eval mismatches before citation issues", () => {
    const issues: ValidatorIssue[] = [
      {
        check_name: "feature_citation_unsupported",
        severity: "error",
        llm_span: "bishop pair",
        expected: null,
        actual: null,
        detail: "Citation a.",
      },
      {
        check_name: "eval_mismatch_qualitative",
        severity: "error",
        llm_span: "winning",
        expected: null,
        actual: null,
        detail: "Eval b.",
      },
    ];
    const text = buildRetryInstruction(issues);
    const evalIdx = text.indexOf("eval_mismatch");
    const citationIdx = text.indexOf("feature_citation");
    expect(evalIdx).toBeLessThan(citationIdx);
  });
});

describe("regenerateUntilValid", () => {
  it("passes on initial call (no retries)", async () => {
    const llm = mockLlmReturning(["good response"]);
    const r = await regenerateUntilValid({
      initialRequest,
      validate: passingValidator(),
      buildFallback: async () => "should not be called",
      correlationId: "rg-1",
      callLLM: llm.fn,
    });
    expect(r.finalOutcome).toBe("passed_initial");
    expect(r.retryCount).toBe(0);
    expect(r.finalResponse).toBe("good response");
    expect(llm.calls).toBe(1);
  });

  it("passes after retry 1", async () => {
    const llm = mockLlmReturning(["bad", "good"]);
    const r = await regenerateUntilValid({
      initialRequest,
      validate: alternatingValidator(1),
      buildFallback: async () => "fallback",
      correlationId: "rg-2",
      callLLM: llm.fn,
    });
    expect(r.finalOutcome).toBe("passed_after_retry");
    expect(r.retryCount).toBe(1);
    expect(r.finalResponse).toBe("good");
    expect(llm.calls).toBe(2);
  });

  it("passes after retry 2", async () => {
    const llm = mockLlmReturning(["bad1", "bad2", "good"]);
    const r = await regenerateUntilValid({
      initialRequest,
      validate: alternatingValidator(2),
      buildFallback: async () => "fallback",
      correlationId: "rg-3",
      callLLM: llm.fn,
    });
    expect(r.finalOutcome).toBe("passed_after_retry");
    expect(r.retryCount).toBe(2);
    expect(llm.calls).toBe(3);
  });

  it("falls back when retry 2 also fails", async () => {
    const llm = mockLlmReturning(["bad1", "bad2", "bad3"]);
    const r = await regenerateUntilValid({
      initialRequest,
      validate: failingValidator([
        {
          check_name: "eval_mismatch_qualitative",
          severity: "error",
          llm_span: "x",
          expected: null,
          actual: null,
          detail: "y",
        },
      ]),
      buildFallback: async () => "FALLBACK CONTENT",
      correlationId: "rg-4",
      callLLM: llm.fn,
    });
    expect(r.finalOutcome).toBe("fallback_used");
    expect(r.finalResponse).toBe("FALLBACK CONTENT");
    expect(llm.calls).toBe(3);
    expect(r.cumulativeIssues.length).toBeGreaterThan(0);
  });

  it("emits one telemetry event per state transition", async () => {
    const llm = mockLlmReturning(["bad", "good"]);
    const r = await regenerateUntilValid({
      initialRequest,
      validate: alternatingValidator(1),
      buildFallback: async () => "fallback",
      correlationId: "rg-5",
      callLLM: llm.fn,
    });
    expect(r.telemetry.some((e) => e.fire_reason === "regenerate_invoked")).toBe(true);
    expect(r.telemetry.some((e) => e.fire_reason === "passed")).toBe(true);
  });

  it("accumulates totalCostUsd across all LLM + validator calls", async () => {
    const llm = mockLlmReturning(["bad", "good"]);
    const r = await regenerateUntilValid({
      initialRequest,
      validate: alternatingValidator(1),
      buildFallback: async () => "fallback",
      correlationId: "rg-6",
      callLLM: llm.fn,
    });
    expect(r.totalCostUsd).toBeGreaterThan(0);
  });

  // Regression for the cost-calc bug fixed alongside this test: prior
  // formula was inputUncached = (inputTokens - cacheRead), which goes
  // negative when cache_read_input_tokens > input_tokens (the normal
  // case for a cache-warm system prompt). Per Anthropic's docs,
  // input_tokens is ALREADY the uncached portion (tokens after the
  // last cache breakpoint); subtracting cacheRead double-counts.
  // https://platform.claude.com/docs/en/build-with-claude/prompt-caching
  it("totalCostUsd stays positive when cache_read_input_tokens > input_tokens", async () => {
    let i = 0;
    const cachedLlm = async (): Promise<LLMResult> => {
      const r: LLMResult = {
        content: ["bad", "good"][Math.min(i, 1)],
        provider: "anthropic",
        model: "claude-sonnet-4-test",
        inputTokens: 50, // post-breakpoint
        outputTokens: 200,
        cacheReadTokens: 7000, // cache hit — much larger than inputTokens
        elapsedMs: 100,
      };
      i++;
      return r;
    };
    const r = await regenerateUntilValid({
      initialRequest,
      validate: alternatingValidator(1),
      buildFallback: async () => "fallback",
      correlationId: "rg-cost-cacheread",
      callLLM: cachedLlm,
    });
    expect(r.totalCostUsd).toBeGreaterThan(0);
    // Hand-calc for ONE Sonnet call: 50/1M*$3 + 7000/1M*$0.30 + 200/1M*$15
    //   = $0.00015 + $0.00210 + $0.00300 = $0.00525.
    // Two LLM calls (initial bad + retry good) plus 2× validator costUsd ($0.001
    // each per alternatingValidator) → at minimum ~$0.0125. Use a loose lower
    // bound to allow for telemetry-cost evolution.
    expect(r.totalCostUsd).toBeGreaterThan(0.005);
  });

  // Regression: cache_creation_input_tokens was previously ignored entirely
  // (zero contribution to cost). Cache writes are billed at 1.25× base input
  // for the default 5-minute TTL per Anthropic's pricing page.
  it("totalCostUsd accounts for cache_creation_input_tokens at 1.25x base input", async () => {
    const writeLlm = async (): Promise<LLMResult> => ({
      content: "good",
      provider: "anthropic",
      model: "claude-sonnet-4-test",
      inputTokens: 50,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheCreationTokens: 6000, // first call, cache-write happening
      elapsedMs: 100,
    });
    const r = await regenerateUntilValid({
      initialRequest,
      validate: passingValidator(),
      buildFallback: async () => "fallback",
      correlationId: "rg-cost-cachewrite",
      callLLM: writeLlm,
    });
    // Hand-calc: 50/1M*$3 + 6000/1M*$3.75 + 100/1M*$15 + $0.001 validator
    //   = $0.00015 + $0.0225 + $0.0015 + $0.001 = $0.02515.
    // Without the cache-write term the LLM portion would be only
    //   50/1M*$3 + 100/1M*$15 = $0.00165 → total $0.00265. A bound between
    // these two values isolates the cache-write contribution.
    expect(r.totalCostUsd).toBeGreaterThan(0.015);
  });
});
