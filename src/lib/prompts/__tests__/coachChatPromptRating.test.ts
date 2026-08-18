import { describe, expect, it } from "vitest";
import { getCoachChatSystemPromptParts } from "@/lib/prompts/coachChatPrompt";
import type { CoachChatPromptInput } from "@/lib/prompts/coachChatPrompt";

/**
 * Finding A1 (MASTERMIND_CONTEXT/SILENT_SUBSTITUTION_HANDOFF.md).
 *
 * The prompt asserts a rating as fact. When the client can't supply one, it
 * must say so rather than pick a plausible number — a fabricated "1500" is
 * indistinguishable from a real one to the model AND to anyone reading the
 * prompt, which is what let this survive.
 */

function input(over: Partial<CoachChatPromptInput> = {}): CoachChatPromptInput {
  return {
    personalityId: "masti",
    userRating: 1500,
    ...over,
  } as CoachChatPromptInput;
}

describe("coach prompt — user rating", () => {
  it("states a real rating as a fact", () => {
    const { perUser } = getCoachChatSystemPromptParts(input({ userRating: 850 }));
    expect(perUser).toContain("- User rating: 850");
  });

  it("renders the sub-1200 band guidance for a genuinely low rating", () => {
    // This block is unreachable today: the client always sends 1500, so no
    // beginner has ever seen the calibration written for them.
    const { perUser } = getCoachChatSystemPromptParts(input({ userRating: 850 }));
    expect(perUser).toContain("Band focus (800-1200)");
  });

  it("says the rating is unknown instead of inventing one", () => {
    const { perUser } = getCoachChatSystemPromptParts(
      input({ userRating: undefined as unknown as number }),
    );
    // The specific failure: an absent rating must not surface as a number.
    expect(perUser).not.toContain("- User rating: 1500");
    expect(perUser).not.toContain("- User rating: undefined");
    expect(perUser).toMatch(/User rating: not provided/i);
  });

  it("falls back to intermediate calibration when the rating is absent", () => {
    const { perUser } = getCoachChatSystemPromptParts(
      input({ userRating: undefined as unknown as number }),
    );
    expect(perUser).toContain("INTERMEDIATE");
    // And must NOT claim beginner-band guidance it cannot justify.
    expect(perUser).not.toContain("Band focus");
  });
});
