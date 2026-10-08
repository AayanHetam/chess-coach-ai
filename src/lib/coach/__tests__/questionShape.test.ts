import { describe, expect, it } from "vitest";
import { isWalkthroughQuestion } from "../questionShape";
import { isWalkthroughQuestion as fromPrompt } from "@/lib/prompts/followUpPrompt";

/**
 * The shape of a question, read from its words alone, shared by the prompt
 * (its budget), the intent router and the client's what-if.
 */
describe("isWalkthroughQuestion", () => {
  it("reads the asks for the longer form", () => {
    for (const q of [
      "walk me through the line",
      "Walk through 8. Qxc1 Rb8 for me",
      "explain it step by step",
      "step-by-step please",
      "take me through the whole line",
      "go through the entire line",
      "explain the whole line",
    ])
      expect(isWalkthroughQuestion(q), q).toBe(true);
  });

  it("leaves the short asks alone", () => {
    for (const q of [
      "why not 8. Qxc1?",
      "what about Nd6+ instead?",
      "was that a blunder?",
      "I walked into a fork",
      "",
    ])
      expect(isWalkthroughQuestion(q), q).toBe(false);
  });

  it("is the one the follow-up prompt still exports", () => {
    expect(fromPrompt).toBe(isWalkthroughQuestion);
  });
});
