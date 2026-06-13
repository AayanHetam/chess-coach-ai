import { describe, expect, it } from "vitest";
import {
  getCoachChatSystemPrompt,
  PROMPT_VERSION,
  type CoachChatPromptInput,
} from "../coachChatPrompt";
import { coachPersonalities } from "@/config/coachPersonalities";

// Phase 1 — pure-function snapshot tests for the coach chat system prompt.
//
// External snapshots (default __snapshots__/ folder) keep the test file
// readable; the snapshot files freeze the rendered prompt body so any
// future drift fails CI loudly. The format-invariant assertions below
// guard the bare minimum the front-end carousel parser depends on.

const baseInput: CoachChatPromptInput = {
  personalityId: "friendly", // matches defaultPersonalityId
  userRating: 1500,
  username: "alice",
  playerColorName: "white",
  chesscomUsername: "alice_chess",
  lichessUsername: "alice_lichess",
};

describe("getCoachChatSystemPrompt — snapshots per personality", () => {
  for (const p of coachPersonalities) {
    it(`matches snapshot for personality '${p.id}'`, () => {
      const out = getCoachChatSystemPrompt({
        ...baseInput,
        personalityId: p.id,
      });
      expect(out).toMatchSnapshot();
    });
  }
});

describe("getCoachChatSystemPrompt — snapshots per skill tier", () => {
  it.each<[string, number]>([
    ["beginner", 800],
    ["intermediate", 1300],
    ["advanced", 2000],
  ])("matches snapshot for tier %s (rating %d)", (_tier, rating) => {
    const out = getCoachChatSystemPrompt({ ...baseInput, userRating: rating });
    expect(out).toMatchSnapshot();
  });
});

describe("getCoachChatSystemPrompt — format invariants", () => {
  // The carousel renderer in AICoachInsights parses these literal tokens.
  // If any of them disappear, the entire insight-card UI fails open.
  const out = getCoachChatSystemPrompt(baseInput);

  it("contains [INSIGHT:", () => {
    expect(out).toContain("[INSIGHT:");
  });
  it("contains [CONCEPT:", () => {
    expect(out).toContain("[CONCEPT:");
  });
  it("contains [/INSIGHT]", () => {
    expect(out).toContain("[/INSIGHT]");
  });
  it("contains 'Neo4j graph of 200,000+'", () => {
    expect(out).toContain("Neo4j graph of 200,000+");
  });
  it("contains 'VERY SHORT prose intro'", () => {
    expect(out).toContain("VERY SHORT prose intro");
  });
});

describe("getCoachChatSystemPrompt — negative invariants (no unresolved interpolation)", () => {
  // Catches template-port bugs: leftover ${...} markers, stray backticks
  // (which would imply an unclosed template literal), or [object Object]
  // (which would imply we tried to interpolate a non-string value).
  const out = getCoachChatSystemPrompt(baseInput);

  it("does not contain '${'", () => {
    expect(out).not.toContain("${");
  });
  it("does not contain raw template-literal backticks", () => {
    expect(out).not.toContain("`");
  });
  it("does not contain '[object Object]'", () => {
    expect(out).not.toContain("[object Object]");
  });
});

describe("PROMPT_VERSION", () => {
  it("is bumped to 3.2", () => {
    expect(PROMPT_VERSION).toBe("3.2");
  });
});

describe("CH-1a — calibrated hedging in the system prompt", () => {
  it("includes the CONFIDENCE & HEDGING block telling the coach to hedge unverifiable claims", () => {
    const p = getCoachChatSystemPrompt(baseInput);
    expect(p).toContain("CONFIDENCE & HEDGING");
    // The catch-all hedge for the ungroundable 80%.
    expect(p).toMatch(/one idea is|frame it as a suggestion/i);
    // Guards the named overclaim words.
    expect(p).toMatch(/Do not use "winning", "decisive", "the only move", "must", or "forced"/);
    // Must NOT tell the coach to drop the masti energy.
    expect(p).toMatch(/never means hedging the masti/i);
  });
});

describe("getCoachChatSystemPrompt — personality fallback", () => {
  it("falls back to the default personality for an unknown id", () => {
    const unknown = getCoachChatSystemPrompt({
      ...baseInput,
      personalityId: "nonexistent_id_xyz",
    });
    const fallback = getCoachChatSystemPrompt({
      ...baseInput,
      personalityId: "friendly",
    });
    expect(unknown).toBe(fallback);
  });
});
