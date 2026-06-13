import { describe, it, expect } from "vitest";
import {
  buildPayload,
  scoreToRating,
  bandLabel,
  derivedRating,
  derivedFocusThemes,
  emptyAnswers,
  QuizAnswers,
} from "../quizConfig";

function answers(partial: Partial<QuizAnswers>): QuizAnswers {
  return { ...emptyAnswers(), ...partial };
}

describe("scoreToRating", () => {
  it("maps self-assessment score to a rating inside the right deriveSkillTier band", () => {
    expect(scoreToRating(0)).toBe(700); // beginner (<1000)
    expect(scoreToRating(1)).toBe(700);
    expect(scoreToRating(2)).toBe(1300); // intermediate (1000-1599)
    expect(scoreToRating(4)).toBe(1300);
    expect(scoreToRating(5)).toBe(1750); // advanced (>=1600)
    expect(scoreToRating(6)).toBe(1750);
  });
});

describe("bandLabel", () => {
  it("mirrors deriveSkillTier breakpoints", () => {
    expect(bandLabel(700)).toBe("Beginner");
    expect(bandLabel(999)).toBe("Beginner");
    expect(bandLabel(1000)).toBe("Intermediate");
    expect(bandLabel(1300)).toBe("Intermediate");
    expect(bandLabel(1599)).toBe("Intermediate");
    expect(bandLabel(1600)).toBe("Advanced");
    expect(bandLabel(1750)).toBe("Advanced");
  });
});

describe("derivedRating", () => {
  it("uses the entered rating on the online path", () => {
    expect(derivedRating(answers({ playStyle: "lichess", rating: 1850 }))).toBe(
      1850
    );
    expect(derivedRating(answers({ playStyle: "chesscom", rating: 900 }))).toBe(
      900
    );
  });

  it("falls back to the self-assessment score off the online path", () => {
    // otb/new ignore any stray rating value and use the self-assessment.
    expect(
      derivedRating(
        answers({
          playStyle: "new",
          selfAssess: { years: 2, spot: 2, tournaments: 2 },
        })
      )
    ).toBe(1750);
    expect(derivedRating(answers({ playStyle: "otb", selfAssess: {} }))).toBe(
      700
    );
  });
});

describe("derivedFocusThemes", () => {
  it("collects and dedupes canonical kebab ids from selected goals", () => {
    const themes = derivedFocusThemes(answers({ goals: ["forks", "pins"] }));
    expect(themes).toEqual(["fork", "double-attack", "pin", "skewer"]);
  });

  it("is empty for non-themed goals (general / openings)", () => {
    expect(
      derivedFocusThemes(answers({ goals: ["general", "openings"] }))
    ).toEqual([]);
  });
});

describe("buildPayload", () => {
  it("online path stores rating, platform, and the matching username only", () => {
    const p = buildPayload(
      answers({
        playStyle: "lichess",
        rating: 1450,
        username: "  knightrider  ",
        goals: ["forks"],
        time: "10-30",
      })
    );
    expect(p.selfReportedRating).toBe(1450);
    expect(p.primaryPlatform).toBe("lichess");
    expect(p.lichessUsername).toBe("knightrider"); // trimmed
    expect(p.chesscomUsername).toBeUndefined();
    expect(p.focusThemes).toEqual(["fork", "double-attack"]);
    expect(p.studyGoals).toEqual(["tactics"]);
    expect(p.dailyTimeCommitment).toBe("10-30");
  });

  it("routes the username to the chess.com field for that platform", () => {
    const p = buildPayload(
      answers({
        playStyle: "chesscom",
        rating: 1200,
        username: "magnus",
        goals: ["endgames"],
      })
    );
    expect(p.chesscomUsername).toBe("magnus");
    expect(p.lichessUsername).toBeUndefined();
    expect(p.studyGoals).toEqual(["endgames"]);
    expect(p.focusThemes).toEqual(["endgame"]);
  });

  it("omits an empty/blank username rather than clobbering with a blank", () => {
    const p = buildPayload(
      answers({
        playStyle: "lichess",
        rating: 1000,
        username: "   ",
        goals: ["forks"],
      })
    );
    expect("lichessUsername" in p).toBe(false);
    expect("chesscomUsername" in p).toBe(false);
  });

  it("self-assessment path sets no platform/username and a representative rating", () => {
    const p = buildPayload(
      answers({
        playStyle: "new",
        selfAssess: { years: 1, spot: 1, tournaments: 0 },
        goals: ["blunders"],
      })
    );
    expect(p.selfReportedRating).toBe(1300); // score 2 -> intermediate
    expect("primaryPlatform" in p).toBe(false);
    expect("lichessUsername" in p).toBe(false);
    expect(p.focusThemes).toEqual(["hanging-piece"]);
  });

  it("dedupes studyGoals across multiple tactical selections", () => {
    const p = buildPayload(
      answers({ playStyle: "otb", goals: ["forks", "pins", "blunders"] })
    );
    expect(p.studyGoals).toEqual(["tactics"]); // three tactics options collapse to one
    // focusThemes follow QUIZ_GOAL_OPTIONS definition order (blunders, forks, pins),
    // not selection order — deterministic regardless of how the user clicked.
    expect(p.focusThemes).toEqual([
      "hanging-piece",
      "fork",
      "double-attack",
      "pin",
      "skewer",
    ]);
  });

  it("omits focusThemes entirely when only non-themed goals are picked", () => {
    const p = buildPayload(answers({ playStyle: "new", goals: ["general"] }));
    expect("focusThemes" in p).toBe(false);
    expect(p.studyGoals).toEqual(["tactics"]); // general -> tactics study focus
  });

  it("omits studyGoals and dailyTimeCommitment when nothing implies them", () => {
    const p = buildPayload(answers({ playStyle: "lichess", rating: 1500 }));
    expect("studyGoals" in p).toBe(false);
    expect("dailyTimeCommitment" in p).toBe(false);
    expect("focusThemes" in p).toBe(false);
    // rating is always derived
    expect(p.selfReportedRating).toBe(1500);
  });
});
