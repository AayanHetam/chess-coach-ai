/**
 * PR-CI-4 verbalizer 4.0 prompt module: version split (legacy 3.6
 * untouched), charter content, server-dictated card plan, token budgeting.
 */
import { describe, it, expect } from "vitest";
import { PROMPT_VERSION } from "@/lib/prompts/coachChatPrompt";
import {
  buildVerbalizerUserTurn,
  getVerbalizerSystemPromptParts,
  maxTokensForInsights,
  selectCardInsights,
  VERBALIZER_CHARTER,
  VERBALIZER_PROMPT_VERSION,
} from "@/lib/prompts/verbalizerPrompt";
import { VERBALIZER_GOLD_EXAMPLES } from "@/lib/prompts/verbalizerGoldExamples";
import { renderInsightHeader } from "@/lib/contract/insightGrammar";
import { makeContract, makeInsight } from "@/lib/contract/__tests__/insightFactory";

describe("version topology (tech-lead decision #1)", () => {
  it("verbalizer is 4.1 (line stories) and legacy stays 3.6 — never bumped by this program", () => {
    expect(VERBALIZER_PROMPT_VERSION).toBe("4.1");
    expect(PROMPT_VERSION).toBe("3.6");
  });
});

describe("system prompt composition", () => {
  it("stable part = unchanged persona manifesto + charter suffix (cacheable)", () => {
    const parts = getVerbalizerSystemPromptParts({
      personalityId: "friendly",
      userRating: 1500,
    });
    expect(parts.stable).toContain("VERBALIZER CHARTER");
    expect(parts.stable).toContain(VERBALIZER_CHARTER);
    // Persona manifesto still present, unmodified ordering.
    expect(parts.stable).toContain("expert grandmaster-level chess coach");
    expect(parts.stable.indexOf("VERBALIZER CHARTER")).toBeGreaterThan(
      parts.stable.indexOf("expert grandmaster-level chess coach"),
    );
    // The gold examples are instruction, so they ride in the CACHED stable
    // half, after the charter — not in the per-game user turn.
    expect(parts.stable).toContain("CONTRACT→PROSE EXAMPLES");
    expect(parts.stable.indexOf("CONTRACT→PROSE EXAMPLES")).toBeGreaterThan(
      parts.stable.indexOf("VERBALIZER CHARTER"),
    );
    // Byte-stable per personality (prompt-cache prerequisite). userRating
    // differs here on purpose: anything per-user leaking into `stable` would
    // give every user a private prefix and silently un-cache the block.
    const again = getVerbalizerSystemPromptParts({ personalityId: "friendly", userRating: 900 });
    expect(again.stable).toBe(parts.stable);
  });

  it("charter carries the load-bearing rules", () => {
    expect(VERBALIZER_CHARTER).toContain("[F:<id>]");
    expect(VERBALIZER_CHARTER).toContain("engine data unavailable");
    expect(VERBALIZER_CHARTER).toContain("Never bluff a theme");
    expect(VERBALIZER_CHARTER).toContain("Rhetoric is YOURS");
  });
});

describe("card plan (server-dictated headers)", () => {
  it("user turn contains the contract JSON and the exact header line per card, in rank order", () => {
    const a = makeInsight(); // rank 1
    const b = makeInsight({ moveNumber: 14, color: "b", factIdPrefix: "M2", topMistakeRank: 2 });
    const intel = makeInsight({
      moveNumber: 20,
      color: "w",
      factIdPrefix: "I1",
      topMistakeRank: null,
      intelligenceRank: 1,
    });
    const contract = makeContract([a, b, intel]);
    const turn = buildVerbalizerUserTurn({ contract, messageText: "analyze my game" });
    expect(turn).toContain("## USER REQUEST:\nanalyze my game");
    expect(turn).toContain("## VERIFIED FACT CONTRACT");
    expect(turn).toContain(`"contractId":"${contract.contractId}"`);
    for (const i of [a, b, intel]) expect(turn).toContain(renderInsightHeader(i));
    const order = selectCardInsights(contract).map((i) => i.factIdPrefix);
    expect(order).toEqual(["M1", "M2", "I1"]);
    // The gold examples moved to the cached stable system block. The user
    // turn is billed uncached on every review, so it carries per-game
    // evidence ONLY — re-adding fixed instruction here is a cost regression.
    expect(turn).not.toContain("CONTRACT→PROSE EXAMPLES");
    // 3 founder-approved (2026-08-10) + 1 added by the CI-4 gate recovery to
    // teach per-sentence citation density inside the [WHY] scaffold + 1 added
    // with verbalizer 4.1 to teach explaining a line through its story facts.
    expect(VERBALIZER_GOLD_EXAMPLES).toHaveLength(5);
  });
});

describe("maxTokens budgeting (plan §2 — truncation never eats the last card)", () => {
  it("floors at the legacy 3000, scales with card count, ceilings at 8000", () => {
    expect(maxTokensForInsights(0)).toBe(3000);
    expect(maxTokensForInsights(4)).toBe(3000);
    expect(maxTokensForInsights(6)).toBe(4200);
    expect(maxTokensForInsights(50)).toBe(8000);
  });
});
