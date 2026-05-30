import { describe, expect, it } from "vitest";
import {
  getCoachChatSystemPrompt,
  getCoachChatSystemPromptParts,
  type CoachChatPromptInput,
} from "../coachChatPrompt";

// These tests lock the contract between the structured form
// (getCoachChatSystemPromptParts) and the concatenated form
// (getCoachChatSystemPrompt). The structured form is what the
// enhanced-analysis route now sends to Anthropic so the stable prefix
// can sit under an ephemeral prompt-cache marker while the per-user
// tail rides uncached. If `stable` ever drifts to contain per-user
// fields, the prompt cache hit rate collapses; these tests catch that.

const baseInput: CoachChatPromptInput = {
  personalityId: "friendly",
  userRating: 1500,
  username: "alice",
  playerColorName: "white",
  chesscomUsername: "alice_chess",
  lichessUsername: "alice_lichess",
};

describe("getCoachChatSystemPromptParts — split contract", () => {
  it("joins back to the exact concatenated form", () => {
    const { stable, perUser } = getCoachChatSystemPromptParts(baseInput);
    expect(`${stable}\n\n${perUser}`).toBe(getCoachChatSystemPrompt(baseInput));
  });

  it("keeps the stable half byte-identical across users who share a personalityId", () => {
    const aliceParts = getCoachChatSystemPromptParts({
      ...baseInput,
      username: "alice",
      userRating: 1450,
      chesscomUsername: "alice_chess",
      lichessUsername: "alice_lichess",
    });
    const bobParts = getCoachChatSystemPromptParts({
      ...baseInput,
      username: "bob",
      userRating: 1900,
      chesscomUsername: undefined,
      lichessUsername: "bobby",
    });
    expect(aliceParts.stable).toBe(bobParts.stable);
    expect(aliceParts.perUser).not.toBe(bobParts.perUser);
  });

  it("differs in stable when personalityId differs (different voice → different cached prefix)", () => {
    const friendly = getCoachChatSystemPromptParts({
      ...baseInput,
      personalityId: "friendly",
    });
    const grandmaster = getCoachChatSystemPromptParts({
      ...baseInput,
      personalityId: "grandmaster",
    });
    expect(friendly.stable).not.toBe(grandmaster.stable);
  });

  it("keeps the username out of the cached prefix", () => {
    const { stable } = getCoachChatSystemPromptParts({
      ...baseInput,
      username: "totally_unique_handle_12345",
    });
    expect(stable).not.toContain("totally_unique_handle_12345");
  });

  it("keeps the user rating out of the cached prefix", () => {
    const { stable } = getCoachChatSystemPromptParts({
      ...baseInput,
      userRating: 1742,
    });
    expect(stable).not.toContain("1742");
  });

  it("keeps the chess.com / lichess handles out of the cached prefix", () => {
    const { stable } = getCoachChatSystemPromptParts({
      ...baseInput,
      chesscomUsername: "alice_unique_chesscom",
      lichessUsername: "alice_unique_lichess",
    });
    expect(stable).not.toContain("alice_unique_chesscom");
    expect(stable).not.toContain("alice_unique_lichess");
  });

  it("keeps coaching prefs (tone / style / goals / openings) out of the cached prefix", () => {
    const { stable } = getCoachChatSystemPromptParts({
      ...baseInput,
      coachingPrefs: {
        coachTone: "masti",
        playingStyle: "tactical",
        studyGoals: ["tactics", "endgames"],
        favoriteOpenings: ["unique_caro_kann_handle"],
      },
    });
    expect(stable).not.toContain("unique_caro_kann_handle");
    expect(stable).not.toContain("Masti");
  });

  it("threads the username + rating + prefs into perUser", () => {
    const { perUser } = getCoachChatSystemPromptParts({
      ...baseInput,
      username: "alice",
      userRating: 1742,
      coachingPrefs: {
        coachTone: "strict",
        playingStyle: "positional",
        studyGoals: ["openings"],
        favoriteOpenings: ["Caro-Kann"],
      },
    });
    expect(perUser).toContain("alice");
    expect(perUser).toContain("1742");
    // renderCoachingPrefs renders prose blurbs rather than echoing the
    // raw enum values, so assert on stable phrases from those blurbs.
    // "no-nonsense" is the strict-tone marker; "long-term plans" is the
    // positional-style marker.
    expect(perUser.toLowerCase()).toContain("no-nonsense");
    expect(perUser).toContain("long-term plans");
    expect(perUser).toContain("Caro-Kann");
  });
});
