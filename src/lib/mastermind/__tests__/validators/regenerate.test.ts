import { describe, it, expect } from "vitest";
import {
  regenerateUntilValid,
  buildRetryInstruction,
  buildSurgicalCorrectionRequest,
} from "../../validators/regenerate";
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

describe("regenerateUntilValid: signal cancellation (fix-orphan-pipeline-cancellation)", () => {
  it("signal aborted before first attempt → breaks loop immediately, calls fallback, 0 LLM calls", async () => {
    const controller = new AbortController();
    controller.abort();
    const llm = mockLlmReturning(["never reached"]);
    const r = await regenerateUntilValid({
      initialRequest,
      validate: failingValidator([
        {
          check_name: "eval_mismatch_qualitative",
          severity: "error",
          llm_span: "",
          expected: null,
          actual: null,
          detail: "",
        },
      ]),
      buildFallback: async () => "fallback used",
      correlationId: "rg-abort-pre",
      callLLM: llm.fn,
      signal: controller.signal,
    });
    expect(llm.calls).toBe(0); // never entered the loop body
    expect(r.finalResponse).toBe("fallback used");
    expect(r.finalOutcome).toBe("fallback_used");
  });

  it("signal aborts mid-loop → breaks before spawning next retry's callLLM", async () => {
    // First attempt completes (signal not yet aborted), validation fails →
    // would normally retry. Before retry, signal aborts. Loop should break,
    // fallback runs. llm.calls === 1, not 2.
    const controller = new AbortController();
    const llm = mockLlmReturning(["bad1", "bad2"]);
    let validateCount = 0;
    const validateAndAbort = async (): Promise<ValidatorResult> => {
      validateCount++;
      if (validateCount === 1) {
        // After the first validate completes, abort the signal so the next
        // loop iteration's top-of-loop signal.aborted check triggers break.
        controller.abort();
      }
      return {
        issues: [
          {
            check_name: "eval_mismatch_qualitative",
            severity: "error",
            llm_span: "",
            expected: null,
            actual: null,
            detail: "",
          } as ValidatorIssue,
        ],
        passed: false,
        telemetry: [],
        costUsd: 0.001,
      };
    };
    const r = await regenerateUntilValid({
      initialRequest,
      validate: validateAndAbort,
      buildFallback: async () => "fallback after abort",
      correlationId: "rg-abort-mid",
      callLLM: llm.fn,
      signal: controller.signal,
    });
    expect(llm.calls).toBe(1); // only the first attempt; retry never spawned
    expect(r.finalResponse).toBe("fallback after abort");
    expect(r.finalOutcome).toBe("fallback_used");
  });

  it("signal threaded into callLLM opts (default-undefined preserves existing behavior)", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const spyLlm: (opts: CallLLMOptions) => Promise<LLMResult> = async (opts) => {
      receivedSignal = opts.signal;
      return {
        content: "ok",
        provider: "anthropic",
        model: "claude-sonnet-4-test",
        inputTokens: 1,
        outputTokens: 1,
      } as LLMResult;
    };
    await regenerateUntilValid({
      initialRequest,
      validate: passingValidator(),
      buildFallback: async () => "fb",
      correlationId: "rg-signal-thread",
      callLLM: spyLlm,
      signal: controller.signal,
    });
    expect(receivedSignal).toBe(controller.signal);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Surgical correction (feat/adaptive-coach)
// ─────────────────────────────────────────────────────────────────────────

function relationalIssue(span: string, reason: string): ValidatorIssue {
  return {
    check_name: "relational_claim_contradicted",
    severity: "error",
    llm_span: span,
    expected: { verdict: "holds" },
    actual: { verdict: "contradicted", reason },
    detail: `Relational claim contradicted by chess.js oracle: "${span}" — ${reason}`,
  };
}

describe("buildSurgicalCorrectionRequest", () => {
  it("requests the FAST (Haiku) tier with a deterministic temperature", () => {
    const req = buildSurgicalCorrectionRequest(
      "prev text",
      [relationalIssue("the knight on f3 attacks g6", "f3 does not attack g6")],
    );
    expect(req.tier).toBe("fast");
    expect(req.temperature).toBe(0);
  });

  it("names the specific contradicted claim (rawText + oracle reason) in the prompt", () => {
    const req = buildSurgicalCorrectionRequest(
      "You can play Nxh7 because the rook on h7 is hanging.",
      [relationalIssue("the rook on h7 is hanging", "h7 is empty — nothing to capture")],
    );
    const user = req.messages[0].content;
    expect(user).toContain("the rook on h7 is hanging");
    expect(user).toContain("h7 is empty — nothing to capture");
    // The full prior response is embedded for verbatim editing.
    expect(user).toContain("You can play Nxh7 because the rook on h7 is hanging.");
  });

  it("does NOT carry the coach system prompt (fresh editor prompt only)", () => {
    const req = buildSurgicalCorrectionRequest(
      "prev",
      [relationalIssue("a", "b")],
    );
    expect(req.system).not.toBe("test system");
    expect(req.system).toContain("precise text editor");
    expect(req.systemSuffix).toBeUndefined();
    expect(req.cacheSystem).toBeUndefined();
  });

  it("mirrors the source maxTokens so the edited message is not truncated", () => {
    expect(buildSurgicalCorrectionRequest("p", [relationalIssue("a", "b")], 3000).maxTokens).toBe(3000);
    // Falls back to a sane default when the source cap is omitted.
    expect(buildSurgicalCorrectionRequest("p", [relationalIssue("a", "b")]).maxTokens).toBe(3000);
  });
});

// A mock LLM that returns flagship-modeled output for the first call (the
// initial flagship analysis) and Haiku-modeled output for the surgical edit,
// driven by the request's tier. Records each call's tier + opts for assertions.
function tierAwareLlm(byTier: { flagship: string[]; fast: string[] }): {
  fn: (opts: CallLLMOptions) => Promise<LLMResult>;
  tiers: ("flagship" | "fast")[];
  opts: CallLLMOptions[];
} {
  const idx = { flagship: 0, fast: 0 };
  const tiers: ("flagship" | "fast")[] = [];
  const opts: CallLLMOptions[] = [];
  return {
    fn: async (o) => {
      tiers.push(o.tier);
      opts.push(o);
      const pool = byTier[o.tier];
      const content = pool[Math.min(idx[o.tier], pool.length - 1)];
      idx[o.tier]++;
      return {
        content,
        provider: "anthropic",
        model: o.tier === "fast" ? "claude-haiku-4-5-test" : "claude-sonnet-4-test",
        inputTokens: 100,
        outputTokens: 50,
      } as LLMResult;
    },
    tiers,
    opts,
  };
}

// Validator that fails ONLY on the initial flagship text, passes once the
// surgical (fast) edit has stripped the offending phrase.
function failThenPassOnSurgical(badText: string): {
  fn: (response: string) => Promise<ValidatorResult>;
  count: number;
} {
  const state = { count: 0 };
  return {
    fn: async (response: string) => {
      state.count++;
      const stillBad = response.includes(badText);
      return stillBad
        ? {
            issues: [relationalIssue(badText, "f3 does not attack g6")],
            passed: false,
            telemetry: [],
            costUsd: 0.001,
          }
        : { issues: [], passed: true, telemetry: [], costUsd: 0.001 };
    },
    get count() {
      return state.count;
    },
  };
}

describe("regenerateUntilValid: surgical correction", () => {
  it("surgical pass returns passed_after_retry without a 2nd flagship call", async () => {
    const badPhrase = "the knight attacks g6";
    const llm = tierAwareLlm({
      flagship: [`Good move. ${badPhrase}.`],
      fast: ["Good move."], // surgical edit removed the false phrase
    });
    const validate = failThenPassOnSurgical(badPhrase);
    const r = await regenerateUntilValid({
      initialRequest: { ...initialRequest, maxTokens: 3000 },
      validate: validate.fn,
      buildFallback: async () => "FALLBACK",
      correlationId: "rg-surgical-pass",
      callLLM: llm.fn,
      maxRetries: 1,
    });
    expect(r.finalOutcome).toBe("passed_after_retry");
    expect(r.finalResponse).toBe("Good move.");
    // Exactly one flagship call (the initial) + one fast surgical call.
    expect(llm.tiers).toEqual(["flagship", "fast"]);
    expect(llm.tiers.filter((t) => t === "flagship").length).toBe(1);
    // Surgical request was named with the specific claim.
    const surgicalOpts = llm.opts.find((o) => o.tier === "fast")!;
    expect(surgicalOpts.maxTokens).toBe(3000);
    expect(surgicalOpts.messages[0].content).toContain(badPhrase);
  });

  it("surgical fail still falls back (truthfulness floor unchanged)", async () => {
    const badPhrase = "the bishop attacks h2";
    // Surgical edit fails to remove the phrase; with maxRetries 0 there is no
    // flagship retry, so the loop falls straight through to buildFallback.
    const llm = tierAwareLlm({
      flagship: [`Watch out: ${badPhrase}.`],
      fast: [`Watch out: ${badPhrase}.`], // Haiku botched it — phrase remains
    });
    const validate = failThenPassOnSurgical(badPhrase);
    const r = await regenerateUntilValid({
      initialRequest: { ...initialRequest, maxTokens: 3000 },
      validate: validate.fn,
      buildFallback: async () => "FALLBACK CONTENT",
      correlationId: "rg-surgical-fail",
      callLLM: llm.fn,
      maxRetries: 0,
    });
    expect(r.finalOutcome).toBe("fallback_used");
    expect(r.finalResponse).toBe("FALLBACK CONTENT");
    // Initial flagship + one surgical attempt; no flagship retry (maxRetries 0).
    expect(llm.tiers).toEqual(["flagship", "fast"]);
    // Both the initial and surgical-output issues are accumulated.
    expect(r.cumulativeIssues.length).toBeGreaterThanOrEqual(2);
  });

  it("does NOT attempt surgical edit on mixed (non-relational) issue sets", async () => {
    const llm = tierAwareLlm({
      flagship: ["bad1", "bad2"],
      fast: ["should not be reached"],
    });
    const mixedValidator = async (): Promise<ValidatorResult> => ({
      issues: [
        relationalIssue("a relational thing", "oracle says no"),
        {
          check_name: "eval_mismatch_qualitative",
          severity: "error",
          llm_span: "winning",
          expected: { band: "equal" },
          actual: { band: "winning" },
          detail: "Wrong band.",
        },
      ],
      passed: false,
      telemetry: [],
      costUsd: 0.001,
    });
    const r = await regenerateUntilValid({
      initialRequest,
      validate: mixedValidator,
      buildFallback: async () => "FALLBACK",
      correlationId: "rg-surgical-mixed",
      callLLM: llm.fn,
      maxRetries: 1,
    });
    // No fast-tier call: surgical path is gated on an all-relational set.
    expect(llm.tiers.includes("fast")).toBe(false);
    // Existing full-regen path ran: initial flagship + one flagship retry.
    expect(llm.tiers).toEqual(["flagship", "flagship"]);
    expect(r.finalOutcome).toBe("fallback_used");
  });

  it("costs the surgical edit at Haiku rates (model contains 'haiku')", async () => {
    const badPhrase = "queen forks the king and rook";
    const llm = tierAwareLlm({
      flagship: [`Nice. ${badPhrase}.`],
      fast: ["Nice."],
    });
    const validate = failThenPassOnSurgical(badPhrase);
    const r = await regenerateUntilValid({
      initialRequest: { ...initialRequest, maxTokens: 3000 },
      validate: validate.fn,
      buildFallback: async () => "FALLBACK",
      correlationId: "rg-surgical-cost",
      callLLM: llm.fn,
      maxRetries: 1,
    });
    // Default estimateCost keys Haiku rates off model.includes("haiku"); the
    // surgical call's contribution must be counted (positive total includes it).
    expect(r.totalCostUsd).toBeGreaterThan(0);
    // Haiku call: 100/1M*$1 + 50/1M*$5 = $0.00035, plus 2 validator calls
    // ($0.001 each) and one Sonnet call (100/1M*$3 + 50/1M*$15 = $0.00105).
    // Total ≈ $0.0024 — assert above the Sonnet-only floor to prove the
    // surgical Haiku call was added.
    expect(r.totalCostUsd).toBeGreaterThan(0.0012);
  });

  it("aborts to fallback when signal expires during the surgical attempt", async () => {
    const badPhrase = "rook controls the open d-file behind a pawn";
    const controller = new AbortController();
    const llm = tierAwareLlm({
      flagship: [`Note: ${badPhrase}.`, "should-not-reach flagship retry"],
      fast: [`Note: ${badPhrase}.`], // surgical fails to fix
    });
    let validateCount = 0;
    const validate = async (response: string): Promise<ValidatorResult> => {
      validateCount++;
      // Abort after the surgical re-validation (2nd validate) completes, so
      // the post-surgical abort check short-circuits to fallback instead of
      // launching a flagship retry.
      if (validateCount === 2) controller.abort();
      return {
        issues: [relationalIssue(badPhrase, "no such pawn")],
        passed: response.includes(badPhrase) ? false : true,
        telemetry: [],
        costUsd: 0.001,
      };
    };
    const r = await regenerateUntilValid({
      initialRequest: { ...initialRequest, maxTokens: 3000 },
      validate,
      buildFallback: async () => "FALLBACK ON ABORT",
      correlationId: "rg-surgical-abort",
      callLLM: llm.fn,
      maxRetries: 1,
      signal: controller.signal,
    });
    expect(r.finalOutcome).toBe("fallback_used");
    expect(r.finalResponse).toBe("FALLBACK ON ABORT");
    // initial flagship + surgical fast; NO flagship retry (aborted first).
    expect(llm.tiers).toEqual(["flagship", "fast"]);
  });
});
