import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FOLLOWUP_MAX_TOKENS,
  FOLLOWUP_PROMPT_VERSION,
  FOLLOWUP_WORD_BUDGET,
  getFollowUpPromptMode,
  getFollowUpSystemPromptStable,
} from "../followUpPrompt";
import { coachPersonalities } from "@/config/coachPersonalities";

describe("getFollowUpSystemPromptStable — snapshots per personality", () => {
  for (const p of coachPersonalities) {
    it(`matches snapshot for personality '${p.id}'`, () => {
      expect(getFollowUpSystemPromptStable(p.id)).toMatchSnapshot();
    });
  }
});

describe("getFollowUpSystemPromptStable — invariants", () => {
  const out = getFollowUpSystemPromptStable("friendly");

  it("is a fraction of the turn-1 prompt", () => {
    // The turn-1 stable block is ~27k characters. This one has to stay small
    // enough that its whole job — the shape, the budget and the teaching
    // rules — is legible: a quarter of it, attitude included.
    expect(out.length).toBeLessThan(7500);
  });

  it("states the word budget and the teaching shape", () => {
    expect(out).toContain(`at most ${FOLLOWUP_WORD_BUDGET} words`);
    expect(out).toContain("1. THE IDEA, THEN WHAT HAPPENS");
    expect(out).toContain("2. PROOF");
    expect(out).toContain("3. LESSON");
    expect(out).toContain("4. YOUR TURN");
  });

  it("asks for a lesson with a trigger, not a maxim, and marks it for the client", () => {
    expect(out).toContain('starts with "Lesson:"');
    expect(out).toContain("a habit with a trigger, not a maxim");
    expect(out).toContain("Name the pattern");
    expect(out).toContain('Start it with "Your turn:"');
  });

  it("wants causes, never the number", () => {
    expect(out).toContain("Causes, never the number");
    expect(out).toContain("what the move was for");
  });

  it("teaches the two line tokens the client renders", () => {
    expect(out).toContain("[CONTINUATION:<moveNumber>:<color>]");
    expect(out).toContain("[PLAYED:<moveNumber>:<color>]");
  });

  it("carries none of the turn-1 card grammar", () => {
    expect(out).not.toContain("[INSIGHT:");
    expect(out).not.toContain("[WHY]");
    expect(out).not.toContain("[THREATS]");
    expect(out).not.toContain("MAIA_CONTINUATION");
  });

  it("names the calibration section the stored USER CONTEXT block points at", () => {
    // The per-user tail stored with the review says "use the X calibration
    // from the SKILL-LEVEL CALIBRATION section above".
    expect(out).toContain("SKILL-LEVEL CALIBRATION");
  });

  it("bans the openers and closers the real answers carried", () => {
    for (const phrase of [
      "Great question",
      "You're absolutely right",
      "Does that clarify",
      "The pattern to remember:",
    ]) {
      expect(out).toContain(phrase);
    }
  });

  it("has no unresolved interpolation", () => {
    expect(out).not.toContain("${");
    expect(out).not.toContain("[object Object]");
    expect(out).not.toContain("undefined");
  });

  it("wears the attitude", () => {
    expect(getFollowUpSystemPromptStable("grandmaster")).toContain(
      "GRANDMASTER ATTITUDE"
    );
    expect(getFollowUpSystemPromptStable("rival")).not.toContain(
      "GRANDMASTER ATTITUDE"
    );
  });

  it("falls back to the default attitude for an unknown id", () => {
    expect(getFollowUpSystemPromptStable("not-a-personality")).toBe(
      getFollowUpSystemPromptStable("friendly")
    );
  });

  it("pins the constants the route relies on", () => {
    expect(FOLLOWUP_PROMPT_VERSION).toBe("1.2");
    expect(FOLLOWUP_MAX_TOKENS).toBeGreaterThan(300);
    expect(FOLLOWUP_MAX_TOKENS).toBeLessThan(3000);
  });
});

describe("getFollowUpPromptMode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to the new prompt", () => {
    vi.stubEnv("COACH_FOLLOWUP_PROMPT", "");
    expect(getFollowUpPromptMode()).toBe("v1");
  });

  it("'legacy' (trimmed, any case) is the rollback", () => {
    vi.stubEnv("COACH_FOLLOWUP_PROMPT", " Legacy\n");
    expect(getFollowUpPromptMode()).toBe("legacy");
  });

  it("anything else is the new prompt", () => {
    vi.stubEnv("COACH_FOLLOWUP_PROMPT", "v2");
    expect(getFollowUpPromptMode()).toBe("v1");
  });
});
