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
  it("names the practice puzzle system without asserting a puzzle count or DB name (3.6)", () => {
    expect(out).toContain("PRACTICE PUZZLE SYSTEM");
    // The old prompt asserted "Neo4j graph of 200,000+ REAL PUZZLES" as fact
    // to the model; 3.6 removed that unverifiable marketing claim.
    expect(out).not.toContain("200,000+");
    expect(out).not.toContain("Neo4j");
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
  it("is bumped to 3.6", () => {
    expect(PROMPT_VERSION).toBe("3.6");
  });
});

describe("3.6 — opening-move policy is single + non-contradictory", () => {
  const p = getCoachChatSystemPrompt(baseInput);

  it("removes the dead BOOK_SOLID/BOOK_DUBIOUS marker branch (no code emits those markers)", () => {
    expect(p).not.toContain("BOOK_SOLID");
    expect(p).not.toContain("BOOK_DUBIOUS");
  });
  it("drops the contradictory move-15/move-16 opening cutoff", () => {
    expect(p).not.toContain("moves 1-15");
    expect(p).not.toContain("move 16 onwards");
  });
  it("keeps one canonical policy that always covers opening blunders/misses", () => {
    expect(p).toContain("OPENING MOVES POLICY");
    expect(p.toLowerCase()).toContain("always cover");
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
  it("emits the hope-chess band line for 1000-1199 (low intermediate, not just beginner tier)", () => {
    // regression: previously gated on tier==="beginner" (<1000), so 1000-1199
    // — the research's highest-leverage band — got nothing.
    const eleven00 = getCoachChatSystemPrompt({ ...baseInput, userRating: 1100 });
    expect(eleven00).toContain("Band focus (800-1200)");
  });
  it("emits no band line at 1200+", () => {
    const intermediate = getCoachChatSystemPrompt({ ...baseInput, userRating: 1300 });
    expect(intermediate).not.toContain("Band focus");
  });
});

describe("A1 — an absent rating is declared absent, never fabricated", () => {
  // SILENT_SUBSTITUTION_HANDOFF §3 A1. The route used to pass
  // `userRating ?? 1500`, so the prompt asserted "- User rating: 1500" as
  // fact for every user who had never set one. The builder now accepts
  // `undefined` and says so out loud.
  const noRating: CoachChatPromptInput = { ...baseInput, userRating: undefined };

  it("does not assert a numeric rating when none was supplied", () => {
    const out = getCoachChatSystemPrompt(noRating);
    expect(out).not.toContain("- User rating: 1500");
    expect(out).not.toMatch(/- User rating: \d/);
  });

  it("states explicitly that no rating is available", () => {
    expect(getCoachChatSystemPrompt(noRating)).toContain(
      "- User rating: not provided"
    );
  });

  it("still calibrates to INTERMEDIATE so the coach has a usable default", () => {
    expect(getCoachChatSystemPrompt(noRating)).toContain(
      "Skill calibration tier: INTERMEDIATE"
    );
  });

  it("emits no sub-1400 band line when the rating is unknown", () => {
    // `undefined < 1200` is false in JS, but assert it so a future refactor
    // to `(input.userRating ?? 0) < 1200` can't silently label every
    // unknown-rating user a sub-800 beginner.
    expect(getCoachChatSystemPrompt(noRating)).not.toContain("Band focus");
  });

  it("leaves the rendered prompt unchanged when a rating IS supplied", () => {
    expect(getCoachChatSystemPrompt(baseInput)).toContain("- User rating: 1500");
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

describe("A3 — the player's colour is asserted only when it is known", () => {
  // SILENT_SUBSTITUTION_HANDOFF §3 Group A. `playerColorName` reaches the
  // builder ONLY when the side is confirmed (the user picked it, or the PGN
  // header matched their username). When it is absent the side is a guess
  // derived from board orientation, which defaults to white — and asserting
  // that is not a small error: for a Black-side game whose header did not
  // match, the coach reviews the OPPONENT's moves as the user's and frames
  // them as "your mistakes".
  const unconfirmed: CoachChatPromptInput = {
    ...baseInput,
    playerColorName: undefined,
  };

  it("does not claim a side when the side is unconfirmed", () => {
    const out = getCoachChatSystemPrompt(unconfirmed);
    expect(out).not.toContain("The user is playing as: White");
    expect(out).not.toContain("The user is playing as: Black");
    expect(out).not.toContain("playing as White");
    expect(out).not.toContain("playing as Black");
  });

  it("says the side is unknown rather than staying silent about it", () => {
    // Silence would let the model infer from move order or the eval sign.
    const out = getCoachChatSystemPrompt(unconfirmed);
    expect(out).toContain("is NOT confirmed");
    expect(out).toContain("do NOT attribute either side's moves");
  });

  it("still names the user so the coach can address them", () => {
    // The minimal fix (skip the whole identity block) would have dropped the
    // username too; there is no reason to lose a fact we actually know.
    expect(getCoachChatSystemPrompt(unconfirmed)).toContain(
      "The user's in-game username is: alice"
    );
  });

  it("asserts the side normally once it IS confirmed", () => {
    const out = getCoachChatSystemPrompt(baseInput);
    expect(out).toContain("The user is playing as: White");
    expect(out).not.toContain("is NOT confirmed");
  });

  it("emits neither block when there is no username at all", () => {
    const out = getCoachChatSystemPrompt({
      ...baseInput,
      username: undefined,
      playerColorName: undefined,
    });
    expect(out).not.toContain("is NOT confirmed");
    expect(out).not.toContain("in-game username");
  });
});
