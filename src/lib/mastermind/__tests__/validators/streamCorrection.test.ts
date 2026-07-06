import { describe, it, expect } from "vitest";

import {
  correctStreamedAnalysis,
  buildIssueFootnotes,
} from "@/lib/mastermind/validators/streamCorrection";
import type { ValidatorIssue } from "@/lib/mastermind/validators/types";
import type { LLMResult, CallLLMOptions } from "@/lib/llmProvider";

const ISSUE: ValidatorIssue = {
  check_name: "material_win_unsupported",
  severity: "error",
  llm_span: "winning a whole rook",
  expected: { material_win_confidence: "MED_or_HIGH" },
  actual: { material_win_confidence: "NONE", sf_cp: 12 },
  detail: "LLM claimed decisive material win but Stockfish shows +0.12 (near equality)",
};

const RAW =
  "Great fighting game! On move 24 you missed Nxd5, winning a whole rook. " +
  "Your endgame technique after move 30 was excellent — trading into the pawn ending was the right call.";

const mockLLM =
  (content: string): ((opts: CallLLMOptions) => Promise<LLMResult>) =>
  async () => ({
    content,
    model: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    inputTokens: 500,
    outputTokens: 200,
    elapsedMs: 900,
  } as unknown as LLMResult);

describe("correctStreamedAnalysis", () => {
  it("returns the Haiku edit when it looks sane", async () => {
    const edited =
      "Great fighting game! On move 24 Nxd5 was the strongest option. " +
      "Your endgame technique after move 30 was excellent — trading into the pawn ending was the right call.";
    const r = await correctStreamedAnalysis({
      rawText: RAW,
      issues: [ISSUE],
      correlationId: "t1",
      callLLMImpl: mockLLM(edited),
    });
    expect(r.mode).toBe("edited");
    expect(r.correctedText).toBe(edited);
    expect(r.correctedText).not.toContain("whole rook");
    expect(r.costUsd).toBeGreaterThan(0);
  });

  it("falls back to footnotes when the edit destroys the message", async () => {
    const r = await correctStreamedAnalysis({
      rawText: RAW,
      issues: [ISSUE],
      correlationId: "t2",
      callLLMImpl: mockLLM("ok"), // 2 chars — fails the sanity ratio
    });
    expect(r.mode).toBe("footnoted");
    // The original text still ships — with the disproven claim flagged.
    expect(r.correctedText).toContain(RAW);
    expect(r.correctedText).toContain("Engine check");
    expect(r.correctedText).toContain("winning a whole rook");
  });

  it("falls back to footnotes when the edit call throws", async () => {
    const r = await correctStreamedAnalysis({
      rawText: RAW,
      issues: [ISSUE],
      correlationId: "t3",
      callLLMImpl: async () => {
        throw new Error("anthropic 529");
      },
    });
    expect(r.mode).toBe("footnoted");
    expect(r.correctedText).toContain("Engine check");
    expect(r.costUsd).toBe(0);
  });

  it("falls back to footnotes when the edit bloats the message (invented content)", async () => {
    const bloated = RAW + " " + "Also consider the fascinating history of this opening. ".repeat(20);
    const r = await correctStreamedAnalysis({
      rawText: RAW,
      issues: [ISSUE],
      correlationId: "t4",
      callLLMImpl: mockLLM(bloated),
    });
    expect(r.mode).toBe("footnoted");
  });
});

describe("buildIssueFootnotes", () => {
  it("lists each disproven claim with its engine reason", () => {
    const notes = buildIssueFootnotes([ISSUE]);
    expect(notes).toContain("winning a whole rook");
    expect(notes).toContain("+0.12");
    expect(notes).toContain("could not be verified");
  });

  it("caps at 5 issues", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...ISSUE,
      llm_span: `claim-${i}`,
    }));
    const notes = buildIssueFootnotes(many);
    expect(notes).toContain("claim-4");
    expect(notes).not.toContain("claim-5");
  });
});
