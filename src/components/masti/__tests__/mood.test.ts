import { describe, expect, it } from "vitest";
import {
  analysisMood,
  classificationMood,
  coachErrorMood,
  puzzleMood,
  repertoireMood,
  resultMood,
  scoreMood,
  trendMood,
} from "../mood";

describe("puzzleMood", () => {
  it("waves on a fresh puzzle and thinks while loading", () => {
    expect(puzzleMood({ status: "playing", wrongAttempts: 0 })).toBe("wave");
    expect(puzzleMood({ status: "loading", wrongAttempts: 0 })).toBe(
      "thinking"
    );
  });
  it("celebrates only a clean solve", () => {
    expect(puzzleMood({ status: "solved", wrongAttempts: 0 })).toBe("excited");
    expect(puzzleMood({ status: "solved", wrongAttempts: 1 })).toBe("idea");
    expect(
      puzzleMood({ status: "solved", wrongAttempts: 0, solutionRevealed: true })
    ).toBe("idea");
  });
  it("is nervous on a miss, loses his mind on the third, and stays worried through the retry", () => {
    expect(puzzleMood({ status: "wrong", wrongAttempts: 1 })).toBe("nervous");
    expect(puzzleMood({ status: "wrong", wrongAttempts: 3 })).toBe("panic");
    expect(puzzleMood({ status: "playing", wrongAttempts: 2 })).toBe("nervous");
  });
  it("the coach working beats everything", () => {
    expect(
      puzzleMood({ status: "solved", wrongAttempts: 0, thinking: true })
    ).toBe("thinking");
    expect(
      puzzleMood({ status: "wrong", wrongAttempts: 1, demoRunning: true })
    ).toBe("thinking");
  });
  it("a hint points at the answer and a revealed answer is an idea, never a cheer", () => {
    expect(
      puzzleMood({ status: "playing", wrongAttempts: 0, hintStage: "hint" })
    ).toBe("pointing");
    // A miss after the hint is still a miss.
    expect(
      puzzleMood({ status: "wrong", wrongAttempts: 1, hintStage: "hint" })
    ).toBe("nervous");
    expect(
      puzzleMood({ status: "playing", wrongAttempts: 1, hintStage: "hint" })
    ).toBe("nervous");
    expect(
      puzzleMood({
        status: "playing",
        wrongAttempts: 1,
        solutionRevealed: true,
      })
    ).toBe("idea");
  });
});

describe("classificationMood", () => {
  it("reads a move from the player's side of the board", () => {
    expect(classificationMood("brilliant", "player")).toBe("excited");
    expect(classificationMood("brilliant", "opponent")).toBe("shocked");
    expect(classificationMood("blunder", "player")).toBe("defeated");
    expect(classificationMood("blunder", "opponent")).toBe("pointing");
    expect(classificationMood("mistake", "player")).toBe("nervous");
    expect(classificationMood("inaccuracy", "opponent")).toBe("idea");
  });
  it("is cautious when the side is unknown and neutral on quiet moves", () => {
    expect(classificationMood("blunder")).toBe("shocked");
    expect(classificationMood("Brilliant")).toBe("excited");
    expect(classificationMood("best")).toBe("wave");
    expect(classificationMood("book")).toBe("wave");
    expect(classificationMood(null)).toBe("wave");
    expect(classificationMood("something-new")).toBe("wave");
  });
});

describe("analysisMood", () => {
  const base = { hasGame: true } as const;
  it("orders the coach's own state above the board", () => {
    expect(analysisMood({ ...base, thinking: true, terminal: "1-0" })).toBe(
      "thinking"
    );
    expect(
      analysisMood({ ...base, streaming: true, classification: "blunder" })
    ).toBe("idea");
    expect(analysisMood({ ...base, coachError: "network" })).toBe("defeated");
    expect(analysisMood({ ...base, coachError: "auth" })).toBe("nervous");
    expect(analysisMood({ ...base, aiDisabled: true })).toBe("nervous");
  });
  it("waves at an empty board and reads while the engine runs", () => {
    expect(analysisMood({ hasGame: false })).toBe("wave");
    expect(
      analysisMood({
        ...base,
        engineRunning: true,
        classification: "brilliant",
      })
    ).toBe("thinking");
  });
  it("never celebrates a result for the wrong colour", () => {
    expect(
      analysisMood({ ...base, terminal: "1-0", playerColor: "white" })
    ).toBe("excited");
    expect(
      analysisMood({ ...base, terminal: "1-0", playerColor: "black" })
    ).toBe("defeated");
    expect(
      analysisMood({ ...base, terminal: "0-1", playerColor: "black" })
    ).toBe("excited");
    expect(analysisMood({ ...base, terminal: "0-1", playerColor: null })).toBe(
      "idea"
    );
    expect(
      analysisMood({ ...base, terminal: "½-½", playerColor: "white" })
    ).toBe("idea");
  });
  it("falls through to the current move", () => {
    expect(
      analysisMood({ ...base, classification: "blunder", mover: "player" })
    ).toBe("defeated");
    expect(
      analysisMood({ ...base, classification: "great", mover: "player" })
    ).toBe("excited");
    expect(analysisMood({ ...base })).toBe("wave");
  });
});

describe("recap, score and result moods", () => {
  it("maps trends", () => {
    expect(trendMood("gain")).toBe("banana");
    expect(trendMood("loss")).toBe("defeated");
    expect(trendMood("neutral")).toBe("wave");
  });
  it("maps scores", () => {
    expect(scoreMood(0, 0)).toBe("wave");
    expect(scoreMood(5, 5)).toBe("excited");
    expect(scoreMood(4, 5)).toBe("excited");
    expect(scoreMood(3, 5)).toBe("idea");
    expect(scoreMood(1, 5)).toBe("nervous");
    expect(scoreMood(0, 5)).toBe("defeated");
  });
  it("maps results and errors", () => {
    expect(resultMood("win")).toBe("excited");
    expect(resultMood("loss")).toBe("defeated");
    expect(resultMood("draw")).toBe("idea");
    expect(resultMood(null)).toBe("wave");
    expect(coachErrorMood("api")).toBe("defeated");
  });
});

describe("repertoireMood", () => {
  const open = { lockedHere: false, bothLocked: false };
  it("waves at an empty side and points at the gap once something is chosen", () => {
    expect(repertoireMood({ picks: 0, enough: false, ...open })).toBe("wave");
    expect(repertoireMood({ picks: 1, enough: false, ...open })).toBe("pointing");
  });
  it("celebrates a side that is enough, then moves on once it is locked", () => {
    expect(repertoireMood({ picks: 2, enough: true, ...open })).toBe("excited");
    expect(repertoireMood({ picks: 2, enough: true, lockedHere: true, bothLocked: false })).toBe("idea");
  });
  it("brings the banana when both colours are locked, whatever the coverage", () => {
    expect(repertoireMood({ picks: 0, enough: false, lockedHere: true, bothLocked: true })).toBe("banana");
  });
});
