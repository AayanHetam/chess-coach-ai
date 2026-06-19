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
  it("is bumped to 3.5", () => {
    expect(PROMPT_VERSION).toBe("3.5");
  });
});

describe("CH-1a hedge reverted (3.2 -> 3.3)", () => {
  it("no longer carries the CONFIDENCE & HEDGING block (no measurable benefit; GCC-Eval Track B)", () => {
    const p = getCoachChatSystemPrompt(baseInput);
    expect(p).not.toContain("CONFIDENCE & HEDGING");
  });
});

describe("3.4 — relational claim constraint (Lever 1 prompt side)", () => {
  const p = getCoachChatSystemPrompt(baseInput);

  it("contains the VERIFIED POSITION FACTS constraint header", () => {
    expect(p).toContain("RELATIONAL CLAIM CONSTRAINT — VERIFIED POSITION FACTS");
  });
  it("forbids asserting relationships absent from the facts block", () => {
    expect(p).toContain("Do NOT assert any attack, capture, defense, threat, fork, or pin relationship");
  });
  it("instructs reframing when a claim is not in the facts", () => {
    expect(p).toContain("reframe as a strategic observation");
  });
});

describe("3.5 — Phase-2 teaching method block (principles 1-5,7)", () => {
  const p = getCoachChatSystemPrompt(baseInput);

  it("contains the TEACHING METHOD header", () => {
    expect(p).toContain("TEACHING METHOD (how to explain, not just what):");
  });
  it("states the ONE PRIMARY IDEA relevance filter", () => {
    expect(p).toContain("ONE PRIMARY IDEA");
  });
  it("requires diagnose-before-correct on mistakes", () => {
    expect(p).toContain("DIAGNOSE BEFORE CORRECT");
  });
  it("forbids substituting the eval for the explanation", () => {
    expect(p).toContain("CAUSAL WHY, NOT EVAL RESTATEMENT");
  });
  it("frames pedagogy as taking precedence over masti (not deleting it)", () => {
    expect(p).toContain("PEDAGOGY OVER MASTI");
    expect(p).toContain("precedence rule");
  });
});

describe("3.5 — Silman imbalance language gated behind ADVANCED (>=1600)", () => {
  it("permits imbalance-based assessment for advanced players", () => {
    const advanced = getCoachChatSystemPrompt({ ...baseInput, userRating: 2000 });
    expect(advanced).toContain("imbalance-based assessment (the Silman framework");
  });
  it("forbids Silman imbalance vocabulary in the BEGINNER block", () => {
    // The stable body is identical across tiers, so the gate text is present
    // for every rating — the assertion is that the forbidding line exists.
    const beginner = getCoachChatSystemPrompt({ ...baseInput, userRating: 700 });
    expect(beginner).toContain(
      "Do NOT use imbalance-based (Silman) assessment language"
    );
  });
});

describe("3.5 — sub-1400 beginner band split (perUser line, no 4th tier)", () => {
  it("emits the <800 board-vision band line", () => {
    const sub800 = getCoachChatSystemPrompt({ ...baseInput, userRating: 600 });
    expect(sub800).toContain("Band focus (<800)");
    expect(sub800).not.toContain("Band focus (800-1200)");
  });
  it("emits the 800-1200 hope-chess band line", () => {
    const sub1200 = getCoachChatSystemPrompt({ ...baseInput, userRating: 950 });
    expect(sub1200).toContain("Band focus (800-1200)");
    expect(sub1200).not.toContain("Band focus (<800)");
  });
  it("emits no band line for non-beginner tiers", () => {
    const intermediate = getCoachChatSystemPrompt({ ...baseInput, userRating: 1300 });
    expect(intermediate).not.toContain("Band focus");
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
