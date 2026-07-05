import { describe, it, expect } from "vitest";
import {
  candidatesFromDelta,
  selectPrimaryIdea,
  toMasterySummary,
  renderPersonalizedFocus,
  type MasterySummary,
  type TeachingCandidate,
} from "@/lib/teaching/relevanceFilter";
import { buildTeachingSpine } from "@/lib/teaching/teachingSpine";
import { compute_feature_delta } from "@/lib/mastermind/featureDelta";
import type { WeaknessProfile } from "@/lib/weaknessProfile";

/**
 * Phase-3 relevance filter: proves cross-game weakness memory deterministically
 * changes the coach's ONE PRIMARY IDEA vs a cold user, and that the mastery
 * summary / prompt block are bounded and gated. This is the deterministic
 * stand-in for the acceptance criterion "cross-game memory demonstrably changes
 * the chosen primary idea vs a cold user (test)".
 */

// 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.Ng5 — a premature knight sortie whose delta
// carries two teachable categories: a conceded threat ("Missed Tactics", mag 2)
// and a poorly-placed knight ("Piece Activity", mag 1). Cold-primary = Missed
// Tactics; a Piece-Activity weakness flips it.
const NG5_BEFORE =
  "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
const NG5_AFTER =
  "r1bqk1nr/pppp1ppp/2n5/2b1p1N1/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 5 4";

function summaryWith(
  category: string,
  severity: MasteryWeaknessSeverity = "critical"
): MasterySummary {
  return {
    gamesAnalyzed: 5,
    weaknesses: [{ category, severity, frequency: 0.6 }],
  };
}
type MasteryWeaknessSeverity = "critical" | "frequent" | "occasional";

describe("selectPrimaryIdea — cross-game memory changes the primary", () => {
  const candidates: TeachingCandidate[] = [
    { category: "Missed Tactics", magnitude: 2, text: "conceded a fork" },
    { category: "Piece Activity", magnitude: 1, text: "knight has no retreat" },
  ];

  it("cold user leads with the largest-magnitude idea", () => {
    const cold = selectPrimaryIdea(candidates);
    expect(cold.primary?.category).toBe("Missed Tactics");
    expect(cold.personalized).toBe(false);
  });

  it("a recurring weakness flips the primary to the smaller matching idea", () => {
    const warm = selectPrimaryIdea(candidates, summaryWith("Piece Activity"));
    expect(warm.primary?.category).toBe("Piece Activity");
    expect(warm.personalized).toBe(true);
    // ...and the cold choice is demonstrably different for the SAME position.
    expect(selectPrimaryIdea(candidates).primary?.category).toBe("Missed Tactics");
  });

  it("boosting the already-top category does NOT report a spurious flip", () => {
    const warm = selectPrimaryIdea(candidates, summaryWith("Missed Tactics"));
    expect(warm.primary?.category).toBe("Missed Tactics");
    expect(warm.personalized).toBe(false);
  });

  it("a weakness the position does not touch leaves the cold choice intact", () => {
    const warm = selectPrimaryIdea(candidates, summaryWith("King Safety"));
    expect(warm.primary?.category).toBe("Missed Tactics");
    expect(warm.personalized).toBe(false);
  });

  it("a frequent (weaker) boost still flips when the gap is small", () => {
    const warm = selectPrimaryIdea(candidates, summaryWith("Piece Activity", "frequent"));
    // 1 + 3 = 4 > 2 ⇒ flips.
    expect(warm.primary?.category).toBe("Piece Activity");
    expect(warm.personalized).toBe(true);
  });

  it("no candidates ⇒ no primary, never personalized", () => {
    const empty = selectPrimaryIdea([], summaryWith("Piece Activity"));
    expect(empty.primary).toBeNull();
    expect(empty.personalized).toBe(false);
  });

  it("ranking is deterministic and stable regardless of input order", () => {
    const a = selectPrimaryIdea([...candidates], summaryWith("Piece Activity")).ranked.map((c) => c.category);
    const b = selectPrimaryIdea([...candidates].reverse(), summaryWith("Piece Activity")).ranked.map((c) => c.category);
    expect(a).toEqual(b);
  });
});

describe("candidatesFromDelta — categorized from a real move", () => {
  it("tags the Ng5 delta with Missed Tactics + Piece Activity", () => {
    const delta = compute_feature_delta(NG5_BEFORE, NG5_AFTER, { pv: [] });
    const cats = candidatesFromDelta(delta).map((c) => c.category).sort();
    expect(cats).toEqual(["Missed Tactics", "Piece Activity"]);
  });

  it("a quiet move (K+K king step) yields no candidates", () => {
    const before = "8/8/8/4k3/8/4K3/8/8 w - - 0 1";
    const after = "8/8/8/4k3/8/8/4K3/8 b - - 1 1";
    const delta = compute_feature_delta(before, after, { pv: [] });
    expect(candidatesFromDelta(delta)).toEqual([]);
  });
});

describe("buildTeachingSpine — personalized primary line", () => {
  it("is behavior-preserving when no summary is passed (null === undefined)", () => {
    const base = buildTeachingSpine(NG5_BEFORE, NG5_AFTER, []);
    expect(buildTeachingSpine(NG5_BEFORE, NG5_AFTER, [], null)).toBe(base);
    expect(base).not.toContain("PRIMARY IDEA (personalized");
  });

  it("emits a personalized primary line when the memory flips the choice", () => {
    const spine = buildTeachingSpine(
      NG5_BEFORE,
      NG5_AFTER,
      [],
      summaryWith("Piece Activity")
    );
    expect(spine).toContain('PRIMARY IDEA (personalized');
    expect(spine).toContain('"Piece Activity"');
  });

  it("does NOT add the line when the memory does not flip the choice", () => {
    const spine = buildTeachingSpine(
      NG5_BEFORE,
      NG5_AFTER,
      [],
      summaryWith("Missed Tactics")
    );
    expect(spine).not.toContain("PRIMARY IDEA (personalized");
  });
});

describe("toMasterySummary — bounded, gated projection", () => {
  function profile(over: Partial<WeaknessProfile>): WeaknessProfile {
    return {
      lastUpdated: 0,
      gamesAnalyzed: 5,
      patterns: [],
      phaseAccuracy: {
        opening: { totalMoves: 0, mistakes: 0, accuracy: 100 },
        middlegame: { totalMoves: 0, mistakes: 0, accuracy: 100 },
        endgame: { totalMoves: 0, mistakes: 0, accuracy: 100 },
      },
      topWeaknesses: [],
      recommendedPuzzleThemes: [],
      ...over,
    };
  }
  const pat = (category: string, severity: "critical" | "frequent" | "occasional", frequency: number) => ({
    category,
    count: 3,
    totalGames: 5,
    frequency,
    examples: [],
    severity,
  });

  it("returns null below the 2-game threshold (no cross-game signal)", () => {
    expect(toMasterySummary(profile({ gamesAnalyzed: 1, patterns: [pat("Hanging Pieces", "critical", 1)] }))).toBeNull();
    expect(toMasterySummary(null)).toBeNull();
  });

  it("drops occasional patterns and caps at 3 weaknesses", () => {
    const p = profile({
      gamesAnalyzed: 6,
      patterns: [
        pat("Hanging Pieces", "critical", 0.8),
        pat("Missed Tactics", "frequent", 0.4),
        pat("King Safety", "frequent", 0.3),
        pat("Piece Activity", "critical", 0.5),
        pat("Pawn Structure", "occasional", 0.1),
      ],
    });
    const s = toMasterySummary(p);
    expect(s).not.toBeNull();
    expect(s!.weaknesses.length).toBe(3);
    expect(s!.weaknesses.every((w) => w.severity !== "occasional")).toBe(true);
  });

  it("returns null when every pattern is only occasional", () => {
    expect(toMasterySummary(profile({ patterns: [pat("Hanging Pieces", "occasional", 0.1)] }))).toBeNull();
  });
});

describe("renderPersonalizedFocus — bounded prompt block", () => {
  it("is empty when there is no trustworthy summary", () => {
    expect(renderPersonalizedFocus(null)).toBe("");
    expect(renderPersonalizedFocus({ gamesAnalyzed: 4, weaknesses: [] })).toBe("");
  });

  it("names the weakness, the game count, and the lead-with directive", () => {
    const block = renderPersonalizedFocus(summaryWith("Hanging Pieces"));
    expect(block).toContain("PERSONALIZED FOCUS");
    expect(block).toContain("Hanging Pieces");
    expect(block).toContain("5 games analyzed");
    expect(block).toContain("ONE PRIMARY IDEA");
    // Bounded: header + one weakness line + directive ⇒ ≤ 3 lines here.
    expect(block.split("\n").length).toBeLessThanOrEqual(5);
  });
});
