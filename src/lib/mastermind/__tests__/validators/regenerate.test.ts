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
});
