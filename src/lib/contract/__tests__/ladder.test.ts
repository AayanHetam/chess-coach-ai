/**
 * PR-CI-4 failure ladder: stage progression, budget caps, deadline
 * short-circuit, and the template floor. All hermetic — deterministic
 * referee mode + injected LLM seams; no network.
 */
import { describe, it, expect, vi } from "vitest";
import { dropViolatingSentences, runInsightLadder, DEFAULT_LADDER_BUDGETS } from "@/lib/contract/ladder";
import type { LadderBudgets, LadderCardOpts } from "@/lib/contract/ladder";
import type { StreamCorrectionResult } from "@/lib/mastermind/validators/streamCorrection";
import type { LLMResult } from "@/lib/llmProvider";
import { makeContract, makeInsight } from "./insightFactory";

const insight = makeInsight();
const contract = makeContract([insight]);

const CLEAN_BODY =
  "You went for Bd3, but Ne6 was the star move [F:M1]. After Ne6 Qd7 Nxg7 the knight nets material at +3.20 [F:M1.pv0]. A fine fighting choice, just one square short.";
const BAD_EVAL_SENTENCE = "The eval crashed to -9.50 after this.";
const BAD_BODY = `${CLEAN_BODY}\n${BAD_EVAL_SENTENCE}`;

function llmResult(content: string): LLMResult {
  return {
    content,
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    inputTokens: 100,
    outputTokens: 50,
    elapsedMs: 5,
  } as LLMResult;
}

function makeOpts(over: Partial<LadderCardOpts> = {}): LadderCardOpts {
  return {
    insight,
    contract,
    refereeOpts: { userRating: 1500, correlationId: "t", playerPerspective: "white" },
    refereeMode: "deterministic",
    citationGranularity: "sentence",
    deadlineAtMs: Date.now() + 60_000,
    budgets: DEFAULT_LADDER_BUDGETS(),
    regenSystem: { stable: "SYS", perUser: "USER" },
    ...over,
  };
}

describe("dropViolatingSentences", () => {
  it("excises only the sentences containing violation spans", () => {
    const out = dropViolatingSentences(BAD_BODY, ["-9.50"]);
    expect(out).toContain("star move");
    expect(out).not.toContain("-9.50");
  });

  it("returns null when the drop would leave no substantive prose", () => {
    expect(dropViolatingSentences("Bad -9.50 claim.", ["-9.50"])).toBeNull();
  });

  it("never drops grammar-token lines", () => {
    const body = "[WHY]\nGood line here about the game and the plan ahead.\nBad -9.50 claim.\n[/WHY]";
    const out = dropViolatingSentences(body, ["-9.50"]);
    expect(out).toContain("[WHY]");
    expect(out).toContain("[/WHY]");
    expect(out).not.toContain("-9.50");
  });
});

describe("runInsightLadder — stages", () => {
  it("clean body passes untouched (stage: pass), citations stripped, header authoritative", async () => {
    const result = await runInsightLadder(CLEAN_BODY, makeOpts());
    expect(result.stage).toBe("pass");
    expect(result.finalText.startsWith("[INSIGHT:11:w:blunder:+1.38:-2.12:Bd3:Ne6]")).toBe(true);
    expect(result.finalText.endsWith("[/INSIGHT]")).toBe(true);
    expect(result.finalText).not.toContain("[F:");
    expect(result.errorsInitial).toBe(0);
    expect(result.citationCoverage).toBeGreaterThan(0);
    expect(result.citedFactIds).toContain("M1.pv0");
  });

  it("a violation confined to one sentence resolves by sentence-drop (no LLM)", async () => {
    const opts = makeOpts();
    const result = await runInsightLadder(BAD_BODY, opts);
    expect(result.stage).toBe("sentence_drop");
    expect(result.finalText).not.toContain("-9.50");
    expect(result.finalText).toContain("star move");
    expect(result.editsUsed).toBe(0);
    expect(result.regensUsed).toBe(0);
    expect(opts.budgets.editsRemaining).toBe(2);
  });

  it("falls to Haiku surgical edit when sentence-drop cannot clean, then re-referees", async () => {
    // Violation span present in EVERY line ⇒ drop leaves nothing ⇒ edit.
    const body = "The eval crashed to -9.50 which loses everything for -9.50 reasons.";
    const correctImpl = vi.fn(async (): Promise<StreamCorrectionResult> => ({
      correctedText: CLEAN_BODY,
      mode: "edited",
      costUsd: 0.001,
    }));
    const opts = makeOpts({ deps: { correctImpl } });
    const result = await runInsightLadder(body, opts);
    expect(result.stage).toBe("edited");
    expect(correctImpl).toHaveBeenCalledOnce();
    expect(result.editsUsed).toBe(1);
    expect(opts.budgets.editsRemaining).toBe(1);
    expect(result.finalText).toContain("star move");
  });

  it("failed edit (mode footnoted) does NOT ship — falls to regen", async () => {
    const body = "The eval crashed to -9.50 which loses everything for -9.50 reasons.";
    const correctImpl = vi.fn(async (): Promise<StreamCorrectionResult> => ({
      correctedText: body + "\n\n---\n*Engine check: ...*",
      mode: "footnoted",
      costUsd: 0,
    }));
    const callLLMImpl = vi.fn(async () => llmResult(CLEAN_BODY));
    const opts = makeOpts({ deps: { correctImpl, callLLMImpl } });
    const result = await runInsightLadder(body, opts);
    expect(result.stage).toBe("regenerated");
    expect(result.regensUsed).toBe(1);
    expect(opts.budgets.regensRemaining).toBe(2);
    expect(result.finalText).not.toContain("-9.50");
  });

  it("exhausted budgets resolve to the template floor", async () => {
    const body = "The eval crashed to -9.50 which loses everything for -9.50 reasons.";
    const budgets: LadderBudgets = { editsRemaining: 0, regensRemaining: 0, relationalRemaining: 0 };
    const correctImpl = vi.fn();
    const callLLMImpl = vi.fn();
    const opts = makeOpts({ budgets, deps: { correctImpl: correctImpl as never, callLLMImpl: callLLMImpl as never } });
    const result = await runInsightLadder(body, opts);
    expect(result.stage).toBe("templated");
    expect(correctImpl).not.toHaveBeenCalled();
    expect(callLLMImpl).not.toHaveBeenCalled();
    expect(result.finalText).toContain("[INSIGHT:11:w:blunder:");
    expect(result.finalText).not.toContain("-9.50");
  });

  it("deadline breach skips LLM stages and resolves instantly to the template", async () => {
    const body = "The eval crashed to -9.50 which loses everything for -9.50 reasons.";
    const correctImpl = vi.fn();
    const callLLMImpl = vi.fn();
    const opts = makeOpts({
      deadlineAtMs: Date.now() + 500, // no LLM stage fits
      deps: { correctImpl: correctImpl as never, callLLMImpl: callLLMImpl as never },
    });
    const result = await runInsightLadder(body, opts);
    expect(result.stage).toBe("templated");
    expect(result.deadlineBreached).toBe(true);
    expect(correctImpl).not.toHaveBeenCalled();
    expect(callLLMImpl).not.toHaveBeenCalled();
  });

  it("LLM infra failure mid-ladder still lands on the template floor (never blank)", async () => {
    const body = "The eval crashed to -9.50 which loses everything for -9.50 reasons.";
    const boom = vi.fn(async () => {
      throw new Error("anthropic 529");
    });
    const opts = makeOpts({ deps: { correctImpl: boom as never, callLLMImpl: boom as never } });
    const result = await runInsightLadder(body, opts);
    expect(result.stage).toBe("templated");
    expect(result.finalText.length).toBeGreaterThan(50);
  });

  it("full referee mode consumes the relational budget via the injected parser seam", async () => {
    const relationalParseCall = vi.fn(async () => ({
      content: JSON.stringify({ claims: [] }),
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0,
    }));
    const opts = makeOpts({
      refereeMode: "full",
      deps: { relationalParseCall: relationalParseCall as never },
    });
    const result = await runInsightLadder(CLEAN_BODY, opts);
    expect(result.stage).toBe("pass");
    expect(relationalParseCall).toHaveBeenCalled();
    expect(opts.budgets.relationalRemaining).toBe(7);
  });
});
